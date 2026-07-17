import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

test("admin visibility hides and restores files everywhere", async (context) => {
  const content = await mkdtemp(path.join(tmpdir(), "folder-wiki-admin-content-"));
  const runtime = await mkdtemp(path.join(tmpdir(), "folder-wiki-admin-runtime-"));
  await mkdir(path.join(content, "Article"));
  await writeFile(path.join(content, "Article", "secret.md"), "# Secret\n\nHidden phrase", "utf8");
  await writeFile(path.join(content, "Article", "public.md"), "# Public\n\nVisible phrase", "utf8");
  await writeFile(path.join(content, "Article", "portrait.png"), Buffer.from([137, 80, 78, 71]));
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: path.resolve("."),
    env: { ...process.env, CONTENT_ROOT: content, RUNTIME_ROOT: runtime, PORT: "0", HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  context.after(async () => { child.kill(); await Promise.all([rm(content, { recursive: true, force: true }), rm(runtime, { recursive: true, force: true })]); });
  let output = "";
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. ${output}`)), 10_000);
    const inspect = (chunk) => {
      output += chunk.toString(); const match = output.match(/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    };
    child.stdout.on("data", inspect); child.stderr.on("data", inspect);
    child.once("exit", (code) => reject(new Error(`Server exited with ${code}. ${output}`)));
  });
  const base = `http://127.0.0.1:${port}`; const adminHeaders = { "x-admin-password": "gmrules" };

  const denied = await fetch(`${base}/api/admin/files`, { headers: { "x-admin-password": "wrong" } });
  assert.equal(denied.status, 401);
  const initial = await fetch(`${base}/api/admin/files`, { headers: adminHeaders }).then((response) => response.json());
  assert.equal(initial.length, 3); assert.equal(initial.every((file) => file.visible), true);
  assert.equal((await fetch(`${base}/api/admin/preview?path=${encodeURIComponent("Article/portrait.png")}&password=wrong`)).status, 401);
  const preview = await fetch(`${base}/api/admin/preview?path=${encodeURIComponent("Article/portrait.png")}&password=gmrules`);
  assert.equal(preview.status, 200); assert.equal(preview.headers.get("content-type"), "image/png");

  const hide = await fetch(`${base}/api/admin/visibility`, {
    method: "PUT", headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({ paths: ["Article/secret.md"], visible: false })
  });
  assert.equal(hide.status, 200);
  const files = await fetch(`${base}/api/files?refresh=1`).then((response) => response.json());
  assert.deepEqual(files.map((file) => file.path), ["Article/portrait.png", "Article/public.md"]);
  const search = await fetch(`${base}/api/search?q=hidden`).then((response) => response.json());
  assert.deepEqual(search, []);
  assert.equal((await fetch(`${base}/api/file?path=${encodeURIComponent("Article/secret.md")}`)).status, 404);
  assert.equal((await fetch(`${base}/content/Article/secret.md`)).status, 404);
  const afterHide = await fetch(`${base}/api/admin/files`, { headers: adminHeaders }).then((response) => response.json());
  assert.equal(afterHide.find((file) => file.path === "Article/secret.md").visible, false);

  const show = await fetch(`${base}/api/admin/visibility`, {
    method: "PUT", headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({ paths: ["Article/secret.md"], visible: true })
  });
  assert.equal(show.status, 200);
  const restored = await fetch(`${base}/api/files?refresh=1`).then((response) => response.json());
  assert.deepEqual(restored.map((file) => file.path), ["Article/portrait.png", "Article/public.md", "Article/secret.md"]);
});
