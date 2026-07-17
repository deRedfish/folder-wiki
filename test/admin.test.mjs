import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { register, startWiki, withSession } from "../test-support/http.mjs";

test("role visibility filters viewers while admins bypass restrictions", async (context) => {
  const content = await mkdtemp(path.join(tmpdir(), "folder-wiki-admin-content-"));
  const runtime = await mkdtemp(path.join(tmpdir(), "folder-wiki-admin-runtime-"));
  await mkdir(path.join(content, "Article"));
  await writeFile(path.join(content, "Article", "secret.md"), "# Secret\n\nHidden phrase", "utf8");
  await writeFile(path.join(content, "Article", "public.md"), "# Public\n\nVisible phrase", "utf8");
  await writeFile(path.join(content, "Article", "portrait.png"), Buffer.from([137, 80, 78, 71]));
  const base = await startWiki(context, content, runtime);
  context.after(() => Promise.all([rm(content, { recursive: true, force: true }), rm(runtime, { recursive: true, force: true })]));
  const admin = await register(base, "firstadmin"); const viewer = await register(base, "adamplayer");

  assert.equal(admin.user.isAdmin, true); assert.equal(viewer.user.isAdmin, false);
  assert.equal((await fetch(`${base}/api/admin/roles`, withSession(viewer.cookie))).status, 403);
  const roles = await fetch(`${base}/api/admin/roles`, withSession(admin.cookie)).then((response) => response.json());
  const playerRole = roles.find((role) => role.name === "Player");
  const initial = await fetch(`${base}/api/admin/files?roleId=${playerRole.id}`, withSession(admin.cookie)).then((response) => response.json());
  assert.equal(initial.length, 3); assert.equal(initial.every((file) => file.visible), true);

  const hide = await fetch(`${base}/api/admin/visibility`, withSession(admin.cookie, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ roleId: playerRole.id, paths: ["Article/secret.md"], visible: false })
  }));
  assert.equal(hide.status, 200);
  const viewerFiles = await fetch(`${base}/api/files?refresh=1`, withSession(viewer.cookie)).then((response) => response.json());
  assert.deepEqual(viewerFiles.map((file) => file.path), ["Article/portrait.png", "Article/public.md"]);
  assert.deepEqual(await fetch(`${base}/api/search?q=hidden`, withSession(viewer.cookie)).then((response) => response.json()), []);
  assert.equal((await fetch(`${base}/api/file?path=${encodeURIComponent("Article/secret.md")}`, withSession(viewer.cookie))).status, 404);
  assert.equal((await fetch(`${base}/content/Article/secret.md`, withSession(viewer.cookie))).status, 404);
  assert.equal((await fetch(`${base}/api/file`, withSession(viewer.cookie, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "Article/new.md", content: "No" }) }))).status, 403);

  const adminFiles = await fetch(`${base}/api/files?refresh=1`, withSession(admin.cookie)).then((response) => response.json());
  assert.equal(adminFiles.find((file) => file.path === "Article/secret.md").viewerVisible, false);
  assert.equal((await fetch(`${base}/api/file?path=${encodeURIComponent("Article/secret.md")}`, withSession(admin.cookie))).status, 200);
  const preview = await fetch(`${base}/api/admin/preview?path=${encodeURIComponent("Article/portrait.png")}`, withSession(admin.cookie));
  assert.equal(preview.status, 200); assert.equal(preview.headers.get("content-type"), "image/png");

  const gnome = await fetch(`${base}/api/admin/roles`, withSession(admin.cookie, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Gnome", isAdmin: false }) })).then((response) => response.json());
  await fetch(`${base}/api/admin/visibility`, withSession(admin.cookie, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ roleId: gnome.id, paths: ["Article/secret.md"], visible: true }) }));
  const updateViewer = await fetch(`${base}/api/admin/users/${viewer.user.id}`, withSession(admin.cookie, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "adamplayer", password: "", roleIds: [playerRole.id, gnome.id] }) }));
  assert.equal(updateViewer.status, 200);
  const cumulative = await fetch(`${base}/api/files?refresh=1`, withSession(viewer.cookie)).then((response) => response.json());
  assert.deepEqual(cumulative.map((file) => file.path), ["Article/portrait.png", "Article/public.md", "Article/secret.md"]);

  const created = await fetch(`${base}/api/admin/users`, withSession(admin.cookie, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "createduser", password: "temporary password", roleIds: [playerRole.id] }) })).then((response) => response.json());
  assert.equal(created.roles[0].name, "Player"); assert.ok(created.joinedAt);
  assert.equal((await fetch(`${base}/api/admin/users/${created.id}`, withSession(admin.cookie, { method: "DELETE" }))).status, 200);
  assert.equal((await fetch(`${base}/api/admin/roles/${gnome.id}`, withSession(admin.cookie, { method: "DELETE" }))).status, 200);
  const afterRoleDelete = await fetch(`${base}/api/files?refresh=1`, withSession(viewer.cookie)).then((response) => response.json());
  assert.deepEqual(afterRoleDelete.map((file) => file.path), ["Article/portrait.png", "Article/public.md"]);
});
