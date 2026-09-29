# The Box

The Box is a retro inspired local channel media player with a BBC Ceefax-style interface. Each subfolder under `channels/` becomes a TV channel, and the server builds a random daily schedule from the video files inside.

For installation, configuration, remote control, troubleshooting, and more, see the **[User Guide](userguide.md)**.

## Requirements

- Node.js 18 or newer
- pnpm for installing dependencies (enable with Corepack — see below)
- FFmpeg is optional — a bundled `ffprobe` is installed when you run `pnpm install`

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

## Configuration

Edit `config.json`:

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
  }
}
```

## Adding channels

1. Create a folder under `channels/`, for example `channels/classic-films/`
2. Add video files to that folder, or set `sourcePath` in `channel.json` to an external folder
3. Optionally add `channel.json`:

```json
{
  "displayName": "Classic Films",
  "pageNumber": 101,
  "color": "cyan",
  "sourcePath": "/mnt/media/classic-films",
  "maxContentDuration": 120,
  "identInterval": 1,
  "scanSubfolders": true,
  "schedule": {
    "startTime": "06:00",
    "endTime": "17:00"
  }
}
```

`sourcePath` is optional. Use an absolute path or a path relative to the project folder when videos live outside `channels/`. A trailing slash is optional.

Set `scanSubfolders` to `true` to include videos from subfolders when scanning a channel or `sourcePath`.

Set `mediaType` to `audio` for audio-only channels. Add artwork (e.g. `artwork.png`) to the channel folder for the watch page display.

`schedule.startTime` and `schedule.endTime` use 24-hour `HH:MM` format in the timezone from `config.json`. New programmes are not started after `endTime`, but the final programme may continue past it. Omit `schedule` to use the global defaults.

4. Restart the server, or call `POST /api/admin/rescan`

## How scheduling works

- Each channel gets a shuffled playlist seeded by `channelId + date`
- The schedule is stable for the whole day
- When you open a channel, playback joins mid-program based on the current time
- By default every channel broadcasts from `00:00` to `24:00` in the configured timezone
- Per-channel `schedule.startTime` / `schedule.endTime` in `channel.json` define when programmes begin and when new ones stop being scheduled
- Channels with less video content repeat programmes more often within their broadcast window; they do not share the same end time unless configured identically

## API

- `GET /api/channels`
- `GET /api/channels/:id`
- `GET /api/channels/:id/schedule`
- `GET /api/channels/:id/now`
- `GET /api/guide`
- `POST /api/admin/rescan`
- `GET /media/:channelId/:filename`

## Raspberry Pi kiosk mode

After starting The Box:

```bash
chromium-browser --kiosk http://localhost:8080
```

For best results on Pi, use H.264 MP4 files at 720p or lower.

## Project layout

```text
TheBox/
├── config.json
├── channels/
├── public/          # Ceefax-style HTML/CSS/JS UI
└── server/          # Express app, scanner, scheduler, streaming
```

## Development

```bash
pnpm dev
```

Uses Node's built-in `--watch` mode for automatic restarts.
