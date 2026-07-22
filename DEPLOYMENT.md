# Deploying Folder Wiki

Folder Wiki is a stateful Node.js web application. Every supported deployment runs the complete server so login, editing, search, user management, and role-based file visibility continue to work.

Whichever deployment method you choose, persist and back up both:

- the content directory, containing the source files for the wiki;
- the runtime directory, containing `wiki.db` with accounts, roles, sessions, and visibility grants.

## Option 1: Docker Compose

Install Docker Desktop on Windows or Docker Engine with the Compose plugin on Linux. Then run:

```powershell
git clone https://github.com/deRedfish/folder-wiki.git
cd folder-wiki
docker compose up --build -d
```

Open `http://127.0.0.1:4173`. The first account created becomes the GM administrator.

Compose uses `content/` and `.folder-wiki/` beside the repository by default. To choose other persistent locations or a different host port:

```powershell
Copy-Item .env.example .env
notepad .env
docker compose up --build -d
```

The available Compose settings are:

| Setting | Default | Purpose |
| --- | --- | --- |
| `FOLDER_WIKI_PORT` | `4173` | Port exposed on the host |
| `FOLDER_WIKI_CONTENT` | `./content` | Host directory mounted at `/app/content` |
| `FOLDER_WIKI_DATA` | `./.folder-wiki` | Host directory mounted at `/app/data` |

Use absolute paths when the persistent directories should live away from the checkout. Create the directories before starting the container and ensure Docker can read and write them.

Useful commands:

```powershell
docker compose logs -f
docker compose ps
docker compose restart
docker compose down
```

`docker compose down` removes the container and network but leaves the bind-mounted host files intact. Do not add `--volumes` when using volumes you intend to retain.

### Update a Docker deployment

```powershell
git pull --ff-only
docker compose up --build -d
```

Compose replaces the application container while retaining the mounted content and database directories.

### Use the image without Compose

The image expects two writable persistent mounts and listens on container port 4173:

```powershell
docker build -t folder-wiki .
docker run -d --name folder-wiki --restart unless-stopped -p 4173:4173 --mount type=bind,source="C:\wiki\content",target=/app/content --mount type=bind,source="C:\wiki\data",target=/app/data folder-wiki
```

Adjust the two host paths for your operating system. Container platforms should map equivalent persistent storage to `/app/content` and `/app/data`. The image provides `GET /api/health` as its health check and shuts down cleanly when the platform sends `SIGTERM`.

## Option 2: Node.js and npm

Install Node.js 24.15 or newer, then:

```powershell
git clone https://github.com/deRedfish/folder-wiki.git
cd folder-wiki
npm ci --omit=dev
$env:NODE_ENV="production"
$env:HOST="0.0.0.0"
$env:PORT="4173"
$env:CONTENT_ROOT="C:\wiki\content"
$env:RUNTIME_ROOT="C:\wiki\data"
npm start
```

The two directories are created automatically when they do not exist. On a permanent host, run `npm start` through the operating system's service manager or another process supervisor so it starts after reboot and restarts after failure. Pass the same environment variables to that service.

To update:

```powershell
git pull --ff-only
npm ci --omit=dev
```

Restart the managed process after the install completes.

## HTTPS and public hosts

Folder Wiki serves HTTP. For access over the internet, place it behind a reverse proxy or hosting platform that terminates HTTPS. Forward requests to port 4173, preserve ordinary request headers and cookies, and keep the application port private to the host network.

The application health endpoint does not require authentication:

```text
GET /api/health
```

A healthy instance returns `{"ok":true}`.

## Backups and migration

Stop the application or container before taking a filesystem-level backup so the SQLite database and content snapshot are consistent. Copy both persistent directories to the backup destination.

To migrate, install Folder Wiki on the new host, restore the two directories, and start the application. Paths inside the content directory remain portable; the database stores content paths relative to that root.

Never bake personal content or the runtime database into a public container image. The supplied `.dockerignore` excludes both directories from image builds.
