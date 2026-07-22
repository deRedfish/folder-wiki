import http from "node:http";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AuthStore } from "./auth.mjs";
import { MapStore } from "./map-store.mjs";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = path.resolve(process.env.CONTENT_ROOT || path.join(HERE, "content"));
const RUNTIME_ROOT = path.resolve(process.env.RUNTIME_ROOT || path.join(HERE, ".folder-wiki"));
const VISIBILITY_FILE = path.join(RUNTIME_ROOT, "visibility.json");
const DATABASE_FILE = path.join(RUNTIME_ROOT, "wiki.db");
const PUBLIC = path.join(HERE, "public");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const SUPPORTED = new Set([".md", ".markdown", ".txt", ".json", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg", ".zip"]);
const TEXT_TYPES = new Set([".md", ".markdown", ".txt", ".json"]);
const IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"]);
const IGNORED = new Set([".git", ".vscode", "node_modules"]);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif", ".svg": "image/svg+xml", ".zip": "application/zip" };

let cache = { at: 0, files: [], folders: [], search: [] };
let auth;
let maps;
const textCache = new Map();
const pdfPending = new Set();

function relative(file) { return path.relative(CONTENT_ROOT, file).split(path.sep).join("/"); }
export function safeContentPath(value) {
  const clean = decodeURIComponent(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
  const resolved = path.resolve(CONTENT_ROOT, clean);
  if (resolved !== CONTENT_ROOT && !resolved.startsWith(CONTENT_ROOT + path.sep)) throw new Error("Invalid path");
  if (relative(resolved).split("/").some((part) => IGNORED.has(part))) throw new Error("That path is reserved");
  return resolved;
}

async function hiddenPaths() {
  try {
    const data = JSON.parse(await readFile(VISIBILITY_FILE, "utf8"));
    return new Set(Array.isArray(data.hidden) ? data.hidden.map(String) : []);
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return new Set();
    throw error;
  }
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const at = part.indexOf("="); return [decodeURIComponent(part.slice(0, at)), decodeURIComponent(part.slice(at + 1))];
  }));
}
function sessionToken(req) { return cookies(req).folder_wiki_session || ""; }
function currentUser(req) { return auth.session(sessionToken(req)); }
function authError(message, status) { const error = new Error(message); error.status = status; return error; }
function requireUser(req) { const user = currentUser(req); if (!user) throw authError("Login required", 401); return user; }
function requireAdmin(user) { if (!user.isAdmin) throw authError("Admin access required", 403); }
function sessionCookie(session) { return `folder_wiki_session=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${session.maxAgeSeconds}`; }
function clearSessionCookie() { return "folder_wiki_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"; }
function userPaths(user) { return auth.visiblePaths(user.id); }
function canView(user, file) { const allowed = userPaths(user); return allowed === null || allowed.has(relative(file)); }
function requireVisible(user, file) { if (!canView(user, file)) { const error = new Error("Not found"); error.code = "ENOENT"; throw error; } }
function visibleRecords(index, user) { const allowed = userPaths(user); return allowed === null ? index.files : index.files.filter((file) => allowed.has(file.path)); }
function visibleFolders(index, user) {
  if (user.isAdmin) return index.folders;
  const folders = new Set();
  for (const file of visibleRecords(index, user)) {
    const parts = file.folder.split("/"); for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join("/"));
  }
  return index.folders.filter((folder) => folders.has(folder));
}

async function walk(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || IGNORED.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, output);
    else if (SUPPORTED.has(path.extname(entry.name).toLowerCase())) output.push(full);
  }
  return output;
}

async function walkFolders(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || IGNORED.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    output.push(relative(full));
    await walkFolders(full, output);
  }
  return output;
}

export function titleFromText(file, content) {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, "").trim();
  return heading || path.basename(file, path.extname(file)).replaceAll("-", " ");
}

async function searchableText(file, info) {
  const ext = path.extname(file).toLowerCase();
  const prior = textCache.get(file);
  if (prior?.mtime === info.mtimeMs) return prior;
  let content = "";
  if (TEXT_TYPES.has(ext)) content = await readFile(file, "utf8");
  else if (ext === ".pdf") {
    try { ({ stdout: content } = await execFileAsync("pdftotext", ["-enc", "UTF-8", file, "-"], { maxBuffer: 25 * 1024 * 1024, timeout: 8000 })); }
    catch { content = ""; }
  }
  const value = { mtime: info.mtimeMs, content, lower: content.toLocaleLowerCase(), title: titleFromText(file, content) };
  textCache.set(file, value);
  return value;
}

async function buildIndex(force = false) {
  if (!force && Date.now() - cache.at < 2000) return cache;
  const [paths, folders] = await Promise.all([walk(CONTENT_ROOT), walkFolders(CONTENT_ROOT)]);
  const legacyHidden = await hiddenPaths();
  const pdfQueue = [];
  const articlePaths = paths.filter((file) => path.dirname(file) !== CONTENT_ROOT);
  const records = await Promise.all(articlePaths.map(async (file) => {
    const info = await stat(file);
    const ext = path.extname(file).toLowerCase();
    let searchable;
    if (ext === ".pdf") {
      const prior = textCache.get(file);
      searchable = prior?.mtime === info.mtimeMs
        ? prior
        : { content: "", lower: "", title: titleFromText(file, "") };
      if (prior?.mtime !== info.mtimeMs) pdfQueue.push({ file, info });
    } else searchable = await searchableText(file, info);
    const rel = relative(file);
    return {
      path: rel,
      name: path.basename(file),
      title: searchable.title,
      folder: path.posix.dirname(rel),
      type: TEXT_TYPES.has(ext) ? "markdown" : ext === ".pdf" ? "pdf" : IMAGE_TYPES.has(ext) ? "image" : "archive",
      ext: ext.slice(1), size: info.size, modified: info.mtime.toISOString(),
      _content: searchable.content, _lower: searchable.lower
    };
  }));
  records.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  const clean = (item) => { const { _content, _lower, ...record } = item; return record; };
  auth.syncFiles(records.map((item) => item.path), legacyHidden);
  cache = { at: Date.now(), files: records.map(clean), folders: folders.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), search: records };
  for (const job of pdfQueue) queuePdf(job.file, job.info);
  return cache;
}

function queuePdf(file, info) {
  if (pdfPending.has(file)) return;
  pdfPending.add(file);
  searchableText(file, info).then((searchable) => {
    const record = cache.search.find((item) => item.path === relative(file));
    if (record) { record._content = searchable.content; record._lower = searchable.lower; }
  }).finally(() => pdfPending.delete(file));
}

function json(res, value, status = 200, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store", ...headers });
  res.end(body);
}
function sendError(res, error, status = 400) { json(res, { error: error.message || String(error) }, status); }
async function bodyJson(req, maxBytes = 5_000_000) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function excerpt(content, query) {
  const plain = content.replace(/[#*_>`|\[\]()]/g, " ").replace(/\s+/g, " ").trim();
  const at = plain.toLocaleLowerCase().indexOf(query);
  const start = Math.max(0, at - 85);
  return `${start ? "…" : ""}${plain.slice(start, start + 240)}${start + 240 < plain.length ? "…" : ""}`;
}

async function serveFile(res, file, download = false) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Not found");
  const headers = { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "content-length": info.size, "cache-control": "no-cache" };
  if (download) headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`;
  res.writeHead(200, headers); createReadStream(file).pipe(res);
}

function requireMapAccess(user, mapId) {
  const map = maps.getMap(mapId, user.isAdmin);
  if (!map) throw authError("Map not found", 404);
  return map;
}

async function validatedMapImage(value) {
  if (value === null || value === "") return null;
  const file = safeContentPath(value);
  if (!IMAGE_TYPES.has(path.extname(file).toLowerCase())) throw new Error("Choose a supported wiki image");
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Map image not found");
  return relative(file);
}

async function uploadMapImage(input) {
  const folder = String(input.folder || "Maps").trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  const suppliedName = String(input.name || "").trim().replaceAll("\\", "/");
  const name = path.posix.basename(suppliedName);
  if (!folder || folder === "." || !name || name !== suppliedName) throw new Error("Choose a content folder and a file name");
  if (!IMAGE_TYPES.has(path.extname(name).toLowerCase())) throw new Error("Upload a PNG, JPG, WEBP, GIF, AVIF, or SVG image");
  const encoded = String(input.data || "").replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error("Image data is invalid");
  const data = Buffer.from(encoded, "base64");
  if (!data.length || data.length > 50 * 1024 * 1024) throw new Error("Images must be 50 MB or smaller");
  const file = safeContentPath(path.posix.join(folder, name));
  await mkdir(path.dirname(file), { recursive: true });
  try { await writeFile(file, data, { flag: "wx" }); }
  catch (error) { if (error.code === "EEXIST") throw new Error("An image with that name already exists in this folder"); throw error; }
  cache.at = 0;
  await buildIndex(true);
  return { path: relative(file), name };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/health" && req.method === "GET") return json(res, { ok: true });
    if (url.pathname === "/api/auth/register" && req.method === "POST") {
      const input = await bodyJson(req); const user = await auth.register(input.username, input.password); const session = auth.createSession(user.id);
      return json(res, user, 201, { "set-cookie": sessionCookie(session) });
    }
    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const input = await bodyJson(req); const user = await auth.authenticate(input.username, input.password);
      if (!user) throw authError("Incorrect username or password", 401);
      const session = auth.createSession(user.id); return json(res, user, 200, { "set-cookie": sessionCookie(session) });
    }
    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      auth.deleteSession(sessionToken(req)); return json(res, { ok: true }, 200, { "set-cookie": clearSessionCookie() });
    }
    if (url.pathname === "/api/auth/me" && req.method === "GET") return json(res, requireUser(req));

    const user = url.pathname.startsWith("/api/") || url.pathname.startsWith("/content/") ? requireUser(req) : null;
    if (url.pathname === "/api/maps" && req.method === "GET") return json(res, maps.listMaps(user.isAdmin));
    if (url.pathname === "/api/maps" && req.method === "POST") { requireAdmin(user); return json(res, maps.createMap(await bodyJson(req), user.id), 201); }
    if (url.pathname === "/api/maps/images" && req.method === "GET") {
      requireAdmin(user); const index = await buildIndex(true);
      return json(res, index.files.filter((file) => file.type === "image"));
    }
    if (url.pathname === "/api/maps/images" && req.method === "POST") {
      requireAdmin(user); return json(res, await uploadMapImage(await bodyJson(req, 70 * 1024 * 1024)), 201);
    }
    const mapImageRoute = url.pathname.match(/^\/api\/maps\/(\d+)\/image$/);
    if (mapImageRoute && req.method === "GET") {
      const map = requireMapAccess(user, mapImageRoute[1]);
      if (!map.imagePath) throw authError("Map image not found", 404);
      return serveFile(res, safeContentPath(map.imagePath));
    }
    const mapActivateRoute = url.pathname.match(/^\/api\/maps\/(\d+)\/activate$/);
    if (mapActivateRoute && req.method === "POST") { requireAdmin(user); return json(res, maps.activateMap(mapActivateRoute[1])); }
    const mapHexRoute = url.pathname.match(/^\/api\/maps\/(\d+)\/hex$/);
    if (mapHexRoute && req.method === "PUT") {
      requireAdmin(user); maps.setHex(mapHexRoute[1], await bodyJson(req)); return json(res, { ok: true });
    }
    const mapNotesRoute = url.pathname.match(/^\/api\/maps\/(\d+)\/notes$/);
    if (mapNotesRoute && req.method === "POST") {
      requireMapAccess(user, mapNotesRoute[1]); return json(res, maps.addNote(mapNotesRoute[1], await bodyJson(req), user.id), 201);
    }
    const mapNoteRoute = url.pathname.match(/^\/api\/maps\/(\d+)\/notes\/(\d+)$/);
    if (mapNoteRoute && req.method === "PUT") {
      requireMapAccess(user, mapNoteRoute[1]); const input = await bodyJson(req);
      maps.updateNote(mapNoteRoute[1], mapNoteRoute[2], input.body, user.id, user.isAdmin); return json(res, { ok: true });
    }
    if (mapNoteRoute && req.method === "DELETE") {
      requireMapAccess(user, mapNoteRoute[1]); maps.deleteNote(mapNoteRoute[1], mapNoteRoute[2], user.id, user.isAdmin); return json(res, { ok: true });
    }
    const mapTokensRoute = url.pathname.match(/^\/api\/maps\/(\d+)\/tokens$/);
    if (mapTokensRoute && req.method === "POST") {
      requireAdmin(user); return json(res, maps.createToken(mapTokensRoute[1], await bodyJson(req), user.id), 201);
    }
    const mapTokenRoute = url.pathname.match(/^\/api\/maps\/(\d+)\/tokens\/(\d+)$/);
    if (mapTokenRoute && req.method === "PUT") {
      requireAdmin(user); maps.updateToken(mapTokenRoute[1], mapTokenRoute[2], await bodyJson(req)); return json(res, { ok: true });
    }
    if (mapTokenRoute && req.method === "DELETE") {
      requireAdmin(user); maps.deleteToken(mapTokenRoute[1], mapTokenRoute[2]); return json(res, { ok: true });
    }
    const mapRoute = url.pathname.match(/^\/api\/maps\/(\d+)$/);
    if (mapRoute && req.method === "GET") return json(res, requireMapAccess(user, mapRoute[1]));
    if (mapRoute && req.method === "PUT") {
      requireAdmin(user); const input = await bodyJson(req);
      if (Object.hasOwn(input, "imagePath")) input.imagePath = await validatedMapImage(input.imagePath);
      return json(res, maps.updateMap(mapRoute[1], input));
    }
    if (mapRoute && req.method === "DELETE") { requireAdmin(user); maps.deleteMap(mapRoute[1]); return json(res, { ok: true }); }
    if (url.pathname === "/api/admin/files" && req.method === "GET") {
      requireAdmin(user); const roleId = Number(url.searchParams.get("roleId")); if (!roleId) throw new Error("Choose a role");
      const role = auth.listRoles().find((item) => item.id === roleId); if (!role) throw new Error("Role not found");
      const index = await buildIndex(true); const granted = auth.rolePaths(roleId);
      return json(res, index.files.map((file) => ({ ...file, visible: role.isAdmin || granted.has(file.path) })));
    }
    if (url.pathname === "/api/admin/preview" && req.method === "GET") {
      requireAdmin(user);
      const file = safeContentPath(url.searchParams.get("path"));
      if (!IMAGE_TYPES.has(path.extname(file).toLowerCase())) throw new Error("Only image files can be previewed");
      return serveFile(res, file);
    }
    if (url.pathname === "/api/admin/visibility" && req.method === "PUT") {
      requireAdmin(user); const input = await bodyJson(req); const visible = Boolean(input.visible); const roleId = Number(input.roleId);
      if (!Array.isArray(input.paths) || !input.paths.length) throw new Error("Select at least one file");
      const role = auth.listRoles().find((item) => item.id === roleId); if (!role) throw new Error("Role not found"); if (role.isAdmin) throw new Error("Admin roles always see all content");
      const paths = [...new Set(input.paths.map(String))]; await buildIndex(true); auth.setRolePaths(roleId, paths, visible); cache.at = 0;
      return json(res, { ok: true, changed: paths.length, visible });
    }
    if (url.pathname === "/api/admin/roles" && req.method === "GET") { requireAdmin(user); return json(res, auth.listRoles()); }
    if (url.pathname === "/api/admin/roles" && req.method === "POST") { requireAdmin(user); const input = await bodyJson(req); return json(res, auth.createRole(input.name, input.isAdmin), 201); }
    const roleRoute = url.pathname.match(/^\/api\/admin\/roles\/(\d+)$/);
    if (roleRoute && req.method === "PUT") { requireAdmin(user); return json(res, auth.updateRole(roleRoute[1], await bodyJson(req))); }
    if (roleRoute && req.method === "DELETE") { requireAdmin(user); auth.deleteRole(roleRoute[1]); return json(res, { ok: true }); }
    if (url.pathname === "/api/admin/users" && req.method === "GET") { requireAdmin(user); return json(res, auth.listUsers()); }
    if (url.pathname === "/api/admin/users" && req.method === "POST") { requireAdmin(user); return json(res, await auth.createUser(await bodyJson(req)), 201); }
    const userRoute = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (userRoute && req.method === "PUT") { requireAdmin(user); return json(res, await auth.updateUser(userRoute[1], await bodyJson(req))); }
    if (userRoute && req.method === "DELETE") { requireAdmin(user); if (Number(userRoute[1]) === user.id) throw new Error("You cannot delete your own account"); auth.deleteUser(userRoute[1]); return json(res, { ok: true }); }
    if (url.pathname === "/api/files" && req.method === "GET") {
      const index = await buildIndex(url.searchParams.has("refresh")); const files = visibleRecords(index, user);
      if (!user.isAdmin) return json(res, files);
      const viewerRoles = auth.viewerRolesByPath();
      return json(res, files.map((file) => ({ ...file, viewerRoles: viewerRoles.get(file.path) || [], viewerVisible: viewerRoles.has(file.path) })));
    }
    if (url.pathname === "/api/folders" && req.method === "GET") { const index = await buildIndex(url.searchParams.has("refresh")); return json(res, visibleFolders(index, user)); }
    if (url.pathname === "/api/search" && req.method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLocaleLowerCase();
      if (!q) return json(res, []);
      const terms = q.split(/\s+/).filter(Boolean);
      const index = await buildIndex(); const allowed = userPaths(user);
      const results = index.search.filter((item) => allowed === null || allowed.has(item.path)).map((item) => {
        const haystack = `${item.title}\n${item.path}\n${item._lower}`.toLocaleLowerCase();
        if (!terms.every((term) => haystack.includes(term))) return null;
        const titleHit = item.title.toLocaleLowerCase().includes(q) ? 30 : 0;
        const pathHit = item.path.toLocaleLowerCase().includes(q) ? 15 : 0;
        const occurrences = terms.reduce((sum, term) => sum + Math.min(10, haystack.split(term).length - 1), 0);
        return { ...item, score: titleHit + pathHit + occurrences, excerpt: excerpt(item._content || item.path, terms[0]) };
      }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 60).map(({ _content, _lower, score, ...item }) => item);
      return json(res, results);
    }
    if (url.pathname === "/api/file" && req.method === "GET") {
      const file = safeContentPath(url.searchParams.get("path"));
      requireVisible(user, file);
      if (!TEXT_TYPES.has(path.extname(file).toLowerCase())) throw new Error("This file is viewed as media");
      return json(res, { path: relative(file), content: await readFile(file, "utf8") });
    }
    if (url.pathname === "/api/file" && req.method === "PUT") {
      requireAdmin(user);
      const input = await bodyJson(req);
      const file = safeContentPath(input.path);
      if (![".md", ".markdown"].includes(path.extname(file).toLowerCase())) throw new Error("Pages must use a .md extension");
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, String(input.content ?? ""), "utf8");
      cache.at = 0;
      return json(res, { ok: true, path: relative(file) });
    }
    if (url.pathname.startsWith("/content/") && req.method === "GET") {
      const file = safeContentPath(url.pathname.slice(9));
      requireVisible(user, file);
      return await serveFile(res, file, url.searchParams.has("download"));
    }
    let file = url.pathname === "/" ? path.join(PUBLIC, "index.html") : path.resolve(PUBLIC, `.${url.pathname}`);
    if (!file.startsWith(PUBLIC + path.sep) && file !== path.join(PUBLIC, "index.html")) throw new Error("Invalid path");
    try { return await serveFile(res, file); }
    catch { return await serveFile(res, path.join(PUBLIC, "index.html")); }
  } catch (error) { sendError(res, error, error.status || (error.code === "ENOENT" ? 404 : 400)); }
});

export async function startServer() {
  await Promise.all([mkdir(CONTENT_ROOT, { recursive: true }), mkdir(RUNTIME_ROOT, { recursive: true })]);
  auth = new AuthStore(DATABASE_FILE);
  maps = new MapStore(DATABASE_FILE);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => {
      const address = server.address(); const port = typeof address === "object" ? address.port : PORT;
      console.log(`Folder Wiki is ready at http://${HOST}:${port}`);
      console.log(`Indexing articles from ${CONTENT_ROOT}`);
      resolve(server);
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received; closing Folder Wiki`);
    server.close(() => {
      maps?.close();
      auth?.close();
      process.exit(0);
    });
    setTimeout(() => {
      console.error("Folder Wiki did not close within 10 seconds; forcing shutdown");
      server.closeAllConnections();
      process.exit(1);
    }, 10_000).unref();
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  startServer().catch((error) => { console.error(`Could not start Folder Wiki: ${error.message}`); process.exitCode = 1; });
}
