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
- Responsive layout for desktop and mobile browsers
- Built-in SQLite persistence with no external database service or runtime package dependencies

## Requirements

- [Node.js 24.15 or newer](https://nodejs.org/)
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

The first account created from the signup screen receives the default **GM** administrator role. Later signups receive the default **Player** viewer role.

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

The built-in renderer supports headings, paragraphs, emphasis, links, images, blockquotes, ordered and unordered lists, fenced code blocks, horizontal rules, and tables. `##`, `###`, and `####` headings populate the article's table of contents.

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

Role access is cumulative. A user assigned Player and Gnome sees every file granted to either Player or Gnome. Administrator roles bypass file visibility entirely and show a warning on articles containing sources hidden from every viewer role.

Open **File visibility** as an administrator and choose the viewer role whose access you want to edit.

The manager mirrors the real `content/` hierarchy as a collapsible file tree. Role-visible files are strongly marked in green; hidden files stay neutral; and blue remains reserved for the temporary editing selection. Folder rows summarize all descendants in green, amber, or gray for all, some, or no visible files, so role coverage remains readable when the tree is collapsed. Image files retain thumbnail previews.

Use **Expand all folders** or **Collapse all folders** for the complete tree. Each folder's **Expand tree** or **Collapse tree** control applies to that folder and every nested folder, while clicking the folder name still opens or closes only that one level. Every folder also has a tri-state **Select all** control: it selects or deselects every file in that folder and all of its subfolders, including descendants hidden inside collapsed branches.

For bulk changes, click anywhere on a file row to select it. Use `Ctrl`-click (or `Cmd`-click on macOS) to add or remove individual rows, and `Shift`-click to select a range from the previous selection. `Ctrl+A`/`Cmd+A` selects all files currently revealed in expanded folders, and `Escape` clears the selection. **Show selected** and **Hide selected** apply the visibility change to the selected rows.

Files not granted to any of a viewer's roles are removed from article pages, folder navigation, file counts, search results, text APIs, and direct media URLs. Their files remain untouched on disk. Newly discovered files are granted to the default Player role; newly created custom viewer roles start with no file grants.

Users, roles, sessions, and role visibility grants are stored in `.folder-wiki/wiki.db`. The runtime directory is Git-ignored and should not be committed. Existing `.folder-wiki/visibility.json` choices are respected when files are first migrated into the role database.

## Local browser data


Pinned articles, initiative entries, and GM scratch notes are stored in your browser's local storage. Login sessions are stored in the local SQLite database and represented in the browser by an HttpOnly cookie. None of these values are written into `content/` or synchronized between browsers.

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

Only expose Folder Wiki on a trusted network. Accounts and role authorization protect campaign information from other wiki users, but the server is designed for local or trusted-network use rather than hardened public internet hosting.

## Backups

Wiki content remains ordinary files. Back up both `content/` and `.folder-wiki/wiki.db`; the latter contains accounts, roles, sessions, and access grants. To version your own content, remove the `content/` rule from `.gitignore` or keep the directory in a separate private repository. Never publish the runtime database.

## Development

```powershell
npm test
```

The test suite performs syntax checks, path-containment checks, title parsing, authentication and role-model tests, clean-start HTTP smoke tests, and end-to-end viewer/admin authorization checks. GitHub Actions runs it on Windows for every push and pull request.

## License

[MIT](LICENSE)
