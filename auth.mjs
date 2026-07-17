import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const now = () => new Date().toISOString();
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");

function validateUsername(username) {
  const value = String(username || "").trim();
  if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(value)) throw new Error("Usernames must be 3–32 letters, numbers, dots, dashes, or underscores");
  return value;
}

function validatePassword(password) {
  const value = String(password || "");
  if (value.length < 8 || value.length > 256) throw new Error("Passwords must be between 8 and 256 characters");
  return value;
}

async function passwordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(validatePassword(password), salt, 64);
  return { salt, hash: Buffer.from(hash).toString("hex") };
}

async function passwordMatches(password, salt, expected) {
  const actual = Buffer.from(await scrypt(String(password || ""), salt, 64));
  const stored = Buffer.from(expected, "hex");
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}

export class AuthStore {
  constructor(databasePath) {
    this.db = new DatabaseSync(databasePath, { timeout: 5000 });
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        last_login TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
        system_key TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        discovered_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS role_files (
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        path TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
        PRIMARY KEY (role_id, path)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS role_files_path ON role_files(path);
    `);
    const roleColumns = new Set(this.db.prepare("PRAGMA table_info(roles)").all().map((column) => column.name));
    if (!roleColumns.has("system_key")) this.db.exec("ALTER TABLE roles ADD COLUMN system_key TEXT");
    const insertRole = this.db.prepare("INSERT OR IGNORE INTO roles (name, is_admin, system_key, created_at) VALUES (?, ?, ?, ?)");
    insertRole.run("Player", 0, "player", now()); insertRole.run("GM", 1, "gm", now());
    this.db.prepare("UPDATE roles SET system_key = 'player' WHERE name = 'Player' COLLATE NOCASE AND system_key IS NULL").run();
    this.db.prepare("UPDATE roles SET system_key = 'gm' WHERE name = 'GM' COLLATE NOCASE AND system_key IS NULL").run();
  }

  close() { this.db.close(); }

  transaction(work) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  rolesForUser(userId) {
    return this.db.prepare(`SELECT r.id, r.name, r.is_admin AS isAdmin FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? ORDER BY r.name COLLATE NOCASE`).all(userId)
      .map((role) => ({ ...role, isAdmin: Boolean(role.isAdmin) }));
  }

  user(userId) {
    const row = this.db.prepare("SELECT id, username, joined_at AS joinedAt, last_login AS lastLogin FROM users WHERE id = ?").get(userId);
    if (!row) return null;
    const roles = this.rolesForUser(userId);
    return { ...row, roles, isAdmin: roles.some((role) => role.isAdmin) };
  }

  async createUser({ username, password, roleIds }) {
    const name = validateUsername(username); const credentials = await passwordRecord(password);
    const roles = [...new Set((roleIds || []).map(Number).filter(Number.isInteger))];
    if (!roles.length) throw new Error("Assign at least one role");
    const available = new Set(this.db.prepare("SELECT id FROM roles").all().map((role) => role.id));
    if (roles.some((role) => !available.has(role))) throw new Error("One or more roles do not exist");
    const userId = this.transaction(() => {
      const result = this.db.prepare("INSERT INTO users (username, password_hash, password_salt, joined_at) VALUES (?, ?, ?, ?)").run(name, credentials.hash, credentials.salt, now());
      const assign = this.db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)");
      for (const role of roles) assign.run(result.lastInsertRowid, role);
      return Number(result.lastInsertRowid);
    });
    return this.user(userId);
  }

  async register(username, password) {
    const name = validateUsername(username); const credentials = await passwordRecord(password);
    const userId = this.transaction(() => {
      const first = Number(this.db.prepare("SELECT COUNT(*) AS count FROM users").get().count) === 0;
      const role = this.db.prepare("SELECT id FROM roles WHERE system_key = ?").get(first ? "gm" : "player");
      const result = this.db.prepare("INSERT INTO users (username, password_hash, password_salt, joined_at) VALUES (?, ?, ?, ?)").run(name, credentials.hash, credentials.salt, now());
      this.db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)").run(result.lastInsertRowid, role.id);
      return Number(result.lastInsertRowid);
    });
    return this.user(userId);
  }

  async authenticate(username, password) {
    const row = this.db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(String(username || "").trim());
    if (!row || !(await passwordMatches(password, row.password_salt, row.password_hash))) return null;
    const loggedIn = now(); this.db.prepare("UPDATE users SET last_login = ? WHERE id = ?").run(loggedIn, row.id);
    return this.user(row.id);
  }

  createSession(userId, maxAgeSeconds = 60 * 60 * 24 * 30) {
    const token = randomBytes(32).toString("base64url"); const created = new Date();
    const expires = new Date(created.getTime() + maxAgeSeconds * 1000);
    this.db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(tokenHash(token), userId, created.toISOString(), expires.toISOString());
    return { token, expiresAt: expires.toISOString(), maxAgeSeconds };
  }

  session(token) {
    if (!token) return null;
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now());
    const row = this.db.prepare("SELECT user_id AS userId FROM sessions WHERE token_hash = ?").get(tokenHash(token));
    return row ? this.user(row.userId) : null;
  }

  deleteSession(token) { if (token) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token)); }

  listRoles() {
    return this.db.prepare(`SELECT r.id, r.name, r.is_admin AS isAdmin, r.system_key AS systemKey, r.created_at AS createdAt,
      COUNT(DISTINCT ur.user_id) AS userCount, COUNT(DISTINCT rf.path) AS fileCount
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id LEFT JOIN role_files rf ON rf.role_id = r.id
      GROUP BY r.id ORDER BY r.name COLLATE NOCASE`).all()
      .map((role) => ({ ...role, isAdmin: Boolean(role.isAdmin), isSystem: Boolean(role.systemKey) }));
  }

  listUsers() {
    return this.db.prepare("SELECT id FROM users ORDER BY username COLLATE NOCASE").all().map(({ id }) => this.user(id));
  }

  createRole(name, isAdmin = false) {
    const value = String(name || "").trim(); if (!/^[\p{L}\p{N} ._-]{2,40}$/u.test(value)) throw new Error("Role names must be 2–40 readable characters");
    const result = this.db.prepare("INSERT INTO roles (name, is_admin, created_at) VALUES (?, ?, ?)").run(value, isAdmin ? 1 : 0, now());
    return this.listRoles().find((role) => role.id === Number(result.lastInsertRowid));
  }

  updateRole(roleId, { name, isAdmin }) {
    const id = Number(roleId); const current = this.db.prepare("SELECT * FROM roles WHERE id = ?").get(id); if (!current) throw new Error("Role not found");
    const value = String(name || "").trim(); if (!/^[\p{L}\p{N} ._-]{2,40}$/u.test(value)) throw new Error("Role names must be 2–40 readable characters");
    if (current.system_key && Boolean(current.is_admin) !== Boolean(isAdmin)) throw new Error("Default role permission types cannot be changed");
    this.transaction(() => {
      this.db.prepare("UPDATE roles SET name = ?, is_admin = ? WHERE id = ?").run(value, isAdmin ? 1 : 0, id);
      const roles = Number(this.db.prepare("SELECT COUNT(*) AS count FROM roles WHERE is_admin = 1").get().count);
      const users = Number(this.db.prepare("SELECT COUNT(DISTINCT ur.user_id) AS count FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.is_admin = 1").get().count);
      if (!roles || !users) throw new Error("At least one admin role and admin user are required");
    });
    return this.listRoles().find((role) => role.id === id);
  }

  deleteRole(roleId) {
    const id = Number(roleId); const role = this.db.prepare("SELECT * FROM roles WHERE id = ?").get(id); if (!role) throw new Error("Role not found");
    if (role.system_key) throw new Error("Default Player and GM roles cannot be deleted");
    const soleAssignments = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM user_roles ur WHERE ur.role_id = ?
      AND (SELECT COUNT(*) FROM user_roles all_roles WHERE all_roles.user_id = ur.user_id) = 1`).get(id).count);
    if (soleAssignments) throw new Error("Reassign users before deleting their only role");
    this.transaction(() => {
      this.db.prepare("DELETE FROM roles WHERE id = ?").run(id);
      const roles = Number(this.db.prepare("SELECT COUNT(*) AS count FROM roles WHERE is_admin = 1").get().count);
      const users = Number(this.db.prepare("SELECT COUNT(DISTINCT ur.user_id) AS count FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.is_admin = 1").get().count);
      if (!roles || !users) throw new Error("At least one admin role and admin user are required");
    });
  }

  async updateUser(userId, { username, password, roleIds }) {
    const id = Number(userId); const current = this.user(id); if (!current) throw new Error("User not found");
    const roles = [...new Set((roleIds || []).map(Number).filter(Number.isInteger))]; if (!roles.length) throw new Error("Assign at least one role");
    const available = new Map(this.listRoles().map((role) => [role.id, role])); if (roles.some((role) => !available.has(role))) throw new Error("One or more roles do not exist");
    if (current.isAdmin && !roles.some((role) => available.get(role).isAdmin) && this.listUsers().filter((user) => user.isAdmin).length <= 1) throw new Error("At least one admin user is required");
    const name = validateUsername(username || current.username); const credentials = password ? await passwordRecord(password) : null;
    this.transaction(() => {
      if (credentials) this.db.prepare("UPDATE users SET username = ?, password_hash = ?, password_salt = ? WHERE id = ?").run(name, credentials.hash, credentials.salt, id);
      else this.db.prepare("UPDATE users SET username = ? WHERE id = ?").run(name, id);
      this.db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(id); const assign = this.db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)"); roles.forEach((role) => assign.run(id, role));
    });
    return this.user(id);
  }

  deleteUser(userId) {
    const id = Number(userId); const user = this.user(id); if (!user) throw new Error("User not found");
    if (user.isAdmin && this.listUsers().filter((item) => item.isAdmin).length <= 1) throw new Error("At least one admin user is required");
    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }

  syncFiles(paths, legacyHidden = new Set()) {
    const wanted = new Set(paths); const known = new Set(this.db.prepare("SELECT path FROM files").all().map((file) => file.path));
    const player = this.db.prepare("SELECT id FROM roles WHERE system_key = 'player'").get();
    this.transaction(() => {
      const addFile = this.db.prepare("INSERT INTO files (path, discovered_at) VALUES (?, ?)"); const grant = this.db.prepare("INSERT OR IGNORE INTO role_files (role_id, path) VALUES (?, ?)");
      for (const path of wanted) if (!known.has(path)) { addFile.run(path, now()); if (!legacyHidden.has(path)) grant.run(player.id, path); }
      const remove = this.db.prepare("DELETE FROM files WHERE path = ?"); for (const path of known) if (!wanted.has(path)) remove.run(path);
    });
  }

  visiblePaths(userId) {
    const user = this.user(userId); if (!user) return new Set(); if (user.isAdmin) return null;
    return new Set(this.db.prepare(`SELECT DISTINCT rf.path FROM role_files rf JOIN user_roles ur ON ur.role_id = rf.role_id
      WHERE ur.user_id = ?`).all(userId).map((file) => file.path));
  }

  rolePaths(roleId) { return new Set(this.db.prepare("SELECT path FROM role_files WHERE role_id = ?").all(Number(roleId)).map((file) => file.path)); }

  setRolePaths(roleId, paths, visible) {
    const id = Number(roleId); const role = this.db.prepare("SELECT id FROM roles WHERE id = ?").get(id); if (!role) throw new Error("Role not found");
    const available = new Set(this.db.prepare("SELECT path FROM files").all().map((file) => file.path)); if (paths.some((path) => !available.has(path))) throw new Error("One or more files no longer exist");
    this.transaction(() => { const statement = this.db.prepare(visible ? "INSERT OR IGNORE INTO role_files (role_id, path) VALUES (?, ?)" : "DELETE FROM role_files WHERE role_id = ? AND path = ?"); paths.forEach((path) => statement.run(id, path)); });
  }

  isVisibleToAnyViewer(path) {
    return Boolean(this.db.prepare(`SELECT 1 FROM role_files rf JOIN roles r ON r.id = rf.role_id
      WHERE rf.path = ? AND r.is_admin = 0 LIMIT 1`).get(path));
  }
}
