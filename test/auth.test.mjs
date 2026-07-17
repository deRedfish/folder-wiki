import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AuthStore } from "../auth.mjs";

test("users, sessions, roles, and cumulative file grants", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "folder-wiki-auth-"));
  const auth = new AuthStore(path.join(directory, "wiki.db"));
  context.after(async () => { auth.close(); await rm(directory, { recursive: true, force: true }); });

  const gm = await auth.register("gamemaster", "correct horse battery staple");
  const player = await auth.register("adam", "another secure password");
  assert.equal(gm.isAdmin, true); assert.deepEqual(gm.roles.map((role) => role.name), ["GM"]);
  assert.equal(player.isAdmin, false); assert.deepEqual(player.roles.map((role) => role.name), ["Player"]);
  assert.equal((await auth.authenticate("ADAM", "wrong password")), null);
  assert.equal((await auth.authenticate("ADAM", "another secure password")).id, player.id);

  const session = auth.createSession(player.id, 60); assert.equal(auth.session(session.token).username, "adam");
  auth.deleteSession(session.token); assert.equal(auth.session(session.token), null);

  auth.syncFiles(["Lore/public.md", "Lore/gnome.md"]);
  const gnome = auth.createRole("Gnome"); auth.setRolePaths(gnome.id, ["Lore/gnome.md"], true);
  await auth.updateUser(player.id, { username: "adam", roleIds: [player.roles[0].id, gnome.id] });
  assert.deepEqual([...auth.visiblePaths(player.id)].sort(), ["Lore/gnome.md", "Lore/public.md"]);
  assert.equal(auth.visiblePaths(gm.id), null);

  const playerRole = auth.listRoles().find((role) => role.systemKey === "player");
  const gmRole = auth.listRoles().find((role) => role.systemKey === "gm");
  auth.updateRole(playerRole.id, { name: "Adventurer", isAdmin: false });
  const laterSignup = await auth.register("laterplayer", "a third secure password");
  assert.deepEqual(laterSignup.roles.map((role) => role.name), ["Adventurer"]);
  assert.throws(() => auth.deleteRole(playerRole.id), /Default Player and GM roles/);
  assert.throws(() => auth.updateRole(gmRole.id, { name: "GM", isAdmin: false }), /permission types/);
});
