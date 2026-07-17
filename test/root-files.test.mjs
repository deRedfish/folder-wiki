import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { register, startWiki, withSession } from "../test-support/http.mjs";

test("root-level files do not create virtual articles", async (context) => {
  const content = await mkdtemp(path.join(tmpdir(), "folder-wiki-content-"));
  await writeFile(path.join(content, "stray.json"), "{}", "utf8");
  await mkdir(path.join(content, "Real Article"));
  await writeFile(path.join(content, "Real Article", "page.md"), "# Real Article", "utf8");
  const base = await startWiki(context, content); const { cookie } = await register(base, "firstadmin");
  context.after(() => rm(content, { recursive: true, force: true }));
  const files = await fetch(`${base}/api/files?refresh=1`, withSession(cookie)).then((response) => response.json());
  const folders = await fetch(`${base}/api/folders?refresh=1`, withSession(cookie)).then((response) => response.json());
  assert.deepEqual(files.map((file) => file.path), ["Real Article/page.md"]);
  assert.deepEqual(folders, ["Real Article"]);
});
