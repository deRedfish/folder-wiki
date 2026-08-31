# Folder Wiki

A straightforward, self-fed local wiki. You organize ordinary files inside `content/`; Folder Wiki turns that directory tree into a searchable website without importing content into a database.

The central rule is simple:

> One folder is one article. Files directly inside it are that article's sources. Subfolders are child articles.

Folder Wiki works especially well as a personal encyclopedia, research archive, campaign reference, worldbuilding library, or GM assistant.

## Features

- Folder-as-article navigation with parent/child links and breadcrumbs
- Markdown, plain text, and JSON rendering
- Embedded PDFs with separate full-page viewing
- Responsive image galleries with a full-size lightbox
- ZIP and other supported archive downloads
- Full-text search across paths, Markdown, text, JSON, and optionally PDFs
- Admin-only Markdown creation, editing, and live preview in the browser
- Account signup, secure sessions, cumulative roles, and per-role content access
- Recently updated, pinned, filtered, and random article navigation
- Local GM screen with initiative tracker, dice roller, and scratchpad
- Persistent world maps with adjustable image-backed hex grids, fog of war, discoveries, notes, and movable tokens
- Responsive layout for desktop and mobile browsers
- Built-in SQLite persistence with no external database service or runtime package dependencies

## Requirements

- [Node.js 24.15 or newer](https://nodejs.org/)
- Any modern browser
- Optional: `pdftotext` on your `PATH` to make PDF contents searchable

The wiki itself works without `pdftotext`; PDFs simply will not contribute text to search results.

## Install and start

Folder Wiki has two supported full-application deployment paths. Both retain accounts, role visibility, editing, search, and the SQLite database.

| Method | Best for | Persistent data |
| --- | --- | --- |
| Node.js with npm | A machine where you already manage Node processes | `content/` and `.folder-wiki/` |
| Docker Compose | Portable installs and container hosts | The configured content and data mounts |

### Run directly with Node.js

From PowerShell:

```powershell
git clone https://github.com/deRedfish/folder-wiki.git
cd folder-wiki
npm install
npm start
```

Open <http://127.0.0.1:4173>.

The first account created from the signup screen receives the default **GM** administrator role. Later signups receive the default **Player** viewer role.

For a persistent server, use `npm ci --omit=dev`, set `HOST=0.0.0.0`, and keep the Node process running with your operating system's service manager. `CONTENT_ROOT` and `RUNTIME_ROOT` let you place wiki files and application data outside the cloned repository. See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete environment-variable and reverse-proxy guide.

### Run with Docker

Docker Desktop or Docker Engine with the Compose plugin is required:

```powershell
docker compose up --build
```

Open <http://127.0.0.1:4173>. Compose bind-mounts `content/` for wiki files and stores the SQLite database in its hidden `content/.folder-wiki/` directory. Back up or move that one directory to preserve the complete wiki. The image listens on port `4173`, exposes `/api/health`, and includes Poppler's `pdftotext` for PDF search indexing.

Copy `.env.example` to `.env` to change the published port or persistent host directory without editing Compose:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for updates, backups, health checks, and deployment behind HTTPS.

## Feed the wiki

All user material belongs under `content/`. The directory and everything inside it are Git-ignored; the server creates it automatically when needed.

```text
content/
├── People/
│   ├── overview.md
│   ├── portrait.jpg
│   └── Allies/
│       ├── notes.md
│       └── reference.pdf
├── Places/
│   ├── city.md
│   └── city-map.png
└── Rules/
    └── quick-reference.pdf
```

This produces:

- **People**, containing `overview.md` and `portrait.jpg`
- **Allies**, a child article linked from People
- **Places**, containing its Markdown and image gallery
- **Rules**, containing an embedded PDF

Only files directly inside a folder appear in that folder's article. A subfolder's files stay in the child article. Folder names become article titles; hyphens and underscores are displayed as spaces. Files placed directly in `content/` are ignored because every article must have its own folder.

Administrators can add content in two ways:

1. Copy, move, or edit files inside `content/` with your normal tools.
2. Use **Add entry** in the web interface to create a Markdown file. Paths entered there are relative to `content/`, for example `People/Allies/New Ally.md`.

Filesystem changes are refreshed before an article opens and normally within two seconds for search and lists. Your entire `content/` directory is ignored by Git, so publishing updates to the wiki engine does not accidentally publish your private library.

## Supported files

| Type | Extensions | Article behavior |
| --- | --- | --- |
| Markdown/text | `.md`, `.markdown`, `.txt` | Rendered together as article body sources |
| Structured text | `.json` | Rendered and included in search |
| Documents | `.pdf` | Embedded viewer; searchable when `pdftotext` is installed |
| Images | `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.avif`, `.svg` | Responsive gallery and full-size viewer |
| Archives | `.zip` | Download link with file size |

Unsupported files are ignored rather than exposed by the server.

## Markdown support

The built-in renderer supports headings, paragraphs, emphasis, links, images, blockquotes, ordered and unordered lists, fenced code blocks, horizontal rules, and tables. `##`, `###`, and `####` headings populate the article's table of contents. Section links retain the article route, so they scroll within the current article and can be refreshed or bookmarked without returning to the overview.

Article images appear as a prominent visual-reference gallery before long-form text, with the first image shown uncropped as the featured reference and every image available in the full-size lightbox. Child articles and Markdown headings have separate navigation groups in a sticky side rail. On narrow screens, the navigation moves above the article instead of disappearing.

Every `.md` or `.markdown` source has an **Edit source** button in its article, including articles that contain several Markdown files. An article with exactly one editable source also shows the top-level **Edit page** shortcut. Saving writes directly to that Markdown file inside `content/`.

The editor includes high-contrast, color-only Markdown syntax highlighting and a live rendered preview. The source pane does not imitate rendered bold, italic, underline, or strikethrough; colors distinguish the syntax while the adjacent preview shows the final typography. The source and preview panes scroll independently within the available browser height, so the formatting toolbar remains in reach while working through long files.

Selection-aware controls cover bold, italic, H1–H4 headings, links with optional titles, inline code, block quotes, lists, and horizontal rules. The link control asks for its URL and optional title while retaining selected text as the visible label. Select text and click another formatting control to wrap or toggle its Markdown markers. Editor shortcuts include `Ctrl+B`/`Cmd+B` for bold, `Ctrl+I`/`Cmd+I` for italic, `Ctrl+K`/`Cmd+K` for a titled link, `Ctrl+Alt+1` through `Ctrl+Alt+4` for heading levels, `Ctrl+Shift+7`/`Cmd+Shift+7` for a numbered list, `Ctrl+Shift+8`/`Cmd+Shift+8` for a bulleted list, `Ctrl+S`/`Cmd+S` to save, and `Tab`/`Shift+Tab` to indent or outdent selected lines.

Use **Format** or `Ctrl+Shift+F`/`Cmd+Shift+F` to normalize Markdown spacing, list markers, headings, quotes, horizontal rules, redundant blank lines, and trailing whitespace. Meaningful two-space line breaks are retained, and fenced code contents are not reformatted.

## Search

Press `Ctrl+K` anywhere outside the Markdown editor. Search matches all entered terms against article titles, paths, and supported text sources. Inside the editor, `Ctrl+K` formats the selection as a link.

PDF text extraction is intentionally optional. If the `pdftotext` command is available, PDFs are indexed quietly in the background after startup. A common Windows source is Poppler; MiKTeX installations may also provide the command.

## File visibility administration

Every request requires a logged-in account. Passwords are hashed with Node's built-in `scrypt`; login sessions use random, expiring, HttpOnly, SameSite cookies. The user database is stored locally at `.folder-wiki/wiki.db`.

The default roles are **GM** and **Player**. GM is an administrator role and Player is a viewer role. The first signup receives GM; public signups after that receive Player. Default roles may be renamed but cannot be deleted or changed between administrator and viewer permissions.

Administrators can open **User management** to see usernames, join dates, last-login dates, and assigned roles. They can create, edit, and delete accounts; reset passwords; combine several roles on one account; and add, rename, change, or remove custom roles. Safeguards prevent removing the final administrator or deleting a role while it is someone's only role.

Role access is cumulative. A user assigned Player and Gnome sees every file granted to either Player or Gnome. Administrator roles bypass file visibility entirely. Every article shows administrators a yellow access notice listing the viewer roles that can reach it, or stating that no viewer role has access.

Open **File visibility** as an administrator and choose the viewer role whose access you want to edit.

The manager mirrors the real `content/` hierarchy as a collapsible file tree. Role-visible files are strongly marked in green; hidden files stay neutral; and blue remains reserved for the temporary editing selection. Folder rows summarize all descendants in green, amber, or gray for all, some, or no visible files, so role coverage remains readable when the tree is collapsed. Image files retain thumbnail previews.

Use **Expand all folders** or **Collapse all folders** for the complete tree. Folders with nested folders have a compact tree control in the gutter outside the tree; it expands or collapses that complete branch. The disclosure arrow changes only that folder's expanded state. Clicking the rest of a folder row selects or deselects every descendant file, including descendants hidden inside collapsed branches. Leaf folders omit the redundant tree control.

For bulk changes, click anywhere on a file row to select it. Use `Ctrl`-click (or `Cmd`-click on macOS) to add or remove individual rows, and `Shift`-click to select a range from the previous selection. `Ctrl+A`/`Cmd+A` selects all files currently revealed in expanded folders, and `Escape` clears the selection. **Show selected** and **Hide selected** apply the visibility change to the selected rows.

Files not granted to any of a viewer's roles are removed from article pages, folder navigation, file counts, search results, text APIs, and direct media URLs. Their files remain untouched on disk. Newly discovered files are granted to the default Player role; newly created custom viewer roles start with no file grants.

Users, roles, sessions, and role visibility grants are stored in `.folder-wiki/wiki.db`. The runtime directory is Git-ignored and should not be committed. Existing `.folder-wiki/visibility.json` choices are respected when files are first migrated into the role database.

## World map editor

Every logged-in user can open **World map**. Players see only the map currently made active by an administrator. Administrators can create any number of maps, switch between them, and choose which single map is active for players.

Open **Map and grid settings** to choose any image already stored in the wiki or upload a new image to a chosen folder under `content/`. Sliders adjust the map width, map height, hex size, and horizontal or vertical grid alignment with an immediate preview; releasing a slider persists the change. The grid automatically adds or removes rows and columns to cover the available map. Before an adjustment removes out-of-bounds features, zone assignments, notes, or tokens, the wiki identifies the affected content and asks for confirmation. Fog-only cells need no confirmation.

Select a hex to open its inspector. Administrators can:

- paint fog, reveal terrain, place features, paint zones, or clear zones across several hexes by clicking and dragging;
- create named and described zones with translucent colors, then reuse them across any number of hexes;
- add multiple named, illustrated, and described features to a hex and choose which one supplies its map icon and fantasy-styled label;
- save a hex's features and notes as a reusable template, then apply that template from the hex inspector without replacing its fog or zone;
- add compact labelled, colored tokens and drag them between hexes;
- independently decide whether each feature, zone, and token is visible to players;
- edit or remove any shared note.

Fog, zones, features, notes, and tokens are independent layers and can coexist on the same hex. All users can add notes to revealed hexes and edit or remove their own notes. Hexes with visible notes receive a distinct outline. In the GM view, fog darkens the background and any painted zone beneath it. Player API responses remove every feature, zone assignment, note, and token inside fog before the data reaches the browser; players see a uniform dark gray hex instead. Items marked GM-only are also removed server-side even on revealed hexes. A visible zone remains inspectable to players wherever at least one of its painted hexes is revealed.

Both GM and player views can zoom while retaining the currently viewed area, then drag the map to pan around it. The player view otherwise contains only the active map's title and map; selecting a revealed hex opens its visible zone, feature descriptions, notes, and tokens without exposing GM controls or map settings.

Map configuration, hex state, zones, features, reusable templates, notes, tokens, visibility settings, and the active-map choice are stored in `.folder-wiki/wiki.db`. Existing single-feature maps and templates are migrated automatically. In Compose deployments, `.folder-wiki/` is inside the configured content directory, so one backup preserves both uploaded files and database state.

## Local browser data

Pinned articles, initiative entries, and GM scratch notes are stored in your browser's local storage. Login sessions are stored in the local SQLite database and represented in the browser by an HttpOnly cookie. None of these values are written into `content/` or synchronized between browsers.

## Configuration

Direct npm deployments support these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Network interface on which the Node server listens |
| `PORT` | `4173` | HTTP port |
| `CONTENT_ROOT` | `./content` | Folder containing all wiki articles and source files |
| `RUNTIME_ROOT` | `./.folder-wiki` | Folder containing the SQLite database and runtime state |

The defaults bind the server only to your computer:

```powershell
npm start
```

Use another port:

```powershell
$env:PORT=8080
npm start
```

Deliberately allow other devices on your local network:

```powershell
$env:HOST="0.0.0.0"
npm start
```

For internet deployment, keep Folder Wiki behind an HTTPS reverse proxy and do not expose its plain HTTP port publicly. Accounts and role authorization protect campaign information from other wiki users, but TLS, firewall policy, rate limiting, and host security belong at the deployment layer.

## Backups

Wiki content remains ordinary files. With Docker Compose, back up the configured content directory, including its hidden `.folder-wiki/wiki.db`; that database contains accounts, roles, sessions, maps, and access grants. With a direct npm deployment, back up both `CONTENT_ROOT` and `RUNTIME_ROOT`. To version your own content, remove the `content/` rule from `.gitignore` or keep the directory in a separate private repository. Never publish the runtime database.

## Development

```powershell
npm test
```

The test suite performs syntax checks, path-containment checks, title parsing, authentication and role-model tests, clean-start HTTP smoke tests, and end-to-end viewer/admin authorization checks. GitHub Actions runs it on Windows for every push and pull request.

## License

[MIT](LICENSE)
