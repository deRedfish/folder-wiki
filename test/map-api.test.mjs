import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { register, startWiki, withSession } from "../test-support/http.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const jsonRequest = (cookie, method, body) => withSession(cookie, {
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body)
});

test("map APIs enforce GM editing and redact fogged content from players", async (context) => {
  const content = await mkdtemp(path.join(tmpdir(), "folder-wiki-map-content-"));
  const images = path.join(content, "Maps");
  await mkdir(images);
  await writeFile(path.join(images, "region.png"), png);
  context.after(() => rm(content, { recursive: true, force: true }));

  const base = await startWiki(context, content);
  const { cookie: gmCookie } = await register(base, "worldgm");
  const { cookie: playerCookie } = await register(base, "worldplayer");

  assert.equal((await fetch(`${base}/api/maps`, jsonRequest(playerCookie, "POST", { name: "Forbidden" }))).status, 403);
  const createdResponse = await fetch(`${base}/api/maps`, jsonRequest(gmCookie, "POST", { name: "Western Reach" }));
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.isActive, true);

  const imagesResponse = await fetch(`${base}/api/maps/images`, withSession(gmCookie));
  assert.deepEqual((await imagesResponse.json()).map((image) => image.path), ["Maps/region.png"]);
  await fetch(`${base}/api/maps/${created.id}`, jsonRequest(gmCookie, "PUT", {
    imagePath: "Maps/region.png", mapWidth: 960, mapHeight: 640, columns: 10, rows: 8, hexSize: 36
  }));

  assert.equal((await fetch(`${base}/api/maps/${created.id}/image`, withSession(playerCookie))).status, 200);
  await fetch(`${base}/api/maps/${created.id}/hex`, jsonRequest(gmCookie, "PUT", {
    col: 2, row: 3, isFog: true, featureIcon: "🐉", featureLabel: "Hidden wyrm", featureColor: "#7a3e65"
  }));
  await fetch(`${base}/api/maps/${created.id}/notes`, jsonRequest(playerCookie, "POST", { col: 2, row: 3, body: "A guess in the mist." }));
  await fetch(`${base}/api/maps/${created.id}/tokens`, jsonRequest(gmCookie, "POST", {
    col: 2, row: 3, label: "Wyrm", icon: "◆", color: "#8b3f35"
  }));

  const gmMap = await fetch(`${base}/api/maps/${created.id}`, withSession(gmCookie)).then((response) => response.json());
  assert.equal(gmMap.hexes[0].featureLabel, "Hidden wyrm");
  assert.equal(gmMap.notes.length, 1);
  assert.equal(gmMap.tokens.length, 1);

  const playerMap = await fetch(`${base}/api/maps/${created.id}`, withSession(playerCookie)).then((response) => response.json());
  assert.equal(playerMap.hexes[0].isFog, true);
  assert.equal(playerMap.hexes[0].featureLabel, null);
  assert.deepEqual(playerMap.notes, []);
  assert.deepEqual(playerMap.tokens, []);
  assert.equal((await fetch(`${base}/api/maps/${created.id}/fog`, jsonRequest(playerCookie, "PUT", { isFog: false }))).status, 403);
  assert.equal((await fetch(`${base}/api/maps/${created.id}/fog`, jsonRequest(gmCookie, "PUT", { isFog: false }))).status, 200);

  const uploaded = await fetch(`${base}/api/maps/images`, jsonRequest(gmCookie, "POST", {
    folder: "World Maps", name: "uploaded.png", data: png.toString("base64")
  }));
  assert.equal(uploaded.status, 201);
  assert.equal((await uploaded.json()).path, "World Maps/uploaded.png");
  assert.equal((await fetch(`${base}/api/maps/images`, jsonRequest(gmCookie, "POST", {
    folder: ".hidden", name: "lost.png", data: png.toString("base64")
  }))).status, 400);

  const second = await fetch(`${base}/api/maps`, jsonRequest(gmCookie, "POST", { name: "Deep Roads" })).then((response) => response.json());
  assert.equal((await fetch(`${base}/api/maps/${second.id}`, withSession(playerCookie))).status, 404);
  await fetch(`${base}/api/maps/${second.id}/activate`, jsonRequest(gmCookie, "POST", {}));
  const visibleMaps = await fetch(`${base}/api/maps`, withSession(playerCookie)).then((response) => response.json());
  assert.deepEqual(visibleMaps.map((map) => map.name), ["Deep Roads"]);
});
