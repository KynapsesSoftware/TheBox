const express = require('express');
const path = require('path');
const { loadConfig, resolveChannelsRoot } = require('./config');
const { createChannelRepository } = require('./library');
const { loadAdsLibrary } = require('./ads');
const { resolveNowPlaying, getDateKey } = require('./scheduler');
const {
  createAdMediaHandler,
  createChannelTestCardHandler,
  createGlobalTestCardHandler,
  createMediaHandler,
} = require('./stream');
const {
  buildTestPatternNowPlaying,
  resolveConfiguredTestPatternPath,
  resolveEffectiveTestCardPath,
} = require('./testPattern');
const { createTranscodeService, findVideoByFilename } = require('./transcode');
const {
  createAdminChannel,
  deleteAdminChannel,
  getAdminChannel,
  listAdminChannels,
  updateAdminChannel,
} = require('./library/adminChannels');
const {
  lookupTranscodeCache,
  upsertTranscodeCacheEntry,
} = require('./library/transcodeCacheDb');

const config = loadConfig();
const projectRoot = path.dirname(config.configPath);
const channelsRoot = resolveChannelsRoot(config);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
let channels = [];
let adsLibrary = null;
let globalTestCardPath = null;
let scanTimer = null;
const transcodeService = createTranscodeService(config, projectRoot);
const libraryRuntime = createChannelRepository(config, { projectRoot, channelsRoot });

if (libraryRuntime.dbConnection?.db) {
  transcodeService.onTranscodeComplete = (info) => {
    upsertTranscodeCacheEntry(libraryRuntime.dbConnection.db, {
      cache_key: info.cacheKey,
      channel_id: info.channelId,
      filename: info.filename,
      source_path: info.sourcePath,
      ffmpeg_exit_note: info.note,
    });
  };
}
const channelRepository = libraryRuntime.repository;
const scheduleService = libraryRuntime.scheduleService;
const mediaCatalogue = libraryRuntime.mediaCatalogue;

function resolveProgrammeVideo(channel, filename) {
  if (mediaCatalogue) {
    return mediaCatalogue.getProgramme(channel.id, filename);
  }

  return findVideoByFilename(channel, filename);
}

function programmeCount(channel) {
  return channel.programmeCount ?? channel.videos.length;
}

function identCount(channel) {
  return channel.identCount ?? channel.idents.length;
}

function scheduleAheadDays() {
  const days = Number(config.transcode?.scheduleAheadDays);
  return Number.isFinite(days) && days >= 1 ? days : 1;
}

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
    sourcePaths: channel.sourcePaths?.length ? channel.sourcePaths : null,
    maxContentDuration: channel.maxContentDuration ?? null,
    identInterval: channel.identInterval ?? 0,
    adsEnabled: channel.adsEnabled === true,
    scanSubfolders: channel.scanSubfolders ?? false,
    schedule: channel.schedule,
    videoCount: programmeCount(channel),
    programmeCount: programmeCount(channel),
    identCount: identCount(channel),
    hasTestCard: Boolean(channel.testCardPath || globalTestCardPath),
    totalDurationSeconds: channel.totalDurationSeconds ?? channel.videos.reduce(
      (sum, video) => sum + (video.durationSeconds || 0),
      0,
    ),
    catalogueInDb: channel.catalogueInDb === true,
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
    if (channel.catalogueInDb) {
      return count + (channel.unplayableProgrammeCount || 0);
    }

    return count + channel.videos.filter((video) => !video.durationSeconds).length;
  }, 0);
}

function applyTranscodeToNowPlaying(channel, current) {
  if (!current || current.isTestPattern || current.isAd || current.isIdent) {
    return current;
  }

  if (!transcodeService.enabled) {
    return current;
  }

  const video = resolveProgrammeVideo(channel, current.filename);
  if (!video?.needsTranscode || transcodeService.canPlayVideo(video)) {
    return current;
  }

  const status = transcodeService.getStatusForVideo(video);
  const { mediaUrl, ...rest } = current;

  return {
    ...rest,
    playbackUnavailable: true,
    reason: status === 'failed' ? 'transcodeFailed' : 'transcodePending',
  };
}

function requireDatabaseAdmin(_req, res, next) {
  if (channelRepository.mode !== 'database' || !libraryRuntime.dbConnection?.db) {
    res.status(503).json({
      error: 'Admin channel management requires library.mode "database" and library.databasePath',
    });
    return;
  }

  next();
}

async function reloadRuntimeChannels() {
  channels = await channelRepository.rescanAll({});
}

function refreshTranscodeQueueOnly() {
  transcodeService.refreshQueue(
    channels,
    scheduleOptions,
    (channel, scheduleOpts) => scheduleService.getSchedule(channel, scheduleOpts),
    resolveProgrammeVideo,
  );
}

async function rebuildSchedulesForRuntime(channelId = null) {
  if (!scheduleService.enabled) {
    refreshTranscodeQueueOnly();
    return;
  }

  if (channelId) {
    const channel = getChannelById(channelId);
    if (channel) {
      scheduleService.rebuildChannel(channel, scheduleOptions, scheduleAheadDays());
    }
  } else {
    scheduleService.invalidateAll();
    scheduleService.ensureAhead(
      channels,
      scheduleOptions,
      scheduleAheadDays(),
      { force: true },
    );
  }

  refreshTranscodeQueueOnly();
}

async function refreshChannels(options = {}) {
  const forceReconcile = options.forceReconcile === true;
  const rescanOnStartup = options.rescanOnStartup === true;
  channels = await channelRepository.rescanAll({ forceReconcile, rescanOnStartup });
  adsLibrary = await loadAdsLibrary(config);
  globalTestCardPath = resolveConfiguredTestPatternPath(config.testPattern?.path, projectRoot);

  if (!mediaCatalogue) {
    for (const channel of channels) {
      await transcodeService.enrichChannelVideos(channel);
    }
  }

  const rebuildSchedules = forceReconcile || rescanOnStartup;

  if (scheduleService.enabled) {
    if (rebuildSchedules) {
      scheduleService.invalidateAll();
    }

    scheduleService.ensureAhead(
      channels,
      scheduleOptions,
      scheduleAheadDays(),
      { force: rebuildSchedules },
    );
  }

  transcodeService.refreshQueue(
    channels,
    scheduleOptions,
    (channel, scheduleOpts) => scheduleService.getSchedule(channel, scheduleOpts),
    resolveProgrammeVideo,
  );

  const mediaCount = channels.reduce((sum, channel) => sum + programmeCount(channel), 0);
  const unplayableCount = countUnplayableMedia(channels);

  const libraryLabel = channelRepository.mode === 'database' ? 'library database' : channelsRoot;
  console.log(`Loaded ${channels.length} channel(s), ${mediaCount} programme(s) from ${libraryLabel}`);
  if (adsLibrary.active) {
    console.log(`Loaded ${adsLibrary.ads.length} ad(s) from ${adsLibrary.config.path}`);
  }
  if (globalTestCardPath) {
    console.log(`Global test card: ${globalTestCardPath}`);
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
    library: {
      mode: channelRepository.mode,
      databasePath: libraryRuntime.dbConnection?.path || null,
      schedulesCached: scheduleService.enabled,
      slimCatalogue: Boolean(mediaCatalogue),
    },
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

  const payload = { ...serializeChannel(channel) };

  if (mediaCatalogue) {
    const listVideos = req.query.videos === '1' || req.query.videos === 'true';
    const limit = Number.parseInt(req.query.limit, 10);
    const offset = Number.parseInt(req.query.offset, 10) || 0;

    if (listVideos || Number.isFinite(limit)) {
      payload.videos = mediaCatalogue.listProgrammeSummaries(channel.id, {
        limit: Number.isFinite(limit) ? limit : 100,
        offset,
      });
    }
  } else {
    payload.videos = channel.videos.map((video) => ({
      filename: video.filename,
      title: video.title,
      durationSeconds: video.durationSeconds,
    }));
  }

  res.json(payload);
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

  const schedule = scheduleService.getSchedule(channel, scheduleOptions(date));
  const withTranscode = transcodeService.attachScheduleMeta(
    schedule,
    channel,
    resolveProgrammeVideo,
  );

  res.json({
    ...withTranscode,
    meta: {
      timezone: config.schedule.timezone,
      adsLibraryActive: adsLibrary?.active === true,
      channelAdsEnabled: channel.adsEnabled === true,
      identInterval: channel.identInterval ?? 0,
      identCount: identCount(channel),
      ...(withTranscode.meta || {}),
    },
  });
});

app.get('/api/channels/:id/now', (req, res) => {
  const channel = getChannelById(req.params.id);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  const schedule = scheduleService.getSchedule(channel, scheduleOptions());
  const current = resolveNowPlaying(schedule);

  if (!current) {
    const testCard = resolveEffectiveTestCardPath(channel, globalTestCardPath);
    if (testCard) {
      res.json(buildTestPatternNowPlaying(channel, testCard));
      return;
    }

    const unplayableCount = channel.catalogueInDb
      ? (channel.unplayableProgrammeCount || 0)
      : channel.videos.filter((video) => !video.durationSeconds).length;

    if (programmeCount(channel) === 0) {
      res.status(404).json({
        error: channel.mediaType === 'audio'
          ? 'This channel has no audio files'
          : 'This channel has no video files',
      });
      return;
    }

    if (unplayableCount === programmeCount(channel)) {
      res.status(503).json({
        error: 'Media durations could not be read. Restart the server after checking ffprobe.',
      });
      return;
    }

    res.status(404).json({ error: 'Nothing scheduled right now' });
    return;
  }

  const payload = applyTranscodeToNowPlaying(channel, {
    channelId: channel.id,
    channelName: channel.displayName,
    mediaType: channel.mediaType || 'video',
    ...current,
    title: current.displayTitle || current.title,
    startsAt: current.displayStartsAt || current.startsAt,
    endsAt: current.displayEndsAt || current.endsAt,
  });

  res.json(payload);
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
    channels: scheduleService.generateGuide(channels, scheduleOptions(date)),
  });
});

app.get('/api/admin/library', requireDatabaseAdmin, (_req, res) => {
  res.json({
    mode: channelRepository.mode,
    databasePath: libraryRuntime.dbConnection.path,
    channelsRoot,
    schedulesCached: scheduleService.enabled,
    slimCatalogue: Boolean(mediaCatalogue),
  });
});

app.get('/api/admin/channels', requireDatabaseAdmin, (_req, res) => {
  const db = libraryRuntime.dbConnection.db;
  res.json({ channels: listAdminChannels(db) });
});

app.get('/api/admin/channels/:id', requireDatabaseAdmin, (req, res) => {
  const channel = getAdminChannel(libraryRuntime.dbConnection.db, req.params.id);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  res.json(channel);
});

app.post('/api/admin/channels', requireDatabaseAdmin, async (req, res) => {
  const result = createAdminChannel(
    libraryRuntime.dbConnection.db,
    req.body || {},
    projectRoot,
  );

  if (!result.ok) {
    res.status(400).json({ error: 'Validation failed', details: result.errors });
    return;
  }

  await reloadRuntimeChannels();

  if (channelRepository.reconcileOneChannel) {
    await channelRepository.reconcileOneChannel(result.channel.id);
    channels = channelRepository.getChannels();
  }

  await rebuildSchedulesForRuntime(result.channel.id);
  res.status(201).json(result.channel);
});

app.put('/api/admin/channels/:id', requireDatabaseAdmin, async (req, res) => {
  const channelId = req.params.id;
  const result = updateAdminChannel(
    libraryRuntime.dbConnection.db,
    channelId,
    req.body || {},
    projectRoot,
  );

  if (!result.ok) {
    const status = result.errors.includes('Channel not found') ? 404 : 400;
    res.status(status).json({ error: 'Update failed', details: result.errors });
    return;
  }

  if (result.pathsAffectingMedia && channelRepository.reconcileOneChannel) {
    await channelRepository.reconcileOneChannel(channelId);
    channels = channelRepository.getChannels();
  } else {
    await reloadRuntimeChannels();
  }

  if (result.scheduleAffecting || result.pathsAffectingMedia) {
    await rebuildSchedulesForRuntime(channelId);
  } else {
    refreshTranscodeQueueOnly();
  }

  res.json(result.channel);
});

app.delete('/api/admin/channels/:id', requireDatabaseAdmin, async (req, res) => {
  const result = deleteAdminChannel(libraryRuntime.dbConnection.db, req.params.id);
  if (!result.ok) {
    res.status(404).json({ error: 'Delete failed', details: result.errors });
    return;
  }

  await reloadRuntimeChannels();
  refreshTranscodeQueueOnly();
  res.json({ ok: true });
});

app.post('/api/admin/channels/:id/rescan', requireDatabaseAdmin, async (req, res) => {
  if (!channelRepository.reconcileOneChannel) {
    res.status(503).json({ error: 'Channel rescan is only available in database mode' });
    return;
  }

  const ok = await channelRepository.reconcileOneChannel(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  channels = channelRepository.getChannels();
  scheduleService.invalidateChannel?.(req.params.id);
  await rebuildSchedulesForRuntime(req.params.id);
  res.json({ ok: true, channelId: req.params.id });
});

app.post('/api/admin/rebuild-schedules', requireDatabaseAdmin, async (req, res) => {
  const channelId = typeof req.body?.channelId === 'string' ? req.body.channelId : null;
  await reloadRuntimeChannels();
  await rebuildSchedulesForRuntime(channelId);
  res.json({ ok: true, channelId });
});

app.post('/api/admin/import-from-folders', requireDatabaseAdmin, async (_req, res) => {
  if (!channelRepository.importFromChannelsRoot) {
    res.status(503).json({ error: 'Import requires database mode' });
    return;
  }

  const imported = await channelRepository.importFromChannelsRoot();
  channels = channelRepository.getChannels();
  scheduleService.invalidateAll?.();
  scheduleService.ensureAhead?.(
    channels,
    scheduleOptions,
    scheduleAheadDays(),
    { force: true },
  );
  refreshTranscodeQueueOnly();
  res.json({ ok: true, imported, channels: channels.length });
});

app.get('/api/admin/transcode-cache', requireDatabaseAdmin, (req, res) => {
  const result = lookupTranscodeCache(libraryRuntime.dbConnection.db, req.query.key || '');
  if (!result.cacheKey) {
    res.status(400).json({ error: 'Invalid cache key' });
    return;
  }

  res.json(result);
});

app.post('/api/admin/rescan', async (_req, res) => {
  await refreshChannels({ forceReconcile: true });
  res.json({ ok: true, channels: channels.length });
});

app.get('/media/ads/*', createAdMediaHandler(() => adsLibrary));
app.get('/media/testcard/global', createGlobalTestCardHandler(() => globalTestCardPath));
app.get('/media/:channelId/testcard', createChannelTestCardHandler(getChannelById));
const resolveMediaItem = mediaCatalogue
  ? (channel, filename, mediaType) => mediaCatalogue.getMediaItem(channel.id, filename, mediaType)
  : null;

app.get(
  '/media/:channelId/ident/*',
  createMediaHandler(getChannelById, 'ident', null, resolveMediaItem),
);
app.get(
  '/media/:channelId/*',
  createMediaHandler(
    getChannelById,
    'video',
    (video) => transcodeService.resolvePlaybackPath(video),
    resolveMediaItem,
  ),
);

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

async function start() {
  if (transcodeService.settings.enabled) {
    if (transcodeService.enabled) {
      console.log(`Transcode enabled; cache: ${transcodeService.cacheDir}`);
    } else if (!transcodeService.settings.cachePath) {
      console.warn('Transcode enabled in config but cachePath is empty — transcode is inactive.');
    } else if (!transcodeService.ffmpegStatus.ok) {
      console.warn(`Transcode enabled but FFmpeg unavailable: ${transcodeService.ffmpegStatus.error}`);
    }
  }

  await refreshChannels({ rescanOnStartup: libraryRuntime.library.rescanOnStartup });
  transcodeService.startDayRolloverWatch(
    scheduleOptions,
    () => channels,
    (_dateKey, channelList, scheduleOptionsFactory) => {
      if (!scheduleService.enabled) {
        return;
      }

      scheduleService.ensureAhead(
        channelList,
        scheduleOptionsFactory,
        scheduleAheadDays(),
        { force: false },
      );
    },
  );

  if (config.scanIntervalMinutes > 0) {
    const intervalRescan = () => {
      const reconcile = channelRepository.mode === 'database';
      refreshChannels({ forceReconcile: reconcile });
    };
    scanTimer = setInterval(intervalRescan, config.scanIntervalMinutes * 60 * 1000);
  }

  const server = app.listen(config.port, config.host, () => {
    console.log(`${config.ui.title} running at http://localhost:${config.port}`);
    console.log(`Channels root: ${channelsRoot}`);
    if (config.localConfigPath) {
      console.log(`Config overrides: ${config.localConfigPath}`);
    }
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

  if (transcodeService.dayCheckTimer) {
    clearInterval(transcodeService.dayCheckTimer);
  }

  libraryRuntime.close();

  process.exit(0);
});

start().catch((error) => {
  console.error('Failed to start The Box:', error);
  process.exit(1);
});
