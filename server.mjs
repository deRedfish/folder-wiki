import http from "node:http";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_ROOT = path.resolve(process.env.CONTENT_ROOT || path.join(HERE, "content"));
const PUBLIC = path.join(HERE, "public");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const SUPPORTED = new Set([".md", ".markdown", ".txt", ".json", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg", ".zip"]);
const TEXT_TYPES = new Set([".md", ".markdown", ".txt", ".json"]);
const IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"]);
const IGNORED = new Set([".git", ".vscode", "node_modules"]);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif", ".svg": "image/svg+xml", ".zip": "application/zip" };

let cache = { at: 0, files: [], folders: [], search: [] };
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
  cache = { at: Date.now(), files: records.map(({ _content, _lower, ...item }) => item), folders: folders.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), search: records };
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

function json(res, value, status = 200) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
  res.end(body);
}
function sendError(res, error, status = 400) { json(res, { error: error.message || String(error) }, status); }
async function bodyJson(req) {
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > 5_000_000) throw new Error("Document is too large"); }
  return JSON.parse(body || "{}");
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/health" && req.method === "GET") return json(res, { ok: true });
    if (url.pathname === "/api/files" && req.method === "GET") return json(res, (await buildIndex(url.searchParams.has("refresh"))).files);
    if (url.pathname === "/api/folders" && req.method === "GET") return json(res, (await buildIndex(url.searchParams.has("refresh"))).folders);
    if (url.pathname === "/api/search" && req.method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLocaleLowerCase();
      if (!q) return json(res, []);
      const terms = q.split(/\s+/).filter(Boolean);
      const results = (await buildIndex()).search.map((item) => {
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
      if (!TEXT_TYPES.has(path.extname(file).toLowerCase())) throw new Error("This file is viewed as media");
      return json(res, { path: relative(file), content: await readFile(file, "utf8") });
    }
    if (url.pathname === "/api/file" && req.method === "PUT") {
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
      return await serveFile(res, file, url.searchParams.has("download"));
    }
    let file = url.pathname === "/" ? path.join(PUBLIC, "index.html") : path.resolve(PUBLIC, `.${url.pathname}`);
    if (!file.startsWith(PUBLIC + path.sep) && file !== path.join(PUBLIC, "index.html")) throw new Error("Invalid path");
    try { return await serveFile(res, file); }
    catch { return await serveFile(res, path.join(PUBLIC, "index.html")); }
  } catch (error) { sendError(res, error, error.code === "ENOENT" ? 404 : 400); }
});

export async function startServer() {
  await mkdir(CONTENT_ROOT, { recursive: true });
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
if (isMain) startServer().catch((error) => { console.error(`Could not start Folder Wiki: ${error.message}`); process.exitCode = 1; });
