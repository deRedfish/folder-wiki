import test from "node:test";
import assert from "node:assert/strict";
import { WorldMapView } from "../public/map-view.mjs";

function playerView(overrides = {}) {
  const root = { innerHTML: "", querySelector: () => null };
  const view = Object.assign(Object.create(WorldMapView.prototype), {
    root,
    getUser: () => ({ id: 2, isAdmin: false }),
    selected: null,
    paintMode: "inspect",
    paintStroke: null,
    drag: null,
    pan: null,
    suppressClickUntil: 0,
    zoom: 0.8,
    renderedZoom: 0.8,
    map: {
      id: 1, name: "Player map", mapWidth: 800, mapHeight: 600,
      columns: 1, rows: 1, hexSize: 32, offsetX: 0, offsetY: 0,
      hexes: [], features: [], zones: [], notes: [], tokens: []
    },
    ...overrides
  });
  return { root, view };
}

test("player maps render a real scrollable viewport", () => {
  const { root, view } = playerView();

  view.render();

  assert.match(root.innerHTML, /<div class="world-map-layout player-only "><section class="map-viewport"/);
  assert.doesNotMatch(root.innerHTML, /player-only ><section class=/);
});

test("selected player hexes expose notes but not GM editing tools", () => {
  const { root, view } = playerView({ selected: { col: 0, row: 0 } });

  view.render();

  assert.match(root.innerHTML, /data-map-form="note"/);
  assert.match(root.innerHTML, />Add note<\/button>/);
  assert.doesNotMatch(root.innerHTML, /data-map-form="feature-new"/);
  assert.doesNotMatch(root.innerHTML, /data-map-form="token-new"/);
  assert.doesNotMatch(root.innerHTML, /map-settings/);
});

test("painted terrain renders with its variant name and layer", () => {
  const { root, view } = playerView({ map: {
    id: 1, name: "Terrain map", mapWidth: 800, mapHeight: 600, columns: 1, rows: 1, hexSize: 32, offsetX: 0, offsetY: 0,
    backgroundOpacity: 1, terrainOpacity: .85, hexes: [{ col: 0, row: 0, isFog: false, terrainType: "wasteland", terrainClimate: "arid" }],
    features: [], zones: [], notes: [], tokens: []
  } });

  view.render();

  assert.match(root.innerHTML, /map-hex-terrain/);
  assert.match(root.innerHTML, /Dune desert/);
});

test("map panning captures the pointer only after movement becomes a drag", () => {
  const { view } = playerView();
  const viewport = { scrollLeft: 40, scrollTop: 25 };
  const captures = []; const releases = []; const held = new Set();
  const surface = {
    closest: (selector) => selector === ".map-viewport" ? viewport : null,
    classList: { add: () => {}, remove: () => {} },
    setPointerCapture: (pointerId) => { held.add(pointerId); captures.push(pointerId); },
    releasePointerCapture: (pointerId) => {
      if (!held.delete(pointerId)) throw new Error("Pointer was not captured");
      releases.push(pointerId);
    }
  };
  const cell = { dataset: { mapHex: "0:0" } };
  const target = { closest: (selector) => selector === "[data-map-hex]" ? cell : selector === ".map-surface" ? surface : null };

  view.pointerDown({ target, pointerId: 7, clientX: 100, clientY: 100, isPrimary: true, button: 0 });
  assert.deepEqual(captures, []);
  view.pointerUp({ pointerId: 7 });
  view.click({ target });
  assert.deepEqual(view.selected, { col: 0, row: 0 });

  view.pointerDown({ target, pointerId: 8, clientX: 100, clientY: 100, isPrimary: true, button: 0 });

  let prevented = false;
  view.pointerMove({ pointerId: 8, clientX: 90, clientY: 92, preventDefault: () => { prevented = true; } });
  assert.deepEqual(captures, [8]);
  assert.equal(prevented, true);
  assert.deepEqual({ left: viewport.scrollLeft, top: viewport.scrollTop }, { left: 50, top: 33 });

  view.pointerUp({ pointerId: 8 });
  assert.deepEqual(releases, [8]);
  assert.equal(view.pan, null);
});
