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

All user material belongs under `content/`. The repository intentionally starts with that directory empty.

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

Only files directly inside a folder appear in that folder's article. A subfolder's files stay in the child article. Folder names become article titles; hyphens and underscores are displayed as spaces.

You can add content in two ways:

1. Copy, move, or edit files inside `content/` with your normal tools.
2. Use **Add entry** in the web interface to create a Markdown file. Paths entered there are relative to `content/`, for example `People/Allies/New Ally.md`.

Filesystem changes are picked up automatically, normally within two seconds. Your content is ignored by Git by default, so publishing updates to the wiki engine does not accidentally publish your private library.

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

An article with exactly one `.md` or `.markdown` source can be edited from its **Edit page** button. When several Markdown sources share an article, they are displayed as separately labeled sources and should be edited on disk.

## Search

Press `Ctrl+K` anywhere in the app. Search matches all entered terms against article titles, paths, and supported text sources.

PDF text extraction is intentionally optional. If the `pdftotext` command is available, PDFs are indexed quietly in the background after startup. A common Windows source is Poppler; MiKTeX installations may also provide the command.

## Local browser data

Pinned articles, initiative entries, and GM scratch notes are stored in your browser's local storage. They are not written into `content/` and are not synchronized between browsers.

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

There is no proprietary data format. Back up the `content/` directory with your preferred filesystem, sync, or version-control tool. To version your own content in this repository, change the `content/**` rules in `.gitignore`, or keep the content directory in a separate private repository.

## Development

```powershell
npm test
```

The test suite performs syntax checks, path-containment checks, title parsing, and a clean-start HTTP smoke test. GitHub Actions runs it on Windows for every push and pull request.

## License

[MIT](LICENSE)
