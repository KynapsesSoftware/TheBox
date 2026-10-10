const express = require('express');
const path = require('path');
const { loadBootstrapConfig } = require('./config');
const { createChannelRepository, openLibraryDatabase } = require('./library');
const {
  initializeAppSettings,
  reloadAppConfigFromDb,
  upsertSettingsRows,
} = require('./library/appSettings');
const {
  classifyInvalidation,
  prepareSettingsUpdate,
  settingsChangeNeedsRestart,
} = require('./library/adminSettings');
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
const { createTranscodeService } = require('./transcode');
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

const bootstrap = loadBootstrapConfig();
const projectRoot = bootstrap.projectRoot;

const dbConnection = openLibraryDatabase(bootstrap.databasePath, projectRoot);
if (!dbConnection) {
  console.error(
    `Failed to open database at "${bootstrap.databasePath}". Check databasePath in config.json.`,
  );
  process.exit(1);
}

if (bootstrap.legacyJsonKeysIgnored) {
  console.warn(
    'Non-databasePath keys in config.json / config.local.json are ignored; application settings are loaded from the database.',
  );
}

const settingsRuntime = initializeAppSettings(dbConnection.db, bootstrap);
let appConfig = settingsRuntime.config;
let listenState = settingsRuntime.listen;

function getConfig() {
  return appConfig;
}

function getListen() {
  return listenState;
}

function syncRepositoryFromConfig() {
  const config = getConfig();
  channelRepository.scanOptions = {
    videoExtensions: config.videoExtensions,
    audioExtensions: config.audioExtensions,
  };
  channelRepository.transcodeSettings = config.transcode || null;
  libraryRuntime.library.rescanOnStartup = config.library?.rescanOnStartup === true;
}
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
let channels = [];
let adsLibrary = null;
let globalTestCardPath = null;
let scanTimer = null;
const transcodeService = createTranscodeService(appConfig, projectRoot);
const libraryRuntime = createChannelRepository(appConfig, {
  projectRoot,
  dbConnection,
});

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
  return mediaCatalogue.getProgramme(channel.id, filename);
}

function programmeCount(channel) {
  return channel.programmeCount ?? channel.videos.length;
}

function identCount(channel) {
  return channel.identCount ?? channel.idents.length;
}

function scheduleAheadDays() {
  const days = Number(getConfig().transcode?.scheduleAheadDays);
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
    totalDurationSeconds: channel.totalDurationSeconds ?? 0,
    catalogueInDb: true,
  };
}

function scheduleOptions(date = new Date()) {
  const config = getConfig();
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
  return channelList.reduce(
    (count, channel) => count + (channel.unplayableProgrammeCount || 0),
    0,
  );
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
  if (!libraryRuntime.dbConnection?.db) {
    res.status(503).json({ error: 'Admin tools require a connected library database.' });
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

function configureScanTimer() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }

  const config = getConfig();
  if (config.scanIntervalMinutes > 0) {
    scanTimer = setInterval(() => {
      refreshChannels({ forceReconcile: true });
    }, config.scanIntervalMinutes * 60 * 1000);
  }
}

async function applySettingsInvalidation(changedKeys) {
  const flags = classifyInvalidation(changedKeys);
  syncRepositoryFromConfig();
  transcodeService.applyAppConfig(getConfig());

  if (flags.testPattern) {
    globalTestCardPath = resolveConfiguredTestPatternPath(
      getConfig().testPattern?.path,
      projectRoot,
    );
  }

  if (flags.ads || flags.testPattern) {
    adsLibrary = await loadAdsLibrary(getConfig());
  }

  if (flags.schedule || flags.ads) {
    scheduleService.invalidateAll();
    scheduleService.ensureAhead(
      channels,
      scheduleOptions,
      scheduleAheadDays(),
      { force: true },
    );
  } else if (flags.transcode) {
    scheduleService.ensureAhead(
      channels,
      scheduleOptions,
      scheduleAheadDays(),
      { force: false },
    );
  }

  if (flags.transcode || flags.schedule || flags.ads) {
    refreshTranscodeQueueOnly();
  }

  if (flags.scanInterval) {
    configureScanTimer();
  }
}

async function refreshChannels(options = {}) {
  const forceReconcile = options.forceReconcile === true;
  const rescanOnStartup = options.rescanOnStartup === true;
  channels = await channelRepository.rescanAll({ forceReconcile, rescanOnStartup });
  const config = getConfig();
  adsLibrary = await loadAdsLibrary(config);
  globalTestCardPath = resolveConfiguredTestPatternPath(config.testPattern?.path, projectRoot);

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

  const libraryLabel = 'library database';
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

app.get('/api/settings/public', (_req, res) => {
  const config = getConfig();
  res.json({
    title: config.ui?.title || 'The Box',
    defaultPage: config.ui?.defaultPage ?? 100,
    timezone: config.schedule?.timezone || 'Europe/London',
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    channels: channels.length,
    settingsSource: 'database',
    appSettingsKeyCount: settingsRuntime.settingsKeyCount,
    listenHost: getListen().host,
    listenPort: getListen().port,
    listenPortSource: getListen().portSource,
    listenHostSource: getListen().hostSource,
    legacyJsonKeysIgnored: bootstrap.legacyJsonKeysIgnored,
    library: {
      mode: 'database',
      databasePath: libraryRuntime.dbConnection?.path || null,
      schedulesCached: scheduleService.enabled,
      slimCatalogue: true,
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

  const listVideos = req.query.videos === '1' || req.query.videos === 'true';
  const limit = Number.parseInt(req.query.limit, 10);
  const offset = Number.parseInt(req.query.offset, 10) || 0;

  if (listVideos || Number.isFinite(limit)) {
    payload.videos = mediaCatalogue.listProgrammeSummaries(channel.id, {
      limit: Number.isFinite(limit) ? limit : 100,
      offset,
    });
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
      timezone: getConfig().schedule.timezone,
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

    const unplayableCount = channel.unplayableProgrammeCount || 0;

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
    date: getDateKey(date, getConfig().schedule.timezone),
    channels: scheduleService.generateGuide(channels, scheduleOptions(date)),
  });
});

app.get('/api/admin/library', requireDatabaseAdmin, (_req, res) => {
  res.json({
    mode: 'database',
    databasePath: libraryRuntime.dbConnection.path,
    schedulesCached: scheduleService.enabled,
    slimCatalogue: Boolean(mediaCatalogue),
  });
});

app.get('/api/admin/settings', requireDatabaseAdmin, (_req, res) => {
  const listen = getListen();
  res.json({
    settings: getConfig(),
    listen: {
      host: listen.host,
      port: listen.port,
      portSource: listen.portSource,
      hostSource: listen.hostSource,
      envOverrides: listen.envOverrides,
      databaseHost: getConfig().host,
      databasePort: getConfig().port,
    },
  });
});

app.put('/api/admin/settings', requireDatabaseAdmin, async (req, res) => {
  const patch = req.body?.settings ?? req.body;
  const result = prepareSettingsUpdate(getConfig(), patch);

  if (!result.ok) {
    res.status(400).json({ error: 'Validation failed', details: result.errors });
    return;
  }

  const db = libraryRuntime.dbConnection.db;
  db.transaction(() => {
    upsertSettingsRows(db, result.rows);
  })();

  const reloaded = reloadAppConfigFromDb(db);
  appConfig = reloaded.config;
  listenState = reloaded.listen;
  settingsRuntime.settingsKeyCount = reloaded.settingsKeyCount;

  await applySettingsInvalidation(result.changedKeys);

  const listen = getListen();
  const restartRequired =
    settingsChangeNeedsRestart(result.changedKeys)
    && ((result.changedKeys.includes('host') && !listen.envOverrides.host)
      || (result.changedKeys.includes('port') && !listen.envOverrides.port));

  res.json({
    settings: getConfig(),
    listen: {
      host: listen.host,
      port: listen.port,
      portSource: listen.portSource,
      hostSource: listen.hostSource,
      envOverrides: listen.envOverrides,
      databaseHost: getConfig().host,
      databasePort: getConfig().port,
    },
    restartRequired,
    changedKeys: result.changedKeys,
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
    res.status(503).json({ error: 'Channel rescan is unavailable.' });
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
const resolveMediaItem = (channel, filename, mediaType) =>
  mediaCatalogue.getMediaItem(channel.id, filename, mediaType);

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

  configureScanTimer();

  const config = getConfig();
  const listen = getListen();
  const server = app.listen(listen.port, listen.host, () => {
    console.log(`${config.ui.title} running at http://${listen.host}:${listen.port}`);
    if (listen.portSource === 'env' || listen.hostSource === 'env') {
      console.log(
        `Listen address from environment (HOST/PORT); database has host=${config.host} port=${config.port}.`,
      );
    }
    console.log(`Database: ${libraryRuntime.dbConnection.path}`);
    if (bootstrap.localConfigPath) {
      console.log(`Database path override: ${bootstrap.localConfigPath}`);
    }
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Port ${getListen().port} is already in use. Stop the other process or change port in Admin → Settings (or set PORT).`,
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
