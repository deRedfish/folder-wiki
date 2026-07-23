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
const request = (base, path, cookie, method, body) => fetch(`${base}${path}`, jsonRequest(cookie, method, body));

test("map APIs enforce GM layer editing and redact fogged or individually hidden content", async (context) => {
  const content = await mkdtemp(path.join(tmpdir(), "folder-wiki-map-content-")); const images = path.join(content, "Maps");
  await mkdir(images); await writeFile(path.join(images, "region.png"), png);
  context.after(() => rm(content, { recursive: true, force: true }));

  const base = await startWiki(context, content);
  const { cookie: gmCookie } = await register(base, "worldgm"); const { cookie: playerCookie } = await register(base, "worldplayer");
  assert.equal((await request(base, "/api/maps", playerCookie, "POST", { name: "Forbidden" })).status, 403);
  const created = await request(base, "/api/maps", gmCookie, "POST", { name: "Western Reach" }).then((response) => response.json());
  assert.equal(created.isActive, true);

  const imagesResponse = await fetch(`${base}/api/maps/images`, withSession(gmCookie));
  assert.deepEqual((await imagesResponse.json()).map((image) => image.path), ["Maps/region.png"]);
  await request(base, `/api/maps/${created.id}`, gmCookie, "PUT", {
    imagePath: "Maps/region.png", mapWidth: 960, mapHeight: 640, columns: 10, rows: 8, hexSize: 36
  });
  assert.equal((await fetch(`${base}/api/maps/${created.id}/image`, withSession(playerCookie))).status, 200);

  await request(base, `/api/maps/${created.id}/hex`, gmCookie, "PUT", { col: 2, row: 3, isFog: true });
  const hiddenFeature = await request(base, `/api/maps/${created.id}/features`, gmCookie, "POST", {
    col: 2, row: 3, name: "Hidden wyrm", icon: "🐉", description: "Under the mountain.", isVisible: true
  }).then((response) => response.json());
  const privateFeature = await request(base, `/api/maps/${created.id}/features`, gmCookie, "POST", {
    col: 1, row: 1, name: "GM clue", icon: "◆", description: "Private.", isVisible: false
  }).then((response) => response.json());
  const visibleFeature = await request(base, `/api/maps/${created.id}/features`, gmCookie, "POST", {
    col: 1, row: 1, name: "Old fort", icon: "🏰", description: "Broken walls.", isDisplayed: true, isVisible: true
  }).then((response) => response.json());
  await request(base, `/api/maps/${created.id}/features/${visibleFeature.id}`, gmCookie, "PUT", { description: "Broken northern walls." });

  const zone = await request(base, `/api/maps/${created.id}/zones`, gmCookie, "POST", {
    name: "Highlands", description: "Wind-cut plateau.", color: "#7a6b9a", isVisible: true
  }).then((response) => response.json());
  const privateZone = await request(base, `/api/maps/${created.id}/zones`, gmCookie, "POST", {
    name: "Secret road", description: "GM only.", color: "#386b57", isVisible: false
  }).then((response) => response.json());
  await request(base, `/api/maps/${created.id}/zones/paint`, gmCookie, "PUT", {
    zoneId: zone.id, hexes: [{ col: 2, row: 3 }, { col: 1, row: 1 }]
  });
  await request(base, `/api/maps/${created.id}/zones/paint`, gmCookie, "PUT", {
    zoneId: privateZone.id, hexes: [{ col: 0, row: 0 }]
  });

  await request(base, `/api/maps/${created.id}/notes`, playerCookie, "POST", { col: 2, row: 3, body: "A guess in the mist." });
  await request(base, `/api/maps/${created.id}/notes`, playerCookie, "POST", { col: 1, row: 1, body: "The gate is open." });
  const fogToken = await request(base, `/api/maps/${created.id}/tokens`, gmCookie, "POST", {
    col: 2, row: 3, label: "Wyrm", icon: "◆", color: "#8b3f35", isVisible: true
  }).then((response) => response.json());
  const privateToken = await request(base, `/api/maps/${created.id}/tokens`, gmCookie, "POST", {
    col: 1, row: 1, label: "GM patrol", icon: "●", color: "#386b57", isVisible: false
  }).then((response) => response.json());
  await request(base, `/api/maps/${created.id}/tokens`, gmCookie, "POST", {
    col: 1, row: 1, label: "Party", icon: "●", color: "#386b57", isVisible: true
  });

  const gmMap = await fetch(`${base}/api/maps/${created.id}`, withSession(gmCookie)).then((response) => response.json());
  assert.equal(gmMap.features.length, 3); assert.equal(gmMap.zones.length, 2);
  assert.equal(gmMap.notes.length, 2); assert.equal(gmMap.tokens.length, 3);
  assert.equal(gmMap.features.find((feature) => feature.id === visibleFeature.id).description, "Broken northern walls.");

  const playerMap = await fetch(`${base}/api/maps/${created.id}`, withSession(playerCookie)).then((response) => response.json());
  assert.equal(playerMap.hexes.find((hex) => hex.col === 2 && hex.row === 3).isFog, true);
  assert.deepEqual(playerMap.features.map((feature) => feature.name), ["Old fort"]);
  assert.deepEqual(playerMap.notes.map((note) => note.body), ["The gate is open."]);
  assert.deepEqual(playerMap.tokens.map((token) => token.label), ["Party"]);
  assert.deepEqual(playerMap.zones.map((item) => ({ name: item.name, hexes: item.hexes })), [
    { name: "Highlands", hexes: [{ col: 1, row: 1 }] }
  ]);

  for (const endpoint of [
    `/api/maps/${created.id}/features`, `/api/maps/${created.id}/zones`, `/api/maps/${created.id}/tokens`
  ]) assert.equal((await request(base, endpoint, playerCookie, "POST", {})).status, 403);
  assert.equal((await request(base, `/api/maps/${created.id}/fog`, playerCookie, "PUT", { isFog: false })).status, 403);
  assert.equal((await request(base, `/api/maps/${created.id}/fog`, gmCookie, "PUT", { isFog: false })).status, 200);

  await request(base, `/api/maps/${created.id}/features/paint`, gmCookie, "PUT", {
    name: "Shrine", icon: "⛩", description: "Wayside altar.", isVisible: true, hexes: [{ col: 0, row: 0 }, { col: 1, row: 0 }]
  });
  await request(base, `/api/maps/${created.id}/zones/paint`, gmCookie, "PUT", { zoneId: null, hexes: [{ col: 1, row: 1 }] });
  assert.equal((await request(base, `/api/maps/${created.id}/features/${privateFeature.id}`, gmCookie, "DELETE", {})).status, 200);
  assert.equal((await request(base, `/api/maps/${created.id}/zones/${privateZone.id}`, gmCookie, "DELETE", {})).status, 200);
  assert.equal((await request(base, `/api/maps/${created.id}/tokens/${privateToken.id}`, gmCookie, "DELETE", {})).status, 200);

  assert.equal((await fetch(`${base}/api/maps/templates`, withSession(playerCookie))).status, 403);
  const template = await request(base, "/api/maps/templates", gmCookie, "POST", {
    name: "Ancient Shrine", features: [
      { name: "Ancient shrine", icon: "⛩", description: "Offerings remain.", isDisplayed: true, isVisible: true }
    ], notes: ["Offerings remain."]
  }).then((response) => response.json());
  assert.equal((await request(base, `/api/maps/${created.id}/hex/template`, gmCookie, "POST", {
    col: 1, row: 1, templateId: template.id
  })).status, 200);
  assert.equal((await request(base, `/api/maps/${created.id}/hexes`, gmCookie, "PUT", { hexes: [
    { col: 0, row: 0, isFog: true }, { col: 1, row: 0, isFog: true }
  ] })).status, 200);
  const impact = await request(base, `/api/maps/${created.id}/resize-impact`, gmCookie, "POST", {
    mapWidth: 320, mapHeight: 240, hexSize: 240, offsetX: 0, offsetY: 0
  }).then((response) => response.json());
  assert.ok(impact.total >= 2); assert.ok(Object.hasOwn(impact, "zones"));

  const uploaded = await request(base, "/api/maps/images", gmCookie, "POST", {
    folder: "World Maps", name: "uploaded.png", data: png.toString("base64")
  });
  assert.equal(uploaded.status, 201); assert.equal((await uploaded.json()).path, "World Maps/uploaded.png");
  assert.equal((await request(base, "/api/maps/images", gmCookie, "POST", {
    folder: ".hidden", name: "lost.png", data: png.toString("base64")
  })).status, 400);

  const second = await request(base, "/api/maps", gmCookie, "POST", { name: "Deep Roads" }).then((response) => response.json());
  assert.equal((await fetch(`${base}/api/maps/${second.id}`, withSession(playerCookie))).status, 404);
  await request(base, `/api/maps/${second.id}/activate`, gmCookie, "POST", {});
  const visibleMaps = await fetch(`${base}/api/maps`, withSession(playerCookie)).then((response) => response.json());
  assert.deepEqual(visibleMaps.map((map) => map.name), ["Deep Roads"]);

  assert.ok(hiddenFeature.id); assert.ok(fogToken.id);
});
