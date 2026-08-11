import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AuthStore } from "../auth.mjs";
import { MapStore } from "../map-store.mjs";

test("maps persist independent fog, feature, zone, note, and token layers", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "folder-wiki-maps-"));
  const database = path.join(directory, "wiki.db");
  const auth = new AuthStore(database); const maps = new MapStore(database);
  context.after(() => { maps.close(); auth.close(); return rm(directory, { recursive: true, force: true }); });

  const gm = await auth.register("mapgm", "a sufficiently secure password");
  const playerRole = auth.listRoles().find((role) => role.systemKey === "player");
  const player = await auth.createUser({ username: "mapplayer", password: "a sufficiently secure password", roleIds: [playerRole.id] });
  const first = maps.createMap({ name: "Western Reach" }, gm.id); const second = maps.createMap({ name: "Deep Roads" }, gm.id);
  assert.equal(first.isActive, true); assert.equal(second.isActive, false);
  assert.deepEqual(maps.listMaps(false).map((map) => map.name), ["Western Reach"]);
  maps.activateMap(second.id); assert.deepEqual(maps.listMaps(false).map((map) => map.name), ["Deep Roads"]);
  assert.equal(maps.getMap(first.id, false), null);

  maps.setHex(second.id, { col: 2, row: 3, isFog: true });
  const wyrm = maps.createFeature(second.id, {
    col: 2, row: 3, name: "Sleeping wyrm", icon: "🐉", description: "Older than the road.", isVisible: true
  }, gm.id);
  const lair = maps.createFeature(second.id, {
    col: 2, row: 3, name: "Ashen lair", icon: "◆", description: "The displayed marker.", isDisplayed: true, isVisible: true
  }, gm.id);
  maps.createFeature(second.id, {
    col: 1, row: 1, name: "GM cache", icon: "◆", description: "Private.", isVisible: false
  }, gm.id);
  assert.equal(maps.feature(second.id, wyrm.id).isDisplayed, 0);
  assert.equal(maps.feature(second.id, lair.id).isDisplayed, 1);

  const frontier = maps.createZone(second.id, {
    name: "Ash Frontier", description: "Dragon-scorched uplands.", color: "#7a3e65", isVisible: true
  }, gm.id);
  const secret = maps.createZone(second.id, {
    name: "Secret Ways", description: "GM only.", color: "#386b57", isVisible: false
  }, gm.id);
  maps.paintZone(second.id, { zoneId: frontier.id, hexes: [{ col: 2, row: 3 }, { col: 1, row: 1 }] });
  maps.paintZone(second.id, { zoneId: secret.id, hexes: [{ col: 1, row: 0 }] });

  maps.addNote(second.id, { col: 2, row: 3, body: "Do not wake it." }, gm.id);
  const visibleNote = maps.addNote(second.id, { col: 1, row: 1, body: "Old bridge." }, player.id);
  const hiddenToken = maps.createToken(second.id, {
    col: 2, row: 3, label: "Dragon", icon: "◆", color: "#8b3f35", isVisible: true
  }, gm.id);
  maps.createToken(second.id, {
    col: 1, row: 1, label: "GM scout", icon: "●", color: "#386b57", isVisible: false
  }, gm.id);
  const party = maps.createToken(second.id, {
    col: 1, row: 1, label: "Party", icon: "●", color: "#386b57", isVisible: true
  }, gm.id);
  assert.throws(() => maps.createToken(second.id, { col: 1, row: 1, label: "Unsafe", color: "red; display:none" }, gm.id), /hex color/);

  const gmMap = maps.getMap(second.id, true);
  assert.equal(gmMap.features.length, 3); assert.equal(gmMap.zones.length, 2);
  assert.equal(gmMap.notes.length, 2); assert.equal(gmMap.tokens.length, 3);
  assert.equal(gmMap.features.find((feature) => feature.id === lair.id).description, "The displayed marker.");

  const playerMap = maps.getMap(second.id, false);
  assert.deepEqual(playerMap.hexes.find((hex) => hex.col === 2 && hex.row === 3), { col: 2, row: 3, isFog: true });
  assert.deepEqual(playerMap.features, []);
  assert.deepEqual(playerMap.notes.map((note) => note.body), ["Old bridge."]);
  assert.deepEqual(playerMap.tokens.map((token) => token.label), ["Party"]);
  assert.deepEqual(playerMap.zones.map((zone) => ({ name: zone.name, hexes: zone.hexes })), [
    { name: "Ash Frontier", hexes: [{ col: 1, row: 1 }] }
  ]);

  assert.throws(() => maps.updateNote(second.id, visibleNote.id, "Changed", gm.id, false), /own notes/);
  assert.throws(() => maps.deleteNote(second.id, visibleNote.id, gm.id, false), /own notes/);
  maps.updateNote(second.id, visibleNote.id, "Safe bridge.", player.id, false);
  assert.deepEqual(maps.resizeImpact(second.id, { mapWidth: 320, mapHeight: 240, hexSize: 240, offsetX: 0, offsetY: 0 }), {
    columns: 2, rows: 2, features: 2, zones: 1, notes: 1, tokens: 1, total: 5
  });
  maps.deleteToken(second.id, hiddenToken.id); maps.updateToken(second.id, party.id, { isVisible: false });
  maps.updateZone(second.id, frontier.id, { isVisible: false }); maps.updateFeature(second.id, lair.id, { isVisible: false });

  maps.updateMap(second.id, { mapWidth: 320, mapHeight: 240, hexSize: 240, offsetX: 0, offsetY: 0 });
  const resized = maps.getMap(second.id, true);
  assert.equal(resized.mapWidth, 320); assert.equal(resized.columns, 2); assert.equal(resized.rows, 2);
  assert.equal(resized.hexes.length, 0); assert.equal(resized.features.length, 1);
  assert.equal(resized.tokens.length, 2); assert.equal(resized.notes.length, 1);
  assert.equal(resized.zones.find((zone) => zone.id === frontier.id).hexes.length, 1);

  maps.setHexes(second.id, [{ col: 0, row: 0, isFog: true }, { col: 1, row: 0, isFog: true }]);
  maps.paintFeatures(second.id, {
    name: "Border keep", icon: "🏰", description: "A repeated brush.", isVisible: true,
    hexes: [{ col: 0, row: 0 }, { col: 1, row: 0 }]
  }, gm.id);
  maps.paintFeatures(second.id, {
    name: "Border keep", icon: "🏰", description: "Updated without duplication.", isVisible: true,
    hexes: [{ col: 0, row: 0 }]
  }, gm.id);
  assert.equal(maps.getMap(second.id, true).features.filter((feature) => feature.col === 0 && feature.row === 0).length, 1);

  const template = maps.createTemplate({
    name: "Ruined Keep", features: [
      { name: "Ruined keep", icon: "🏰", description: "Collapsed walls.", isDisplayed: true, isVisible: true },
      { name: "Old heraldry", icon: "◆", description: "Faded device.", isDisplayed: false, isVisible: false }
    ], notes: ["Collapsed gate", "Old heraldry"]
  }, gm.id);
  maps.applyTemplate(second.id, { col: 0, row: 1, templateId: template.id }, gm.id);
  const templated = maps.getMap(second.id, true);
  assert.deepEqual(templated.features.filter((feature) => feature.col === 0 && feature.row === 1).map((feature) => feature.name), ["Ruined keep", "Old heraldry"]);
  assert.deepEqual(templated.notes.filter((note) => note.col === 0 && note.row === 1).map((note) => note.body), ["Collapsed gate", "Old heraldry"]);
  maps.deleteTemplate(template.id);
  maps.setAllFog(second.id, true); assert.equal(maps.getMap(second.id, true).hexes.filter((hex) => hex.isFog).length, 4);
  maps.setAllFog(second.id, false); assert.equal(maps.getMap(second.id, true).hexes.some((hex) => hex.isFog), false);
});

test("existing single-feature maps and templates migrate without losing content", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "folder-wiki-map-migration-")); const database = path.join(directory, "wiki.db");
  const auth = new AuthStore(database); const gm = await auth.register("migrationgm", "a sufficiently secure password"); auth.close();
  const legacy = new DatabaseSync(database); const created = new Date().toISOString();
  legacy.exec(`
    CREATE TABLE world_maps (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, image_path TEXT, map_width INTEGER NOT NULL DEFAULT 1200,
      map_height INTEGER NOT NULL DEFAULT 800, grid_columns INTEGER NOT NULL DEFAULT 16, grid_rows INTEGER NOT NULL DEFAULT 12,
      hex_size REAL NOT NULL DEFAULT 42, offset_x REAL NOT NULL DEFAULT 0, offset_y REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)), created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE map_hexes (
      map_id INTEGER NOT NULL REFERENCES world_maps(id) ON DELETE CASCADE, column_index INTEGER NOT NULL, row_index INTEGER NOT NULL,
      is_fog INTEGER NOT NULL DEFAULT 0 CHECK (is_fog IN (0, 1)), feature_icon TEXT, feature_label TEXT, feature_color TEXT,
      PRIMARY KEY (map_id, column_index, row_index)
    ) STRICT;
    CREATE TABLE map_tokens (
      id INTEGER PRIMARY KEY, map_id INTEGER NOT NULL REFERENCES world_maps(id) ON DELETE CASCADE, label TEXT NOT NULL, icon TEXT NOT NULL,
      color TEXT NOT NULL, column_index INTEGER NOT NULL, row_index INTEGER NOT NULL, created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE map_hex_templates (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, feature_icon TEXT, feature_label TEXT, feature_color TEXT,
      notes_json TEXT NOT NULL DEFAULT '[]', created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
  `);
  legacy.prepare(`INSERT INTO world_maps
    (id, name, map_width, map_height, grid_columns, grid_rows, hex_size, offset_x, offset_y, is_active, created_by, created_at, updated_at)
    VALUES (1, 'Legacy map', 1200, 800, 16, 12, 42, 0, 0, 1, ?, ?, ?)`).run(gm.id, created, created);
  legacy.prepare("INSERT INTO map_hexes VALUES (1, 2, 3, 0, '🐉', 'Old wyrm', '#7a3e65')").run();
  legacy.prepare("INSERT INTO map_tokens VALUES (1, 1, 'Party', '●', '#386b57', 2, 3, ?, ?, ?)").run(gm.id, created, created);
  legacy.prepare("INSERT INTO map_hex_templates VALUES (1, 'Old shrine', '⛩', 'Ancient shrine', '#a56a36', '[\"Offerings\"]', ?, ?, ?)").run(gm.id, created, created);
  legacy.close();

  let maps = new MapStore(database); context.after(async () => { maps.close(); await rm(directory, { recursive: true, force: true }); });
  const migrated = maps.getMap(1, true);
  assert.deepEqual(migrated.features.map(({ name, icon, description, isDisplayed, isVisible }) => ({
    name, icon, description, isDisplayed, isVisible
  })), [{ name: "Old wyrm", icon: "🐉", description: "", isDisplayed: true, isVisible: true }]);
  assert.equal(migrated.tokens[0].isVisible, true);
  assert.deepEqual(maps.listTemplates()[0].features, [{
    name: "Ancient shrine", icon: "⛩", description: "", isDisplayed: true, isVisible: true
  }]);
  maps.deleteFeature(1, migrated.features[0].id); maps.close(); maps = new MapStore(database);
  assert.deepEqual(maps.getMap(1, true).features, []);
});
