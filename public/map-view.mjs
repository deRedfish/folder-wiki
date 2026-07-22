import { cellKey, hexCenter, hexPoints, nearestHex } from "./map-utils.mjs";

export const FEATURE_ICONS = [
  ["🏰", "Fortress"], ["🏘", "Settlement"], ["⛺", "Camp"], ["⚔", "Danger"],
  ["🐉", "Monster"], ["☠", "Death"], ["✦", "Magic"], ["⛩", "Shrine"],
  ["⛏", "Mine"], ["🌲", "Forest"], ["⛰", "Mountain"], ["⚓", "Port"],
  ["💰", "Treasure"], ["👁", "Mystery"], ["◆", "Landmark"]
];
const TOKEN_ICONS = [["●", "Party"], ["◆", "Enemy"], ["♞", "Riders"], ["⚑", "Army"], ["✦", "Special"]];
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;

export class WorldMapView {
  constructor({ root, api, toast, user }) {
    this.root = root; this.api = api; this.toast = toast; this.getUser = user;
    this.maps = []; this.images = []; this.map = null; this.selected = null; this.zoom = 0.8; this.drag = null; this.suppressClickUntil = 0;
    root.addEventListener("click", (event) => this.click(event));
    root.addEventListener("submit", (event) => this.submit(event));
    root.addEventListener("change", (event) => this.change(event));
    root.addEventListener("input", (event) => this.input(event));
    root.addEventListener("pointerdown", (event) => this.pointerDown(event));
    window.addEventListener("pointermove", (event) => this.pointerMove(event));
    window.addEventListener("pointerup", (event) => this.pointerUp(event));
  }

  async mount() {
    this.root.innerHTML = '<div class="empty-state">Loading world maps…</div>';
    try {
      this.maps = await this.api("/api/maps");
      this.images = this.getUser().isAdmin ? await this.api("/api/maps/images") : [];
      const available = this.maps.find((map) => map.id === this.map?.id) || this.maps.find((map) => map.isActive) || this.maps[0];
      if (!available) { this.map = null; this.renderEmpty(); return; }
      await this.load(available.id);
    } catch (error) { this.root.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
  }

  async load(mapId) {
    this.map = await this.api(`/api/maps/${mapId}`);
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

  render() {
    const priorViewport = this.root.querySelector(".map-viewport");
    const scroll = { left: priorViewport?.scrollLeft || 0, top: priorViewport?.scrollTop || 0 };
    const settingsOpen = Boolean(this.root.querySelector(".map-settings")?.open);
    const admin = this.getUser().isAdmin; const map = this.map; const zoomPercent = Math.round(this.zoom * 100);
    const switcher = admin
      ? `<label class="map-switcher-label">Map <select id="map-switcher">${this.maps.map((item) => option(String(item.id), item.name + (item.isActive ? " · Active" : ""), String(map.id))).join("")}</select></label>`
      : `<span class="map-active-badge">Active world map</span>`;
    const adminActions = admin ? `<button class="button ghost" data-map-action="create">＋ New map</button>
      ${map.isActive ? '<span class="map-active-badge">Visible to players</span>' : '<button class="button" data-map-action="activate">Make active</button>'}
      <button class="danger-button" data-map-action="delete-map">Delete map</button>` : "";
    this.root.innerHTML = `<div class="document-header map-header"><div><div class="eyebrow">Exploration · Persistent world map</div>
      <h1>${esc(map.name)}</h1><div class="document-meta">${map.columns} × ${map.rows} hexes · ${map.tokens.length} tokens · ${map.notes.length} notes</div></div></div>
      <div class="map-toolbar">${switcher}<label class="map-zoom">Zoom <input id="map-zoom" type="range" min="35" max="160" value="${zoomPercent}"><output id="map-zoom-output">${zoomPercent}%</output></label>${adminActions}</div>
      ${admin ? this.settingsHtml() : ""}
      <div class="world-map-layout">
        <section class="map-viewport" aria-label="${esc(map.name)} hex map">
          <div class="map-stage-spacer" style="width:${map.mapWidth * this.zoom}px;height:${map.mapHeight * this.zoom}px">
            <div class="map-surface ${admin ? "gm-map" : "player-map"}" style="width:${map.mapWidth}px;height:${map.mapHeight}px;transform:scale(${this.zoom})">
              ${map.imagePath ? `<img class="map-background" src="/api/maps/${map.id}/image?v=${encodeURIComponent(map.updatedAt)}" alt="">` : '<div class="map-background-placeholder"><span>Map image not set</span></div>'}
              ${this.gridHtml()}
            </div>
          </div>
        </section>
        <aside class="map-inspector">${this.inspectorHtml()}</aside>
      </div>`;
    const viewport = this.root.querySelector(".map-viewport");
    if (viewport) { viewport.scrollLeft = scroll.left; viewport.scrollTop = scroll.top; }
    const settings = this.root.querySelector(".map-settings"); if (settings) settings.open = settingsOpen;
  }

  settingsHtml() {
    const map = this.map;
    const images = ['<option value="">No background image</option>', ...this.images.map((image) => option(image.path, image.path, map.imagePath || ""))].join("");
    return `<details class="map-settings"><summary>Map and grid settings</summary><div class="map-settings-body">
      <form data-map-form="settings" class="map-settings-form">
        <label class="wide">Map name<input name="name" value="${esc(map.name)}" required maxlength="80"></label>
        <label class="wide">Background image<select name="imagePath">${images}</select></label>
        <label>Map width<input name="mapWidth" type="number" min="320" max="6000" value="${map.mapWidth}"></label>
        <label>Map height<input name="mapHeight" type="number" min="240" max="6000" value="${map.mapHeight}"></label>
        <label>Grid columns<input name="columns" type="number" min="1" max="120" value="${map.columns}"></label>
        <label>Grid rows<input name="rows" type="number" min="1" max="120" value="${map.rows}"></label>
        <label>Hex size<input name="hexSize" type="number" min="10" max="240" step="1" value="${map.hexSize}"></label>
        <label>X offset<input name="offsetX" type="number" min="-6000" max="6000" step="1" value="${map.offsetX}"></label>
        <label>Y offset<input name="offsetY" type="number" min="-6000" max="6000" step="1" value="${map.offsetY}"></label>
        <button class="button" type="submit">Save map settings</button>
      </form>
      <form data-map-form="upload" class="map-upload-form">
        <div><strong>Upload a new map image</strong><small>The image becomes an ordinary wiki file in the chosen content folder.</small></div>
        <label>Content folder<input name="folder" value="Maps" required></label>
        <label>Image file<input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml" required></label>
        <button class="button ghost" type="submit">Upload and use image</button>
      </form>
      <div class="map-fog-bulk"><div><strong>Fog of war</strong><small>Set a starting state for the complete grid, then adjust individual hexes from the inspector.</small></div>
        <button class="button ghost" data-map-action="fog-all">Fog entire map</button><button class="button ghost" data-map-action="reveal-all">Reveal entire map</button></div>
    </div></details>`;
  }

  gridHtml() {
    const states = this.hexState(); const admin = this.getUser().isAdmin; const cells = [];
    for (let row = 0; row < this.map.rows; row++) {
      for (let col = 0; col < this.map.columns; col++) {
        const key = cellKey(col, row); const hex = states.get(key) || { col, row, isFog: false };
        const notes = this.notesAt(col, row).length; const selected = this.selected?.col === col && this.selected?.row === row;
        const classes = ["map-hex", hex.isFog ? "is-fog" : "", (hex.featureIcon || hex.featureLabel) ? "has-feature" : "", notes ? "has-notes" : "", selected ? "is-selected" : ""].filter(Boolean).join(" ");
        const center = hexCenter(this.map, col, row); const title = hex.isFog && !admin ? "Unexplored" : [`Hex ${col + 1}, ${row + 1}`, hex.featureLabel, notes ? `${notes} note${notes === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
        cells.push(`<g class="${classes}" data-map-hex="${key}" style="--feature-color:${esc(hex.featureColor || "#a56a36")}">
          <polygon points="${hexPoints(this.map, col, row)}"><title>${esc(title)}</title></polygon>
          ${hex.featureIcon ? `<text class="map-feature-icon" x="${center.x}" y="${center.y + 7}">${esc(hex.featureIcon)}</text>` : ""}
          ${notes && !(hex.isFog && !admin) ? `<circle class="map-note-dot" cx="${center.x + this.map.hexSize * .58}" cy="${center.y - this.map.hexSize * .55}" r="4"/>` : ""}
        </g>`);
      }
    }
    const tokens = this.map.tokens.map((token) => {
      const center = hexCenter(this.map, token.col, token.row);
      const cellTokens = this.tokensAt(token.col, token.row); const index = cellTokens.findIndex((item) => item.id === token.id);
      const offset = (index - (cellTokens.length - 1) / 2) * Math.min(24, this.map.hexSize * .55);
      return `<g class="map-token ${admin ? "is-draggable" : ""}" data-map-token="${token.id}" transform="translate(${center.x + offset} ${center.y})">
        <circle r="17" style="fill:${esc(token.color)}"></circle><text class="map-token-icon" y="6">${esc(token.icon)}</text>
        <text class="map-token-label" y="31">${esc(token.label)}</text><title>${esc(token.label)}</title></g>`;
    }).join("");
    return `<svg class="map-grid" viewBox="0 0 ${this.map.mapWidth} ${this.map.mapHeight}" width="${this.map.mapWidth}" height="${this.map.mapHeight}">
      <defs><pattern id="map-fog-clouds" width="54" height="36" patternUnits="userSpaceOnUse"><rect width="54" height="36" fill="#777b78"/>
      <circle cx="12" cy="20" r="13" fill="#aeb2ad"/><circle cx="29" cy="14" r="16" fill="#969b97"/><circle cx="46" cy="23" r="14" fill="#b8bbb6"/></pattern></defs>
      <g class="map-hex-layer">${cells.join("")}</g><g class="map-token-layer">${tokens}</g></svg>`;
  }

  inspectorHtml() {
    if (!this.selected) return '<div class="map-inspector-empty"><span>⬡</span><h2>Select a hex</h2><p>Open a hex to view its features, notes, and tokens.</p></div>';
    const { col, row } = this.selected; const admin = this.getUser().isAdmin;
    const hex = this.hexState().get(cellKey(col, row)) || { col, row, isFog: false, featureIcon: "", featureLabel: "", featureColor: "#a56a36" };
    if (hex.isFog && !admin) return `<div class="map-inspector-empty"><span>☁</span><h2>Unexplored</h2><p>Knowledge of hex ${col + 1}, ${row + 1} is hidden by fog of war.</p></div>`;
    const notes = this.notesAt(col, row); const tokens = this.tokensAt(col, row);
    const featureChoices = FEATURE_ICONS.map(([icon, label]) => `<label title="${esc(label)}"><input type="radio" name="featureIcon" value="${esc(icon)}" ${hex.featureIcon === icon ? "checked" : ""}><span>${icon}</span><small>${esc(label)}</small></label>`).join("");
    const notesHtml = notes.map((note) => {
      const editable = admin || note.userId === this.getUser().id;
      return `<article class="map-note"><header><strong>${esc(note.author)}</strong><span>${new Date(note.updatedAt).toLocaleDateString()}</span></header><p>${esc(note.body)}</p>
        ${editable ? `<footer><button data-map-note-edit="${note.id}">Edit</button><button data-map-note-delete="${note.id}">Remove</button></footer>` : ""}</article>`;
    }).join("") || '<p class="map-muted">No notes on this hex.</p>';
    const tokenOptions = (selected) => TOKEN_ICONS.map(([icon, label]) => option(icon, `${icon}  ${label}`, selected)).join("");
    const tokensHtml = admin ? tokens.map((token) => `<form data-map-form="token-edit" data-token-id="${token.id}" class="map-token-form">
      <input name="label" value="${esc(token.label)}" required maxlength="80" aria-label="Token label"><select name="icon" aria-label="Token icon">${tokenOptions(token.icon)}</select>
      <input name="color" type="color" value="${esc(token.color)}" aria-label="Token color"><button type="submit">Save</button><button type="button" data-map-token-delete="${token.id}">×</button></form>`).join("") : "";
    return `<div class="map-inspector-head"><div><span>Hex ${col + 1}, ${row + 1}</span><h2>${esc(hex.featureLabel || "Unmarked territory")}</h2></div><button data-map-action="close-hex" aria-label="Close inspector">×</button></div>
      ${admin ? `<form data-map-form="hex" class="map-hex-form"><label class="map-fog-toggle"><input name="isFog" type="checkbox" ${hex.isFog ? "checked" : ""}><span>Fog of war</span></label>
        <label>Feature name<input name="featureLabel" value="${esc(hex.featureLabel || "")}" maxlength="80" placeholder="Ancient watchtower"></label>
        <div class="feature-icon-grid">${featureChoices}</div><label>Marker color<input name="featureColor" type="color" value="${esc(hex.featureColor || "#a56a36")}"></label>
        <div class="map-form-actions"><button class="button" type="submit">Save hex</button><button class="button ghost" type="button" data-map-action="clear-feature">Clear feature</button></div></form>` : ""}
      <section class="map-inspector-section"><h3>Notes</h3><div class="map-notes">${notesHtml}</div>
        <form data-map-form="note" class="map-note-form"><textarea name="body" required maxlength="4000" placeholder="Add something the table should remember…"></textarea><button class="button ghost" type="submit">Add note</button></form></section>
      ${admin ? `<section class="map-inspector-section"><h3>Tokens</h3>${tokensHtml || '<p class="map-muted">No tokens on this hex.</p>'}
        <form data-map-form="token-new" class="map-token-form"><input name="label" required maxlength="80" placeholder="Party or group name"><select name="icon">${tokenOptions("●")}</select>
        <input name="color" type="color" value="#386b57" aria-label="Token color"><button class="button ghost" type="submit">Add</button></form></section>` : ""}`;
  }

  async perform(work, success) {
    try { await work(); if (success) this.toast(success); }
    catch (error) { this.toast(error.message); }
  }

  async refreshLists(selectId = this.map?.id) {
    this.maps = await this.api("/api/maps");
    this.images = this.getUser().isAdmin ? await this.api("/api/maps/images") : [];
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
    if (action === "clear-feature") return this.saveHex({ isFog: this.hexState().get(cellKey(this.selected.col, this.selected.row))?.isFog, featureIcon: null, featureLabel: null, featureColor: null }, "Feature cleared");
    const editNote = event.target.closest("[data-map-note-edit]");
    if (editNote) return this.editNote(Number(editNote.dataset.mapNoteEdit));
    const deleteNote = event.target.closest("[data-map-note-delete]");
    if (deleteNote) return this.deleteNote(Number(deleteNote.dataset.mapNoteDelete));
    const deleteToken = event.target.closest("[data-map-token-delete]");
    if (deleteToken) return this.deleteToken(Number(deleteToken.dataset.mapTokenDelete));
    const token = event.target.closest("[data-map-token]");
    if (token && Date.now() > this.suppressClickUntil) {
      const item = this.map.tokens.find((entry) => entry.id === Number(token.dataset.mapToken));
      if (item) { this.selected = { col: item.col, row: item.row }; this.render(); }
      return;
    }
    const cell = event.target.closest("[data-map-hex]");
    if (cell) { const [col, row] = cell.dataset.mapHex.split(":").map(Number); this.selected = { col, row }; this.render(); }
  }

  async createMap() {
    const name = window.prompt("Name this world map:");
    if (!name?.trim()) return;
    await this.perform(async () => {
      const map = await this.api("/api/maps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      this.selected = null; await this.refreshLists(map.id);
    }, "Map created");
  }

  async deleteMap() {
    if (!window.confirm(`Delete "${this.map.name}" and all of its hex notes and tokens?`)) return;
    await this.perform(async () => { await this.api(`/api/maps/${this.map.id}`, { method: "DELETE" }); this.selected = null; await this.refreshLists(null); }, "Map deleted");
  }

  setAllFog(isFog) {
    const label = isFog ? "cover the complete map in fog" : "reveal every hex";
    if (!window.confirm(`Do you want to ${label}? Existing features, notes, and tokens are retained.`)) return;
    return this.perform(async () => {
      await this.api(`/api/maps/${this.map.id}/fog`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ isFog }) });
      await this.load(this.map.id);
    }, isFog ? "Map covered in fog" : "Map fully revealed");
  }

  change(event) {
    if (event.target.matches("#map-switcher")) this.load(Number(event.target.value)).catch((error) => this.toast(error.message));
  }

  input(event) {
    if (!event.target.matches("#map-zoom")) return;
    this.zoom = Number(event.target.value) / 100;
    const output = this.root.querySelector("#map-zoom-output"); if (output) output.textContent = event.target.value + "%";
    const spacer = this.root.querySelector(".map-stage-spacer"); const surface = this.root.querySelector(".map-surface");
    if (spacer && surface) { spacer.style.width = this.map.mapWidth * this.zoom + "px"; spacer.style.height = this.map.mapHeight * this.zoom + "px"; surface.style.transform = `scale(${this.zoom})`; }
  }

  async submit(event) {
    const form = event.target.closest("[data-map-form]"); if (!form) return;
    event.preventDefault(); const data = new FormData(form); const kind = form.dataset.mapForm;
    if (kind === "settings") {
      const input = Object.fromEntries(data); for (const key of ["mapWidth","mapHeight","columns","rows","hexSize","offsetX","offsetY"]) input[key] = Number(input[key]);
      if ((input.columns < this.map.columns || input.rows < this.map.rows) && !window.confirm("Shrinking the grid removes notes, features, and tokens that fall outside its new bounds. Continue?")) return;
      return this.perform(async () => { await this.api(`/api/maps/${this.map.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }); await this.refreshLists(); }, "Map settings saved");
    }
    if (kind === "upload") return this.uploadImage(form, data);
    if (kind === "hex") return this.saveHex({ col: this.selected.col, row: this.selected.row, isFog: data.has("isFog"), featureIcon: data.get("featureIcon") || null, featureLabel: data.get("featureLabel"), featureColor: data.get("featureColor") }, "Hex updated");
    if (kind === "note") return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...this.selected, body: data.get("body") }) }); await this.load(this.map.id); }, "Note added");
    if (kind === "token-new") return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/tokens`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...this.selected, label: data.get("label"), icon: data.get("icon"), color: data.get("color") }) }); await this.load(this.map.id); }, "Token added");
    if (kind === "token-edit") return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/tokens/${form.dataset.tokenId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: data.get("label"), icon: data.get("icon"), color: data.get("color") }) }); await this.load(this.map.id); }, "Token updated");
  }

  async uploadImage(form, data) {
    const file = data.get("image"); if (!(file instanceof File) || !file.size) return this.toast("Choose an image");
    if (file.size > 50 * 1024 * 1024) return this.toast("Images must be 50 MB or smaller");
    await this.perform(async () => {
      const encoded = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",", 2)[1]); reader.onerror = () => reject(new Error("Could not read that image")); reader.readAsDataURL(file);
      });
      const uploaded = await this.api("/api/maps/images", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ folder: data.get("folder"), name: file.name, data: encoded }) });
      await this.api(`/api/maps/${this.map.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ imagePath: uploaded.path }) });
      form.reset(); await this.refreshLists();
    }, "Image uploaded and selected");
  }

  saveHex(input, message) {
    return this.perform(async () => {
      await this.api(`/api/maps/${this.map.id}/hex`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...this.selected, ...input }) });
      await this.load(this.map.id);
    }, message);
  }

  editNote(noteId) {
    const note = this.map.notes.find((item) => item.id === noteId); if (!note) return;
    const body = window.prompt("Edit note:", note.body); if (!body?.trim() || body === note.body) return;
    return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/notes/${noteId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) }); await this.load(this.map.id); }, "Note updated");
  }

  deleteNote(noteId) {
    if (!window.confirm("Remove this note?")) return;
    return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/notes/${noteId}`, { method: "DELETE" }); await this.load(this.map.id); }, "Note removed");
  }

  deleteToken(tokenId) {
    return this.perform(async () => { await this.api(`/api/maps/${this.map.id}/tokens/${tokenId}`, { method: "DELETE" }); await this.load(this.map.id); }, "Token removed");
  }

  pointerDown(event) {
    const node = event.target.closest("[data-map-token]");
    if (!node || !this.getUser().isAdmin || !this.root.contains(node)) return;
    event.preventDefault(); const token = this.map.tokens.find((item) => item.id === Number(node.dataset.mapToken)); if (!token) return;
    this.drag = { node, token, startX: event.clientX, startY: event.clientY, moved: false };
  }

  pointerMove(event) {
    if (!this.drag) return;
    const rect = this.root.querySelector(".map-grid")?.getBoundingClientRect(); if (!rect) return;
    const x = (event.clientX - rect.left) / rect.width * this.map.mapWidth;
    const y = (event.clientY - rect.top) / rect.height * this.map.mapHeight;
    if (Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 4) this.drag.moved = true;
    this.drag.node.setAttribute("transform", `translate(${x} ${y})`);
  }

  pointerUp(event) {
    if (!this.drag) return;
    const drag = this.drag; this.drag = null;
    if (!drag.moved) return;
    this.suppressClickUntil = Date.now() + 250;
    const rect = this.root.querySelector(".map-grid")?.getBoundingClientRect(); if (!rect) return this.render();
    const x = (event.clientX - rect.left) / rect.width * this.map.mapWidth;
    const y = (event.clientY - rect.top) / rect.height * this.map.mapHeight;
    const cell = nearestHex(this.map, x, y);
    this.render();
    this.perform(async () => {
      await this.api(`/api/maps/${this.map.id}/tokens/${drag.token.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(cell) });
      this.selected = cell; await this.load(this.map.id);
    }, "Token moved");
  }
}
