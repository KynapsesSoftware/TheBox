const express = require('express');
const path = require('path');
const { loadConfig, resolveChannelsRoot } = require('./config');
const { scanChannels } = require('./scanner');
const { loadAdsLibrary } = require('./ads');
const { generateChannelSchedule, generateGuide, resolveNowPlaying, getDateKey } = require('./scheduler');
const { createAdMediaHandler, createMediaHandler } = require('./stream');

const config = loadConfig();
const projectRoot = path.dirname(config.configPath);
const channelsRoot = resolveChannelsRoot(config);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
let channels = [];
let adsLibrary = null;
let scanTimer = null;

function getChannelById(channelId) {
  return channels.find((channel) => channel.id === channelId);
}

function serializeChannel(channel) {
  return {
    id: channel.id,
    displayName: channel.displayName,
    pageNumber: channel.pageNumber,
    color: channel.color,
    mediaType: channel.mediaType || 'video',
    artworkUrl: channel.artworkPath ? `/api/channels/${encodeURIComponent(channel.id)}/artwork` : null,
    sourcePath: channel.sourcePath || null,
    maxContentDuration: channel.maxContentDuration ?? null,
    identInterval: channel.identInterval ?? 0,
    adsEnabled: channel.adsEnabled === true,
    scanSubfolders: channel.scanSubfolders ?? false,
    schedule: channel.schedule,
    videoCount: channel.videos.length,
    identCount: channel.idents.length,
    totalDurationSeconds: channel.videos.reduce(
      (sum, video) => sum + (video.durationSeconds || 0),
      0,
    ),
  };
}

function scheduleOptions(date = new Date()) {
  return {
    date,
    timezone: config.schedule.timezone,
    hoursToGenerate: config.schedule.hoursToGenerate,
    defaultStartTime: config.schedule.defaultStartTime,
    defaultEndTime: config.schedule.defaultEndTime,
    adsLibrary,
  };
}

function countUnplayableMedia(channelList) {
  return channelList.reduce((count, channel) => {
    return count + channel.videos.filter((video) => !video.durationSeconds).length;
  }, 0);
}

async function refreshChannels() {
  channels = await scanChannels(channelsRoot, {
    videoExtensions: config.videoExtensions,
    audioExtensions: config.audioExtensions,
  }, projectRoot);
  adsLibrary = await loadAdsLibrary(config);
  const mediaCount = channels.reduce((sum, channel) => sum + channel.videos.length, 0);
  const unplayableCount = countUnplayableMedia(channels);

  console.log(`Scanned ${channels.length} channel(s), ${mediaCount} programme(s) from ${channelsRoot}`);
  if (adsLibrary.active) {
    console.log(`Loaded ${adsLibrary.ads.length} ad(s) from ${adsLibrary.config.path}`);
  }

  if (unplayableCount > 0) {
    console.warn(
      `${unplayableCount} programme(s) have no duration and will be excluded from schedules.`,
    );
  }
}

app.use(express.json());
app.use(express.static(publicDir));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    channels: channels.length,
    channelsRoot,
  });
});

app.get('/api/channels', (_req, res) => {
  res.json(channels.map(serializeChannel));
});

app.get('/api/channels/:id', (req, res) => {
  const channel = getChannelById(req.params.id);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  res.json({
    ...serializeChannel(channel),
    videos: channel.videos.map((video) => ({
      filename: video.filename,
      title: video.title,
      durationSeconds: video.durationSeconds,
    })),
  });
});

app.get('/api/channels/:id/schedule', (req, res) => {
  const channel = getChannelById(req.params.id);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  const date = req.query.date
    ? new Date(`${req.query.date}T12:00:00.000Z`)
    : new Date();

  const schedule = generateChannelSchedule(channel, scheduleOptions(date));

  res.json({
    ...schedule,
    meta: {
      timezone: config.schedule.timezone,
      adsLibraryActive: adsLibrary?.active === true,
      channelAdsEnabled: channel.adsEnabled === true,
      identInterval: channel.identInterval ?? 0,
      identCount: channel.idents.length,
    },
  });
});

app.get('/api/channels/:id/now', (req, res) => {
  const channel = getChannelById(req.params.id);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  const schedule = generateChannelSchedule(channel, scheduleOptions());
  const current = resolveNowPlaying(schedule);

  if (!current) {
    const unplayableCount = channel.videos.filter((video) => !video.durationSeconds).length;

    if (channel.videos.length === 0) {
      res.status(404).json({
        error: channel.mediaType === 'audio'
          ? 'This channel has no audio files'
          : 'This channel has no video files',
      });
      return;
    }

    if (unplayableCount === channel.videos.length) {
      res.status(503).json({
        error: 'Media durations could not be read. Restart the server after checking ffprobe.',
      });
      return;
    }

    res.status(404).json({ error: 'Nothing scheduled right now' });
    return;
  }

  res.json({
    channelId: channel.id,
    channelName: channel.displayName,
    mediaType: channel.mediaType || 'video',
    ...current,
    title: current.displayTitle || current.title,
    startsAt: current.displayStartsAt || current.startsAt,
    endsAt: current.displayEndsAt || current.endsAt,
  });
});

app.get('/api/channels/:id/artwork', (req, res) => {
  const channel = getChannelById(req.params.id);
  if (!channel?.artworkPath) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  res.sendFile(channel.artworkPath);
});

app.get('/api/guide', (req, res) => {
  const date = req.query.date
    ? new Date(`${req.query.date}T12:00:00.000Z`)
    : new Date();

  res.json({
    date: getDateKey(date, config.schedule.timezone),
    channels: generateGuide(channels, scheduleOptions(date)),
  });
});

app.post('/api/admin/rescan', async (_req, res) => {
  await refreshChannels();
  res.json({ ok: true, channels: channels.length });
});

app.get('/media/ads/*', createAdMediaHandler(() => adsLibrary));
app.get('/media/:channelId/ident/*', createMediaHandler(getChannelById, 'ident'));
app.get('/media/:channelId/*', createMediaHandler(getChannelById));

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

async function start() {
  await refreshChannels();

  if (config.scanIntervalMinutes > 0) {
    scanTimer = setInterval(refreshChannels, config.scanIntervalMinutes * 60 * 1000);
  }

  const server = app.listen(config.port, config.host, () => {
    console.log(`${config.ui.title} running at http://localhost:${config.port}`);
    console.log(`Channels root: ${channelsRoot}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Port ${config.port} is already in use. Stop the other process or change "port" in config.json.`,
      );
    } else {
      console.error('Failed to start The Box:', error.message);
    }
    process.exit(1);
  });
}

process.on('SIGINT', () => {
  if (scanTimer) {
    clearInterval(scanTimer);
  }
  process.exit(0);
});

start().catch((error) => {
  console.error('Failed to start The Box:', error);
  process.exit(1);
});
