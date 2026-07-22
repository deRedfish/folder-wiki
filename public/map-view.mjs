import { cellKey, gridDimensions, hexCenter, hexPoints, nearestHex } from "./map-utils.mjs";

export const FEATURE_ICONS = [
  ["🏰", "Fortress"], ["🏘", "Settlement"], ["⛺", "Camp"], ["⚔", "Danger"], ["🐉", "Monster"],
  ["☠", "Death"], ["✦", "Magic"], ["⛩", "Shrine"], ["⛏", "Mine"], ["🌲", "Forest"],
  ["⛰", "Mountain"], ["⚓", "Port"], ["💰", "Treasure"], ["👁", "Mystery"], ["◆", "Landmark"]
];
const TOKEN_ICONS = [["●", "Party"], ["◆", "Enemy"], ["♞", "Riders"], ["⚑", "Army"], ["✦", "Special"]];
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const option = (value, label, selected) => `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
const clone = (value) => JSON.parse(JSON.stringify(value));

export class WorldMapView {
  constructor({ root, api, toast, user }) {
    this.root = root; this.api = api; this.toast = toast; this.getUser = user;
    this.maps = []; this.images = []; this.templates = []; this.map = null; this.persistedMap = null; this.selected = null;
    this.zoom = .8; this.renderedZoom = .8; this.drag = null; this.pan = null; this.paintStroke = null; this.paintMode = "inspect"; this.suppressClickUntil = 0;
    this.brush = { featureIcon: "🏰", featureLabel: "Fortress", featureColor: "#a56a36" };
    this.selectedTemplateId = null; this.hexSaveTimer = null; this.stageFrame = null;
    root.addEventListener("click", (event) => this.click(event));
    root.addEventListener("submit", (event) => this.submit(event));
    root.addEventListener("change", (event) => this.change(event));
    root.addEventListener("input", (event) => this.input(event));
    root.addEventListener("pointerdown", (event) => this.pointerDown(event));
    window.addEventListener("pointermove", (event) => this.pointerMove(event));
    window.addEventListener("pointerup", (event) => this.pointerUp(event));
    window.addEventListener("pointercancel", () => this.cancelPointer());
  }

  async mount() {
    this.root.innerHTML = '<div class="empty-state">Loading world maps…</div>';
    try {
      this.maps = await this.api("/api/maps");
      if (this.getUser().isAdmin) [this.images, this.templates] = await Promise.all([this.api("/api/maps/images"), this.api("/api/maps/templates")]);
      const available = this.maps.find((map) => map.id === this.map?.id) || this.maps.find((map) => map.isActive) || this.maps[0];
      if (!available) { this.map = null; this.renderEmpty(); return; }
      await this.load(available.id);
    } catch (error) { this.root.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
  }

  async load(mapId) {
    this.map = await this.api(`/api/maps/${mapId}`); this.persistedMap = clone(this.map);
    if (this.selected && (this.selected.col >= this.map.columns || this.selected.row >= this.map.rows)) this.selected = null;
    this.render();
  }

  renderEmpty() {
    const admin = this.getUser().isAdmin;
    this.root.innerHTML = `<div class="document-header"><div class="eyebrow">Exploration</div><h1>World map</h1>
      <div class="document-meta">${admin ? "Create a map to begin tracking the party's exploration." : "The GM has not made a world map active yet."}</div></div>
      <div class="empty-state map-empty"><div class="map-empty-icon">⬡</div><h2>No map to display</h2>
      ${admin ? '<button class="button" data-map-action="create">＋ Create first map</button>' : "<p>Check back after the GM publishes one.</p>"}</div>`;
  }

  hexState() { return new Map(this.map.hexes.map((hex) => [cellKey(hex.col, hex.row), hex])); }
  notesAt(col, row) { return this.map.notes.filter((note) => note.col === col && note.row === row); }
  tokensAt(col, row) { return this.map.tokens.filter((token) => token.col === col && token.row === row); }
  selectedHex() { return this.selected ? this.hexState().get(cellKey(this.selected.col, this.selected.row)) || { ...this.selected, isFog: false, featureIcon: null, featureLabel: null, featureColor: null } : null; }

  render() {
    const viewport = this.root.querySelector(".map-viewport"); const scroll = { left: viewport?.scrollLeft || 0, top: viewport?.scrollTop || 0 };
    const settingsOpen = Boolean(this.root.querySelector(".map-settings")?.open); const admin = this.getUser().isAdmin; const map = this.map;
    if (!admin) {
      const showInspector = this.selected && !this.selectedHex()?.isFog;
      this.root.innerHTML = `<header class="player-map-title"><h1>${esc(map.name)}</h1><div class="player-map-controls">${this.zoomControlHtml("Zoom")}<span>Drag the map to move</span></div></header>
        <div class="world-map-layout player-only ${showInspector ? "has-selection" : ""}">${this.viewportHtml()}${showInspector ? `<aside class="map-inspector">${this.inspectorHtml()}</aside>` : ""}</div>`;
    } else {
      const switcher = `<label class="map-switcher-label">Map <select id="map-switcher">${this.maps.map((item) => option(item.id, item.name + (item.isActive ? " · Active" : ""), map.id)).join("")}</select></label>`;
      const active = map.isActive ? '<span class="map-active-badge">Visible to players</span>' : '<button class="button" data-map-action="activate">Make active</button>';
      this.root.innerHTML = `<div class="document-header map-header"><div><div class="eyebrow">Exploration · Persistent world map</div><h1>${esc(map.name)}</h1>
        <div class="document-meta"><span id="map-grid-summary">${map.columns} × ${map.rows} automatic grid</span><span>${map.tokens.length} tokens</span><span>${map.notes.length} notes</span></div></div></div>
        <div class="map-toolbar">${switcher}${this.zoomControlHtml("View zoom")}
        <button class="button ghost" data-map-action="create">＋ New map</button>${active}<button class="danger-button" data-map-action="delete-map">Delete map</button></div>
        ${this.settingsHtml()}${this.paintToolbarHtml()}<div class="world-map-layout">${this.viewportHtml()}<aside class="map-inspector">${this.inspectorHtml()}</aside></div>`;
    }
    const nextViewport = this.root.querySelector(".map-viewport"); if (nextViewport) { nextViewport.scrollLeft = scroll.left; nextViewport.scrollTop = scroll.top; }
    this.renderedZoom = this.zoom;
    const settings = this.root.querySelector(".map-settings"); if (settings) settings.open = settingsOpen;
  }

  viewportHtml() {
    return `<section class="map-viewport" aria-label="${esc(this.map.name)} hex map"><div class="map-stage-spacer" style="width:${this.map.mapWidth * this.zoom}px;height:${this.map.mapHeight * this.zoom}px">${this.surfaceHtml()}</div></section>`;
  }

  surfaceHtml() {
    const admin = this.getUser().isAdmin;
    return `<div class="map-surface ${admin ? "gm-map paint-" + this.paintMode : "player-map paint-inspect"}" style="width:${this.map.mapWidth}px;height:${this.map.mapHeight}px;transform:scale(${this.zoom})">
      ${this.map.imagePath ? `<img class="map-background" src="/api/maps/${this.map.id}/image?v=${encodeURIComponent(this.map.updatedAt)}" alt="">` : '<div class="map-background-placeholder"><span>Map image not set</span></div>'}${this.gridHtml()}</div>`;
  }

  zoomControlHtml(label) {
    const percent = Math.round(this.zoom * 100);
    return `<label class="map-zoom">${label}<input id="map-zoom" type="range" min="35" max="160" value="${percent}" aria-label="Map zoom"><output id="map-zoom-output">${percent}%</output></label>`;
  }

  renderStage(focus = null) {
    cancelAnimationFrame(this.stageFrame);
    this.stageFrame = requestAnimationFrame(() => {
      const viewport = this.root.querySelector(".map-viewport"); if (!viewport) return;
      const scroll = { left: viewport.scrollLeft, top: viewport.scrollTop }; const spacer = viewport.querySelector(".map-stage-spacer");
      spacer.style.width = this.map.mapWidth * this.zoom + "px"; spacer.style.height = this.map.mapHeight * this.zoom + "px"; spacer.innerHTML = this.surfaceHtml();
      viewport.scrollLeft = focus ? focus.x * this.zoom - viewport.clientWidth / 2 : scroll.left;
      viewport.scrollTop = focus ? focus.y * this.zoom - viewport.clientHeight / 2 : scroll.top;
      this.renderedZoom = this.zoom;
    });
  }

  slider(name, label, min, max, step) {
    return `<label class="map-range"><span>${label}<output data-map-output="${name}">${this.map[name]} px</output></span>
      <input data-map-setting="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${this.map[name]}"></label>`;
  }

  settingsHtml() {
    const images = ['<option value="">No background image</option>', ...this.images.map((image) => option(image.path, image.path, this.map.imagePath || ""))].join("");
    return `<details class="map-settings"><summary>Map and grid settings</summary><div class="map-settings-body"><div class="map-live-settings">
      <label class="map-text-setting">Map name<input data-map-setting="name" value="${esc(this.map.name)}" required maxlength="80"></label>
      <label class="map-text-setting">Background image<select data-map-setting="imagePath">${images}</select></label>
      ${this.slider("mapWidth", "Map width", 480, 4000, 20)}${this.slider("mapHeight", "Map height", 320, 3000, 20)}
      ${this.slider("hexSize", "Hex size", 16, 140, 1)}${this.slider("offsetX", "Grid X alignment", -140, 0, 1)}${this.slider("offsetY", "Grid Y alignment", -140, 0, 1)}
      <div class="map-auto-grid"><span>Automatic coverage</span><strong data-map-auto-grid>${this.map.columns} × ${this.map.rows} hexes</strong></div></div>
      <form data-map-form="upload" class="map-upload-form"><div><strong>Upload a new map image</strong><small>The image becomes an ordinary wiki file in the chosen content folder.</small></div>
      <label>Content folder<input name="folder" value="Maps" required></label><label>Image file<input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml" required></label>
      <button class="button ghost" type="submit">Upload and use image</button></form>
      <div class="map-fog-bulk"><div><strong>Fog of war</strong><small>Set the complete grid, then refine it with the paint tools.</small></div>
      <button class="button ghost" data-map-action="fog-all">Fog entire map</button><button class="button ghost" data-map-action="reveal-all">Reveal entire map</button></div></div></details>`;
  }

  paintToolbarHtml() {
    const mode = (value, label) => `<button class="${this.paintMode === value ? "active" : ""}" data-map-mode="${value}">${label}</button>`;
    return `<div class="map-paint-toolbar"><div class="map-paint-modes">${mode("inspect", "Inspect")}${mode("fog", "Paint fog")}${mode("reveal", "Reveal")}${mode("feature", "Place feature")}${mode("erase", "Erase feature")}</div>
      <label>Feature brush<select id="map-paint-feature">${FEATURE_ICONS.map(([icon, label]) => option(icon, `${icon}  ${label}`, this.brush.featureIcon)).join("")}</select></label>
      <label>Color<input id="map-paint-color" type="color" value="${this.brush.featureColor}"></label><span>Click or drag across hexes to paint.</span></div>`;
  }

  gridHtml() {
    const states = this.hexState(); const admin = this.getUser().isAdmin; const cells = [];
    for (let row = 0; row < this.map.rows; row++) for (let col = 0; col < this.map.columns; col++) {
      const key = cellKey(col, row); const hex = states.get(key) || { col, row, isFog: false }; const notes = this.notesAt(col, row).length;
      const selected = this.selected?.col === col && this.selected?.row === row && !(!admin && hex.isFog);
      const classes = ["map-hex", hex.isFog ? "is-fog" : "", (hex.featureIcon || hex.featureLabel) ? "has-feature" : "", notes ? "has-notes" : "", selected ? "is-selected" : ""].filter(Boolean).join(" ");
      const center = hexCenter(this.map, col, row); const title = hex.isFog && !admin ? "Unexplored" : [hex.featureLabel, notes ? `${notes} note${notes === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "Unmarked";
      cells.push(`<g class="${classes}" data-map-hex="${key}" style="--feature-color:${esc(hex.featureColor || "#a56a36")}"><polygon points="${hexPoints(this.map, col, row)}"><title>${esc(title)}</title></polygon>
        ${hex.featureIcon ? `<text class="map-feature-icon" x="${center.x}" y="${center.y + 7}">${esc(hex.featureIcon)}</text>` : ""}${notes && !(hex.isFog && !admin) ? `<circle class="map-note-dot" cx="${center.x + this.map.hexSize * .58}" cy="${center.y - this.map.hexSize * .55}" r="4"/>` : ""}</g>`);
    }
    const tokens = this.map.tokens.map((token) => {
      const center = hexCenter(this.map, token.col, token.row); const siblings = this.tokensAt(token.col, token.row); const index = siblings.findIndex((item) => item.id === token.id);
      const offset = (index - (siblings.length - 1) / 2) * Math.min(24, this.map.hexSize * .55);
      return `<g class="map-token ${admin ? "is-draggable" : ""}" data-map-token="${token.id}" transform="translate(${center.x + offset} ${center.y})"><circle r="17" style="fill:${esc(token.color)}"></circle>
        <text class="map-token-icon" y="6">${esc(token.icon)}</text><text class="map-token-label" y="31">${esc(token.label)}</text><title>${esc(token.label)}</title></g>`;
    }).join("");
    return `<svg class="map-grid" viewBox="0 0 ${this.map.mapWidth} ${this.map.mapHeight}" width="${this.map.mapWidth}" height="${this.map.mapHeight}"><defs>
      <filter id="map-fog-soften" x="-30%" y="-45%" width="160%" height="190%"><feGaussianBlur stdDeviation="10"/></filter>
      <pattern id="map-fog-clouds" width="180" height="112" patternUnits="userSpaceOnUse">
        <rect width="180" height="112" fill="#858c88"/><g filter="url(#map-fog-soften)" opacity=".82">
          <ellipse cx="20" cy="28" rx="55" ry="25" fill="#b8bfbb"/><ellipse cx="94" cy="18" rx="61" ry="31" fill="#6f7773"/>
          <ellipse cx="164" cy="53" rx="58" ry="29" fill="#adb4b0"/><ellipse cx="66" cy="83" rx="72" ry="31" fill="#929a96"/>
          <ellipse cx="145" cy="108" rx="64" ry="29" fill="#c0c5c2"/>
        </g></pattern></defs>
      <g class="map-hex-layer">${cells.join("")}</g><g class="map-token-layer">${tokens}</g></svg>`;
  }

  notesHtml(notes) {
    return notes.map((note) => {
      const editable = this.getUser().isAdmin || note.userId === this.getUser().id;
      return `<article class="map-note"><header><strong>${esc(note.author)}</strong><span>${new Date(note.updatedAt).toLocaleDateString()}</span></header><p>${esc(note.body)}</p>
        ${editable ? `<footer><button data-map-note-edit="${note.id}">Edit</button><button data-map-note-delete="${note.id}">Remove</button></footer>` : ""}</article>`;
    }).join("") || '<p class="map-muted">No notes on this hex.</p>';
  }

  inspectorHtml() {
    if (!this.selected) return '<div class="map-inspector-empty"><span>⬡</span><h2>Select a hex</h2><p>Open a hex to view its features, notes, and tokens.</p></div>';
    const { col, row } = this.selected; const admin = this.getUser().isAdmin; const hex = this.selectedHex();
    if (hex.isFog && !admin) return "";
    const notes = this.notesAt(col, row);
    if (!admin) return `<div class="map-inspector-head player-hex-head"><h2>${esc(hex.featureLabel || "Unmarked territory")}</h2><button data-map-action="close-hex" aria-label="Close">×</button></div>
      <section class="map-inspector-section"><h3>Notes</h3><div class="map-notes">${this.notesHtml(notes)}</div>
      <form data-map-form="note" class="map-note-form"><textarea name="body" required maxlength="4000" placeholder="Add a note…"></textarea><button class="button ghost" type="submit">Add note</button></form></section>`;
    const featureChoices = FEATURE_ICONS.map(([icon, label]) => `<label title="${esc(label)}"><input data-map-feature type="radio" name="featureIcon" value="${esc(icon)}" ${hex.featureIcon === icon ? "checked" : ""}><span>${icon}</span><small>${esc(label)}</small></label>`).join("");
    const tokenOptions = (selected) => TOKEN_ICONS.map(([icon, label]) => option(icon, `${icon}  ${label}`, selected)).join("");
    const tokenForms = this.tokensAt(col, row).map((token) => `<form data-map-form="token-edit" data-token-id="${token.id}" class="map-token-form"><input name="label" value="${esc(token.label)}" required maxlength="80">
      <select name="icon">${tokenOptions(token.icon)}</select><input name="color" type="color" value="${esc(token.color)}"><button type="submit">Save</button><button type="button" data-map-token-delete="${token.id}">×</button></form>`).join("");
    const templates = '<option value="">Apply a template…</option>' + this.templates.map((template) => option(template.id, template.name, this.selectedTemplateId)).join("");
    return `<div class="map-inspector-head"><div><span>Hex ${col + 1}, ${row + 1}</span><h2>${esc(hex.featureLabel || "Unmarked territory")}</h2></div><button data-map-action="close-hex">×</button></div>
      <div class="map-template-tools"><select id="map-hex-template">${templates}</select><button data-map-action="save-template" title="Save this hex as a template">＋ Template</button>
      <button data-map-action="delete-template" title="Delete selected template" ${this.selectedTemplateId ? "" : "disabled"}>×</button><small>Applying a template replaces this hex's feature and notes.</small></div>
      <div class="map-hex-form"><label class="map-fog-toggle"><input data-map-feature name="isFog" type="checkbox" ${hex.isFog ? "checked" : ""}><span>Fog of war</span></label>
        <label>Feature name<input data-map-feature name="featureLabel" value="${esc(hex.featureLabel || "")}" maxlength="80" placeholder="Ancient watchtower"></label>
        <div class="feature-icon-grid">${featureChoices}</div><label>Marker color<input data-map-feature name="featureColor" type="color" value="${esc(hex.featureColor || "#a56a36")}"></label>
        <div class="map-form-actions"><span>Changes save automatically.</span><button class="button ghost" type="button" data-map-action="clear-feature">Clear feature</button></div></div>
      <section class="map-inspector-section"><h3>Notes</h3><div class="map-notes">${this.notesHtml(notes)}</div><form data-map-form="note" class="map-note-form">
        <textarea name="body" required maxlength="4000" placeholder="Add something the table should remember…"></textarea><button class="button ghost" type="submit">Add note</button></form></section>
      <section class="map-inspector-section"><h3>Tokens</h3>${tokenForms || '<p class="map-muted">No tokens on this hex.</p>'}<form data-map-form="token-new" class="map-token-form">
        <input name="label" required maxlength="80" placeholder="Party or group name"><select name="icon">${tokenOptions("●")}</select><input name="color" type="color" value="#386b57"><button class="button ghost" type="submit">Add</button></form></section>`;
  }

  async perform(work, success) {
    try { await work(); if (success) this.toast(success); return true; }
    catch (error) { this.toast(error.message); return false; }
  }
  async refreshLists(selectId = this.map?.id) {
    this.maps = await this.api("/api/maps");
    if (this.getUser().isAdmin) [this.images, this.templates] = await Promise.all([this.api("/api/maps/images"), this.api("/api/maps/templates")]);
    const target = this.maps.find((item) => item.id === selectId) || this.maps.find((item) => item.isActive) || this.maps[0];
    if (target) await this.load(target.id); else { this.map = null; this.renderEmpty(); }
  }

  click(event) {
    const action = event.target.closest("[data-map-action]")?.dataset.mapAction;
    if (action === "create") return this.createMap();
    if (action === "activate") return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/activate`, { method: "POST" }); await this.refreshLists(); }, "Map is now visible to players");
    if (action === "delete-map") return this.deleteMap();
    if (action === "fog-all") return this.setAllFog(true);
    if (action === "reveal-all") return this.setAllFog(false);
    if (action === "close-hex") { this.selected = null; return this.render(); }
    if (action === "clear-feature") return this.clearFeature();
    if (action === "save-template") return this.saveTemplate();
    if (action === "delete-template") return this.deleteTemplate();
    const mode = event.target.closest("[data-map-mode]")?.dataset.mapMode;
    if (mode) { this.paintMode = mode; return this.render(); }
    const editNote = event.target.closest("[data-map-note-edit]"); if (editNote) return this.editNote(Number(editNote.dataset.mapNoteEdit));
    const deleteNote = event.target.closest("[data-map-note-delete]"); if (deleteNote) return this.deleteNote(Number(deleteNote.dataset.mapNoteDelete));
    const deleteToken = event.target.closest("[data-map-token-delete]"); if (deleteToken) return this.deleteToken(Number(deleteToken.dataset.mapTokenDelete));
    if (Date.now() < this.suppressClickUntil) return;
    const token = event.target.closest("[data-map-token]");
    if (token) { const item = this.map.tokens.find((entry) => entry.id === Number(token.dataset.mapToken)); if (item) { this.selected = { col: item.col, row: item.row }; this.render(); } return; }
    const cell = event.target.closest("[data-map-hex]");
    if (cell && this.paintMode === "inspect") { const [col, row] = cell.dataset.mapHex.split(":").map(Number); this.selected = { col, row }; this.render(); }
  }

  async createMap() {
    const name = window.prompt("Name this world map:"); if (!name?.trim()) return;
    await this.perform(async () => { const map = await this.api("/api/maps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }); this.selected = null; await this.refreshLists(map.id); }, "Map created");
  }
  async deleteMap() {
    if (!window.confirm(`Delete "${this.map.name}" and all of its hex notes and tokens?`)) return;
    await this.perform(async () => { await this.api(`/api/maps/${this.map.id}`, { method: "DELETE" }); this.selected = null; await this.refreshLists(null); }, "Map deleted");
  }
  setAllFog(isFog) {
    if (!window.confirm(isFog ? "Cover the complete map in fog?" : "Reveal every hex on this map?")) return;
    return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/fog`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ isFog }) }); await this.load(this.map.id); }, isFog ? "Map covered in fog" : "Map fully revealed");
  }

  change(event) {
    if (event.target.matches("#map-switcher")) return this.load(Number(event.target.value)).catch((error) => this.toast(error.message));
    if (event.target.matches("[data-map-setting]")) return this.persistMapSetting(event.target);
    if (event.target.matches("[data-map-feature]")) { this.updateSelectedHexFromControls(); return this.persistSelectedHex(); }
    if (event.target.matches("#map-paint-feature")) { const found = FEATURE_ICONS.find(([icon]) => icon === event.target.value); [this.brush.featureIcon, this.brush.featureLabel] = found; return; }
    if (event.target.matches("#map-paint-color")) { this.brush.featureColor = event.target.value; return; }
    if (event.target.matches("#map-hex-template") && event.target.value) return this.applyTemplate(Number(event.target.value));
  }

  input(event) {
    if (event.target.matches("#map-zoom")) {
      const viewport = this.root.querySelector(".map-viewport"); const focus = viewport ? {
        x: (viewport.scrollLeft + viewport.clientWidth / 2) / this.renderedZoom,
        y: (viewport.scrollTop + viewport.clientHeight / 2) / this.renderedZoom
      } : null;
      this.zoom = Number(event.target.value) / 100; this.root.querySelector("#map-zoom-output").textContent = event.target.value + "%"; return this.renderStage(focus);
    }
    if (event.target.matches("[data-map-setting]")) {
      const key = event.target.dataset.mapSetting; if (!["mapWidth","mapHeight","hexSize","offsetX","offsetY"].includes(key)) return;
      this.map[key] = Number(event.target.value); Object.assign(this.map, gridDimensions(this.map)); this.root.querySelector(`[data-map-output="${key}"]`).textContent = event.target.value + " px";
      this.root.querySelector("[data-map-auto-grid]").textContent = `${this.map.columns} × ${this.map.rows} hexes`;
      this.root.querySelector("#map-grid-summary").textContent = `${this.map.columns} × ${this.map.rows} automatic grid`; this.renderStage(); return;
    }
    if (event.target.matches("[data-map-feature]")) { this.updateSelectedHexFromControls(); clearTimeout(this.hexSaveTimer); this.hexSaveTimer = setTimeout(() => this.persistSelectedHex(), 350); }
  }

  async persistMapSetting(control) {
    const key = control.dataset.mapSetting; const geometry = ["mapWidth","mapHeight","hexSize","offsetX","offsetY"];
    const patch = geometry.includes(key) ? Object.fromEntries(geometry.map((name) => [name, this.map[name]])) : { [key]: control.value };
    if (geometry.includes(key)) {
      try {
        const impact = await this.api(`/api/maps/${this.map.id}/resize-impact`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
        if (impact.total) {
          const details = [impact.features ? `${impact.features} feature hex${impact.features === 1 ? "" : "es"}` : "", impact.notes ? `${impact.notes} note${impact.notes === 1 ? "" : "s"}` : "", impact.tokens ? `${impact.tokens} token${impact.tokens === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
          if (!window.confirm(`This adjustment removes ${details} outside the new automatic grid. Fog-only hexes are discarded silently. Continue?`)) { this.map = clone(this.persistedMap); return this.render(); }
        }
      } catch (error) { this.toast(error.message); this.map = clone(this.persistedMap); return this.render(); }
    }
    const saved = await this.perform(async () => { await this.api(`/api/maps/${this.map.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }); await this.refreshLists(); }, "Map updated");
    if (!saved) { this.map = clone(this.persistedMap); this.render(); }
  }

  updateSelectedHexFromControls() {
    if (!this.selected) return; const root = this.root.querySelector(".map-hex-form"); if (!root) return;
    const next = { ...this.selectedHex(), ...this.selected, isFog: root.querySelector('[name="isFog"]').checked,
      featureIcon: root.querySelector('[name="featureIcon"]:checked')?.value || null, featureLabel: root.querySelector('[name="featureLabel"]').value,
      featureColor: root.querySelector('[name="featureColor"]').value };
    const index = this.map.hexes.findIndex((hex) => hex.col === next.col && hex.row === next.row);
    if (index >= 0) this.map.hexes[index] = next; else this.map.hexes.push(next); this.renderStage();
  }

  async persistSelectedHex() {
    clearTimeout(this.hexSaveTimer); const hex = this.selectedHex(); if (!hex) return;
    const saved = await this.perform(async () => { await this.api(`/api/maps/${this.map.id}/hex`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(hex) }); this.persistedMap = clone(this.map); });
    if (!saved) { this.map = clone(this.persistedMap); this.render(); }
  }

  clearFeature() {
    const hex = { ...this.selectedHex(), featureIcon: null, featureLabel: null, featureColor: null };
    const index = this.map.hexes.findIndex((item) => item.col === hex.col && item.row === hex.row); if (index >= 0) this.map.hexes[index] = hex; else this.map.hexes.push(hex);
    this.render(); return this.persistSelectedHex();
  }

  async saveTemplate() {
    const name = window.prompt("Template name:"); if (!name?.trim()) return; const hex = this.selectedHex();
    await this.perform(async () => {
      const created = await this.api("/api/maps/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        name, featureIcon: hex.featureIcon, featureLabel: hex.featureLabel, featureColor: hex.featureColor, notes: this.notesAt(hex.col, hex.row).map((note) => note.body)
      }) });
      this.templates = await this.api("/api/maps/templates"); this.selectedTemplateId = created.id; this.render();
    }, "Hex template saved");
  }

  applyTemplate(templateId) {
    this.selectedTemplateId = templateId;
    return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/hex/template`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...this.selected, templateId }) }); await this.load(this.map.id); }, "Template applied");
  }

  deleteTemplate() {
    if (!this.selectedTemplateId || !window.confirm("Delete this hex template?")) return;
    return this.perform(async () => { await this.api(`/api/maps/templates/${this.selectedTemplateId}`, { method: "DELETE" }); this.selectedTemplateId = null; this.templates = await this.api("/api/maps/templates"); this.render(); }, "Template deleted");
  }

  async submit(event) {
    const form = event.target.closest("[data-map-form]"); if (!form) return; event.preventDefault(); const data = new FormData(form); const kind = form.dataset.mapForm;
    if (kind === "upload") return this.uploadImage(form, data);
    if (kind === "note") return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...this.selected, body: data.get("body") }) }); await this.load(this.map.id); }, "Note added");
    if (kind === "token-new") return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/tokens`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...this.selected, label: data.get("label"), icon: data.get("icon"), color: data.get("color") }) }); await this.load(this.map.id); }, "Token added");
    if (kind === "token-edit") return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/tokens/${form.dataset.tokenId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: data.get("label"), icon: data.get("icon"), color: data.get("color") }) }); await this.load(this.map.id); }, "Token updated");
  }

  async uploadImage(form, data) {
    const file = data.get("image"); if (!(file instanceof File) || !file.size) return this.toast("Choose an image");
    if (file.size > 50 * 1024 * 1024) return this.toast("Images must be 50 MB or smaller");
    await this.perform(async () => {
      const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",", 2)[1]); reader.onerror = () => reject(new Error("Could not read that image")); reader.readAsDataURL(file); });
      const uploaded = await this.api("/api/maps/images", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ folder: data.get("folder"), name: file.name, data: encoded }) });
      await this.api(`/api/maps/${this.map.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ imagePath: uploaded.path }) }); form.reset(); await this.refreshLists();
    }, "Image uploaded and selected");
  }

  editNote(noteId) {
    const note = this.map.notes.find((item) => item.id === noteId); if (!note) return; const body = window.prompt("Edit note:", note.body); if (!body?.trim() || body === note.body) return;
    return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/notes/${noteId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) }); await this.load(this.map.id); }, "Note updated");
  }
  deleteNote(noteId) { if (!window.confirm("Remove this note?")) return; return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/notes/${noteId}`, { method: "DELETE" }); await this.load(this.map.id); }, "Note removed"); }
  deleteToken(tokenId) { return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/tokens/${tokenId}`, { method: "DELETE" }); await this.load(this.map.id); }, "Token removed"); }

  paintInput(col, row) {
    const existing = this.hexState().get(cellKey(col, row)) || { col, row, isFog: false, featureIcon: null, featureLabel: null, featureColor: null };
    if (this.paintMode === "fog") return { ...existing, isFog: true };
    if (this.paintMode === "reveal") return { ...existing, isFog: false };
    if (this.paintMode === "feature") return { ...existing, ...this.brush };
    if (this.paintMode === "erase") return { ...existing, featureIcon: null, featureLabel: null, featureColor: null };
    return null;
  }

  paintCell(node) {
    if (!node) return; const [col, row] = node.dataset.mapHex.split(":").map(Number); const key = cellKey(col, row);
    if (this.paintStroke.has(key)) return; const input = this.paintInput(col, row); if (!input) return; this.paintStroke.set(key, input);
    const index = this.map.hexes.findIndex((hex) => hex.col === col && hex.row === row); if (index >= 0) this.map.hexes[index] = input; else this.map.hexes.push(input);
    this.renderStage();
  }

  pointerDown(event) {
    const tokenNode = event.target.closest("[data-map-token]");
    if (tokenNode && this.getUser().isAdmin && this.paintMode === "inspect") {
      event.preventDefault(); const token = this.map.tokens.find((item) => item.id === Number(tokenNode.dataset.mapToken)); if (token) this.drag = { node: tokenNode, token, startX: event.clientX, startY: event.clientY, moved: false }; return;
    }
    const cell = event.target.closest("[data-map-hex]");
    if (cell && this.getUser().isAdmin && this.paintMode !== "inspect") { event.preventDefault(); this.paintStroke = new Map(); this.paintCell(cell); return; }
    const surface = event.target.closest(".map-surface");
    if (surface && this.paintMode === "inspect" && event.isPrimary && event.button === 0) {
      const viewport = surface.closest(".map-viewport"); this.pan = {
        surface, viewport, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
        scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop, moved: false
      };
    }
  }

  pointerMove(event) {
    if (this.paintStroke) { const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-map-hex]"); if (cell && this.root.contains(cell)) this.paintCell(cell); return; }
    if (this.drag) {
      const rect = this.root.querySelector(".map-grid")?.getBoundingClientRect(); if (!rect) return;
      const x = (event.clientX - rect.left) / rect.width * this.map.mapWidth; const y = (event.clientY - rect.top) / rect.height * this.map.mapHeight;
      if (Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 4) this.drag.moved = true; this.drag.node.setAttribute("transform", `translate(${x} ${y})`); return;
    }
    if (this.pan && this.pan.pointerId === event.pointerId) {
      const dx = event.clientX - this.pan.startX; const dy = event.clientY - this.pan.startY;
      if (!this.pan.moved && Math.hypot(dx, dy) > 4) { this.pan.moved = true; this.pan.surface.classList.add("is-panning"); }
      if (this.pan.moved) { event.preventDefault(); this.pan.viewport.scrollLeft = this.pan.scrollLeft - dx; this.pan.viewport.scrollTop = this.pan.scrollTop - dy; }
    }
  }

  pointerUp(event) {
    if (this.paintStroke) {
      const stroke = [...this.paintStroke.values()]; this.paintStroke = null; this.suppressClickUntil = Date.now() + 250;
      return this.savePaintStroke(stroke);
    }
    if (this.pan && this.pan.pointerId === event.pointerId) {
      const moved = this.pan.moved; this.pan.surface.classList.remove("is-panning"); this.pan = null;
      if (moved) this.suppressClickUntil = Date.now() + 250; return;
    }
    if (!this.drag) return; const drag = this.drag; this.drag = null; if (!drag.moved) return; this.suppressClickUntil = Date.now() + 250;
    const rect = this.root.querySelector(".map-grid")?.getBoundingClientRect(); if (!rect) return this.render();
    const cell = nearestHex(this.map, (event.clientX - rect.left) / rect.width * this.map.mapWidth, (event.clientY - rect.top) / rect.height * this.map.mapHeight); this.render();
    this.perform(async () => { await this.api(`/api/maps/${this.map.id}/tokens/${drag.token.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(cell) }); this.selected = cell; await this.load(this.map.id); }, "Token moved");
  }

  async savePaintStroke(stroke) {
    const saved = await this.perform(async () => { await this.api(`/api/maps/${this.map.id}/hexes`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ hexes: stroke }) }); this.persistedMap = clone(this.map); }, `${stroke.length} hex${stroke.length === 1 ? "" : "es"} painted`);
    if (!saved) { this.map = clone(this.persistedMap); this.render(); }
  }

  cancelPointer() {
    if (this.pan) { this.pan.surface.classList.remove("is-panning"); this.pan = null; }
    if (this.paintStroke || this.drag) { this.paintStroke = null; this.drag = null; this.map = clone(this.persistedMap); this.render(); }
  }
}
