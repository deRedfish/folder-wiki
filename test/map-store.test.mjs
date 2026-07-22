import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AuthStore } from "../auth.mjs";
import { MapStore } from "../map-store.mjs";

test("maps persist configuration and expose only the active map to viewers", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "folder-wiki-maps-"));
  const database = path.join(directory, "wiki.db");
  const auth = new AuthStore(database);
  const maps = new MapStore(database);
  context.after(() => { maps.close(); auth.close(); return rm(directory, { recursive: true, force: true }); });

  const gm = await auth.register("mapgm", "a sufficiently secure password");
  const playerRole = auth.listRoles().find((role) => role.systemKey === "player");
  const player = await auth.createUser({ username: "mapplayer", password: "a sufficiently secure password", roleIds: [playerRole.id] });
  const first = maps.createMap({ name: "Western Reach" }, gm.id);
  const second = maps.createMap({ name: "Deep Roads" }, gm.id);

  assert.equal(first.isActive, true);
  assert.equal(second.isActive, false);
  assert.deepEqual(maps.listMaps(false).map((map) => map.name), ["Western Reach"]);
  maps.activateMap(second.id);
  assert.deepEqual(maps.listMaps(false).map((map) => map.name), ["Deep Roads"]);
  assert.equal(maps.getMap(first.id, false), null);

  maps.setHex(second.id, { col: 2, row: 3, isFog: true, featureIcon: "🐉", featureLabel: "Sleeping wyrm", featureColor: "#7a3e65" });
  maps.addNote(second.id, { col: 2, row: 3, body: "Do not wake it." }, gm.id);
  const visibleNote = maps.addNote(second.id, { col: 1, row: 1, body: "Old bridge." }, player.id);
  const hiddenToken = maps.createToken(second.id, { col: 2, row: 3, label: "Dragon", icon: "◆", color: "#8b3f35" }, gm.id);
  maps.createToken(second.id, { col: 1, row: 1, label: "Party", icon: "●", color: "#386b57" }, gm.id);

  const gmMap = maps.getMap(second.id, true);
  assert.equal(gmMap.hexes[0].featureLabel, "Sleeping wyrm");
  assert.equal(gmMap.notes.length, 2);
  assert.equal(gmMap.tokens.length, 2);

  const playerMap = maps.getMap(second.id, false);
  assert.deepEqual(playerMap.hexes[0], { col: 2, row: 3, isFog: true, featureIcon: null, featureLabel: null, featureColor: null });
  assert.deepEqual(playerMap.notes.map((note) => note.body), ["Old bridge."]);
  assert.deepEqual(playerMap.tokens.map((token) => token.label), ["Party"]);
  assert.throws(() => maps.updateNote(second.id, visibleNote.id, "Changed", gm.id, false), /own notes/);
  assert.throws(() => maps.deleteNote(second.id, visibleNote.id, gm.id, false), /own notes/);
  maps.updateNote(second.id, visibleNote.id, "Safe bridge.", player.id, false);
  maps.deleteToken(second.id, hiddenToken.id);

  maps.updateMap(second.id, { columns: 2, rows: 2, mapWidth: 900, mapHeight: 600, hexSize: 30 });
  const resized = maps.getMap(second.id, true);
  assert.equal(resized.mapWidth, 900);
  assert.equal(resized.hexes.length, 0);
  assert.equal(resized.tokens.length, 1);
  assert.equal(resized.notes.length, 1);
});
