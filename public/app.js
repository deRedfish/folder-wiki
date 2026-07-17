import { prettifyMarkdown } from "./editor-utils.mjs";
import { filesInFolder, folderSelectionStatus } from "./admin-utils.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const view = $("#view");
const state = { user: null, authMode: "login", files: [], folderPaths: [], articles: [], current: null, currentFile: null, content: "", searchResults: [], selectedResult: 0, adminFiles: [], adminRoles: [], adminRoleId: null, adminSelection: new Set(), adminCollapsed: new Set(), adminAnchor: null };
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
  if (response.status === 401 && !url.startsWith("/api/auth/")) showAuth();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}
function setAuthMode(mode) {
  state.authMode = mode; const registering = mode === "register";
  $$("[data-auth-mode]").forEach((button) => button.classList.toggle("active", button.dataset.authMode === mode));
  $("#auth-eyebrow").textContent = registering ? "Create an account" : "Welcome back";
  $("#auth-title").textContent = registering ? "Sign up" : "Log in";
  $("#auth-copy").textContent = registering ? "New accounts receive the Player role. The first account becomes the GM administrator." : "Enter your account details to open the wiki.";
  $("#auth-submit").textContent = registering ? "Create account" : "Log in";
  $("#auth-password").autocomplete = registering ? "new-password" : "current-password";
  $("#auth-error").classList.add("hidden");
}
function showAuth(message = "") {
  state.user = null; $("#app-shell").classList.add("hidden"); $("#auth-screen").classList.remove("hidden");
  closeSearch(); setAuthMode(state.authMode); const error = $("#auth-error"); error.textContent = message; error.classList.toggle("hidden", !message); $("#auth-username").focus();
}
function showApp(user) {
  state.user = user; $("#auth-screen").classList.add("hidden"); $("#app-shell").classList.remove("hidden");
  $$('[data-admin-only]').forEach((node) => node.classList.toggle("hidden", !user.isAdmin));
  $("#session-username").textContent = user.username; $("#session-roles").textContent = user.roles.map((role) => role.name).join(" · ");
}
async function submitAuth() {
  const input = { username: $("#auth-username").value, password: $("#auth-password").value };
  try { const user = await api(`/api/auth/${state.authMode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }); showApp(user); await loadFiles(true); navigate("#home"); }
  catch (error) { const node = $("#auth-error"); node.textContent = error.message; node.classList.remove("hidden"); }
}
function setChrome(label, editable = false) {
  view.classList.remove("editor-view");
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
  const isEditable = state.user.isAdmin && editableFiles.length === 1;
  setChrome(article.path, isEditable);
  const breadcrumbParts = article.path.split("/");
  $("#breadcrumbs").innerHTML = `<button data-action="home">Wiki</button>${breadcrumbParts.map((part, index) => { const target = breadcrumbParts.slice(0, index + 1).join("/"); return `<span>/</span><button data-article="${esc(target)}">${esc(articleTitle(part))}</button>`; }).join("")}`;
  const isPinned = pinned().includes(article.path);
  const totalSize = article.files.reduce((sum, file) => sum + file.size, 0);
  const restricted = state.user.isAdmin ? article.files.filter((file) => file.viewerVisible === false).length : 0;
  const warning = restricted ? `<div class="restriction-warning"><strong>Restricted content</strong><span>${restricted === article.files.length ? "This article is hidden from all viewer roles." : `${restricted} source${restricted === 1 ? " is" : "s are"} hidden from all viewer roles.`}</span></div>` : "";
  const header = `<header class="document-header"><button class="pin-button ${isPinned ? "is-pinned" : ""}" data-action="pin" title="Pin this article">◇</button><div class="eyebrow">Folder article${article.parent ? ` · <button class="inline-link" data-article="${esc(article.parent)}">${esc(articleTitle(article.parent))}</button>` : ""}</div><h1>${esc(article.title)}</h1><div class="document-meta"><span>${article.files.length} direct sources</span><span>${article.children.length} child articles</span>${article.modified ? `<span>Updated ${formatDate(article.modified)}</span>` : ""}${totalSize ? `<span>${formatSize(totalSize)}</span>` : ""}</div></header>${warning}`;
  try {
    const loaded = await Promise.all(textFiles.map(async (file, index) => {
      const data = await api(`/api/file?path=${encodeURIComponent(file.path)}`);
      const rendered = renderMarkdown(data.content, `source-${index}-`);
      return { file, content: data.content, ...rendered };
    }));
    if (isEditable) { state.currentFile = editableFiles[0]; state.content = loaded.find((item) => item.file.path === editableFiles[0].path)?.content || ""; }
    const markdown = loaded.map((item) => {
      const canEdit = state.user.isAdmin && ["md", "markdown"].includes(item.file.ext);
      return `<section class="article-source prose"><div class="source-toolbar"><div class="source-label">Source · ${esc(item.file.name)}</div>${canEdit ? `<button class="source-edit" data-edit-file="${esc(item.file.path)}">Edit source</button>` : ""}</div>${item.html}</section>`;
    }).join("");
    const pdfs = article.files.filter((file) => file.type === "pdf").map((file) => `<details class="embedded-source" open><summary><span>▥</span><strong>${esc(file.title)}</strong><a href="${contentUrl(file.path)}" target="_blank" title="Open PDF in a new tab">Open separately ↗</a></summary><iframe class="media-view embedded-pdf" loading="lazy" src="${contentUrl(file.path)}" title="${esc(file.title)}"></iframe></details>`).join("");
    const images = article.files.filter((file) => file.type === "image");
    const gallery = images.length ? `<section class="article-gallery"><div class="section-kicker">Visual references · ${images.length}</div><div class="image-grid ${images.length === 1 ? "single" : ""}">${images.map((file, index) => `<figure class="${index === 0 ? "featured-image" : ""}" data-image="${contentUrl(file.path)}" data-image-title="${esc(file.title)}"><img loading="${index === 0 ? "eager" : "lazy"}" src="${contentUrl(file.path)}" alt="${esc(file.title)}"><figcaption>${esc(file.title)}</figcaption></figure>`).join("")}</div></section>` : "";
    const downloads = article.files.filter((file) => file.type === "archive");
    const downloadList = downloads.length ? `<section class="article-downloads"><div class="section-kicker">Downloads</div>${downloads.map((file) => `<a class="download-row" href="${contentUrl(file.path)}?download"><span>⬡</span><strong>${esc(file.name)}</strong><small>${formatSize(file.size)}</small><b>Download ↓</b></a>`).join("")}</section>` : "";
    const empty = !article.files.length && !article.children.length ? `<div class="empty-state">This article is empty. Add content to <strong>${esc(article.path)}</strong> and it will appear here.</div>` : "";
    const headings = loaded.flatMap((item) => item.headings).filter((heading) => heading.level > 1);
    const childLinks = article.children.length ? `<nav class="article-rail-section"><strong>Child articles</strong>${article.children.map((child) => `<a class="child-article-link" data-article="${esc(child.path)}" href="#article/${encodeURIComponent(child.path)}"><span>▱</span><span><b>${esc(child.title)}</b><small>${child.files.length} source${child.files.length === 1 ? "" : "s"} · ${child.children.length} child${child.children.length === 1 ? "" : "ren"}</small></span><i>→</i></a>`).join("")}</nav>` : "";
    const tocLinks = headings.length ? `<nav class="article-rail-section"><strong>On this page</strong>${headings.map((heading) => `<a data-level="${heading.level}" href="#${heading.id}">${esc(heading.label)}</a>`).join("")}</nav>` : "";
    const rail = childLinks || tocLinks ? `<aside class="article-rail">${childLinks}${tocLinks}</aside>` : "";
    view.innerHTML = `<div class="article-shell">${header}<div class="page-layout"><article class="article-content">${gallery}${markdown}${pdfs}${downloadList}${empty}</article>${rail}</div></div>`;
  } catch (error) { view.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
}

function renderEditor(file = null) {
  if (!state.user?.isAdmin) return navigate("#home");
  const isEdit = Boolean(file); setChrome(isEdit ? `Editing ${file.path}` : "New page");
  view.classList.add("editor-view");
  const initial = isEdit ? state.content : "# New page\n\nStart writing here. Use Markdown headings to keep longer articles easy to navigate.\n";
  const tool = (command, label, title, className = "") => `<button type="button" class="${className}" data-md-command="${command}" title="${title}" aria-label="${title}">${label}</button>`;
  const linkIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>`;
  const toolbar = `${tool("bold", "B", "Bold (Ctrl+B)", "md-bold")}${tool("italic", "I", "Italic (Ctrl+I)", "md-italic")}${[1, 2, 3, 4].map((level) => tool(`heading-${level}`, `H${level}`, `Heading level ${level} (Ctrl+Alt+${level})`)).join("")}${tool("link", linkIcon, "Link with optional title (Ctrl+K)", "md-link")}${tool("quote", "❯", "Block quote")}${tool("bullet", "• List", "Bulleted list")}${tool("number", "1. List", "Numbered list")}${tool("code", "</>", "Inline code")}${tool("rule", "—", "Horizontal rule")}${tool("format", "Format", "Format Markdown (Ctrl+Shift+F)", "md-format")}`;
  view.innerHTML = `<div class="document-header"><div class="eyebrow">Markdown editor</div><h1>${isEdit ? "Edit entry" : "Create an entry"}</h1><input id="editor-path" class="editor-path" value="${esc(isEdit ? file.path : "Notes/New Page.md")}" ${isEdit ? "readonly" : ""}></div><div class="editor-layout"><section class="editor-pane"><div class="editor-label">Markdown <span>Ctrl+S to save</span></div><div class="markdown-toolbar" role="toolbar" aria-label="Markdown formatting">${toolbar}</div><div class="editor-code-wrap"><pre class="editor-highlight" id="editor-highlight" aria-hidden="true"><code></code></pre><textarea class="editor-text" id="editor-text" spellcheck="true" aria-label="Markdown source"></textarea></div></section><section class="editor-pane"><div class="editor-label">Preview</div><div class="editor-preview prose" id="editor-preview"></div></section></div><div class="editor-actions"><button class="button ghost" data-action="cancel-edit">Cancel</button><button class="button" data-action="save">Save page</button></div>`;
  const editor = $("#editor-text"); editor.value = initial; updateEditor();
  editor.addEventListener("input", updateEditor);
  editor.addEventListener("scroll", syncEditorScroll);
  editor.addEventListener("keydown", handleEditorKeydown);
}
function highlightInlineMarkdown(text) {
  const pattern = /(`[^`\n]+`|!\[[^\]\n]*\]\([^\)\n]*\)|\[[^\]\n]+\]\([^\)\n]*\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/g;
  return text.split(pattern).map((token) => {
    if (/^`/.test(token)) return `<span class="md-token-code">${esc(token)}</span>`;
    if (/^!?\[/.test(token)) return `<span class="md-token-link">${esc(token)}</span>`;
    if (/^(\*\*|__)/.test(token)) return `<span class="md-token-strong">${esc(token)}</span>`;
    if (/^(\*|_)/.test(token)) return `<span class="md-token-em">${esc(token)}</span>`;
    if (/^~~/.test(token)) return `<span class="md-token-del">${esc(token)}</span>`;
    return esc(token);
  }).join("");
}
function highlightMarkdown(source) {
  let fenced = false;
  return source.replace(/\r/g, "").split("\n").map((line) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return `<span class="md-token-fence">${esc(line)}</span>`; }
    if (fenced) return `<span class="md-token-codeblock">${esc(line)}</span>`;
    const heading = line.match(/^(\s*)(#{1,6})(\s+)(.*)$/);
    if (heading) return `${esc(heading[1])}<span class="md-token-marker">${esc(heading[2])}</span>${esc(heading[3])}<span class="md-token-heading md-token-heading-${heading[2].length}">${highlightInlineMarkdown(heading[4])}</span>`;
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) return `<span class="md-token-rule">${esc(line)}</span>`;
    const prefix = line.match(/^(\s*)(>\s+|[-+*]\s+|\d+[.)]\s+)(.*)$/);
    if (prefix) { const tokenClass = prefix[2].trim().startsWith(">") ? "md-token-quote" : ""; return `${esc(prefix[1])}<span class="md-token-marker">${esc(prefix[2])}</span><span class="${tokenClass}">${highlightInlineMarkdown(prefix[3])}</span>`; }
    return highlightInlineMarkdown(line);
  }).join("\n") + " ";
}
function syncEditorScroll() { const editor = $("#editor-text"), highlight = $("#editor-highlight"); if (editor && highlight) { highlight.scrollTop = editor.scrollTop; highlight.scrollLeft = editor.scrollLeft; } }
function updateEditor() {
  const editor = $("#editor-text"); if (!editor) return;
  $("#editor-preview").innerHTML = renderMarkdown(editor.value).html;
  $("#editor-highlight code").innerHTML = highlightMarkdown(editor.value);
  syncEditorScroll();
}
function replaceEditorText(start, end, replacement, selectionStart, selectionEnd) {
  const editor = $("#editor-text"); editor.setRangeText(replacement, start, end, "end");
  editor.setSelectionRange(selectionStart, selectionEnd); editor.focus(); editor.dispatchEvent(new Event("input", { bubbles: true }));
}
function wrapEditorSelection(before, after = before, placeholder = "text") {
  const editor = $("#editor-text"); let { selectionStart: start, selectionEnd: end } = editor; const selected = editor.value.slice(start, end);
  if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
    const replacement = selected.slice(before.length, selected.length - after.length); return replaceEditorText(start, end, replacement, start, start + replacement.length);
  }
  if (start >= before.length && editor.value.slice(start - before.length, start) === before && editor.value.slice(end, end + after.length) === after) {
    return replaceEditorText(start - before.length, end + after.length, selected, start - before.length, end - before.length);
  }
  const content = selected || placeholder; const replacement = `${before}${content}${after}`;
  replaceEditorText(start, end, replacement, start + before.length, start + before.length + content.length);
}
function insertEditorLink() {
  const editor = $("#editor-text"); const start = editor.selectionStart, end = editor.selectionEnd;
  const label = editor.value.slice(start, end) || "link text";
  const url = window.prompt("Link URL", "https://"); if (url === null) return editor.focus();
  const title = window.prompt("Optional link title", ""); if (title === null) return editor.focus();
  const destination = url.trim() || "https://example.com";
  const titlePart = title.trim() ? ` \"${title.trim().replaceAll('"', '\\"')}\"` : "";
  const replacement = `[${label}](${destination}${titlePart})`;
  replaceEditorText(start, end, replacement, start + 1, start + 1 + label.length);
}
function toggleEditorLinePrefix(prefix, matcher) {
  const editor = $("#editor-text"); const start = editor.value.lastIndexOf("\n", Math.max(0, editor.selectionStart - 1)) + 1;
  const selectedEnd = editor.selectionEnd > editor.selectionStart ? editor.selectionEnd - 1 : editor.selectionEnd;
  const nextBreak = editor.value.indexOf("\n", selectedEnd); const end = nextBreak < 0 ? editor.value.length : nextBreak;
  const lines = editor.value.slice(start, end).split("\n"); const remove = lines.filter((line) => line.trim()).every((line) => matcher.test(line));
  const replacement = lines.map((line) => remove ? line.replace(matcher, "") : (line.trim() ? prefix + line : line)).join("\n");
  replaceEditorText(start, end, replacement, start, start + replacement.length);
}
function setEditorHeading(level) {
  const editor = $("#editor-text"); const start = editor.value.lastIndexOf("\n", Math.max(0, editor.selectionStart - 1)) + 1;
  const selectedEnd = editor.selectionEnd > editor.selectionStart ? editor.selectionEnd - 1 : editor.selectionEnd;
  const nextBreak = editor.value.indexOf("\n", selectedEnd); const end = nextBreak < 0 ? editor.value.length : nextBreak;
  const lines = editor.value.slice(start, end).split("\n"); const exact = new RegExp(`^\\s*#{${level}}\\s+`);
  const remove = lines.filter((line) => line.trim()).every((line) => exact.test(line));
  const replacement = lines.map((line) => {
    if (!line.trim()) return line;
    const content = line.replace(/^\s*#{1,6}\s+/, "");
    return remove ? content : `${"#".repeat(level)} ${content}`;
  }).join("\n");
  replaceEditorText(start, end, replacement, start, start + replacement.length);
}
function insertEditorHorizontalRule() {
  const editor = $("#editor-text"); const at = editor.selectionEnd;
  const before = editor.value.slice(0, at), after = editor.value.slice(at);
  const leading = !before ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trailing = !after ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const insertion = `${leading}---${trailing}`; replaceEditorText(at, at, insertion, at + insertion.length, at + insertion.length);
}
function formatEditorMarkdown() {
  const editor = $("#editor-text"); const start = editor.selectionStart, end = editor.selectionEnd;
  const formatted = prettifyMarkdown(editor.value); editor.setRangeText(formatted, 0, editor.value.length, "end");
  editor.setSelectionRange(Math.min(start, formatted.length), Math.min(end, formatted.length)); editor.focus(); editor.dispatchEvent(new Event("input", { bubbles: true })); toast("Markdown formatted");
}
function runMarkdownCommand(command) {
  if (!$("#editor-text")) return;
  if (command === "bold") return wrapEditorSelection("**", "**", "bold text");
  if (command === "italic") return wrapEditorSelection("*", "*", "italic text");
  if (command === "code") return wrapEditorSelection("`", "`", "code");
  if (command === "link") return insertEditorLink();
  if (command.startsWith("heading-")) return setEditorHeading(Number(command.slice(-1)));
  if (command === "quote") return toggleEditorLinePrefix("> ", /^\s*>\s+/);
  if (command === "bullet") return toggleEditorLinePrefix("- ", /^\s*[-+*]\s+/);
  if (command === "number") return toggleEditorLinePrefix("1. ", /^\s*\d+[.)]\s+/);
  if (command === "rule") return insertEditorHorizontalRule();
  if (command === "format") return formatEditorMarkdown();
}
function indentEditorSelection(outdent = false) {
  const editor = $("#editor-text"); const start = editor.value.lastIndexOf("\n", Math.max(0, editor.selectionStart - 1)) + 1;
  const selectedEnd = editor.selectionEnd > editor.selectionStart ? editor.selectionEnd - 1 : editor.selectionEnd;
  const nextBreak = editor.value.indexOf("\n", selectedEnd); const end = nextBreak < 0 ? editor.value.length : nextBreak;
  const replacement = editor.value.slice(start, end).split("\n").map((line) => outdent ? line.replace(/^( {1,2}|\t)/, "") : `  ${line}`).join("\n");
  replaceEditorText(start, end, replacement, start, start + replacement.length);
}
function handleEditorKeydown(event) {
  const modifier = event.ctrlKey || event.metaKey; const key = event.key.toLocaleLowerCase();
  const commands = { b: "bold", i: "italic", k: "link" };
  if (modifier && commands[key]) { event.preventDefault(); event.stopPropagation(); return runMarkdownCommand(commands[key]); }
  if (modifier && event.shiftKey && event.code === "Digit7") { event.preventDefault(); return runMarkdownCommand("number"); }
  if (modifier && event.shiftKey && event.code === "Digit8") { event.preventDefault(); return runMarkdownCommand("bullet"); }
  if (modifier && event.altKey && /^Digit[1-4]$/.test(event.code)) { event.preventDefault(); return runMarkdownCommand(`heading-${event.code.at(-1)}`); }
  if (modifier && event.shiftKey && key === "f") { event.preventDefault(); event.stopPropagation(); return runMarkdownCommand("format"); }
  if (modifier && key === "s") { event.preventDefault(); event.stopPropagation(); return savePage(); }
  if (event.key === "Tab") { event.preventDefault(); return indentEditorSelection(event.shiftKey); }
}
async function savePage() {
  let path = $("#editor-path").value.trim().replaceAll("\\", "/"); if (!/\.md$/i.test(path)) path += ".md";
  if (!path || path.startsWith("/") || path.includes("..")) return toast("Choose a safe path inside the content folder");
  if (!path.includes("/")) return toast("Pages must be placed inside an article folder");
  try { await api("/api/file", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, content: $("#editor-text").value }) }); await loadFiles(true); toast("Page saved"); const folder = path.slice(0, path.lastIndexOf("/")); navigate(`#article/${encodeURIComponent(folder)}`); }
  catch (error) { toast(error.message); }
}

function renderGM() {
  if (!state.user?.isAdmin) return navigate("#home");
  setChrome("GM screen"); $(".primary-nav [data-action=gm]").classList.add("active");
  view.innerHTML = `<div class="document-header"><div class="eyebrow">At-the-table utilities</div><h1>GM screen</h1><div class="document-meta">Initiative and notes are saved in this browser.</div></div><div class="gm-grid"><section class="tool-card"><div class="section-head"><h2>Initiative tracker</h2><button data-action="add-initiative">＋ Add combatant</button></div><div id="initiative-list"></div></section><div><section class="tool-card"><h2>Dice roller</h2><div class="dice-buttons">${[4,6,8,10,12,20,100].map((die) => `<button data-die="${die}">d${die}</button>`).join("")}</div><div class="dice-result" id="dice-result">—</div></section><section class="tool-card" style="margin-top:16px"><h2>Session scratchpad</h2><textarea class="quick-notes" id="quick-notes" placeholder="Names, HP, secrets, reminders…"></textarea></section></div></div>`;
  renderInitiative(); $("#quick-notes").value = localStorage.getItem(STORAGE.notes) || ""; $("#quick-notes").addEventListener("input", (e) => localStorage.setItem(STORAGE.notes, e.target.value));
}
function initiatives() { return JSON.parse(localStorage.getItem(STORAGE.initiative) || "[]"); }
function renderInitiative() { const list = initiatives().sort((a,b) => Number(b.score)-Number(a.score)); $("#initiative-list").innerHTML = list.map((item, index) => `<div class="initiative-row"><input data-init-name="${index}" value="${esc(item.name)}" placeholder="Combatant"><input type="number" data-init-score="${index}" value="${esc(item.score)}" placeholder="Init"><button data-init-remove="${index}">×</button></div>`).join("") || `<div class="empty-state" style="padding:35px 10px">Add combatants when the encounter begins.</div>`; }
function updateInitiative() { const list = initiatives(); $$("[data-init-name]").forEach((input) => list[input.dataset.initName].name = input.value); $$("[data-init-score]").forEach((input) => list[input.dataset.initScore].score = input.value); localStorage.setItem(STORAGE.initiative, JSON.stringify(list)); }

async function renderAdmin() {
  setChrome("File visibility"); $(".primary-nav [data-action=admin]").classList.add("active");
  if (!state.user.isAdmin) return navigate("#home");
  try {
    state.adminRoles = await api("/api/admin/roles"); const viewerRoles = state.adminRoles.filter((role) => !role.isAdmin);
    if (!viewerRoles.length) { view.innerHTML = `<div class="empty-state">Create a viewer role in User management before assigning file visibility.</div>`; return; }
    if (!viewerRoles.some((role) => role.id === state.adminRoleId)) state.adminRoleId = (viewerRoles.find((role) => role.systemKey === "player") || viewerRoles[0]).id;
    await loadAdminFiles(); renderAdminManager();
  } catch (error) { view.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
}
async function loadAdminFiles() {
  const [files, folders] = await Promise.all([api(`/api/admin/files?roleId=${state.adminRoleId}`), api("/api/folders?refresh=1")]);
  state.adminFiles = files; state.folderPaths = folders;
  const available = new Set(files.map((file) => file.path));
  state.adminSelection = new Set([...state.adminSelection].filter((file) => available.has(file)));
  if (state.adminAnchor && !available.has(state.adminAnchor)) state.adminAnchor = null;
}
function selectedAdminPaths() { return [...state.adminSelection]; }
function adminPreviewUrl(file) { return `/api/admin/preview?path=${encodeURIComponent(file.path)}`; }
function adminFileRows() { return $$("[data-admin-file-row]").map((row) => row.dataset.adminFileRow); }
function syncAdminSelection() {
  $$("[data-admin-file-row]").forEach((row) => { const selected = state.adminSelection.has(row.dataset.adminFileRow); row.classList.toggle("is-selected", selected); row.setAttribute("aria-selected", selected); });
  $$("[data-admin-folder-selection]").forEach((button) => {
    const folder = button.dataset.adminFolderSelection; const paths = filesInFolder(state.adminFiles, folder); const status = folderSelectionStatus(state.adminFiles, folder, state.adminSelection);
    const selecting = status !== "all"; button.classList.toggle("is-partial", status === "some"); button.classList.toggle("is-all", status === "all"); button.disabled = !paths.length;
    button.setAttribute("aria-pressed", status === "some" ? "mixed" : status === "all" ? "true" : "false"); button.setAttribute("aria-label", `${selecting ? "Select" : "Deselect"} all ${paths.length} files in ${folder}`); button.title = `${selecting ? "Select" : "Deselect"} this folder and all subfolders`;
    button.querySelector("span").textContent = status === "all" ? "✓" : status === "some" ? "−" : "";
    button.querySelector("b").textContent = `${selecting ? "Select" : "Deselect"} all`;
  });
  const count = $("#admin-selection-count"); if (count) count.textContent = `${state.adminSelection.size} selected`;
}
function toggleAdminFolderSelection(folder) {
  const paths = filesInFolder(state.adminFiles, folder); const allSelected = paths.length && paths.every((path) => state.adminSelection.has(path));
  paths.forEach((path) => allSelected ? state.adminSelection.delete(path) : state.adminSelection.add(path));
  state.adminAnchor = null; syncAdminSelection();
}
function selectAdminRow(path, event) {
  const order = adminFileRows(); const additive = event.ctrlKey || event.metaKey;
  if (event.shiftKey && state.adminAnchor && order.includes(state.adminAnchor)) {
    if (!additive) state.adminSelection.clear();
    const from = order.indexOf(state.adminAnchor), to = order.indexOf(path);
    order.slice(Math.min(from, to), Math.max(from, to) + 1).forEach((item) => state.adminSelection.add(item));
  } else if (additive) {
    state.adminSelection.has(path) ? state.adminSelection.delete(path) : state.adminSelection.add(path);
    state.adminAnchor = path;
  } else {
    state.adminSelection = new Set([path]); state.adminAnchor = path;
  }
  syncAdminSelection();
}
function renderAdminManager() {
  const nodes = new Map();
  for (const folder of state.folderPaths) nodes.set(folder, { path: folder, name: folder.split("/").at(-1), folders: [], files: [] });
  for (const file of state.adminFiles) {
    if (!nodes.has(file.folder)) nodes.set(file.folder, { path: file.folder, name: file.folder.split("/").at(-1), folders: [], files: [] });
    nodes.get(file.folder).files.push(file);
  }
  const roots = [];
  for (const node of nodes.values()) {
    const parts = node.path.split("/"); const parent = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
    if (parent && nodes.has(parent)) nodes.get(parent).folders.push(node); else roots.push(node);
  }
  const sortByName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  for (const node of nodes.values()) { node.folders.sort(sortByName); node.files.sort(sortByName); }
  roots.sort(sortByName);
  const fileRow = (file, depth) => {
    const selected = state.adminSelection.has(file.path);
    const preview = file.type === "image" ? `<img class="admin-preview" loading="lazy" src="${esc(adminPreviewUrl(file))}" alt="">` : `<span class="admin-file-icon">${icons[file.type] || "·"}</span>`;
    return `<div class="admin-file ${file.visible ? "" : "is-hidden"} ${selected ? "is-selected" : ""}" data-admin-file-row="${esc(file.path)}" style="--depth:${depth}" tabindex="0" role="option" aria-selected="${selected}">${preview}<span class="admin-file-name"><strong>${esc(file.name)}</strong><small>${esc(file.path)}</small></span><label class="visibility-toggle"><input type="checkbox" data-admin-visible="${esc(file.path)}" ${file.visible ? "checked" : ""}><span>Visible</span></label></div>`;
  };
  const branch = (node, depth = 0) => {
    const collapsed = state.adminCollapsed.has(node.path); const hasChildren = node.folders.length || node.files.length; const descendantPaths = filesInFolder(state.adminFiles, node.path); const selectionStatus = folderSelectionStatus(state.adminFiles, node.path, state.adminSelection); const selectAction = selectionStatus === "all" ? "Deselect" : "Select";
    return `<section class="admin-folder-node"><div class="admin-folder-row" style="--depth:${depth}"><button class="admin-folder-main" data-admin-folder="${esc(node.path)}" aria-expanded="${!collapsed}"><span class="admin-folder-chevron">${hasChildren ? (collapsed ? "▶" : "▼") : "·"}</span><span class="admin-folder-icon">▱</span><strong>${esc(node.name)}</strong><small>${descendantPaths.length} file${descendantPaths.length === 1 ? "" : "s"}</small></button><button class="admin-folder-select ${selectionStatus === "all" ? "is-all" : selectionStatus === "some" ? "is-partial" : ""}" data-admin-folder-selection="${esc(node.path)}" aria-pressed="${selectionStatus === "some" ? "mixed" : selectionStatus === "all"}" aria-label="${selectAction} all ${descendantPaths.length} files in ${esc(node.path)}" title="${selectAction} this folder and all subfolders" ${descendantPaths.length ? "" : "disabled"}><span>${selectionStatus === "all" ? "✓" : selectionStatus === "some" ? "−" : ""}</span><b>${selectAction} all</b></button></div><div class="admin-children ${collapsed ? "is-collapsed" : ""}">${node.folders.map((child) => branch(child, depth + 1)).join("")}${node.files.map((file) => fileRow(file, depth + 1)).join("")}</div></section>`;
  };
  const visible = state.adminFiles.filter((file) => file.visible).length;
  const role = state.adminRoles.find((item) => item.id === state.adminRoleId);
  const roleOptions = state.adminRoles.filter((item) => !item.isAdmin).map((item) => `<option value="${item.id}" ${item.id === state.adminRoleId ? "selected" : ""}>${esc(item.name)}</option>`).join("");
  const tree = roots.map((node) => branch(node)).join("");
  view.innerHTML = `<div class="document-header"><div class="eyebrow">Administration</div><h1>File visibility</h1><div class="document-meta">${visible} of ${state.adminFiles.length} files visible to ${esc(role.name)} · Users receive the combined access of all assigned roles</div></div><div class="visibility-role-picker"><label>Editing visibility for <select id="visibility-role">${roleOptions}</select></label></div><div class="admin-toolbar"><button class="button ghost" data-action="admin-expand-all">Expand all</button><button class="button ghost" data-action="admin-collapse-all">Collapse all</button><span id="admin-selection-count">${state.adminSelection.size} selected</span><button class="button ghost" data-action="admin-hide-selected">Hide selected</button><button class="button" data-action="admin-show-selected">Show selected</button></div><div class="admin-tree" role="listbox" aria-multiselectable="true">${tree || `<div class="empty-state">No article folders were found.</div>`}</div>`;
}
async function updateAdminVisibility(paths, visible) {
  if (!paths.length) return toast("Select at least one file");
  try {
    await api("/api/admin/visibility", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ roleId: state.adminRoleId, paths, visible }) });
    await Promise.all([loadAdminFiles(), loadFiles(true)]); state.adminSelection.clear(); state.adminAnchor = null; renderAdminManager(); toast(`${paths.length} file${paths.length === 1 ? "" : "s"} ${visible ? "shown" : "hidden"}`);
  } catch (error) { toast(error.message); }
}
function roleChoices(selected = [], prefix = "role") {
  const chosen = new Set(selected.map((role) => typeof role === "object" ? role.id : role));
  return state.adminRoles.map((role) => `<label class="role-choice"><input type="checkbox" data-role-choice="${prefix}" value="${role.id}" ${chosen.has(role.id) ? "checked" : ""}><span>${esc(role.name)}</span><small>${role.isAdmin ? "Admin" : "Viewer"}</small></label>`).join("");
}
function selectedRoleIds(form, prefix) { return $$(`[data-role-choice="${prefix}"]:checked`, form).map((input) => Number(input.value)); }
async function refreshSessionUser() { showApp(await api("/api/auth/me")); }
async function renderUserManagement() {
  if (!state.user.isAdmin) return navigate("#home");
  setChrome("User management"); $(".primary-nav [data-action=users]").classList.add("active");
  try {
    const [users, roles] = await Promise.all([api("/api/admin/users"), api("/api/admin/roles")]); state.adminRoles = roles;
    const roleRows = roles.map((role) => `<form class="management-row role-management-row" data-role-form="${role.id}"><input class="management-name" name="name" value="${esc(role.name)}" aria-label="Role name"><select name="isAdmin" ${role.isSystem ? "disabled" : ""}><option value="false" ${role.isAdmin ? "" : "selected"}>Viewer</option><option value="true" ${role.isAdmin ? "selected" : ""}>Admin</option></select><span class="management-meta">${role.userCount} user${role.userCount === 1 ? "" : "s"} · ${role.fileCount} files${role.isSystem ? " · Default" : ""}</span><button class="button ghost" type="submit">Save</button>${role.isSystem ? "" : `<button class="danger-button" type="button" data-delete-role="${role.id}">Delete</button>`}</form>`).join("");
    const userRows = users.map((user) => `<form class="management-user" data-user-form="${user.id}"><div class="management-user-head"><input class="management-name" name="username" value="${esc(user.username)}" aria-label="Username"><span>Joined ${formatDate(user.joinedAt)} · Last login ${user.lastLogin ? formatDate(user.lastLogin) : "Never"}</span></div><div class="role-choice-grid">${roleChoices(user.roles, `user-${user.id}`)}</div><div class="management-user-actions"><input name="password" type="password" minlength="8" placeholder="New password (optional)" autocomplete="new-password"><button class="button" type="submit">Save user</button>${user.id === state.user.id ? "" : `<button class="danger-button" type="button" data-delete-user="${user.id}">Delete</button>`}</div></form>`).join("");
    view.innerHTML = `<div class="document-header"><div class="eyebrow">Administration</div><h1>User management</h1><div class="document-meta">Create accounts, combine roles, and control whether each role has viewer or administrator permissions.</div></div><section class="management-section"><div class="section-head"><h2>Roles</h2></div><form class="management-create" id="create-role-form"><input name="name" placeholder="New role name" required minlength="2" maxlength="40"><select name="isAdmin"><option value="false">Viewer role</option><option value="true">Admin role</option></select><button class="button" type="submit">Add role</button></form><div class="management-list">${roleRows}</div></section><section class="management-section"><div class="section-head"><h2>Users</h2></div><form class="management-create-user" id="create-user-form"><div><input name="username" placeholder="Username" required minlength="3" maxlength="32"><input name="password" type="password" placeholder="Temporary password" required minlength="8" maxlength="256" autocomplete="new-password"></div><div class="role-choice-grid">${roleChoices([], "new-user")}</div><button class="button" type="submit">Create user</button></form><div class="management-users">${userRows}</div></section>`;
  } catch (error) { view.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
}
async function saveRoleForm(form) {
  const id = Number(form.dataset.roleForm); const current = state.adminRoles.find((role) => role.id === id);
  const input = { name: form.elements.name.value, isAdmin: current.isSystem ? current.isAdmin : form.elements.isAdmin.value === "true" };
  try { await api(`/api/admin/roles/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }); await refreshSessionUser(); toast("Role updated"); renderUserManagement(); } catch (error) { toast(error.message); }
}
async function createRoleForm(form) {
  const input = { name: form.elements.name.value, isAdmin: form.elements.isAdmin.value === "true" };
  try { await api("/api/admin/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }); toast("Role created"); renderUserManagement(); } catch (error) { toast(error.message); }
}
async function saveUserForm(form) {
  const id = Number(form.dataset.userForm); const input = { username: form.elements.username.value, password: form.elements.password.value, roleIds: selectedRoleIds(form, `user-${id}`) };
  try { await api(`/api/admin/users/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }); await refreshSessionUser(); toast("User updated"); renderUserManagement(); } catch (error) { toast(error.message); }
}
async function createUserForm(form) {
  const input = { username: form.elements.username.value, password: form.elements.password.value, roleIds: selectedRoleIds(form, "new-user") };
  try { await api("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }); toast("User created"); renderUserManagement(); } catch (error) { toast(error.message); }
}
async function deleteManaged(kind, id) {
  if (!window.confirm(`Delete this ${kind}? This cannot be undone.`)) return;
  try { await api(`/api/admin/${kind}s/${id}`, { method: "DELETE" }); toast(`${kind === "user" ? "User" : "Role"} deleted`); renderUserManagement(); } catch (error) { toast(error.message); }
}
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
  if (!state.user) return showAuth();
  const hash = location.hash || "#home"; const [routeName, encoded] = hash.slice(1).split("/");
  if (!state.user.isAdmin && ["gm", "admin", "users", "new"].includes(routeName)) return navigate("#home");
  if (["home", "article", "folder", "file", "all", "pinned"].includes(routeName)) await loadFiles(true);
  if (routeName === "article" || routeName === "folder") return openArticle(decodeURIComponent(encoded || ""));
  if (routeName === "file") { const file = state.files.find((item) => item.path === decodeURIComponent(encoded || "")); return file ? openArticle(file.folder) : renderNotFound(); }
  if (routeName === "all") return renderList("All articles", state.articles);
  if (routeName === "pinned") { const pins = pinned(); return renderList("Pinned articles", state.articles.filter((article) => pins.includes(article.path)), "A short shelf of references you want close at hand."); }
  if (routeName === "gm") return renderGM();
  if (routeName === "admin") return renderAdmin();
  if (routeName === "users") return renderUserManagement();
  if (routeName === "new") return renderEditor();
  renderHome();
}
async function loadFiles(refresh = false) { const suffix = refresh ? "?refresh=1" : ""; state.files = await api(`/api/files${suffix}`); state.folderPaths = await api(`/api/folders${suffix}`); buildArticles(); buildTree(); }

document.addEventListener("click", async (event) => {
  const authMode = event.target.closest("[data-auth-mode]"); if (authMode) return setAuthMode(authMode.dataset.authMode);
  const markdownTool = event.target.closest("[data-md-command]");
  if (markdownTool) return runMarkdownCommand(markdownTool.dataset.mdCommand);
  const editSource = event.target.closest("[data-edit-file]");
  if (editSource) {
    const file = state.files.find((item) => item.path === editSource.dataset.editFile); if (!file) return toast("That file is no longer available");
    try { const data = await api(`/api/file?path=${encodeURIComponent(file.path)}`); state.currentFile = file; state.content = data.content; return renderEditor(file); }
    catch (error) { return toast(error.message); }
  }
  const articleNode = event.target.closest("[data-article]"); if (articleNode) { closeSearch(); return navigate(`#article/${encodeURIComponent(articleNode.dataset.article)}`); }
  const imageNode = event.target.closest("[data-image]"); if (imageNode) return openImage(imageNode.dataset.image, imageNode.dataset.imageTitle);
  const treeToggle = event.target.closest(".tree-toggle"); if (treeToggle) return treeToggle.closest(".tree-folder").classList.toggle("closed");
  if (event.target.closest(".visibility-toggle")) return;
  const adminFolderSelection = event.target.closest("[data-admin-folder-selection]");
  if (adminFolderSelection) return toggleAdminFolderSelection(adminFolderSelection.dataset.adminFolderSelection);
  const adminFolder = event.target.closest("[data-admin-folder]");
  if (adminFolder) { const path = adminFolder.dataset.adminFolder; state.adminCollapsed.has(path) ? state.adminCollapsed.delete(path) : state.adminCollapsed.add(path); return renderAdminManager(); }
  const adminRow = event.target.closest("[data-admin-file-row]");
  if (adminRow) return selectAdminRow(adminRow.dataset.adminFileRow, event);
  const deleteRole = event.target.closest("[data-delete-role]"); if (deleteRole) return deleteManaged("role", deleteRole.dataset.deleteRole);
  const deleteUser = event.target.closest("[data-delete-user]"); if (deleteUser) return deleteManaged("user", deleteUser.dataset.deleteUser);
  const die = event.target.closest("[data-die]"); if (die) { const sides = Number(die.dataset.die); $("#dice-result").textContent = Math.floor(Math.random() * sides) + 1; return; }
  const remove = event.target.closest("[data-init-remove]"); if (remove) { const list = initiatives(); list.splice(Number(remove.dataset.initRemove), 1); localStorage.setItem(STORAGE.initiative, JSON.stringify(list)); return renderInitiative(); }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (["home","all","pinned","gm","admin","users","new"].includes(action)) return navigate(`#${action}`);
  if (action === "search") return openSearch();
  if (action === "menu") return $("#sidebar").classList.toggle("open");
  if (action === "collapse") return $$(".tree-folder").forEach((node) => node.classList.add("closed"));
  if (action === "random") { const article = state.articles[Math.floor(Math.random() * state.articles.length)]; if (article) navigate(`#article/${encodeURIComponent(article.path)}`); }
  if (action === "edit" && state.currentFile) return renderEditor(state.currentFile);
  if (action === "cancel-edit") return state.current ? navigate(`#article/${encodeURIComponent(state.current.path)}`) : navigate("#home");
  if (action === "save") return savePage();
  if (action === "pin" && state.current) { const pins = pinned(), at = pins.indexOf(state.current.path); at >= 0 ? pins.splice(at,1) : pins.push(state.current.path); setPinned(pins); event.target.classList.toggle("is-pinned"); toast(at >= 0 ? "Removed from pinned" : "Pinned for quick access"); }
  if (action === "add-initiative") { const list = initiatives(); list.push({ name:"", score:"" }); localStorage.setItem(STORAGE.initiative, JSON.stringify(list)); renderInitiative(); $$("[data-init-name]").at(-1)?.focus(); }
  if (action === "admin-expand-all") { state.adminCollapsed.clear(); return renderAdminManager(); }
  if (action === "admin-collapse-all") { state.folderPaths.forEach((folder) => state.adminCollapsed.add(folder)); return renderAdminManager(); }
  if (action === "admin-show-selected") return updateAdminVisibility(selectedAdminPaths(), true);
  if (action === "admin-hide-selected") return updateAdminVisibility(selectedAdminPaths(), false);
  if (action === "logout") { try { await api("/api/auth/logout", { method: "POST" }); } finally { location.hash = ""; showAuth(); } }
});
document.addEventListener("change", (event) => {
  if (event.target.matches("[data-init-name],[data-init-score]")) { updateInitiative(); renderInitiative(); }
  if (event.target.matches("[data-admin-visible]")) updateAdminVisibility([event.target.dataset.adminVisible], event.target.checked);
  if (event.target.matches("#visibility-role")) { state.adminRoleId = Number(event.target.value); state.adminSelection.clear(); state.adminAnchor = null; loadAdminFiles().then(renderAdminManager).catch((error) => toast(error.message)); }
});
document.addEventListener("submit", (event) => {
  if (event.target.matches("#auth-form")) { event.preventDefault(); submitAuth(); }
  if (event.target.matches("#create-role-form")) { event.preventDefault(); createRoleForm(event.target); }
  if (event.target.matches("[data-role-form]")) { event.preventDefault(); saveRoleForm(event.target); }
  if (event.target.matches("#create-user-form")) { event.preventDefault(); createUserForm(event.target); }
  if (event.target.matches("[data-user-form]")) { event.preventDefault(); saveUserForm(event.target); }
});
$("#search-modal").addEventListener("click", (event) => { if (event.target === $("#search-modal")) closeSearch(); });
$("#search-input").addEventListener("input", (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(event.target.value), 180); });
document.addEventListener("keydown", (event) => {
  if (state.user && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); }
  const adminOpen = Boolean($(".admin-tree")); const typing = event.target.matches("input,textarea,[contenteditable=true]");
  if (adminOpen && !typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); state.adminSelection = new Set(adminFileRows()); state.adminAnchor = adminFileRows().at(-1) || null; syncAdminSelection(); }
  if (event.key === "Escape") { if (!$("#search-modal").classList.contains("hidden")) closeSearch(); else if (adminOpen) { state.adminSelection.clear(); state.adminAnchor = null; syncAdminSelection(); } }
  if (!$("#search-modal").classList.contains("hidden") && ["ArrowDown","ArrowUp","Enter"].includes(event.key)) { event.preventDefault(); if (event.key === "ArrowDown") state.selectedResult = Math.min(state.searchResults.length - 1, state.selectedResult + 1); if (event.key === "ArrowUp") state.selectedResult = Math.max(0, state.selectedResult - 1); if (event.key === "Enter" && state.searchResults[state.selectedResult]) { closeSearch(); navigate(`#article/${encodeURIComponent(state.searchResults[state.selectedResult].path)}`); } else renderSearchResults(); }
});
window.addEventListener("hashchange", route);

async function boot() {
  try {
    const response = await fetch("/api/auth/me"); if (!response.ok) return showAuth();
    showApp(await response.json()); await loadFiles(); await route();
  } catch (error) { showAuth(error.message); }
}
await boot();
