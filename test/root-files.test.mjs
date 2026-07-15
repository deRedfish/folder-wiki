import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

test("root-level files do not create virtual articles", async (context) => {
  const content = await mkdtemp(path.join(tmpdir(), "folder-wiki-content-"));
  await writeFile(path.join(content, "stray.json"), "{}", "utf8");
  await mkdir(path.join(content, "Real Article"));
  await writeFile(path.join(content, "Real Article", "page.md"), "# Real Article", "utf8");
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: path.resolve("."),
    env: { ...process.env, CONTENT_ROOT: content, PORT: "0", HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  context.after(async () => { child.kill(); await rm(content, { recursive: true, force: true }); });
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
  const files = await fetch(`http://127.0.0.1:${port}/api/files?refresh=1`).then((response) => response.json());
  const folders = await fetch(`http://127.0.0.1:${port}/api/folders?refresh=1`).then((response) => response.json());
  assert.deepEqual(files.map((file) => file.path), ["Real Article/page.md"]);
  assert.deepEqual(folders, ["Real Article"]);
});
