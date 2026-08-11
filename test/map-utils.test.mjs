import test from "node:test";
import assert from "node:assert/strict";
import { cellKey, gridDimensions, hexCenter, hexPoints, nearestHex } from "../public/map-utils.mjs";

const map = { hexSize: 40, offsetX: 5, offsetY: 10, columns: 5, rows: 4 };

test("pointy-top hex geometry offsets alternating rows", () => {
  const first = hexCenter(map, 0, 0);
  const odd = hexCenter(map, 0, 1);
  assert.equal(first.y, 50);
  assert.equal(odd.y, 110);
  assert.ok(odd.x < first.x);
  assert.equal(hexPoints(map, 0, 0).split(" ").length, 6);
});

test("grid dimensions automatically cover the complete map", () => {
  assert.deepEqual(gridDimensions({ ...map, mapWidth: 900, mapHeight: 600 }), { columns: 14, rows: 11 });
  assert.deepEqual(gridDimensions({ ...map, mapWidth: 320, mapHeight: 240, hexSize: 240, offsetX: 0, offsetY: 0 }), { columns: 2, rows: 2 });
});

test("nearest hex and cell keys are stable for token dragging", () => {
  const target = hexCenter(map, 3, 2);
  assert.deepEqual(nearestHex(map, target.x + 2, target.y - 3), { col: 3, row: 2 });
  assert.equal(cellKey(3, 2), "3:2");
});
