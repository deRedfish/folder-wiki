import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { safeContentPath, titleFromText } from "../server.mjs";
import { register, startWiki, withSession } from "../test-support/http.mjs";

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
  const base = await startWiki(context, content); const { cookie } = await register(base, "firstadmin");
  context.after(() => rm(content, { recursive: true, force: true }));
  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  assert.equal((await fetch(`${base}/api/files`)).status, 401);
  const files = await fetch(`${base}/api/files`, withSession(cookie)).then((response) => response.json());
  const folders = await fetch(`${base}/api/folders`, withSession(cookie)).then((response) => response.json());
  assert.deepEqual(health, { ok: true });
  assert.deepEqual(files, []);
  assert.deepEqual(folders, []);
});
