import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeContentPath, titleFromText } from "../server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("content paths cannot escape the content directory", () => {
  assert.throws(() => safeContentPath("../outside.md"), /Invalid path/);
  assert.match(safeContentPath("Notes/Page.md"), /content[\\/]Notes[\\/]Page\.md$/);
});

test("Markdown headings provide readable source titles", () => {
  assert.equal(titleFromText("notes.md", "# Useful Notes\n\nBody"), "Useful Notes");
  assert.equal(titleFromText("quick-reference.md", "No heading"), "quick reference");
});

test("a fresh wiki starts and exposes empty content APIs", async (context) => {
  const content = await mkdtemp(path.join(tmpdir(), "folder-wiki-empty-"));
  const child = spawn(process.execPath, ["server.mjs"], { cwd: ROOT, env: { ...process.env, CONTENT_ROOT: content, PORT: "0", HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"] });
  context.after(async () => { child.kill(); await rm(content, { recursive: true, force: true }); });
  let output = "";
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. ${output}`)), 10_000);
    const inspect = (chunk) => {
      output += chunk.toString(); const match = output.match(/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    };
    child.stdout.on("data", inspect); child.stderr.on("data", inspect); child.once("exit", (code) => reject(new Error(`Server exited with ${code}. ${output}`)));
  });
  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json());
  const files = await fetch(`http://127.0.0.1:${port}/api/files`).then((response) => response.json());
  const folders = await fetch(`http://127.0.0.1:${port}/api/folders`).then((response) => response.json());
  assert.deepEqual(health, { ok: true });
  assert.deepEqual(files, []);
  assert.deepEqual(folders, []);
});
