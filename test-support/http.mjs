import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";

export async function startWiki(context, content, runtime = null) {
  const runtimePath = runtime || await mkdtemp(path.join(tmpdir(), "folder-wiki-runtime-"));
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: path.resolve("."), env: { ...process.env, CONTENT_ROOT: content, RUNTIME_ROOT: runtimePath, PORT: "0", HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"]
  });
  context.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, "exit"); }
    if (!runtime) await rm(runtimePath, { recursive: true, force: true });
  });
  let output = "";
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. ${output}`)), 10_000);
    const inspect = (chunk) => { output += chunk.toString(); const match = output.match(/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timeout); resolve(Number(match[1])); } };
    child.stdout.on("data", inspect); child.stderr.on("data", inspect); child.once("exit", (code) => reject(new Error(`Server exited with ${code}. ${output}`)));
  });
  return `http://127.0.0.1:${port}`;
}

export async function register(base, username, password = "a sufficiently secure password") {
  const response = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error);
  return { user: data, cookie: response.headers.get("set-cookie").split(";", 1)[0] };
}

export function withSession(cookie, options = {}) {
  return { ...options, headers: { ...(options.headers || {}), cookie } };
}
