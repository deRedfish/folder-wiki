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
- Markdown creation, editing, and live preview in the browser
- Recently updated, pinned, filtered, and random article navigation
- Local GM screen with initiative tracker, dice roller, and scratchpad
- Responsive layout for desktop and mobile browsers
- No database, build step, cloud service, or runtime dependencies

## Requirements

- [Node.js 20 or newer](https://nodejs.org/)
- Any modern browser
- Optional: `pdftotext` on your `PATH` to make PDF contents searchable

The wiki itself works without `pdftotext`; PDFs simply will not contribute text to search results.

## Install and start

From PowerShell:

```powershell
git clone https://github.com/deRedfish/folder-wiki.git
cd folder-wiki
npm install
npm start
```

Open <http://127.0.0.1:4173>.

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

You can add content in two ways:

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

The built-in renderer supports headings, paragraphs, emphasis, links, images, blockquotes, ordered and unordered lists, fenced code blocks, horizontal rules, and tables. `##`, `###`, and `####` headings populate the article's table of contents.

Every `.md` or `.markdown` source has an **Edit source** button in its article, including articles that contain several Markdown files. An article with exactly one editable source also shows the top-level **Edit page** shortcut. Saving writes directly to that Markdown file inside `content/`.

The editor includes high-contrast, color-only Markdown syntax highlighting and a live rendered preview. The source pane does not imitate rendered bold, italic, underline, or strikethrough; colors distinguish the syntax while the adjacent preview shows the final typography.

Selection-aware controls cover bold, italic, H1–H4 headings, links with optional titles, inline code, block quotes, lists, and horizontal rules. The link control asks for its URL and optional title while retaining selected text as the visible label. Select text and click another formatting control to wrap or toggle its Markdown markers. Editor shortcuts include `Ctrl+B`/`Cmd+B` for bold, `Ctrl+I`/`Cmd+I` for italic, `Ctrl+K`/`Cmd+K` for a titled link, `Ctrl+Alt+1` through `Ctrl+Alt+4` for heading levels, `Ctrl+Shift+7`/`Cmd+Shift+7` for a numbered list, `Ctrl+Shift+8`/`Cmd+Shift+8` for a bulleted list, `Ctrl+S`/`Cmd+S` to save, and `Tab`/`Shift+Tab` to indent or outdent selected lines.

Use **Format** or `Ctrl+Shift+F`/`Cmd+Shift+F` to normalize Markdown spacing, list markers, headings, quotes, horizontal rules, redundant blank lines, and trailing whitespace. Meaningful two-space line breaks are retained, and fenced code contents are not reformatted.

## Search

Press `Ctrl+K` anywhere outside the Markdown editor. Search matches all entered terms against article titles, paths, and supported text sources. Inside the editor, `Ctrl+K` formats the selection as a link.

PDF text extraction is intentionally optional. If the `pdftotext` command is available, PDFs are indexed quietly in the background after startup. A common Windows source is Poppler; MiKTeX installations may also provide the command.

## File visibility administration

Open **File visibility** in the sidebar and enter the local admin password. The default is:

```text
gmrules
```

Change `ADMIN_PASSWORD` in [`config.mjs`](config.mjs) and restart the server to use another password. This is deliberately a simple local gate, not a secure user or authentication system.

The manager mirrors the real `content/` hierarchy as a collapsible file tree. Expand or collapse folders to navigate deeply nested articles, and use the thumbnail beside an image file as a quick visual reference. Each file has its own **Visible** checkbox.

For bulk changes, click anywhere on a file row to select it. Use `Ctrl`-click (or `Cmd`-click on macOS) to add or remove individual rows, and `Shift`-click to select a range from the previous selection. `Ctrl+A`/`Cmd+A` selects all files currently revealed in expanded folders, and `Escape` clears the selection. **Show selected** and **Hide selected** apply the visibility change to the selected rows.

Hidden files are removed from article pages, file counts, search results, text APIs, and direct media URLs. Their files remain untouched on disk, and they can be restored from the manager at any time. New files are visible by default.

Visibility choices are stored in `.folder-wiki/visibility.json`. That runtime directory is Git-ignored and should not be committed.

## Local browser data


Pinned articles, initiative entries, and GM scratch notes are stored in your browser's local storage. The entered admin password is retained only in the browser tab's session storage. None of these values are written into `content/` or synchronized between browsers.

## Configuration

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

Only expose Folder Wiki on a trusted network. The browser editor can create and modify Markdown files inside `content/`; the server is not designed for public internet hosting or untrusted users.

## Backups

There is no proprietary data format. Back up the `content/` directory with your preferred filesystem, sync, or version-control tool. To version your own content, remove the `content/` rule from `.gitignore` or keep the directory in a separate private repository.

## Development

```powershell
npm test
```

The test suite performs syntax checks, path-containment checks, title parsing, clean-start HTTP smoke tests, and end-to-end admin visibility checks. GitHub Actions runs it on Windows for every push and pull request.

## License

[MIT](LICENSE)
