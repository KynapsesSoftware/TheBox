const express = require('express');
const path = require('path');
const { loadConfig, resolveChannelsRoot } = require('./config');
const { scanChannels } = require('./scanner');
const { generateChannelSchedule, generateGuide, findCurrentSlot, getDateKey } = require('./scheduler');
const { createMediaHandler } = require('./stream');

const config = loadConfig();
const channelsRoot = resolveChannelsRoot(config);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
let channels = [];
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
    schedule: channel.schedule,
    videoCount: channel.videos.length,
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
  };
}

function countUnplayableVideos(channelList) {
  return channelList.reduce((count, channel) => {
    return count + channel.videos.filter((video) => !video.durationSeconds).length;
  }, 0);
}

async function refreshChannels() {
  channels = await scanChannels(channelsRoot, config.videoExtensions);
  const videoCount = channels.reduce((sum, channel) => sum + channel.videos.length, 0);
  const unplayableCount = countUnplayableVideos(channels);

  console.log(`Scanned ${channels.length} channel(s), ${videoCount} video(s) from ${channelsRoot}`);

  if (unplayableCount > 0) {
    console.warn(
      `${unplayableCount} video(s) have no duration and will be excluded from schedules.`,
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

  res.json(generateChannelSchedule(channel, scheduleOptions(date)));
});

app.get('/api/channels/:id/now', (req, res) => {
  const channel = getChannelById(req.params.id);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  const schedule = generateChannelSchedule(channel, scheduleOptions());
  const current = findCurrentSlot(schedule);

  if (!current) {
    const unplayableCount = channel.videos.filter((video) => !video.durationSeconds).length;

    if (channel.videos.length === 0) {
      res.status(404).json({ error: 'This channel has no video files' });
      return;
    }

    if (unplayableCount === channel.videos.length) {
      res.status(503).json({
        error: 'Video durations could not be read. Restart the server after checking ffprobe.',
      });
      return;
    }

    res.status(404).json({ error: 'Nothing scheduled right now' });
    return;
  }

  res.json({
    channelId: channel.id,
    channelName: channel.displayName,
    ...current,
  });
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

app.get('/media/:channelId/:filename', createMediaHandler(getChannelById));

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

async function start() {
  await refreshChannels();

  if (config.scanIntervalMinutes > 0) {
    scanTimer = setInterval(refreshChannels, config.scanIntervalMinutes * 60 * 1000);
  }

  app.listen(config.port, config.host, () => {
    console.log(`${config.ui.title} running at http://localhost:${config.port}`);
    console.log(`Channels root: ${channelsRoot}`);
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
