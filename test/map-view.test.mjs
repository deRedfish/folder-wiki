import test from "node:test";
import assert from "node:assert/strict";
import { WorldMapView } from "../public/map-view.mjs";

test("player maps render a real scrollable viewport", () => {
  const root = { innerHTML: "", querySelector: () => null };
  const view = Object.assign(Object.create(WorldMapView.prototype), {
    root,
    getUser: () => ({ id: 2, isAdmin: false }),
    selected: null,
    zoom: 0.8,
    renderedZoom: 0.8,
    map: {
      id: 1, name: "Player map", mapWidth: 800, mapHeight: 600,
      columns: 1, rows: 1, hexSize: 32, offsetX: 0, offsetY: 0,
      hexes: [], features: [], zones: [], notes: [], tokens: []
    }
  });

  view.render();

  assert.match(root.innerHTML, /<div class="world-map-layout player-only "><section class="map-viewport"/);
  assert.doesNotMatch(root.innerHTML, /player-only ><section class=/);
});
