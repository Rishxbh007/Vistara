# Vistara — how to run it (Windows)

A self-hosted video streaming platform: Node.js + Express backend, vanilla
HTML/CSS/JS frontend, SQLite (via `sql.js`) for storage. No build step, no
framework to compile — which also makes it easy to explain how it works.

## Requirements

- **Node.js 18 or newer** (developed on Node 22). Check with `node -v`.
- That's all. The database is a file; there is no separate database server to install.

## Run it

Open **Command Prompt** or **PowerShell** in the project folder
(`C:\qwerty\video streaming platform`) and run:

```bat
cd "C:\qwerty\video streaming platform"

:: 1. Install dependencies (first time only)
npm install

:: 2. Start the server (this also creates the database on first run)
npm start
```

Then open your browser at:

```
http://localhost:3000
```

To stop the server, press **Ctrl + C** in the terminal.

There is no separate "frontend" and "backend" to start — the Express server
serves both the API and the web pages on the same port (3000).

## The database

Nothing to set up. On first start, `db/schema.js` creates
`data\streaming.db` automatically and makes the `users` and `videos` tables.
Delete that file if you ever want a clean slate — it will be recreated on the
next start.

## Configuration — the `.env` file

All settings live in `.env` in the project root. Edit it with any text editor,
then restart the server (`Ctrl + C`, then `npm start`) for changes to apply.

```
JWT_SECRET=vistara_jwt_secret_2024_btech   # signing key for login tokens
PORT=3000                                  # the port the site runs on
ADS_ENABLED=true                           # master ad switch (see below)
AD_SKIP_SECONDS=5                          # seconds before "Skip Ad" unlocks
```

### The master Ads ON / OFF switch

This is the single setting that controls advertisements — no code changes needed.

| `ADS_ENABLED` | What happens |
|---------------|--------------|
| `true`  | A video-selected → **ad plays** → countdown → **Skip Ad** → main video starts. |
| `false` | **No ad, no countdown, no Skip button.** The main video starts immediately. |

Set it, save `.env`, restart. That's it.

## Adding your own ads

Ads are just video files in the **`ads\`** folder — the app discovers them
automatically, no code and no restart required (it re-scans every couple of
seconds).

1. Drop an `.mp4` into `C:\qwerty\video streaming platform\ads\`.
2. Reload a watch page. Your ad is now in the rotation.

With multiple files in `ads\`, the app picks one at random for each view and
avoids repeating the last one. Full details — supported formats, how to weight
or disable individual ads via `ads\ads.config.json`, and a known-good ffmpeg
conversion command — are in **`ads\README.md`**.

Three demo ads ship in that folder so you can see the flow immediately.

## Quick tour of what to test in the browser

1. **Home** (`/`) — hero + latest uploads grid. The hero preview is your newest video.
2. **Register** (`/register.html`) — make an account.
3. **Upload** (`/upload.html`) — drag in an MP4, add a title, upload.
4. **Watch** — with `ADS_ENABLED=true` you'll see: **ad plays → "Skip in 5s" counts down → Skip Ad → your video starts.** The player has play/pause, a draggable seek bar, volume, playback speed and fullscreen.
5. Set `ADS_ENABLED=false`, restart, open a video again — it starts instantly, no ad.

## Project layout

```
video streaming platform\
├─ server.js            Express app: serves API + web pages on port 3000
├─ .env                 all configuration (ads switch, port, secret)
├─ ads\                 <-- put your ad videos here (+ ads.config.json, README.md)
├─ data\streaming.db    the SQLite database (auto-created)
├─ db\schema.js         tables + query helpers
├─ lib\
│  ├─ config.js         reads .env into one config object
│  └─ adLibrary.js      discovers/selects ads from the ads\ folder
├─ middleware\auth.js   JWT auth
├─ routes\              auth.js · videos.js · ads.js
├─ uploads\             uploaded videos + thumbnails
└─ public\              the frontend (HTML, css\style.css, js\)
```
