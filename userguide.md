# The Box — User Guide

**The Box** is a retro-inspired local TV platform with a BBC Ceefax-style interface. Each folder under `channels/` becomes a TV channel. The server builds a daily schedule from the video files inside, and playback simulates tuning into a live broadcast.

This guide covers installation, configuration, channel setup, scheduling, the on-screen interface, remote control, developer tools, and troubleshooting.

The Box - Screenshot 1

---

## Table of contents

1. [Requirements](#requirements)
2. [Installation](#installation)
3. [Quick start](#quick-start)
4. [Project layout](#project-layout)
5. [Global configuration (`config.json`)](#global-configuration-configjson) — includes [SQLite catalogue (database mode)](#sqlite-catalogue-database-mode)
6. [Adding and configuring channels](#adding-and-configuring-channels)
7. [How scheduling works](#how-scheduling-works)
8. [The interface (Ceefax pages)](#the-interface-ceefax-pages)
9. [Client-side settings (`api.js`)](#client-side-settings-apijs)
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
├── config.json              # Shipped server and schedule settings (template)
├── config.local.json        # Optional local overrides (gitignored; create if needed)
├── userguide.md             # This guide
├── channels/                # One subfolder per TV channel
│   └── bbc1/
│       ├── channel.json     # Optional channel metadata
│       └── *.mp4 / *.mkv    # Video files
├── database/                # SQLite catalogue (gitignored *.db; used when library.mode is database)
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



## Global configuration (`config.json`)

Edit `config.json` in the project root:

```json
{
  "channelsRoot": "./channels",
  "host": "0.0.0.0",
  "port": 8080,
  "videoExtensions": [".mp4", ".mkv", ".webm", ".mov", ".avi"],
  "audioExtensions": [".mp3", ".flac", ".ogg", ".m4a", ".wav", ".aac"],
  "scanIntervalMinutes": 60,
  "schedule": {
    "timezone": "Europe/London",
    "seedBy": "day",
    "hoursToGenerate": 24,
    "defaultStartTime": "00:00",
    "defaultEndTime": "24:00"
  },
  "ui": {
    "title": "The Box",
    "defaultPage": 100
  },
  "ads": {
    "enabled": false,
    "path": "/absolute/path/to/ads",
    "breakMinAds": 1,
    "breakMaxAds": 3,
    "intervalMinutes": 15,
    "intervalJitterMinutes": 3,
    "programEndGuardMinutes": 5
  },
  "testPattern": {
    "path": ""
  },
  "transcode": {
    "enabled": false,
    "cachePath": "",
    "maxConcurrentJobs": 1,
    "maxHeight": 720,
    "preset": "veryfast",
    "scheduleAheadDays": 1,
    "nativeVideoCodecs": ["h264"],
    "nativeAudioCodecs": ["aac", "mp3"],
    "probeExtensions": [".mkv"]
  },
  "library": {
    "mode": "filesystem",
    "databasePath": "",
    "startupScan": "if-empty",
    "rescanOnStartup": false
  }
}
```



### Setting reference


| Setting                               | Description                                                                                                                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `channelsRoot`                        | Path to the folder containing channel subfolders                                                                                                                                                                                         |
| `host`                                | Network interface to bind (`0.0.0.0` = all interfaces)                                                                                                                                                                                   |
| `port`                                | HTTP port (default `8080`)                                                                                                                                                                                                               |
| `videoExtensions`                     | File types treated as video when scanning video channels                                                                                                                                                                                 |
| `audioExtensions`                     | File types treated as audio when scanning audio channels                                                                                                                                                                                 |
| `scanIntervalMinutes`                 | How often to rescan channel folders (`0` = only on startup)                                                                                                                                                                              |
| `schedule.timezone`                   | IANA timezone used for daily schedules (e.g. `Europe/London`, `Australia/Adelaide`)                                                                                                                                                      |
| `schedule.seedBy`                     | Schedule randomisation period (`day` = new shuffle each calendar day)                                                                                                                                                                    |
| `schedule.hoursToGenerate`            | Fallback schedule length when no end time is set                                                                                                                                                                                         |
| `schedule.defaultStartTime`           | Default broadcast start for channels without their own (`HH:MM`)                                                                                                                                                                         |
| `schedule.defaultEndTime`             | Default broadcast end (`HH:MM`; use `24:00` for midnight)                                                                                                                                                                                |
| `ui.title`                            | Application title (server logs)                                                                                                                                                                                                          |
| `ui.defaultPage`                      | Default Ceefax page number                                                                                                                                                                                                               |
| `ads.enabled`                         | Master switch for commercial breaks on video channels                                                                                                                                                                                    |
| `ads.path`                            | **Absolute** path to a folder of ad video files (subfolders are scanned)                                                                                                                                                                 |
| `ads.breakMinAds` / `ads.breakMaxAds` | Random number of ads per break (inclusive range)                                                                                                                                                                                         |
| `ads.intervalMinutes`                 | Target minutes between commercial breaks (e.g. first break ~15 minutes after channel start)                                                                                                                                              |
| `ads.intervalJitterMinutes`           | Random ± minutes applied to each interval                                                                                                                                                                                                |
| `ads.programEndGuardMinutes`          | Defer a break that would start within this many minutes of a programme’s end                                                                                                                                                             |
| `testPattern.path`                    | Optional global test card: path to a **file** (`testcard.mp4` / `testcard.mkv`) or a **folder** containing one of those names. Used when a channel has no programme on air and no channel-specific test card                             |
| `transcode.enabled`                   | When `true`, non–browser-safe programme files are transcoded to cached H.264/AAC MP4 in the background (**default** `false`)                                                                                                             |
| `transcode.cachePath`                 | Writable folder for cached MP4s (absolute or relative to the project root). Required when transcode is enabled                                                                                                                           |
| `transcode.maxConcurrentJobs`         | Maximum simultaneous FFmpeg encodes (use `1` on a Raspberry Pi)                                                                                                                                                                          |
| `transcode.maxHeight`                 | Scale down taller sources (e.g. `720`); `0` keeps full height                                                                                                                                                                            |
| `transcode.preset`                    | FFmpeg x264 preset (`veryfast` is a good default)                                                                                                                                                                                        |
| `transcode.scheduleAheadDays`         | Days of generated schedule used to build the transcode queue (minimum `1`)                                                                                                                                                               |
| `transcode.nativeVideoCodecs`         | ffprobe **video** `codec_name` values treated as HTML5-playable for probed files (default `["h264"]`). Add `"hevc"` here if your browsers play HEVC MKV natively                                                                         |
| `transcode.nativeAudioCodecs`         | ffprobe **audio** `codec_name` values allowed without transcode (default `["aac", "mp3"]`)                                                                                                                                               |
| `transcode.probeExtensions`           | File extensions to ffprobe on scan (default `[".mkv"]`). Other extensions are not probed and are always served from source                                                                                                               |
| `library.mode`                        | `filesystem` (default): scan `channelsRoot` on every refresh. `database`: catalogue in SQLite; warm startup loads from the DB without re-walking disk                                                                                    |
| `library.databasePath`                | SQLite file path (e.g. `database/thebox.db`). Required when `library.mode` is `database`. Store under the project’s **`database/`** folder; catalogue files are gitignored                                                                 |
| `library.startupScan`                 | `if-empty` (default): when the DB has no channels, **import once** from `channelsRoot` (full scan + ffprobe), then use the DB. `never`: never auto-import; create channels in [Admin → Channels](#channels-admin) or call the import API |
| `library.rescanOnStartup`             | When `true`, reconcile disk against the DB on every server start (incremental ffprobe). Default `false` for fast warm boot                                                                                                               |


After changing configuration, restart the server or wait for the next automatic scan (if `scanIntervalMinutes` is set).

### SQLite catalogue (database mode)

By default, `library.mode` is `filesystem`: the server reads each channel folder under `channelsRoot` and keeps the full programme list in memory (same behaviour as early releases).

For larger libraries, set `library.mode` to `database`. The server stores **channels**, **media catalogue**, **cached daily schedules**, and (optionally) **transcode cache metadata** in a SQLite file at `library.databasePath`. Startup stays fast after the first import; the Ceefax UI and watch pages behave the same.


| Topic                     | Filesystem mode                               | Database mode                                                                                  |
| ------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Channel config            | `channel.json` + folders under `channelsRoot` | Rows in SQLite; optional one-time import from folders                                          |
| Programme list at runtime | Full in-memory scan                           | Metadata + counts in RAM; paths from DB on playback                                            |
| Schedules                 | Generated on each API call                    | Cached in DB (rebuilt on rescan / admin action)                                                |
| Editing channels          | Edit JSON on disk                             | [Admin → Channels](#channels-admin) or admin API                                               |
| `channelsRoot`            | Required at runtime                           | Used for **import** and filesystem dev; not read for programmes unless paths in DB point there |


**Enable database mode** in `config.local.json` (recommended — keep shipped `config.json` on `filesystem` for simple clones):

```json
{
  "library": {
    "mode": "database",
    "databasePath": "database/thebox.db",
    "startupScan": "if-empty",
    "rescanOnStartup": false
  }
}
```

Use an absolute path or a path relative to the project root. The recommended location is **`database/thebox.db`** (the `database/` catalogue files are **gitignored** — they are local runtime data, not part of the shipped repo). Keep machine-specific paths in **`config.local.json`** only.

**First run with an empty database**

1. Start the server with `startupScan: if-empty` (default).
2. If the DB has no channels, the server **imports once** from `channelsRoot` (same work as a full filesystem scan, including ffprobe).
3. Later restarts **hydrate from SQLite** in milliseconds when `rescanOnStartup` is `false`.

**Ongoing operation**

- **Admin Rescan** (global or per channel) reconciles disk paths stored in the DB: new/changed files are probed; missing files are removed from the catalogue.
- `scanIntervalMinutes` in database mode triggers **incremental reconcile**, not a full folder walk of `channelsRoot`.
- `transcode.scheduleAheadDays` controls how many days of schedules are pre-built in the DB after refresh (and feeds the transcode queue).
- `GET /api/health` reports `library.mode`, `databasePath`, `schedulesCached`, and `slimCatalogue` when applicable.

**API note:** `GET /api/channels/:id` returns counts only in database mode; add `?videos=1` or `?limit=50&offset=0` for paginated programme summaries from the database.

See [Admin tools](#admin-tools) for the web UI. Database-only admin APIs return **503** if `library.mode` is not `database`.

### Cached transcode (optional)

When `transcode.enabled` is `true`, The Box **ffprobe**s programme files whose extension is listed in `transcode.probeExtensions` (default `.mkv` only). Other extensions such as `.mp4` are not probed and are always served from source.

For each probed file, if the first video stream’s `codec_name` is listed in `nativeVideoCodecs` and the first audio stream (if any) is listed in `nativeAudioCodecs`, the file is **served from the original path** (no transcode). Otherwise it is transcoded to cached H.264/AAC MP4 when it appears on the schedule. The **daily schedule is unchanged** — if a programme **needs** transcode and the cache is not ready when its slot airs, the watch page shows **“PROGRAMME NOT AVAILABLE AT THIS TIME”** with the scheduled title and times.

Only **programmes that appear on the generated schedule** are queued (not your entire library). The queue prioritises **upcoming** slots so a long encode does not block titles that still have time to finish before they air. Slots that are **already on air** without a cache are skipped until a later repeat or the next day.

**Requirements:** system **FFmpeg** on your `PATH`, or set the `FFMPEG_PATH` environment variable. Set `transcode.cachePath` to a folder with enough free space (plan roughly 0.5–1× the size of cached sources over time).

Example in `config.local.json`:

```json
{
  "transcode": {
    "enabled": true,
    "cachePath": "videos/transcode-cache",
    "maxConcurrentJobs": 1,
    "maxHeight": 720,
    "scheduleAheadDays": 1,
    "nativeVideoCodecs": ["h264", "hevc"],
    "nativeAudioCodecs": ["aac", "mp3"]
  }
}
```

The admin **Schedule inspector** shows per-programme **Transcode** status and an **FFprobe** column (`v:… · a:…`) for probed files, including those that did not require transcode. The summary line lists your configured native codec lists. Use **Rescan** or restart after changing config or adding files. To check a file yourself before it airs, see [Checking MKV files with ffprobe](#checking-mkv-files-with-ffprobe).

### Local overrides (`config.local.json`)

For machine-specific settings (timezone, ad folder paths, alternate `channelsRoot`, port changes on a dev laptop), create `config.local.json` in the project root beside `config.json`.

- The server always loads `config.json` **first**, then merges `config.local.json` on top when that file exists.
- Use the same JSON shape as `config.json`; you only need to include keys you want to override (nested objects are merged, not replaced wholesale).
- `config.local.json` **is not tracked in git** — use it for paths and toggles that should not be committed.

Example (optional file):

```json
{
  "schedule": { "timezone": "Australia/Adelaide" },
  "ads": {
    "enabled": true,
    "path": "/home/you/Videos/ads"
  },
  "channelsRoot": "/path/to/my-local-channels",
  "library": {
    "mode": "database",
    "databasePath": "database/thebox.db"
  }
}
```

Fresh clones work with `config.json` **alone**; no copy or rename step is required.

---



## Adding and configuring channels

With `library.mode: database`, you can define channels entirely in **[Admin → Channels](#channels-admin)** (programme roots, ident/test card/artwork paths, schedule window). Legacy folders under `channelsRoot` are optional and used mainly for **Import from folders**. The steps below describe the **filesystem** workflow (`library.mode: filesystem`), which remains the default for new installs.

### 1. Create a channel folder

Each subfolder of `channelsRoot` is one channel:

```text
channels/
├── bbc1/
├── bbc2/
├── itv/
└── cartoons/
```



### 2. Add media files

Each channel is either a **video** channel (default) or an **audio** channel. Copy media files into the channel folder, or point `channel.json` at one or more external folders (`sourcePath` or `sourcePaths`). Supported extensions are defined in `config.json`.

### 3. Optional: `channel.json`

Create `channel.json` inside the channel folder:

```json
{
  "displayName": "BBC 1",
  "pageNumber": 101,
  "color": "cyan",
  "sourcePath": "/mnt/media/bbc1",
  "maxContentDuration": 90,
  "identInterval": 2,
  "scanSubfolders": true,
  "schedule": {
    "startTime": "06:00",
    "endTime": "23:00"
  }
}
```

Multiple programme folders (JSON array). Each root is scanned with `scanSubfolders`; every file’s schedule/`/media/` name is prefixed with a **slug** from that folder’s basename so paths from different roots cannot collide (`comedy/Season 1/ep.mkv`, `drama/Season 1/ep.mkv`). If two entries share the same basename (e.g. two paths ending in `comedy`), the second uses a suffix: `comedy-2/…`, `comedy-3/…`, and so on. When `sourcePaths` is set, `sourcePath` **is ignored**.

```json
{
  "displayName": "TV Comedy Gold",
  "pageNumber": 105,
  "color": "yellow",
  "sourcePaths": [
    "/mnt/nas/comedy/dvd-rips",
    "/mnt/nas/comedy/broadcast-caps"
  ],
  "scanSubfolders": true,
  "schedule": {
    "startTime": "06:00",
    "endTime": "24:00"
  }
}
```

Audio channel example:

```json
{
  "displayName": "Music Channel",
  "pageNumber": 107,
  "color": "cyan",
  "mediaType": "audio",
  "artwork": "artwork.png",
  "sourcePath": "/mnt/media/music",
  "scanSubfolders": true,
  "schedule": {
    "startTime": "06:00",
    "endTime": "23:00"
  }
}
```



### Channel setting reference


| Field                | Description                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayName`        | Name shown in the UI                                                                                                                                                                                                                                                                                                                                  |
| `mediaType`          | `video` (default) or `audio`. A channel scans only one media type                                                                                                                                                                                                                                                                                     |
| `artwork`            | Optional artwork filename in the channel folder for audio channels (also checks `artwork.png`, `cover.png`, etc.)                                                                                                                                                                                                                                     |
| `pageNumber`         | Ceefax-style page number in the channel list                                                                                                                                                                                                                                                                                                          |
| `color`              | Accent colour in the channel list: `cyan`, `green`, `yellow`, `red`, `blue`, or `magenta`                                                                                                                                                                                                                                                             |
| `sourcePath`         | Optional **single** external folder for programmes. Absolute or relative to the project folder. When set, filenames in schedules and `/media/` URLs match the file paths **inside that folder** (no prefix). Ignored when `sourcePaths` is a non-empty array. When both are omitted, programmes are read from the channel folder (excluding `ident/`) |
| `sourcePaths`        | Optional **array** of external programme folders. Same path rules as `sourcePath`. Each root gets a basename **slug prefix** on every filename (see example above). Duplicate basenames use `-2`, `-3`, … suffixes on the slug. Legacy single `sourcePath` remains unprefixed for backward compatibility                                              |
| `maxContentDuration` | Optional maximum programme length in **minutes**. Videos longer than this are scanned but excluded from the daily schedule                                                                                                                                                                                                                            |
| `identInterval`      | Optional ident insertion interval. `0` = no idents (default). `1` = ident after every programme. `2` = ident after every two programmes, and so on. Requires an `ident/` subfolder in the channel directory                                                                                                                                           |
| `adsEnabled`         | Optional. When `true`, this video channel includes commercial breaks if ads are enabled globally and the ad library is valid. Default is off (omit or set `false`)                                                                                                                                                                                    |
| `scanSubfolders`     | Optional. When `true`, scan video files in all subfolders of the channel folder, `sourcePath`, or each entry in `sourcePaths`. Default is `false` (top-level files only). The channel’s `ident/` folder is always excluded when scanning the channel folder; external roots are scanned as given                                                      |
| `schedule.startTime` | When this channel starts broadcasting each day (`HH:MM`, 24-hour)                                                                                                                                                                                                                                                                                     |
| `schedule.endTime`   | When new programmes stop being scheduled (`HH:MM`)                                                                                                                                                                                                                                                                                                    |


If `schedule` is omitted, the channel uses `defaultStartTime` and `defaultEndTime` from `config.json`.

### Channel idents

Each channel can include an optional `ident/` subfolder alongside `channel.json`:

```text
channels/bbc1/
├── channel.json
└── ident/
    ├── bbc1-sting.mp4
    └── bbc1-logo.mp4
```

Ident files are always read from the channel folder, even when `sourcePath` or `sourcePaths` point elsewhere for programme content. When `identInterval` is greater than zero and one or more playable idents exist, the scheduler inserts them after every N programmes. If several idents are available, a shuffled order is chosen for the day (stable until the next day’s schedule). Idents play during the broadcast but are not shown in the TV guide or Today schedule lists. Use video idents on video channels and audio idents on audio channels.

### Test cards (standby signal)

When a channel has **no programme on air** (outside broadcast hours, empty schedule, or no playable library), the watch page can show a **test card** video instead of an error.

**Channel test card (optional):** place `testcard.mp4` or `testcard.mkv` in the **root of the channel folder** (next to `channel.json`), not in `sourcePath` / `sourcePaths`. Only one file is used; if both exist, `testcard.mp4` wins. These filenames are never scheduled as programmes.

**Global fallback:** set `testPattern.path` in `config.json` (or `config.local.json`) to an absolute or project-relative path pointing at a test card **file**, or a **folder** that contains `testcard.mp4` or `testcard.mkv`. If a channel has its own test card, that file is used; otherwise the global card applies.

On the watch page the clip **loops** until a programme is scheduled again. Status shows **TEST SIGNAL**. Audio channels display the test card on the video stage while off air.

### Commercial ads (video channels)

Ads are stored in a **single global folder** configured in `config.json` (`ads.path` must be an absolute path). Enable them with `"ads.enabled": true`, then opt in per video channel with `"adsEnabled": true` in that channel’s `channel.json`.

- Ad files use the same extensions as video channels; subfolders under `ads.path` are scanned automatically.
- Break timing is calculated when the daily schedule is built (including mid-programme breaks). Programme rows in the TV guide and Today list show **broadcast** start/end times (including time taken by ads inside that programme). Individual ads are not listed.
- If ads are enabled but the folder is missing, empty, invalid, or contains fewer files than `ads.breakMaxAds`, the server logs a warning on startup/rescan and **no ads** are scheduled.
- Invalid ad settings (for example `breakMinAds` > `breakMaxAds`) also disable ads with a console warning.
- Rescanning channels rescans ads and rebuilds commercial breaks for the current day.
- When an ident is also due before the next programme, **ads play first, then the ident**. Idents never follow mid-programme ad breaks.
- During playback, the Now Showing overlay keeps the current or next programme title (not ad filenames). Between-programme ads show the **next** programme’s times.



### Audio channels

When `mediaType` is `audio`:

- The scanner uses `audioExtensions` from `config.json`
- Scheduling, idents, and live-join playback work the same as video channels
- Page 300 shows static artwork in the picture area while audio plays
- Place artwork in the channel folder (`artwork.png` by default, or set `artwork` in `channel.json`)
- Full screen expands the artwork area rather than a video element



### 4. Rescan channels

Restart the server, or trigger a rescan without restarting:

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

These toggles live in `public/js/api.js`:

```javascript
window.TheBox = {
  devGuideEnabled: false,       // Design overlay (see below)
  remoteEnabled: true,          // Enable remote / keyboard control
  remotePageOsdEnabled: true,   // Page number OSD (see below)
  // ...
};
```


| Setting                | Default | Description                                    |
| ---------------------- | ------- | ---------------------------------------------- |
| `devGuideEnabled`      | `false` | Show the 1920×1080 design guide overlay        |
| `remoteEnabled`        | `true`  | Enable global remote / keyboard handling       |
| `remotePageOsdEnabled` | `true`  | Show page number entry in the top-right corner |


The design guide can also be toggled on the index page in `public/js/app.js`:

```javascript
TheBox.devGuideEnabled = false;
```

Reload the browser after changing these values.

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


| URL                              | Purpose                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `/admin/`                        | Overview and links to each tool                                         |
| `/admin/channels.html`           | Create/edit/delete channels in the SQLite catalogue (**database mode**) |
| `/admin/schedule-inspector.html` | Full playback timeline for one channel                                  |
| `/admin/transcode-cache.html`    | Look up a cached `{hash}.mp4` → programme in the database               |


Open [http://localhost:8080/admin/](http://localhost:8080/admin/) after starting the server. Use **Back to TV UI** in the sidebar to return to Page 100.

Tools that require `library.mode: database` show an error or empty state if the server is still on filesystem mode.

### Channels (admin)

**URL:** [http://localhost:8080/admin/channels.html](http://localhost:8080/admin/channels.html)

Manage the SQLite catalogue without editing `channel.json`:


| Action                          | What it does                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **New channel**                 | Creates a row with programme **source paths** (one directory per line), optional ident/test card/artwork paths, schedule window, Ceefax **colour** (dropdown), ads/ident flags |
| **Edit / Delete**               | Update config or remove a channel (cascades media and schedule rows in the DB)                                                                                                 |
| **Import from folders**         | Merges every channel folder under `channelsRoot` into the DB (upsert by channel id)                                                                                            |
| **Rescan all channels**         | Same as `POST /api/admin/rescan` — reconcile all programme and ident paths                                                                                                     |
| **Rescan media** (on edit form) | Reconcile one channel’s files on disk                                                                                                                                          |
| **Rebuild schedule**            | Rebuild cached timelines for one channel or **Rebuild all schedules**                                                                                                          |


Duplicate **channel IDs** are rejected on create. Programme paths must exist on disk when you save.

### Transcode cache lookup (admin)

**URL:** [http://localhost:8080/admin/transcode-cache.html](http://localhost:8080/admin/transcode-cache.html)

Paste a cache filename (`{hash}.mp4` or the hash alone) to find matching `media_files` rows and any `transcode_cache_entries` record (written when an encode completes in database mode).

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

The watch page joins the current programme **mid-playback** based on the schedule and wall-clock time. The top-right header shows the channel’s **page number** from `channel.json` (not the app route 300). The **Today** panel lists the full day’s broadcast schedule for that channel and scrolls to the currently playing item.

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
- Set `schedule.timezone` in `config.json` to your local timezone

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

**Result:** with default config, HEVC is not in `nativeVideoCodecs` — file will be transcoded when it appears on the schedule. Add `"hevc"` to `nativeVideoCodecs` in `config.local.json` if your browser already plays this file without transcode.

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


| Method | Path                              | Description                                                        |
| ------ | --------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/health`                     | Server status and channel count                                    |
| GET    | `/api/channels`                   | List all channels                                                  |
| GET    | `/api/channels/:id`               | Channel details and video list                                     |
| GET    | `/api/channels/:id/schedule`      | Daily schedule (`?date=YYYY-MM-DD` optional)                       |
| GET    | `/api/channels/:id/now`           | Currently playing programme                                        |
| GET    | `/api/guide`                      | Combined guide for all channels                                    |
| POST   | `/api/admin/rescan`               | Rescan all channels (database: reconcile; filesystem: folder scan) |
| GET    | `/api/admin/channels`             | List channels from DB (**database mode**)                          |
| POST   | `/api/admin/channels`             | Create channel                                                     |
| PUT    | `/api/admin/channels/:id`         | Update channel                                                     |
| DELETE | `/api/admin/channels/:id`         | Delete channel                                                     |
| POST   | `/api/admin/channels/:id/rescan`  | Reconcile one channel’s media                                      |
| POST   | `/api/admin/rebuild-schedules`    | Rebuild cached schedules (`{ "channelId": "optional" }`)           |
| POST   | `/api/admin/import-from-folders`  | Import/merge from `channelsRoot`                                   |
| GET    | `/api/admin/transcode-cache?key=` | Lookup cache hash → `media_files`                                  |
| GET    | `/media/:channelId/:filename`     | Stream a video file (supports HTTP Range)                          |


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

By default all channels shared one broadcast window (midnight to midnight). Use per-channel `schedule.startTime` and `schedule.endTime` in each `channel.json` to stagger channels (e.g. `06:00`–`23:00`).

### Page number entry clears before three digits

The numpad buffer allows up to **4 seconds** between digits. Only **three-digit** entries navigate. Adjust `pageBufferTimeoutMs` in `remote.js` if needed.

### Remote colour buttons do not work

Many remotes send non-standard key codes. Open **Page 400**, press each button, note the `code` value in the log, and add it to `TheBox.remote.keys` in `remote.js`.

### Full screen does not work

- Full screen requires a **user gesture** in some browsers; press Enter on the remote after the page has loaded
- Use **Chromium** on Pi rather than minimal embedded browsers
- Check Page 400 to confirm your remote’s Enter key code



### Times look wrong

- Schedule generation uses the timezone in `config.json` (`schedule.timezone`)
- The UI displays times in the **browser’s local timezone** via `toLocaleTimeString()`
- Set `schedule.timezone` to match your intended broadcast region



### Changes to `channel.json` not reflected

Restart the server or run:

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

config.json          →  Shipped server defaults
config.local.json    →  Optional local overrides (gitignored)
channel.json         →  Per-channel name, page, colour, broadcast hours
public/js/api.js     →  Remote, OSD, dev guide toggles
public/js/remote.js  →  Key mappings and page navigation timing
public/css/thebox.css →  Visual styling and layout variables
```

---

*The Box — Retro Inspired TV Player*