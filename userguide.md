# The Box — User Guide

**The Box** is a retro-inspired local TV platform with a BBC Ceefax-style interface. Each folder under `channels/` becomes a TV channel. The server builds a daily schedule from the video files inside, and playback simulates tuning into a live broadcast.

This guide covers installation, configuration, channel setup, scheduling, the on-screen interface, remote control, developer tools, and troubleshooting.

![The Box - Screenshot 1](docs/images/thebox-screenshot-1.png)

---

## Table of contents

1. [Requirements](#requirements)
2. [Installation](#installation)
3. [Quick start](#quick-start)
4. [Project layout](#project-layout)
5. [Global configuration (`config.json`)](#global-configuration-configjson)
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
17. [API reference](#api-reference)
18. [Troubleshooting](#troubleshooting)

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
├── config.json              # Server and schedule settings
├── userguide.md             # This guide
├── channels/                # One subfolder per TV channel
│   └── bbc1/
│       ├── channel.json     # Optional channel metadata
│       └── *.mp4 / *.mkv    # Video files
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
  }
}
```

### Setting reference

| Setting | Description |
|---|---|
| `channelsRoot` | Path to the folder containing channel subfolders |
| `host` | Network interface to bind (`0.0.0.0` = all interfaces) |
| `port` | HTTP port (default `8080`) |
| `videoExtensions` | File types treated as video when scanning video channels |
| `audioExtensions` | File types treated as audio when scanning audio channels |
| `scanIntervalMinutes` | How often to rescan channel folders (`0` = only on startup) |
| `schedule.timezone` | IANA timezone used for daily schedules (e.g. `Europe/London`, `Australia/Adelaide`) |
| `schedule.seedBy` | Schedule randomisation period (`day` = new shuffle each calendar day) |
| `schedule.hoursToGenerate` | Fallback schedule length when no end time is set |
| `schedule.defaultStartTime` | Default broadcast start for channels without their own (`HH:MM`) |
| `schedule.defaultEndTime` | Default broadcast end (`HH:MM`; use `24:00` for midnight) |
| `ui.title` | Application title (server logs) |
| `ui.defaultPage` | Default Ceefax page number |
| `ads.enabled` | Master switch for commercial breaks on video channels |
| `ads.path` | **Absolute** path to a folder of ad video files (subfolders are scanned) |
| `ads.breakMinAds` / `ads.breakMaxAds` | Random number of ads per break (inclusive range) |
| `ads.intervalMinutes` | Target minutes between commercial breaks (e.g. first break ~15 minutes after channel start) |
| `ads.intervalJitterMinutes` | Random ± minutes applied to each interval |
| `ads.programEndGuardMinutes` | Defer a break that would start within this many minutes of a programme’s end |

After changing `config.json`, restart the server or wait for the next automatic scan (if `scanIntervalMinutes` is set).

---

## Adding and configuring channels

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

Each channel is either a **video** channel (default) or an **audio** channel. Copy media files into the channel folder, or set `sourcePath` in `channel.json` to point at an external folder on another drive or network share. Supported extensions are defined in `config.json`.

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

| Field | Description |
|---|---|
| `displayName` | Name shown in the UI |
| `mediaType` | `video` (default) or `audio`. A channel scans only one media type |
| `artwork` | Optional artwork filename in the channel folder for audio channels (also checks `artwork.png`, `cover.png`, etc.) |
| `pageNumber` | Ceefax-style page number in the channel list |
| `color` | Accent colour in the channel list: `cyan`, `green`, `yellow`, `red`, `blue`, or `magenta` |
| `sourcePath` | Optional folder containing this channel’s video files. Can be absolute (`/mnt/nas/shows/bbc1`) or relative to the project folder (`../media/bbc1`). A trailing slash is optional. When omitted or empty, videos are read from the channel folder itself |
| `maxContentDuration` | Optional maximum programme length in **minutes**. Videos longer than this are scanned but excluded from the daily schedule |
| `identInterval` | Optional ident insertion interval. `0` = no idents (default). `1` = ident after every programme. `2` = ident after every two programmes, and so on. Requires an `ident/` subfolder in the channel directory |
| `adsEnabled` | Optional. When `true`, this video channel includes commercial breaks if ads are enabled globally and the ad library is valid. Default is off (omit or set `false`) |
| `scanSubfolders` | Optional. When `true`, scan video files in all subfolders of the channel folder or `sourcePath`. Default is `false` (top-level files only). The channel’s `ident/` folder is always excluded from programme scans |
| `schedule.startTime` | When this channel starts broadcasting each day (`HH:MM`, 24-hour) |
| `schedule.endTime` | When new programmes stop being scheduled (`HH:MM`) |

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

Ident files are always read from the channel folder, even when `sourcePath` points elsewhere for programme content. When `identInterval` is greater than zero and one or more playable idents exist, the scheduler inserts them after every N programmes. If several idents are available, a shuffled order is chosen for the day (stable until the next day’s schedule). Idents play during the broadcast but are not shown in the TV guide or Today schedule lists. Use video idents on video channels and audio idents on audio channels.

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

| Page | URL | Purpose |
|---|---|---|
| **100** | `/` | Channel list |
| **200** | `/guide.html` | TV guide (all channels) |
| **300** | `/watch.html?channel=…` | Live channel view (header shows that channel’s Ceefax page, e.g. PAGE 101) |
| **400** | `/remote-test.html` | Remote control troubleshooting |

Admin and debugging tools live under **`/admin/`** (modern UI, not Ceefax pages). See [Admin tools](#admin-tools).

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

| Setting | Default | Description |
|---|---|---|
| `devGuideEnabled` | `false` | Show the 1920×1080 design guide overlay |
| `remoteEnabled` | `true` | Enable global remote / keyboard handling |
| `remotePageOsdEnabled` | `true` | Show page number entry in the top-right corner |

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

| Page | Destination |
|---|---|
| **100** | Channel list (home) |
| **200** | TV guide |
| **300** | Last watched channel (watch page) |
| **400** | Remote test page |

- Up to **4 seconds** between digits (`pageBufferTimeoutMs` in `remote.js`)
- Navigation waits **2 seconds** after the third digit (`pageNavigateDelayMs`) before changing page, simulating retro teletext delay
- Only complete three-digit entries navigate; partial entries are cleared

### Global remote keys

| Key | Action |
|---|---|
| **Home** | Go to Page 100 (channel list) |
| **Back** | Previous page, or home if no history |
| **↑ / ↓** | Navigate lists (channel list, guide, schedule) |
| **Enter** | Select highlighted item / toggle full screen on watch page |
| **Pg+ / Pg−** | Move five rows in lists |
| **←** (watch page) | Go back |
| **→** (watch page) | Go to TV guide (Page 200) |

### Watch page media keys

| Key | Action |
|---|---|
| **Play / Pause** | Play or pause video |
| **Stop** | Pause and return to start |
| **Rewind** | Skip back 30 seconds |
| **Fast forward** | Skip forward 30 seconds |
| **Enter** | Toggle full screen |
| **Back** | Exit full screen (if active), otherwise go back |

### Colour buttons (optional)

Mapped in `remote.js` but may not work on all remotes until key codes are identified on the [Remote test page](#remote-test-page-page-400):

| Button | Page |
|---|---|
| Red | 100 |
| Green | 200 |
| Yellow | 300 |
| Blue | 400 |

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

Operator tools are served from **`public/admin/`** with their own layout and styles (`admin/css/admin.css`, `admin/js/admin-common.js`). They are **not** Ceefax pages and are **not** reachable via the TV remote page numbers (100–400).

| URL | Purpose |
|---|---|
| **`/admin/`** | Overview and links to each tool |
| **`/admin/schedule-inspector.html`** | Full playback timeline for one channel |

Open [http://localhost:8080/admin/](http://localhost:8080/admin/) after starting the server. Use **Back to TV UI** in the sidebar to return to Page 100.

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

| Recommendation | Reason |
|---|---|
| **H.264 + AAC in MP4** | Best hardware decode support on Raspberry Pi and browsers |
| **720p or lower** | Reduces CPU/GPU load on Pi |
| **Avoid exotic codecs** | No transcoding pipeline; files must play natively in HTML5 `<video>` |

Supported extensions (configurable): `.mp4`, `.mkv`, `.webm`, `.mov`

---

## API reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Server status and channel count |
| GET | `/api/channels` | List all channels |
| GET | `/api/channels/:id` | Channel details and video list |
| GET | `/api/channels/:id/schedule` | Daily schedule (`?date=YYYY-MM-DD` optional) |
| GET | `/api/channels/:id/now` | Currently playing programme |
| GET | `/api/guide` | Combined guide for all channels |
| POST | `/api/admin/rescan` | Rescan channel folders |
| GET | `/media/:channelId/:filename` | Stream a video file (supports HTTP Range) |

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

config.json          →  Server, timezone, defaults
channel.json         →  Per-channel name, page, colour, broadcast hours
public/js/api.js     →  Remote, OSD, dev guide toggles
public/js/remote.js  →  Key mappings and page navigation timing
public/css/thebox.css →  Visual styling and layout variables
```

---

*The Box — Retro Inspired TV Player*
