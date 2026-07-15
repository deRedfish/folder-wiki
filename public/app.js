const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const view = $("#view");
const state = { files: [], folderPaths: [], articles: [], current: null, currentFile: null, content: "", searchResults: [], selectedResult: 0 };
const icons = { markdown: "▤", pdf: "▥", image: "▧", archive: "⬡" };
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const contentUrl = (file) => `/content/${file.split("/").map(encodeURIComponent).join("/")}`;
const formatDate = (date) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
const formatSize = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const STORAGE = { pins: "folder-wiki-pins", notes: "folder-wiki-notes", initiative: "folder-wiki-initiative" };
const pinned = () => JSON.parse(localStorage.getItem(STORAGE.pins) || "[]");
const setPinned = (items) => localStorage.setItem(STORAGE.pins, JSON.stringify(items));

function toast(message) {
  const node = $("#toast"); node.textContent = message; node.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 2200);
}
async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}
function setChrome(label, editable = false) {
  $("#breadcrumbs").textContent = `Wiki / ${label}`;
  $("#edit-button").classList.toggle("hidden", !editable);
  $$(".primary-nav button").forEach((button) => button.classList.remove("active"));
}
function navigate(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
  $("#sidebar").classList.remove("open");
}

function articleTitle(path) {
  return path.split("/").at(-1).replaceAll("-", " ").replaceAll("_", " ");
}
function buildArticles() {
  const map = new Map();
  const ensure = (folder) => {
    if (!map.has(folder)) {
      const parts = folder.split("/");
      map.set(folder, { path: folder, title: articleTitle(folder), parent: parts.length > 1 ? parts.slice(0, -1).join("/") : null, files: [], children: [], modified: null, size: 0 });
    }
    return map.get(folder);
  };
  for (const folder of state.folderPaths) ensure(folder);
  for (const file of state.files) {
    const folder = file.folder;
    const parts = folder.split("/");
    for (let i = 1; i <= parts.length; i++) ensure(parts.slice(0, i).join("/"));
    const article = ensure(folder); article.files.push(file); article.size += file.size;
    if (!article.modified || new Date(file.modified) > new Date(article.modified)) article.modified = file.modified;
  }
  for (const article of map.values()) {
    if (article.parent && map.has(article.parent)) map.get(article.parent).children.push(article);
  }
  const newestDescendant = (article) => {
    for (const child of article.children) { const modified = newestDescendant(child); if (modified && (!article.modified || new Date(modified) > new Date(article.modified))) article.modified = modified; }
    return article.modified;
  };
  [...map.values()].filter((article) => !article.parent).forEach(newestDescendant);
  for (const article of map.values()) article.children.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  state.articles = [...map.values()].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

function buildTree() {
  const roots = state.articles.filter((article) => !article.parent);
  function branch(articles, depth = 0) {
    return articles.map((article) => `<div class="tree-folder ${depth > 0 ? "closed" : ""}"><div class="tree-folder-line"><button class="tree-toggle" aria-label="Toggle child articles"><span class="chev">${article.children.length ? "▼" : "·"}</span></button><button class="tree-folder-row" data-article="${esc(article.path)}"><span>▱</span><span>${esc(article.title)}</span></button></div>${article.children.length ? `<div class="tree-children">${branch(article.children, depth + 1)}</div>` : ""}</div>`).join("");
  }
  $("#file-tree").innerHTML = branch(roots);
  $("#library-status").textContent = `${state.articles.length} articles · ${state.files.length} files`;
}

function renderHome() {
  setChrome("Overview"); $(".primary-nav [data-action=home]").classList.add("active");
  const recent = [...state.articles].filter((article) => article.modified).sort((a, b) => new Date(b.modified) - new Date(a.modified)).slice(0, 6);
  const folders = state.articles.filter((article) => !article.parent);
  const counts = { markdown: 0, pdf: 0, image: 0 }; state.files.forEach((file) => counts[file.type] = (counts[file.type] || 0) + 1);
  const welcome = state.articles.length ? "" : `<section class="welcome-card"><div><div class="eyebrow">Start here</div><h2>Feed your wiki with folders.</h2><p>Create a folder inside <code>content/</code> to make an article. Add Markdown, PDFs, images, text, JSON or ZIP files to that folder, and add subfolders to create child articles.</p></div><button class="button" data-action="new">Create your first page</button></section>`;
  view.innerHTML = `<section class="hero"><div><div class="eyebrow">Your self-fed reference library</div><h1>Your knowledge,<br>within reach.</h1><p>Browse notes, references, images and PDFs as connected folder articles. Anything added inside the content folder appears here automatically.</p></div><div class="stats"><div class="stat"><strong>${state.articles.length}</strong><span>Articles</span></div><div class="stat"><strong>${state.files.length}</strong><span>Sources</span></div><div class="stat"><strong>${folders.length}</strong><span>Collections</span></div></div></section>
    ${welcome}
    <section><div class="section-head"><h2>Recently updated</h2><button data-action="all">View entire wiki →</button></div><div class="card-grid">${recent.map(card).join("")}</div></section>
    <section><div class="section-head"><h2>Browse collections</h2></div><div class="folder-chips">${folders.map((article) => `<button class="folder-chip" data-article="${esc(article.path)}">${esc(article.title)} · ${article.children.length} sections</button>`).join("")}</div></section>`;
}
function card(article) {
  return `<article class="entry-card" data-article="${esc(article.path)}"><div class="type"><span>▱</span>Article</div><h3>${esc(article.title)}</h3><p>${article.files.length} sources · ${article.children.length} child articles${article.modified ? ` · ${formatDate(article.modified)}` : ""}</p></article>`;
}
function renderList(title, articles, subtitle = "Browse every folder article in the content directory.") {
  setChrome(title); const action = title === "Pinned entries" ? "pinned" : "all"; $(`.primary-nav [data-action=${action}]`)?.classList.add("active");
  view.innerHTML = `<div class="document-header"><div class="eyebrow">Article index</div><h1>${esc(title)}</h1><div class="document-meta">${esc(subtitle)} · ${articles.length} articles</div></div><div class="list-toolbar"><input class="filter-input" id="list-filter" placeholder="Filter this list…"><button class="button ghost" data-action="search">Full-text search</button></div><div class="entry-list" id="entry-list">${articles.map(row).join("")}</div>`;
  $("#list-filter").addEventListener("input", (event) => { const q = event.target.value.toLocaleLowerCase(); $("#entry-list").innerHTML = articles.filter((article) => `${article.title} ${article.path}`.toLocaleLowerCase().includes(q)).map(row).join("") || `<div class="empty-state">No matching articles.</div>`; });
}
function row(article) { return `<button class="list-row" data-article="${esc(article.path)}"><span class="file-icon">▱</span><span class="list-title">${esc(article.title)}</span><span class="list-path">${esc(article.path)}</span><span class="list-date">${article.modified ? formatDate(article.modified) : "—"}</span></button>`; }

function slug(value) { return value.toLocaleLowerCase().replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section"; }
function inline(text) {
  let value = esc(text);
  const code = [];
  value = value.replace(/`([^`]+)`/g, (_, content) => `%%CODE${code.push(`<code>${content}</code>`) - 1}%%`);
  value = value.replace(/!\[([^\]]*)\]\(([^ )]+)(?:\s+"[^"]*")?\)/g, (_, alt, url) => `<img src="${safeHref(url)}" alt="${alt}">`);
  value = value.replace(/\[([^\]]+)\]\(([^ )]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, url) => `<a href="${safeHref(url)}" ${/^https?:/i.test(url) ? 'target="_blank" rel="noreferrer"' : ""}>${label}</a>`);
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
  value = value.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>").replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
  value = value.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  code.forEach((item, index) => value = value.replace(`%%CODE${index}%%`, item));
  return value;
}
function safeHref(url) {
  const decoded = url.replaceAll("&amp;", "&");
  if (/^(https?:|mailto:|#)/i.test(decoded)) return esc(decoded);
  if (/^(javascript|data):/i.test(decoded)) return "#";
  return esc(decoded);
}
function renderMarkdown(source, prefix = "") {
  const lines = source.replace(/\r/g, "").split("\n"); const out = []; const headings = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) { const lang = line.slice(3).trim(); const block = []; i++; while (i < lines.length && !/^```/.test(lines[i])) block.push(lines[i++]); i++; out.push(`<pre><code data-language="${esc(lang)}">${esc(block.join("\n"))}</code></pre>`); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { const level = heading[1].length, label = heading[2].replace(/\\?\[\[?\]\([^)]*\)\\?\]$/g, "").trim(), id = `${prefix}${slug(label)}-${headings.length}`; headings.push({ level, label: label.replace(/[*_`]/g, ""), id }); out.push(`<h${level} id="${id}">${inline(label)}</h${level}>`); i++; continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if (/^>\s?/.test(line)) { const block = []; while (i < lines.length && /^>\s?/.test(lines[i])) block.push(lines[i++].replace(/^>\s?/, "")); out.push(`<blockquote>${renderMarkdown(block.join("\n")).html}</blockquote>`); continue; }
    if (/^\s*([-+*])\s+/.test(line)) { const items = []; while (i < lines.length && /^\s*[-+*]\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*[-+*]\s+/, ""))}</li>`); out.push(`<ul>${items.join("")}</ul>`); continue; }
    if (/^\s*\d+[.)]\s+/.test(line)) { const items = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*\d+[.)]\s+/, ""))}</li>`); out.push(`<ol>${items.join("")}</ol>`); continue; }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[i + 1])) { const split = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()); const headers = split(line); i += 2; const rows = []; while (i < lines.length && lines[i].includes("|")) rows.push(split(lines[i++])); out.push(`<table><thead><tr>${headers.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`); continue; }
    if (!line.trim()) { i++; continue; }
    const paragraph = [line]; i++; while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s|^```|^>|^\s*([-+*])\s+|^\s*\d+[.)]\s+/.test(lines[i])) paragraph.push(lines[i++]); out.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return { html: out.join("\n"), headings };
}

async function openArticle(path) {
  const article = state.articles.find((item) => item.path === path); if (!article) return renderNotFound();
  state.current = article; state.currentFile = null; state.content = "";
  const textFiles = article.files.filter((file) => file.type === "markdown");
  const editableFiles = textFiles.filter((file) => ["md", "markdown"].includes(file.ext));
  const isEditable = editableFiles.length === 1;
  setChrome(article.path, isEditable);
  const breadcrumbParts = article.path.split("/");
  $("#breadcrumbs").innerHTML = `<button data-action="home">Wiki</button>${breadcrumbParts.map((part, index) => { const target = breadcrumbParts.slice(0, index + 1).join("/"); return `<span>/</span><button data-article="${esc(target)}">${esc(articleTitle(part))}</button>`; }).join("")}`;
  const isPinned = pinned().includes(article.path);
  const totalSize = article.files.reduce((sum, file) => sum + file.size, 0);
  const header = `<header class="document-header"><button class="pin-button ${isPinned ? "is-pinned" : ""}" data-action="pin" title="Pin this article">◇</button><div class="eyebrow">Folder article${article.parent ? ` · <button class="inline-link" data-article="${esc(article.parent)}">${esc(articleTitle(article.parent))}</button>` : ""}</div><h1>${esc(article.title)}</h1><div class="document-meta"><span>${article.files.length} direct sources</span><span>${article.children.length} child articles</span>${article.modified ? `<span>Updated ${formatDate(article.modified)}</span>` : ""}${totalSize ? `<span>${formatSize(totalSize)}</span>` : ""}</div></header>`;
  try {
    const loaded = await Promise.all(textFiles.map(async (file, index) => {
      const data = await api(`/api/file?path=${encodeURIComponent(file.path)}`);
      const rendered = renderMarkdown(data.content, `source-${index}-`);
      return { file, content: data.content, ...rendered };
    }));
    if (isEditable) { state.currentFile = editableFiles[0]; state.content = loaded.find((item) => item.file.path === editableFiles[0].path)?.content || ""; }
    const childNav = article.children.length ? `<section class="child-articles"><div class="section-kicker">Sub-articles</div><div class="child-grid">${article.children.map((child) => `<article class="child-card" data-article="${esc(child.path)}"><span>▱</span><div><strong>${esc(child.title)}</strong><small>${child.files.length} sources · ${child.children.length} children</small></div><b>→</b></article>`).join("")}</div></section>` : "";
    const markdown = loaded.map((item) => `<section class="article-source prose">${textFiles.length > 1 ? `<div class="source-label">Source · ${esc(item.file.name)}</div>` : ""}${item.html}</section>`).join("");
    const pdfs = article.files.filter((file) => file.type === "pdf").map((file) => `<details class="embedded-source" open><summary><span>▥</span><strong>${esc(file.title)}</strong><a href="${contentUrl(file.path)}" target="_blank" title="Open PDF in a new tab">Open separately ↗</a></summary><iframe class="media-view embedded-pdf" loading="lazy" src="${contentUrl(file.path)}" title="${esc(file.title)}"></iframe></details>`).join("");
    const images = article.files.filter((file) => file.type === "image");
    const gallery = images.length ? `<section class="article-gallery"><div class="section-kicker">Images · ${images.length}</div><div class="image-grid ${images.length === 1 ? "single" : ""}">${images.map((file) => `<figure data-image="${contentUrl(file.path)}" data-image-title="${esc(file.title)}"><img loading="lazy" src="${contentUrl(file.path)}" alt="${esc(file.title)}"><figcaption>${esc(file.title)}</figcaption></figure>`).join("")}</div></section>` : "";
    const downloads = article.files.filter((file) => file.type === "archive");
    const downloadList = downloads.length ? `<section class="article-downloads"><div class="section-kicker">Downloads</div>${downloads.map((file) => `<a class="download-row" href="${contentUrl(file.path)}?download"><span>⬡</span><strong>${esc(file.name)}</strong><small>${formatSize(file.size)}</small><b>Download ↓</b></a>`).join("")}</section>` : "";
    const empty = !article.files.length && !article.children.length ? `<div class="empty-state">This article is empty. Add content to <strong>${esc(article.path)}</strong> and it will appear here.</div>` : "";
    const headings = loaded.flatMap((item) => item.headings).filter((heading) => heading.level > 1);
    view.innerHTML = `<div class="page-layout"><article>${header}${childNav}${markdown}${pdfs}${gallery}${downloadList}${empty}</article><aside class="toc"><strong>In this article</strong>${article.children.map((child) => `<a data-article="${esc(child.path)}" href="#article/${encodeURIComponent(child.path)}">${esc(child.title)} →</a>`).join("")}${headings.map((heading) => `<a data-level="${heading.level}" href="#${heading.id}">${esc(heading.label)}</a>`).join("") || (!article.children.length ? `<a>No sections</a>` : "")}</aside></div>`;
  } catch (error) { view.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
}

function renderEditor(file = null) {
  const isEdit = Boolean(file); setChrome(isEdit ? `Editing ${file.path}` : "New page");
  const initial = isEdit ? state.content : "# New page\n\nStart writing here. Use Markdown headings to keep longer articles easy to navigate.\n";
  view.innerHTML = `<div class="document-header"><div class="eyebrow">Markdown editor</div><h1>${isEdit ? "Edit entry" : "Create an entry"}</h1><input id="editor-path" class="editor-path" value="${esc(isEdit ? file.path : "Notes/New Page.md")}" ${isEdit ? "readonly" : ""}></div><div class="editor-layout"><section class="editor-pane"><div class="editor-label">Markdown</div><textarea class="editor-text" id="editor-text" spellcheck="true"></textarea></section><section class="editor-pane"><div class="editor-label">Preview</div><div class="editor-preview prose" id="editor-preview"></div></section></div><div class="editor-actions"><button class="button ghost" data-action="cancel-edit">Cancel</button><button class="button" data-action="save">Save page</button></div>`;
  $("#editor-text").value = initial; updatePreview(); $("#editor-text").addEventListener("input", updatePreview);
}
function updatePreview() { $("#editor-preview").innerHTML = renderMarkdown($("#editor-text").value).html; }
async function savePage() {
  let path = $("#editor-path").value.trim().replaceAll("\\", "/"); if (!/\.md$/i.test(path)) path += ".md";
  if (!path || path.startsWith("/") || path.includes("..")) return toast("Choose a safe path inside the content folder");
  try { await api("/api/file", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, content: $("#editor-text").value }) }); await loadFiles(); toast("Page saved"); const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "Library"; navigate(`#article/${encodeURIComponent(folder)}`); }
  catch (error) { toast(error.message); }
}

function renderGM() {
  setChrome("GM screen"); $(".primary-nav [data-action=gm]").classList.add("active");
  view.innerHTML = `<div class="document-header"><div class="eyebrow">At-the-table utilities</div><h1>GM screen</h1><div class="document-meta">Initiative and notes are saved in this browser.</div></div><div class="gm-grid"><section class="tool-card"><div class="section-head"><h2>Initiative tracker</h2><button data-action="add-initiative">＋ Add combatant</button></div><div id="initiative-list"></div></section><div><section class="tool-card"><h2>Dice roller</h2><div class="dice-buttons">${[4,6,8,10,12,20,100].map((die) => `<button data-die="${die}">d${die}</button>`).join("")}</div><div class="dice-result" id="dice-result">—</div></section><section class="tool-card" style="margin-top:16px"><h2>Session scratchpad</h2><textarea class="quick-notes" id="quick-notes" placeholder="Names, HP, secrets, reminders…"></textarea></section></div></div>`;
  renderInitiative(); $("#quick-notes").value = localStorage.getItem(STORAGE.notes) || ""; $("#quick-notes").addEventListener("input", (e) => localStorage.setItem(STORAGE.notes, e.target.value));
}
function initiatives() { return JSON.parse(localStorage.getItem(STORAGE.initiative) || "[]"); }
function renderInitiative() { const list = initiatives().sort((a,b) => Number(b.score)-Number(a.score)); $("#initiative-list").innerHTML = list.map((item, index) => `<div class="initiative-row"><input data-init-name="${index}" value="${esc(item.name)}" placeholder="Combatant"><input type="number" data-init-score="${index}" value="${esc(item.score)}" placeholder="Init"><button data-init-remove="${index}">×</button></div>`).join("") || `<div class="empty-state" style="padding:35px 10px">Add combatants when the encounter begins.</div>`; }
function updateInitiative() { const list = initiatives(); $$("[data-init-name]").forEach((input) => list[input.dataset.initName].name = input.value); $$("[data-init-score]").forEach((input) => list[input.dataset.initScore].score = input.value); localStorage.setItem(STORAGE.initiative, JSON.stringify(list)); }

function openSearch() { $("#search-modal").classList.remove("hidden"); $("#search-input").focus(); }
function closeSearch() { $("#search-modal").classList.add("hidden"); }
let searchTimer;
async function runSearch(q) {
  if (!q.trim()) { $("#search-results").innerHTML = `<div class="search-empty">Start typing to search titles and full document text.</div>`; return; }
  $("#search-results").innerHTML = `<div class="search-empty">Searching the wiki…</div>`;
  try {
    const fileResults = await api(`/api/search?q=${encodeURIComponent(q)}`);
    const grouped = new Map();
    for (const result of fileResults) {
      const article = state.articles.find((item) => item.path === result.folder); if (!article) continue;
      if (!grouped.has(article.path)) grouped.set(article.path, { ...article, excerpt: result.excerpt || `Matched ${result.name}`, matches: 0 });
      grouped.get(article.path).matches++;
    }
    state.searchResults = [...grouped.values()]; state.selectedResult = 0; renderSearchResults();
  } catch (error) { $("#search-results").innerHTML = `<div class="search-empty">${esc(error.message)}</div>`; }
}
function renderSearchResults() { $("#search-results").innerHTML = state.searchResults.map((item, index) => `<div class="search-result ${index === state.selectedResult ? "selected" : ""}" data-article="${esc(item.path)}"><span class="file-icon">▱</span><div><strong>${esc(item.title)}</strong><p>${esc(item.excerpt || item.path)}</p></div><span class="badge">${item.matches} source${item.matches === 1 ? "" : "s"}</span></div>`).join("") || `<div class="search-empty">No articles matched that search.</div>`; $(".search-result.selected")?.scrollIntoView({ block: "nearest" }); }

function renderNotFound() { setChrome("Not found"); view.innerHTML = `<div class="empty-state"><h1>Page not found</h1><p>The entry may have moved or been renamed.</p><button class="button" data-action="home">Return to wiki</button></div>`; }
function openImage(src, title) {
  let lightbox = $("#image-lightbox");
  if (!lightbox) { lightbox = document.createElement("div"); lightbox.id = "image-lightbox"; lightbox.className = "image-lightbox"; lightbox.innerHTML = `<button aria-label="Close image">×</button><img><div></div>`; document.body.append(lightbox); lightbox.addEventListener("click", (event) => { if (event.target !== $("img", lightbox)) lightbox.remove(); }); }
  $("img", lightbox).src = src; $("img", lightbox).alt = title || ""; $("div", lightbox).textContent = title || "";
}
async function route() {
  const hash = location.hash || "#home"; const [routeName, encoded] = hash.slice(1).split("/");
  if (routeName === "article" || routeName === "folder") return openArticle(decodeURIComponent(encoded || ""));
  if (routeName === "file") { const file = state.files.find((item) => item.path === decodeURIComponent(encoded || "")); return file ? openArticle(file.folder) : renderNotFound(); }
  if (routeName === "all") return renderList("All articles", state.articles);
  if (routeName === "pinned") { const pins = pinned(); return renderList("Pinned articles", state.articles.filter((article) => pins.includes(article.path)), "A short shelf of references you want close at hand."); }
  if (routeName === "gm") return renderGM();
  if (routeName === "new") return renderEditor();
  renderHome();
}
async function loadFiles() { state.files = await api("/api/files"); state.folderPaths = await api("/api/folders"); buildArticles(); buildTree(); }

document.addEventListener("click", async (event) => {
  const articleNode = event.target.closest("[data-article]"); if (articleNode) { closeSearch(); return navigate(`#article/${encodeURIComponent(articleNode.dataset.article)}`); }
  const imageNode = event.target.closest("[data-image]"); if (imageNode) return openImage(imageNode.dataset.image, imageNode.dataset.imageTitle);
  const treeToggle = event.target.closest(".tree-toggle"); if (treeToggle) return treeToggle.closest(".tree-folder").classList.toggle("closed");
  const die = event.target.closest("[data-die]"); if (die) { const sides = Number(die.dataset.die); $("#dice-result").textContent = Math.floor(Math.random() * sides) + 1; return; }
  const remove = event.target.closest("[data-init-remove]"); if (remove) { const list = initiatives(); list.splice(Number(remove.dataset.initRemove), 1); localStorage.setItem(STORAGE.initiative, JSON.stringify(list)); return renderInitiative(); }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (["home","all","pinned","gm","new"].includes(action)) return navigate(`#${action}`);
  if (action === "search") return openSearch();
  if (action === "menu") return $("#sidebar").classList.toggle("open");
  if (action === "collapse") return $$(".tree-folder").forEach((node) => node.classList.add("closed"));
  if (action === "random") { const article = state.articles[Math.floor(Math.random() * state.articles.length)]; if (article) navigate(`#article/${encodeURIComponent(article.path)}`); }
  if (action === "edit" && state.currentFile) return renderEditor(state.currentFile);
  if (action === "cancel-edit") return state.current ? navigate(`#article/${encodeURIComponent(state.current.path)}`) : navigate("#home");
  if (action === "save") return savePage();
  if (action === "pin" && state.current) { const pins = pinned(), at = pins.indexOf(state.current.path); at >= 0 ? pins.splice(at,1) : pins.push(state.current.path); setPinned(pins); event.target.classList.toggle("is-pinned"); toast(at >= 0 ? "Removed from pinned" : "Pinned for quick access"); }
  if (action === "add-initiative") { const list = initiatives(); list.push({ name:"", score:"" }); localStorage.setItem(STORAGE.initiative, JSON.stringify(list)); renderInitiative(); $$("[data-init-name]").at(-1)?.focus(); }
});
document.addEventListener("change", (event) => { if (event.target.matches("[data-init-name],[data-init-score]")) { updateInitiative(); renderInitiative(); } });
$("#search-modal").addEventListener("click", (event) => { if (event.target === $("#search-modal")) closeSearch(); });
$("#search-input").addEventListener("input", (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(event.target.value), 180); });
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); }
  if (event.key === "Escape") closeSearch();
  if (!$("#search-modal").classList.contains("hidden") && ["ArrowDown","ArrowUp","Enter"].includes(event.key)) { event.preventDefault(); if (event.key === "ArrowDown") state.selectedResult = Math.min(state.searchResults.length - 1, state.selectedResult + 1); if (event.key === "ArrowUp") state.selectedResult = Math.max(0, state.selectedResult - 1); if (event.key === "Enter" && state.searchResults[state.selectedResult]) { closeSearch(); navigate(`#article/${encodeURIComponent(state.searchResults[state.selectedResult].path)}`); } else renderSearchResults(); }
});
window.addEventListener("hashchange", route);

try { await loadFiles(); await route(); } catch (error) { view.innerHTML = `<div class="empty-state"><h1>Could not open the wiki</h1><p>${esc(error.message)}</p></div>`; }
