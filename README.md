# The Box

The Box is a retro inspired local channel media player with a BBC Ceefax-style interface. Channels, schedules, and settings live in a **SQLite catalogue**; the Ceefax UI streams programmes from paths stored in the database.

For installation, configuration, remote control, troubleshooting, and more, see the **[User Guide](userguide.md)**.

![The Box - Screenshot 1](docs/images/thebox-screenshot-1.png)

## Requirements

- Node.js 18 or newer
- pnpm for installing dependencies (enable with Corepack — see below)
- A bundled **ffprobe** is installed when you run `pnpm install`; **FFmpeg** is optional unless you enable [cached transcode](userguide.md#cached-transcode-optional)

### Enable pnpm

Corepack ships with Node.js 18+. Run once:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

You can also install system FFmpeg if you prefer:

- **Raspberry Pi / Debian / Ubuntu:** `sudo apt install ffmpeg`
- **macOS:** `brew install ffmpeg`
- **Windows:** install from [ffmpeg.org](https://ffmpeg.org/download.html)

## Quick start

```bash
pnpm install
pnpm start
```

Open [http://localhost:8080](http://localhost:8080).

Admin tools ( **Settings**, **Channels**, schedule inspector, transcode lookup) live at [http://localhost:8080/admin/](http://localhost:8080/admin/) — separate from the Ceefax viewer. See the [User Guide — Admin tools](userguide.md#admin-tools).

## Configuration

**`config.json`** (shipped) contains only the SQLite path:

```json
{
  "databasePath": "./database/thebox.db"
}
```

Optional **`config.local.json`** (gitignored) may override **`databasePath`** only. All other options — port, timezone, ads, transcode, scan behaviour — are in the database and edited under **[Admin → Settings](http://localhost:8080/admin/settings.html)**.

See [Server startup configuration](userguide.md#server-startup-configuration-configjson) and [SQLite catalogue](userguide.md#sqlite-catalogue) in the user guide.

## Adding channels

Open **[Admin → Channels](http://localhost:8080/admin/channels.html)**, create a channel, and set **programme source paths** (one media directory per line). Use **Rescan** so the catalogue picks up files on disk. Details: [User Guide — Adding and configuring channels](userguide.md#adding-and-configuring-channels).

Set **Ads enabled** globally in Settings and opt in per video channel in the admin editor.

## Schedule window

`schedule.startTime` and `schedule.endTime` use 24-hour `HH:MM` format in the timezone from **Admin → Settings**. New programmes are not started after `endTime`, but the final programme may continue past it. Omit per-channel schedule to use global defaults from Settings.

## Project layout

```text
TheBox/
├── config.json              # databasePath (server startup)
├── config.local.json        # optional databasePath override (gitignored)
├── database/                # SQLite catalogue (*.db gitignored)
├── channels/                # optional sample media folders (not used by the server)
├── public/                  # Ceefax UI + admin/
└── server/                  # Express app
```

## License

GPL-3.0 — see [LICENSE](LICENSE).
