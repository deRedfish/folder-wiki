import test from "node:test";
import assert from "node:assert/strict";
import { filesInFolder, folderSelectionStatus } from "../public/admin-utils.mjs";

const files = [
  { path: "Campaigns/overview.md", folder: "Campaigns" },
  { path: "Campaigns/Dwarovar/map.png", folder: "Campaigns/Dwarovar" },
  { path: "Campaigns/Dwarovar/Notes/session.md", folder: "Campaigns/Dwarovar/Notes" },
  { path: "Bestiary/orcs.md", folder: "Bestiary" }
];

test("folder selection includes files in every descendant folder", () => {
  assert.deepEqual(filesInFolder(files, "Campaigns"), [
    "Campaigns/overview.md",
    "Campaigns/Dwarovar/map.png",
    "Campaigns/Dwarovar/Notes/session.md"
  ]);
  assert.deepEqual(filesInFolder(files, "Campaigns/Dwarovar"), [
    "Campaigns/Dwarovar/map.png",
    "Campaigns/Dwarovar/Notes/session.md"
  ]);
});

test("folder selection reports empty, partial, and complete states", () => {
  assert.equal(folderSelectionStatus(files, "Campaigns", new Set()), "none");
  assert.equal(folderSelectionStatus(files, "Campaigns", new Set(["Campaigns/overview.md"])), "some");
  assert.equal(folderSelectionStatus(files, "Campaigns", new Set(filesInFolder(files, "Campaigns"))), "all");
});
