# The Box — User Guide

**The Box** is a retro-inspired local TV platform with a BBC Ceefax-style interface. The server builds a daily schedule from channel video files, and playback simulates tuning into a live broadcast.

This guide covers installation, configuration, channel setup, scheduling, the on-screen interface, remote control, developer tools, and troubleshooting.

---

## Table of contents

1. [Requirements](#requirements)
2. [Installation](#installation)
3. [Quick start](#quick-start)
4. [Project layout](#project-layout)
5. [Server startup configuration (](#server-startup-configuration-configjson)`config.json`[)](#server-startup-configuration-configjson) — [SQLite catalogue](#sqlite-catalogue) and [Admin → Settings](#admin-tools)
6. [Adding and configuring channels](#adding-and-configuring-channels)
7. [How scheduling works](#how-scheduling-works)
8. [The interface (Ceefax pages)](#the-interface-ceefax-pages)
9. [Client-side settings (](#client-side-settings-apijs)`api.js`[)](#client-side-settings-apijs)
10. [Media remote control](#media-remote-control)
11. [Page number on-screen display (OSD)](#page-number-on-screen-display-osd)
12. [Design / developer guide overlay](#design--developer-guide-overlay)
13. [Remote test page (Page 400)](#remote-test-page-page-400)
14. [Watching video and full screen](#watching-video-and-full-screen)
15. [Raspberry Pi and kiosk mode](#raspberry-pi-and-kiosk-mode)
16. [Video format recommendations](#video-format-recommendations)
17. [Checking MKV files with ffprobe](#checking-mkv-files-with-ffprobe)
18. [API reference](#api-reference)
19. [Troubleshooting](#troubleshooting)

---



## Requirements

- **Node.js 18** or newer
- **pnpm** for installing dependencies
- **Video files** in supported formats (see [Video format recommendations](#video-format-recommendations))
- **ffprobe** for reading video durations — bundled automatically when you run `pnpm install` (`@ffprobe-installer/ffprobe`)

Optional:

- System **FFmpeg** if you prefer a local install over the bundled ffprobe
- A **USB / wireless media remote** that presents itself as a keyboard and media keys (recommended for TV use)

---



## Installation

If you don't have pnpm yet, enable it with **Corepack** (included with Node.js 18+):

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Verify with `pnpm --version`.

Clone or copy the project, then install dependencies:

```bash
pnpm install
```

Dependencies are minimal: Express for the server and a bundled ffprobe for metadata.

---



## Quick start

```bash
pnpm start
```

Open [http://localhost:8080](http://localhost:8080) in a browser.

For development with automatic restarts:

```bash
pnpm dev
```

---



## Project layout

```text
TheBox/
├── config.json              # Server startup: databasePath only (shipped default)
├── config.local.json        # Optional databasePath override (gitignored)
├── userguide.md             # This guide
├── channels/                # Optional local media samples (paths are configured in Admin → Channels)
├── database/                # SQLite catalogue (gitignored *.db; default thebox.db)
├── public/                  # Web interface (The Box UI)
│   ├── index.html           # Page 100 — channel list
│   ├── guide.html           # Page 200 — TV guide
│   ├── watch.html           # Page 300 — live player
│   ├── remote-test.html     # Page 400 — remote troubleshooting
│   ├── css/thebox.css       # Stylesheet
│   ├── fonts/vt323/         # Self-hosted VT323 font
│   └── js/                  # Client scripts
└── server/                  # Express app, scanner, scheduler, streaming
```

---



## Server startup configuration (`config.json`)

The shipped `config.json` tells the server **where the SQLite catalogue lives**. All other settings (port, schedule, ads, transcode, import folder, and so on) are stored in the database table `app_settings` and edited in **[Admin → Settings](http://localhost:8080/admin/settings.html)**.

```json
{
  "databasePath": "./database/thebox.db"
}
```

On first start, if the database file does not exist, the server creates it, applies schema migrations, and seeds default settings. You can change everything else from the admin UI without editing JSON.

**Environment overrides:** `HOST` and `PORT` can override the listen address from settings for this process (useful in Docker). Changing host/port in Settings requires a **server restart** unless env vars override bind.

### Local overrides (`config.local.json`)

Optional, gitignored file beside `config.json`. It may override `databasePath` **only** (for example, to point at a dev catalogue on your machine):

```json
{
  "databasePath": "/path/to/my/thebox.db"
}
```

Do not put schedule, ads, or transcode settings here — use **Admin → Settings** so values stay in SQLite.

### SQLite catalogue

The Box is **database-first**: channels, media catalogue, cached daily schedules, application settings, and (optionally) transcode cache metadata live in the file at `databasePath` (default `database/thebox.db` under the project’s `database/` folder; `*.db` files are gitignored).


| Topic                 | Behaviour                                                        |
| --------------------- | ---------------------------------------------------------------- |
| Channel config        | Rows in SQLite; [Admin → Channels](#channels-admin) or admin API |
| Programmes at runtime | Metadata in RAM; full paths resolved from the DB on playback     |
| Schedules             | Cached in the DB; rebuilt on rescan or admin action              |


**First run with an empty database**

1. Start the server and open **[Admin → Channels](#channels-admin)**.
2. Create each channel and set **programme source paths** to directories on disk, then **Rescan** (or use **Rescan all channels**).
3. With **Rescan on startup** off, warm restarts load from SQLite in milliseconds.

**Ongoing operation**

- **Admin Rescan** reconciles disk paths stored in the DB.
- **Scan interval** triggers periodic reconcile (not a blind walk of sample folders).
- `GET /api/health` reports `databasePath`, `schedulesCached`, and `settingsSource`.
- `GET /api/channels/:id` returns counts by default; add `?videos=1` or `?limit=50&offset=0` for paginated programme summaries.

Configure port, timezone, ads, transcode, extensions, and library flags in **[Admin → Settings](#admin-tools)**. Restart the server after changing host/port (unless `HOST`/`PORT` env is set).

### Cached transcode (optional)

When `transcode.enabled` is `true`, The Box **ffprobe**s programme files whose extension is listed in `transcode.probeExtensions` (default `.mkv` only). Other extensions such as `.mp4` are not probed and are always served from source.

For each probed file, if the first video stream’s `codec_name` is listed in `nativeVideoCodecs` and the first audio stream (if any) is listed in `nativeAudioCodecs`, the file is **served from the original path** (no transcode). Otherwise it is transcoded to cached H.264/AAC MP4 when it appears on the schedule. The **daily schedule is unchanged** — if a programme **needs** transcode and the cache is not ready when its slot airs, the watch page shows **“PROGRAMME NOT AVAILABLE AT THIS TIME”** with the scheduled title and times.

Only **programmes that appear on the generated schedule** are queued (not your entire library). The queue prioritises **upcoming** slots so a long encode does not block titles that still have time to finish before they air. Slots that are **already on air** without a cache are skipped until a later repeat or the next day.

**Requirements:** system **FFmpeg** on your `PATH`, or set the `FFMPEG_PATH` environment variable. Set `transcode.cachePath` to a folder with enough free space (plan roughly 0.5–1× the size of cached sources over time).

Enable and configure transcode in **Admin → Settings** (cache path, native codecs, probe extensions, schedule ahead days).

The admin **Schedule inspector** shows per-programme **Transcode** status and an **FFprobe** column (`v:… · a:…`) for probed files, including those that did not require transcode. The summary line lists your configured native codec lists. Use **Rescan** or restart after changing config or adding files. To check a file yourself before it airs, see [Checking MKV files with ffprobe](#checking-mkv-files-with-ffprobe).

---



## Adding and configuring channels

All channel configuration lives in the **SQLite catalogue**. Use **[Admin → Channels](#channels-admin)** (or the admin API) to create channels, point at media on disk, and rebuild schedules. The repo’s `channels/` tree is only optional sample media — the server does not read it unless you add those paths in the admin editor.

### 1. Create a channel

Click **New channel**, choose a unique **channel ID** (used in URLs and schedules), and fill in display metadata (name, Ceefax **page number**, **colour**).

Each channel is either **video** (default) or **audio**. Supported file extensions come from **Admin → Settings** (**Video extensions** / **Audio extensions**).

### 2. Programme source paths

In **Programme source paths**, enter **one absolute or project-relative directory per line**. The rescan step walks each directory (and subfolders) for playable files matching the channel’s media type.

When you list **multiple** roots, each root gets a basename **slug** prefix on every file path so names from different folders cannot collide (`comedy/Season 1/ep.mkv`, `drama/Season 1/ep.mkv`). If two lines share the same folder basename, the second uses `-2`, `-3`, and so on.

Paths must exist when you save; after adding or moving files on disk, run **Rescan media** on the channel or **Rescan all channels**.

### Channel fields (admin)


| Field                          | Description                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display name                   | Name shown in the UI                                                                                                                                          |
| Media type                     | Video or audio; the channel scans only one type                                                                                                               |
| Programme source paths         | One or more directories (one per line)                                                                                                                        |
| Ident directory                | Optional folder of ident clips (video or audio to match the channel)                                                                                          |
| Test card path                 | Optional `testcard.mp4` / `testcard.mkv` file for off-air standby on that channel                                                                             |
| Artwork path                   | Optional image for audio channels on Page 300                                                                                                                 |
| Page number                    | Ceefax-style page number in the channel list                                                                                                                  |
| Colour                         | Accent in the channel list: cyan, green, yellow, red, blue, magenta                                                                                           |
| Max content duration (minutes) | Optional cap; longer files are indexed but excluded from the daily schedule                                                                                   |
| Ident interval                 | `0` = no idents (default). `1` = after every programme. `2` = after every two programmes, etc. Requires an ident directory with playable files                |
| Ads enabled                    | Opt in for commercial breaks when ads are enabled globally and the ad library is valid                                                                        |
| Scan subfolders                | When enabled, recurse into subdirectories under each programme source path                                                                                    |
| Schedule start / end           | Per-channel broadcast window (`HH:MM`, 24-hour). Leave blank to use **Default start time** and **Default end time** from **[Admin → Settings](#admin-tools)** |




### Channel idents

Set **Ident directory** to a folder containing ident files. When **Ident interval** is greater than zero and at least one playable ident exists, the scheduler inserts idents after every N programmes. Several idents are shuffled for the day (stable until the next day). Idents play during the broadcast but do not appear in the TV guide or Today list. Use video idents on video channels and audio idents on audio channels.

### Test cards (standby signal)

When a channel has **no programme on air** (outside broadcast hours, empty schedule, or no playable library), the watch page can show a **test card** video instead of an error.

**Per channel:** set **Test card path** to a `testcard.mp4` or `testcard.mkv` file (not inside a programme source tree). These filenames are never scheduled as programmes.

**Global fallback:** set **Test pattern → Path (file or folder)** in **[Admin → Settings](#admin-tools)**. If a channel has its own test card path, that file wins; otherwise the global card applies.

On the watch page the clip **loops** until a programme is scheduled again. Status shows **TEST SIGNAL**. Audio channels display the test card on the video stage while off air.

### Commercial ads (video channels)

Ads live in a **single global folder** (**Ads path** in Settings; must be an absolute path). Enable ads globally, then turn on **Ads enabled** for each video channel in the admin editor.

- Ad files use the same extensions as video channels; subfolders under the ads path are scanned automatically.
- Break timing is calculated when the daily schedule is built (including mid-programme breaks). Programme rows in the TV guide and Today list show **broadcast** start/end times (including time taken by ads inside that programme). Individual ads are not listed.
- If ads are enabled but the folder is missing, empty, invalid, or contains fewer files than configured maximums, the server logs a warning on startup/rescan and **no ads** are scheduled.
- Rescanning channels rescans ads and rebuilds commercial breaks for the current day.
- When an ident is also due before the next programme, **ads play first, then the ident**. Idents never follow mid-programme ad breaks.
- During playback, the Now Showing overlay keeps the current or next programme title (not ad filenames). Between-programme ads show the **next** programme’s times.



### Audio channels

For **Media type** audio:

- The scanner uses **Audio extensions** from Settings
- Scheduling, idents, and live-join playback work the same as video channels
- Page 300 shows static artwork in the picture area while audio plays
- Set **Artwork path** or rely on common filenames in a programme folder (`artwork.png`, `cover.png`, etc.)
- Full screen expands the artwork area rather than a video element



### 3. Rescan and schedules

After changing paths or media on disk, **Rescan** so SQLite matches the filesystem, then **Rebuild schedule** if needed. You can also rescan without restarting:

```bash
curl -X POST http://localhost:8080/api/admin/rescan
```

---



## How scheduling works

The Box simulates **live TV** rather than on-demand playback:

1. **Daily shuffle** — Each channel’s videos are shuffled using a seed based on `channelId + date`, so the lineup is random but **stable for the whole day**.
2. **Broadcast window** — Programmes are scheduled between `startTime` and `endTime` (per channel or global defaults).
3. **Back-to-back playback** — Programmes play sequentially from the shuffled list, looping as needed to fill the window.
4. **End time overrun** — No new programme starts after `endTime`, but the **last programme before end time plays to completion**, even if it runs past `endTime`.
5. **Join mid-programme** — When you open a channel, playback starts at the correct offset for the current time, as if you tuned in live.



### Why channels can look different

- Channels with **more or longer** videos repeat less often within the same window.
- Channels with **shorter** libraries repeat the same programmes more frequently.
- Each channel can have its **own start and end times**, so schedules align differently across the day.



### Duration detection

Video durations are read using **ffprobe** (bundled with the project). If durations cannot be read, videos are excluded from schedules and the watch page will show an error. Install FFmpeg system-wide if the bundled ffprobe fails on your platform.

---



## The interface (Ceefax pages)

The UI is styled like teletext (BBC Ceefax) using the **VT323** font (self-hosted under `public/fonts/` — no internet connection required).


| Page    | URL                     | Purpose                                                                    |
| ------- | ----------------------- | -------------------------------------------------------------------------- |
| **100** | `/`                     | Channel list                                                               |
| **200** | `/guide.html`           | TV guide (all channels)                                                    |
| **300** | `/watch.html?channel=…` | Live channel view (header shows that channel’s Ceefax page, e.g. PAGE 101) |
| **400** | `/remote-test.html`     | Remote control troubleshooting                                             |


Admin and debugging tools live under `/admin/` (modern UI, not Ceefax pages). See [Admin tools](#admin-tools).

### Layout

- Fixed **header** and **footer** with scrollable content between them
- Maximum content width of **960px**, centred on screen
- **10px** vertical margin (`--page-margin-y` in `thebox.css`) at top and bottom of the viewport
- Channel list and watch schedule panels scroll independently where needed



### Navigation

Use footer links, click channel rows, or use the [media remote](#media-remote-control) to move between pages.

---



## Client-side settings (`api.js`)

On load, the Ceefax UI fetches `GET /api/settings/public` and stores the result on `TheBox.publicSettings`:


| Field         | Source (Admin → Settings) | Used for                                                                |
| ------------- | ------------------------- | ----------------------------------------------------------------------- |
| `title`       | UI title                  | Browser tab title (`TheBox.applyDocumentTitle`)                         |
| `defaultPage` | Default Ceefax page       | **Home** remote key and opening `/` when not Page 100 (must be 100–400) |
| `timezone`    | Schedule timezone         | `TheBox.formatClock` / status bar times (`formatLocalDateTime`)         |


Developer-only toggles remain in `public/js/api.js` (not in the database):


| Setting                | Default | Description                                    |
| ---------------------- | ------- | ---------------------------------------------- |
| `devGuideEnabled`      | `false` | Show the 1920×1080 design guide overlay        |
| `remoteEnabled`        | `true`  | Enable global remote / keyboard handling       |
| `remotePageOsdEnabled` | `true`  | Show page number entry in the top-right corner |


Change broadcast title, default page, or timezone in **Admin → Settings** and reload the TV UI. Edit the dev toggles in `api.js` / `app.js` and reload after changing those.

---



## Media remote control

The Box supports remotes that appear as a **USB keyboard** and/or **media keys** (typical for wireless dongle remotes on Raspberry Pi).

Remote handling is in `public/js/remote.js`, loaded on every page.

### Disable remote control

Set in `api.js`:

```javascript
remoteEnabled: false,
```



### Ceefax page navigation (numpad)

Dial a **three-digit page number** on the remote:


| Page    | Destination                       |
| ------- | --------------------------------- |
| **100** | Channel list (home)               |
| **200** | TV guide                          |
| **300** | Last watched channel (watch page) |
| **400** | Remote test page                  |


- Up to **4 seconds** between digits (`pageBufferTimeoutMs` in `remote.js`)
- Navigation waits **2 seconds** after the third digit (`pageNavigateDelayMs`) before changing page, simulating retro teletext delay
- Only complete three-digit entries navigate; partial entries are cleared



### Global remote keys


| Key                | Action                                                     |
| ------------------ | ---------------------------------------------------------- |
| **Home**           | Go to Page 100 (channel list)                              |
| **Back**           | Previous page, or home if no history                       |
| **↑ / ↓**          | Navigate lists (channel list, guide, schedule)             |
| **Enter**          | Select highlighted item / toggle full screen on watch page |
| **Pg+ / Pg−**      | Move five rows in lists                                    |
| **←** (watch page) | Go back                                                    |
| **→** (watch page) | Go to TV guide (Page 200)                                  |




### Watch page media keys


| Key              | Action                                          |
| ---------------- | ----------------------------------------------- |
| **Play / Pause** | Play or pause video                             |
| **Stop**         | Pause and return to start                       |
| **Rewind**       | Skip back 30 seconds                            |
| **Fast forward** | Skip forward 30 seconds                         |
| **Enter**        | Toggle full screen                              |
| **Back**         | Exit full screen (if active), otherwise go back |




### Colour buttons (optional)

Mapped in `remote.js` but may not work on all remotes until key codes are identified on the [Remote test page](#remote-test-page-page-400):


| Button | Page |
| ------ | ---- |
| Red    | 100  |
| Green  | 200  |
| Yellow | 300  |
| Blue   | 400  |


Default key mappings include `F1`–`F4` and `ColorF0Red` etc. Adjust `TheBox.remote.keys` in `remote.js` after checking your remote on Page 400.

### Volume keys

Volume up, down, and mute are handled by the **operating system**, not The Box. They are logged on the remote test page for troubleshooting only.

### Customising key mappings

Edit `public/js/remote.js`:

```javascript
keys: {
  enter: ['Enter'],
  playPause: ['MediaPlayPause', ' '],
  fullscreen: ['MediaFullscreen', 'F11', 'KeyF'],
  // Add your remote's key codes here
},
```

Other timing settings in the same file:

```javascript
pageBufferTimeoutMs: 4000,   // Max gap between numpad digits
pageNavigateDelayMs: 2000,     // Delay after 3rd digit before navigation
```

---



## Page number on-screen display (OSD)

When `remotePageOsdEnabled` is `true`, entering a page number shows a large **green** readout in the **top-right** of the screen:

- Partial entry shows placeholders: `1— —`, `10—`
- Complete entry shows: `100`
- Displayed for **2 seconds** before navigation (retro delay)

Toggle in `api.js`:

```javascript
remotePageOsdEnabled: false,
```

Style via CSS class `.remote-page-osd` in `public/css/thebox.css`.

---



## Design / developer guide overlay

A semi-transparent **1920×1080** red-bordered overlay helps align the UI during development.

Enable in `public/js/api.js` or `public/js/app.js`:

```javascript
TheBox.devGuideEnabled = true;
```

CSS variables in `thebox.css`:

```css
--dev-guide-width: 1920px;
--dev-guide-height: 1080px;
```

The overlay sits **behind** the main UI (`z-index: 0`).

---



## Admin tools

Operator tools are served from `public/admin/` with their own layout and styles (`admin/css/admin.css`, `admin/js/admin-common.js`). They are **not** Ceefax pages and are **not** reachable via the TV remote page numbers (100–400).


| URL                              | Purpose                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| `/admin/`                        | Overview and links to each tool                                        |
| `/admin/settings.html`           | Global server, schedule, ads, transcode, and library settings (SQLite) |
| `/admin/channels.html`           | Create/edit/delete channels in the SQLite catalogue                    |
| `/admin/schedule-inspector.html` | Full playback timeline for one channel                                 |
| `/admin/transcode-cache.html`    | Look up a cached `{hash}.mp4` → programme in the database              |


Open [http://localhost:8080/admin/](http://localhost:8080/admin/) after starting the server. Use **Back to TV UI** in the sidebar to return to Page 100.

### Settings (admin)

**URL:** [http://localhost:8080/admin/settings.html](http://localhost:8080/admin/settings.html)

Edit `app_settings` in the database: host/port (restart required), timezone, scan interval, extensions, ads, transcode, global test card, and library flags such as **Rescan on startup**.

### Channels (admin)

**URL:** [http://localhost:8080/admin/channels.html](http://localhost:8080/admin/channels.html)

Manage the SQLite catalogue:


| Action                          | What it does                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **New channel**                 | Creates a row with programme **source paths** (one directory per line), optional ident/test card/artwork paths, schedule window, Ceefax **colour** (dropdown), ads/ident flags |
| **Edit / Delete**               | Update config or remove a channel (cascades media and schedule rows in the DB)                                                                                                 |
| **Rescan all channels**         | Same as `POST /api/admin/rescan` — reconcile all programme and ident paths                                                                                                     |
| **Rescan media** (on edit form) | Reconcile one channel’s files on disk                                                                                                                                          |
| **Rebuild schedule**            | Rebuild cached timelines for one channel or **Rebuild all schedules**                                                                                                          |


Duplicate **channel IDs** are rejected on create. Programme paths must exist on disk when you save.

### Transcode cache lookup (admin)

**URL:** [http://localhost:8080/admin/transcode-cache.html](http://localhost:8080/admin/transcode-cache.html)

Paste a cache filename (`{hash}.mp4` or the hash alone) to find matching `media_files` rows and any `transcode_cache_entries` record (written when an encode completes).

### Schedule inspector

Inspect the **full playback timeline** for one channel on a chosen day.

Unlike the TV guide (Page 200) and Today list (Page 300), the inspector shows **every playback slot**:

- Programme segments (including mid-programme resume offsets)
- Commercial breaks (mid-roll within a programme, gap between programmes)
- Idents

Use the **channel** and **date** controls, then **Refresh**. **Rescan channels & ads** rescans media and rebuilds schedules (same as `POST /api/admin/rescan`). The current slot is highlighted when viewing today’s date. The summary line shows ad/ident settings and slot counts.

Query parameters: `?channel=cartoons&date=2026-10-01` (date is `YYYY-MM-DD` in the schedule timezone’s calendar day).

### Adding more admin tools

1. Add an HTML page under `public/admin/`.
2. Link it from `public/admin/index.html` and register it in `TheBoxAdmin.tools` in `public/admin/js/admin-common.js`.
3. Reuse `admin.css` classes (`admin-card`, `admin-btn`, etc.) for a consistent look.

---



## Remote test page (Page 400)

Open [http://localhost:8080/remote-test.html](http://localhost:8080/remote-test.html) or dial **400** on the remote.

This page shows:

- **Last key press** — `key`, `code`, `keyCode`, and mapped action
- **Page number buffer** — current numpad entry
- **Event log** — rolling history of remote input
- **Key map** — summary of default bindings

Use this page to identify unknown key codes from your remote, then add them to `TheBox.remote.keys` in `remote.js`.

---



## Watching video and full screen



### Live broadcast behaviour

The watch page joins the current programme **mid-playback** based on the schedule and wall-clock time. The top-right header shows the channel’s configured **page number** (not the app route 300). The **Today** panel lists the full day’s broadcast schedule for that channel and scrolls to the currently playing item.

### Full screen

On the watch page:

- Press **Enter** on the remote to toggle full screen
- Press **Back** to exit full screen
- Click the video (mouse) to toggle full screen

Full screen uses the browser Fullscreen API on the `<video>` element.

### Supported browsers

Use **Chromium** in kiosk mode on Raspberry Pi for best results. Full screen and media key support depend on the browser.

---



## Raspberry Pi and kiosk mode



### Recommended setup

1. Install Node.js 18+ and clone/copy The Box
2. Run `pnpm install && pnpm start`
3. Launch Chromium in kiosk mode:

```bash
chromium-browser --kiosk http://localhost:8080
```



### Auto-start on boot (optional)

Create a **systemd** service for the Node server and configure the desktop or window manager to open Chromium in kiosk mode on login.

### Pi tips

- Use **H.264 MP4** at **720p or lower** for smooth playback
- Prefer a **keyboard-style media remote** with USB dongle
- Use Page **400** to verify remote key codes before customising `remote.js`
- Set **Schedule timezone** in **[Admin → Settings](#admin-tools)** to your local timezone

---



## Video format recommendations


| Recommendation                 | Reason                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **H.264 + AAC in MP4**         | Best hardware decode support on Raspberry Pi and browsers                                                                                |
| **720p or lower**              | Reduces CPU/GPU load on Pi                                                                                                               |
| **Avoid exotic codecs in MKV** | With [cached transcode](#cached-transcode-optional) enabled, only non–HTML5-safe MKVs are re-encoded; H.264 + AAC/MP3 MKVs play natively |


Supported extensions (configurable): `.mp4`, `.mkv`, `.webm`, `.mov`

---



## Checking MKV files with ffprobe

When [cached transcode](#cached-transcode-optional) is enabled, The Box only probes `.mkv` programme files. It uses the same **ffprobe** binary as duration scanning (bundled after `pnpm install`, or a system install from the **FFmpeg** package). You can run the same check on any MKV on disk to see whether The Box will **transcode** it or **play it natively**.

### Command (matches the server)

```bash
ffprobe -v error \
  -show_entries stream=codec_type,codec_name \
  -show_entries format=format_name \
  -of json \
  "/path/to/your/file.mkv"
```

If `ffprobe` is not on your shell `PATH`, use the bundled binary from the project root (platform name may differ):

```bash
node -e "console.log(require('@ffprobe-installer/ffprobe').path)"
```

Run that path in place of `ffprobe` in the command above.

### How to read the result

Look at the `streams` array in the JSON output:

1. Find the first stream with `"codec_type": "video"` — note `codec_name`.
2. Find the first stream with `"codec_type": "audio"` — note `codec_name` (some files have no audio stream).

The Box compares ffprobe results to `transcode.nativeVideoCodecs` and `transcode.nativeAudioCodecs` in config (defaults below). Codec names are matched case-insensitively against ffprobe’s `codec_name` values.

**Default native lists:** video `h264` · audio `aac`, `mp3`


| Video `codec_name`                             | Audio `codec_name` (if present)  | Transcode with defaults?                                                |
| ---------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| in `nativeVideoCodecs` (e.g. `h264`)           | in `nativeAudioCodecs` or absent | **No** — original file is streamed                                      |
| in `nativeVideoCodecs`                         | not in list (e.g. `ac3`, `dts`)  | **Yes**                                                                 |
| not in list (e.g. `hevc`, `mpeg2video`, `vp9`) | any                              | **Yes** (add e.g. `hevc` to `nativeVideoCodecs` if your setup plays it) |


Extensions not listed in `transcode.probeExtensions` (e.g. `.mp4` with defaults) are **not** probed; they are always served from source.

If ffprobe **fails** on a file (corrupt path, unreadable file), the server treats that MKV as **needs transcode** until probe succeeds on a later rescan.

### Example: no transcode

```json
{
  "streams": [
    { "codec_type": "video", "codec_name": "h264" },
    { "codec_type": "audio", "codec_name": "aac" }
  ],
  "format": { "format_name": "matroska,webm" }
}
```

**Result:** play natively — no queue entry for this file.

### Example: transcode required

```json
{
  "streams": [
    { "codec_type": "video", "codec_name": "hevc" },
    { "codec_type": "audio", "codec_name": "aac" }
  ],
  "format": { "format_name": "matroska,webm" }
}
```

**Result:** with default settings, HEVC is not in **Native video codecs** — file will be transcoded when it appears on the schedule. Add `hevc` to **Native video codecs** in **[Admin → Settings](#admin-tools)** if your browser already plays this file without transcode.

### Multiple audio tracks

The server uses the **first** audio stream ffprobe lists. If the default track is DTS but a later track is AAC, The Box may still mark the file for transcode. Remuxing to a single AAC track (or reordering streams) avoids unnecessary encodes.

### Quick human-readable summary

Without JSON, print the first video and first audio codec names:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "/path/to/your/file.mkv"
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "/path/to/your/file.mkv"
```

You should see `h264` for video and `aac` or `mp3` for audio when no transcode is needed (the second command may print nothing if the file has no audio).

---



## API reference


| Method | Path                              | Description                                                   |
| ------ | --------------------------------- | ------------------------------------------------------------- |
| GET    | `/api/settings/public`            | Ceefax UI: `title`, `defaultPage`, `timezone` (from database) |
| GET    | `/api/health`                     | Server status and channel count                               |
| GET    | `/api/channels`                   | List all channels                                             |
| GET    | `/api/channels/:id`               | Channel details and video list                                |
| GET    | `/api/channels/:id/schedule`      | Daily schedule (`?date=YYYY-MM-DD` optional)                  |
| GET    | `/api/channels/:id/now`           | Currently playing programme                                   |
| GET    | `/api/guide`                      | Combined guide for all channels                               |
| POST   | `/api/admin/rescan`               | Reconcile all channels (disk → SQLite catalogue)              |
| GET    | `/api/admin/settings`             | Full settings + effective listen (admin)                      |
| PUT    | `/api/admin/settings`             | Update settings in `app_settings`                             |
| GET    | `/api/admin/channels`             | List channels from DB                                         |
| POST   | `/api/admin/channels`             | Create channel                                                |
| PUT    | `/api/admin/channels/:id`         | Update channel                                                |
| DELETE | `/api/admin/channels/:id`         | Delete channel                                                |
| POST   | `/api/admin/channels/:id/rescan`  | Reconcile one channel’s media                                 |
| POST   | `/api/admin/rebuild-schedules`    | Rebuild cached schedules (`{ "channelId": "optional" }`)      |
| GET    | `/api/admin/transcode-cache?key=` | Lookup cache hash → `media_files`                             |
| GET    | `/media/:channelId/:filename`     | Stream a video file (supports HTTP Range)                     |


---



## Troubleshooting



### Channels appear but nothing plays / schedule is empty

**Cause:** Video durations could not be read (ffprobe failure).

**Fix:**

- Ensure `pnpm install` completed (bundled ffprobe)
- Or install system FFmpeg: `sudo apt install ffmpeg` (Linux/Pi)
- Restart the server and check startup logs for duration warnings
- Call `POST /api/admin/rescan`



### Today list on watch page looks wrong or incomplete

The Today panel shows the **full daily schedule** for the channel. Scroll within the panel to see all programmes. The list auto-scrolls to the currently playing item on load.

### All channels seemed to start at the same time

By default all channels share one broadcast window (midnight to midnight). Set per-channel **Schedule start** and **Schedule end** in **[Admin → Channels](#channels-admin)** to stagger channels (e.g. `06:00`–`23:00`).

### Page number entry clears before three digits

The numpad buffer allows up to **4 seconds** between digits. Only **three-digit** entries navigate. Adjust `pageBufferTimeoutMs` in `remote.js` if needed.

### Remote colour buttons do not work

Many remotes send non-standard key codes. Open **Page 400**, press each button, note the `code` value in the log, and add it to `TheBox.remote.keys` in `remote.js`.

### Full screen does not work

- Full screen requires a **user gesture** in some browsers; press Enter on the remote after the page has loaded
- Use **Chromium** on Pi rather than minimal embedded browsers
- Check Page 400 to confirm your remote’s Enter key code



### Times look wrong

- Schedule generation uses **Schedule timezone** from **[Admin → Settings](#admin-tools)**
- The UI displays clock times using that timezone when `TheBox.ready` has loaded public settings (see [Client-side settings](#client-side-settings-apijs))
- Set **Schedule timezone** to match your intended broadcast region



### Channel changes or new files not reflected

Edit the channel in **[Admin → Channels](#channels-admin)** if you changed paths or flags, then **Rescan**. For new or moved media files only, **Rescan media** or:

```bash
curl -X POST http://localhost:8080/api/admin/rescan
```



### Design / CSS changes not visible

Hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) to bypass cached CSS.

---



## Quick reference card

```text
PAGE 100  →  Channel list
PAGE 200  →  TV guide
PAGE 300  →  Watch (last channel)
PAGE 400  →  Remote test

/admin/   →  Admin tools (browser only)

ENTER     →  Select / Full screen (watch)
BACK      →  Back / Exit full screen
↑ ↓       →  Navigate lists
PG+/PG-   →  Jump in lists

config.json          →  SQLite path only (server startup)
config.local.json    →  Optional databasePath override (gitignored)
Admin → Settings     →  Port, schedule, ads, transcode, extensions, test card, library flags
Admin → Channels     →  Per-channel name, page, colour, source paths, broadcast hours
public/js/api.js     →  Remote, OSD, dev guide toggles
public/js/remote.js  →  Key mappings and page navigation timing
public/css/thebox.css →  Visual styling and layout variables
```

---

*The Box — Retro Inspired TV Player*