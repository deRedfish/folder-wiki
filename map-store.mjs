import { DatabaseSync } from "node:sqlite";

const now = () => new Date().toISOString();
const DEFAULTS = { mapWidth: 1200, mapHeight: 800, columns: 16, rows: 12, hexSize: 42, offsetX: 0, offsetY: 0 };

function integer(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return parsed;
}
function number(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return parsed;
}
function text(value, label, max, required = false) {
  const parsed = String(value ?? "").trim();
  if (required && !parsed) throw new Error(`${label} is required`);
  if (parsed.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return parsed;
}
function color(value, label, fallback = null) {
  const parsed = text(value, label, 24);
  if (!parsed) return fallback;
  if (!/^#[0-9a-f]{6}$/i.test(parsed)) throw new Error(`${label} must be a six-digit hex color`);
  return parsed.toLowerCase();
}
function mapRecord(row) {
  return {
    id: row.id, name: row.name, imagePath: row.imagePath || null,
    mapWidth: row.mapWidth, mapHeight: row.mapHeight, columns: row.columns, rows: row.rows,
    hexSize: row.hexSize, offsetX: row.offsetX, offsetY: row.offsetY,
    isActive: Boolean(row.isActive), createdAt: row.createdAt, updatedAt: row.updatedAt
  };
}

export class MapStore {
  constructor(databasePath) {
    this.db = new DatabaseSync(databasePath, { timeout: 5000 });
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS world_maps (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        image_path TEXT,
        map_width INTEGER NOT NULL DEFAULT 1200,
        map_height INTEGER NOT NULL DEFAULT 800,
        grid_columns INTEGER NOT NULL DEFAULT 16,
        grid_rows INTEGER NOT NULL DEFAULT 12,
        hex_size REAL NOT NULL DEFAULT 42,
        offset_x REAL NOT NULL DEFAULT 0,
        offset_y REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS map_hexes (
        map_id INTEGER NOT NULL REFERENCES world_maps(id) ON DELETE CASCADE,
        column_index INTEGER NOT NULL,
        row_index INTEGER NOT NULL,
        is_fog INTEGER NOT NULL DEFAULT 0 CHECK (is_fog IN (0, 1)),
        feature_icon TEXT,
        feature_label TEXT,
        feature_color TEXT,
        PRIMARY KEY (map_id, column_index, row_index)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS map_notes (
        id INTEGER PRIMARY KEY,
        map_id INTEGER NOT NULL REFERENCES world_maps(id) ON DELETE CASCADE,
        column_index INTEGER NOT NULL,
        row_index INTEGER NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS map_tokens (
        id INTEGER PRIMARY KEY,
        map_id INTEGER NOT NULL REFERENCES world_maps(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        column_index INTEGER NOT NULL,
        row_index INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS world_maps_one_active ON world_maps(is_active) WHERE is_active = 1;
      CREATE INDEX IF NOT EXISTS map_notes_cell ON map_notes(map_id, column_index, row_index);
      CREATE INDEX IF NOT EXISTS map_tokens_cell ON map_tokens(map_id, column_index, row_index);
    `);
  }

  close() { this.db.close(); }

  transaction(work) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  row(mapId) {
    return this.db.prepare(`SELECT id, name, image_path AS imagePath, map_width AS mapWidth, map_height AS mapHeight,
      grid_columns AS columns, grid_rows AS rows, hex_size AS hexSize, offset_x AS offsetX, offset_y AS offsetY,
      is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM world_maps WHERE id = ?`).get(Number(mapId));
  }

  requireMap(mapId) {
    const row = this.row(mapId);
    if (!row) throw new Error("Map not found");
    return mapRecord(row);
  }

  listMaps(isAdmin) {
    const condition = isAdmin ? "" : "WHERE is_active = 1";
    const rows = this.db.prepare(`SELECT id, name, image_path AS imagePath, map_width AS mapWidth, map_height AS mapHeight,
      grid_columns AS columns, grid_rows AS rows, hex_size AS hexSize, offset_x AS offsetX, offset_y AS offsetY,
      is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM world_maps
      ${condition} ORDER BY is_active DESC, name COLLATE NOCASE`).all();
    return rows.map(mapRecord);
  }

  getMap(mapId, isAdmin) {
    const map = this.requireMap(mapId);
    if (!isAdmin && !map.isActive) return null;
    let hexes = this.db.prepare(`SELECT column_index AS col, row_index AS row, is_fog AS isFog,
      feature_icon AS featureIcon, feature_label AS featureLabel, feature_color AS featureColor
      FROM map_hexes WHERE map_id = ?`).all(map.id).map((hex) => ({ ...hex, isFog: Boolean(hex.isFog) }));
    let notes = this.db.prepare(`SELECT n.id, n.column_index AS col, n.row_index AS row, n.user_id AS userId,
      COALESCE(u.username, 'Deleted user') AS author, n.body, n.created_at AS createdAt, n.updated_at AS updatedAt
      FROM map_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.map_id = ? ORDER BY n.created_at`).all(map.id);
    let tokens = this.db.prepare(`SELECT id, label, icon, color, column_index AS col, row_index AS row,
      created_at AS createdAt, updated_at AS updatedAt FROM map_tokens WHERE map_id = ? ORDER BY id`).all(map.id);
    if (!isAdmin) {
      const fog = new Set(hexes.filter((hex) => hex.isFog).map((hex) => `${hex.col}:${hex.row}`));
      hexes = hexes.map((hex) => hex.isFog ? { col: hex.col, row: hex.row, isFog: true, featureIcon: null, featureLabel: null, featureColor: null } : hex);
      notes = notes.filter((note) => !fog.has(`${note.col}:${note.row}`));
      tokens = tokens.filter((token) => !fog.has(`${token.col}:${token.row}`));
    }
    return { ...map, hexes, notes, tokens };
  }

  createMap(input, userId) {
    const name = text(input.name, "Map name", 80, true);
    const created = now();
    return this.transaction(() => {
      const first = Number(this.db.prepare("SELECT COUNT(*) AS count FROM world_maps").get().count) === 0;
      const active = first || Boolean(input.isActive);
      if (active) this.db.prepare("UPDATE world_maps SET is_active = 0").run();
      const result = this.db.prepare(`INSERT INTO world_maps
        (name, map_width, map_height, grid_columns, grid_rows, hex_size, offset_x, offset_y, is_active, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        name, DEFAULTS.mapWidth, DEFAULTS.mapHeight, DEFAULTS.columns, DEFAULTS.rows,
        DEFAULTS.hexSize, DEFAULTS.offsetX, DEFAULTS.offsetY, active ? 1 : 0, Number(userId), created, created
      );
      return this.requireMap(result.lastInsertRowid);
    });
  }

  updateMap(mapId, input) {
    const current = this.requireMap(mapId);
    const next = {
      name: input.name === undefined ? current.name : text(input.name, "Map name", 80, true),
      imagePath: input.imagePath === undefined ? current.imagePath : (text(input.imagePath, "Image path", 500) || null),
      mapWidth: input.mapWidth === undefined ? current.mapWidth : integer(input.mapWidth, "Map width", 320, 6000),
      mapHeight: input.mapHeight === undefined ? current.mapHeight : integer(input.mapHeight, "Map height", 240, 6000),
      columns: input.columns === undefined ? current.columns : integer(input.columns, "Grid columns", 1, 120),
      rows: input.rows === undefined ? current.rows : integer(input.rows, "Grid rows", 1, 120),
      hexSize: input.hexSize === undefined ? current.hexSize : number(input.hexSize, "Hex size", 10, 240),
      offsetX: input.offsetX === undefined ? current.offsetX : number(input.offsetX, "Grid X offset", -6000, 6000),
      offsetY: input.offsetY === undefined ? current.offsetY : number(input.offsetY, "Grid Y offset", -6000, 6000)
    };
    this.transaction(() => {
      this.db.prepare(`UPDATE world_maps SET name = ?, image_path = ?, map_width = ?, map_height = ?, grid_columns = ?,
        grid_rows = ?, hex_size = ?, offset_x = ?, offset_y = ?, updated_at = ? WHERE id = ?`).run(
        next.name, next.imagePath, next.mapWidth, next.mapHeight, next.columns, next.rows,
        next.hexSize, next.offsetX, next.offsetY, now(), current.id
      );
      for (const table of ["map_hexes", "map_notes", "map_tokens"]) {
        this.db.prepare(`DELETE FROM ${table} WHERE map_id = ? AND (column_index >= ? OR row_index >= ?)`).run(current.id, next.columns, next.rows);
      }
    });
    return this.requireMap(current.id);
  }

  activateMap(mapId) {
    const map = this.requireMap(mapId);
    this.transaction(() => {
      this.db.prepare("UPDATE world_maps SET is_active = 0 WHERE is_active = 1").run();
      this.db.prepare("UPDATE world_maps SET is_active = 1, updated_at = ? WHERE id = ?").run(now(), map.id);
    });
    return this.requireMap(map.id);
  }

  deleteMap(mapId) {
    const map = this.requireMap(mapId);
    this.db.prepare("DELETE FROM world_maps WHERE id = ?").run(map.id);
  }

  cell(mapId, col, row) {
    const map = this.requireMap(mapId);
    return { map, col: integer(col, "Hex column", 0, map.columns - 1), row: integer(row, "Hex row", 0, map.rows - 1) };
  }

  setHex(mapId, input) {
    const { map, col, row } = this.cell(mapId, input.col, input.row);
    const featureIcon = text(input.featureIcon, "Feature icon", 16) || null;
    const featureLabel = text(input.featureLabel, "Feature label", 80) || null;
    const featureColor = color(input.featureColor, "Feature color");
    this.db.prepare(`INSERT INTO map_hexes (map_id, column_index, row_index, is_fog, feature_icon, feature_label, feature_color)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(map_id, column_index, row_index) DO UPDATE SET
      is_fog = excluded.is_fog, feature_icon = excluded.feature_icon, feature_label = excluded.feature_label, feature_color = excluded.feature_color`)
      .run(map.id, col, row, input.isFog ? 1 : 0, featureIcon, featureLabel, featureColor);
    this.touch(map.id);
  }

  setAllFog(mapId, isFog) {
    const map = this.requireMap(mapId);
    this.transaction(() => {
      if (!isFog) this.db.prepare("UPDATE map_hexes SET is_fog = 0 WHERE map_id = ?").run(map.id);
      else {
        const setFog = this.db.prepare(`INSERT INTO map_hexes (map_id, column_index, row_index, is_fog)
          VALUES (?, ?, ?, 1) ON CONFLICT(map_id, column_index, row_index) DO UPDATE SET is_fog = 1`);
        for (let row = 0; row < map.rows; row++) for (let col = 0; col < map.columns; col++) setFog.run(map.id, col, row);
      }
      this.touch(map.id);
    });
  }

  addNote(mapId, input, userId) {
    const { map, col, row } = this.cell(mapId, input.col, input.row);
    const body = text(input.body, "Note", 4000, true); const created = now();
    const result = this.db.prepare(`INSERT INTO map_notes (map_id, column_index, row_index, user_id, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(map.id, col, row, Number(userId), body, created, created);
    this.touch(map.id);
    return this.db.prepare(`SELECT n.id, n.column_index AS col, n.row_index AS row, n.user_id AS userId,
      u.username AS author, n.body, n.created_at AS createdAt, n.updated_at AS updatedAt
      FROM map_notes n JOIN users u ON u.id = n.user_id WHERE n.id = ?`).get(result.lastInsertRowid);
  }

  updateNote(mapId, noteId, body, userId, isAdmin) {
    const map = this.requireMap(mapId);
    const note = this.db.prepare("SELECT * FROM map_notes WHERE id = ? AND map_id = ?").get(Number(noteId), map.id);
    if (!note) throw new Error("Note not found");
    if (!isAdmin && note.user_id !== Number(userId)) throw new Error("You can only edit your own notes");
    this.db.prepare("UPDATE map_notes SET body = ?, updated_at = ? WHERE id = ?").run(text(body, "Note", 4000, true), now(), note.id);
    this.touch(map.id);
  }

  deleteNote(mapId, noteId, userId, isAdmin) {
    const map = this.requireMap(mapId);
    const note = this.db.prepare("SELECT * FROM map_notes WHERE id = ? AND map_id = ?").get(Number(noteId), map.id);
    if (!note) throw new Error("Note not found");
    if (!isAdmin && note.user_id !== Number(userId)) throw new Error("You can only remove your own notes");
    this.db.prepare("DELETE FROM map_notes WHERE id = ?").run(note.id);
    this.touch(map.id);
  }

  createToken(mapId, input, userId) {
    const { map, col, row } = this.cell(mapId, input.col, input.row);
    const label = text(input.label, "Token label", 80, true);
    const icon = text(input.icon, "Token icon", 16) || "●";
    const colorValue = color(input.color, "Token color", "#8b3f35");
    const created = now();
    const result = this.db.prepare(`INSERT INTO map_tokens
      (map_id, label, icon, color, column_index, row_index, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(map.id, label, icon, colorValue, col, row, Number(userId), created, created);
    this.touch(map.id);
    return this.db.prepare(`SELECT id, label, icon, color, column_index AS col, row_index AS row,
      created_at AS createdAt, updated_at AS updatedAt FROM map_tokens WHERE id = ?`).get(result.lastInsertRowid);
  }

  updateToken(mapId, tokenId, input) {
    const map = this.requireMap(mapId);
    const token = this.db.prepare("SELECT * FROM map_tokens WHERE id = ? AND map_id = ?").get(Number(tokenId), map.id);
    if (!token) throw new Error("Token not found");
    const col = input.col === undefined ? token.column_index : integer(input.col, "Hex column", 0, map.columns - 1);
    const row = input.row === undefined ? token.row_index : integer(input.row, "Hex row", 0, map.rows - 1);
    const label = input.label === undefined ? token.label : text(input.label, "Token label", 80, true);
    const icon = input.icon === undefined ? token.icon : (text(input.icon, "Token icon", 16) || "●");
    const colorValue = input.color === undefined ? token.color : color(input.color, "Token color", "#8b3f35");
    this.db.prepare(`UPDATE map_tokens SET label = ?, icon = ?, color = ?, column_index = ?, row_index = ?, updated_at = ? WHERE id = ?`)
      .run(label, icon, colorValue, col, row, now(), token.id);
    this.touch(map.id);
  }

  deleteToken(mapId, tokenId) {
    const map = this.requireMap(mapId);
    const result = this.db.prepare("DELETE FROM map_tokens WHERE id = ? AND map_id = ?").run(Number(tokenId), map.id);
    if (!result.changes) throw new Error("Token not found");
    this.touch(map.id);
  }

  touch(mapId) { this.db.prepare("UPDATE world_maps SET updated_at = ? WHERE id = ?").run(now(), Number(mapId)); }
}
