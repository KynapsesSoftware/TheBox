const fs = require('fs');
const path = require('path');
const { probeDurationSeconds, displayTitleFromFilename } = require('../metadata');
const {
  assignUniqueRootSlugs,
  normalizeDirectoryPath,
  parseMediaType,
  scanChannels,
} = require('../scanner');
const { computeCacheKey } = require('../transcode/cache');
const { analyzePlaybackProbe } = require('../transcode/probe');
const { enumerateMediaFilesFromDirectory } = require('./enumerateMedia');
const {
  deleteChannelMedia,
  deleteMediaNotInSet,
  getAllChannelRows,
  getMediaRow,
  getMediaRows,
  upsertChannelRow,
  upsertMediaRow,
} = require('./channelDb');

function buildSourcePathsJson(channel, channelDir) {
  if (Array.isArray(channel.sourcePaths) && channel.sourcePaths.length > 0) {
    return JSON.stringify(channel.sourcePaths);
  }

  if (channel.sourcePath) {
    return JSON.stringify([channel.sourcePath]);
  }

  return JSON.stringify([channelDir]);
}

function channelRowFromScan(channel, channelDir) {
  const identDir = path.join(channelDir, 'ident');
  let identPath = null;

  if (fs.existsSync(identDir)) {
    try {
      if (fs.statSync(identDir).isDirectory()) {
        identPath = identDir;
      }
    } catch {
      identPath = null;
    }
  }

  return {
    id: channel.id,
    display_name: channel.displayName,
    page_number: channel.pageNumber,
    color: channel.color,
    media_type: channel.mediaType,
    schedule_start: channel.schedule?.startTime || null,
    schedule_end: channel.schedule?.endTime || null,
    max_content_duration_minutes: channel.maxContentDuration,
    ident_interval: channel.identInterval ?? 0,
    ads_enabled: channel.adsEnabled ? 1 : 0,
    scan_subfolders: channel.scanSubfolders ? 1 : 0,
    source_paths_json: buildSourcePathsJson(channel, channelDir),
    ident_path: identPath,
    testcard_path: channel.testCardPath,
    artwork_path: channel.artworkPath,
    folder_name: channel.folderName,
  };
}

function mediaRowFromVideo(channelId, kind, video, extras = {}) {
  return {
    channel_id: channelId,
    kind,
    filename: video.filename,
    source_path: video.path,
    title: video.title,
    duration_seconds: video.durationSeconds ?? null,
    size_bytes: extras.sizeBytes ?? 0,
    mtime_ms: extras.mtimeMs ?? 0,
    cache_key: extras.cacheKey ?? null,
    needs_transcode: extras.needsTranscode == null ? null : extras.needsTranscode ? 1 : 0,
    transcode_probe_json: extras.transcodeProbeJson ?? null,
  };
}

async function persistScannedChannel(db, channel, channelDir, transcodeSettings) {
  upsertChannelRow(db, channelRowFromScan(channel, channelDir));

  deleteChannelMedia(db, channel.id);

  for (const video of channel.videos) {
    let cacheKey = null;
    try {
      cacheKey = computeCacheKey(video.path);
    } catch {
      cacheKey = null;
    }

    let stat = { size: 0, mtimeMs: 0 };
    try {
      stat = fs.statSync(video.path);
    } catch {
      // keep defaults
    }

    let needsTranscode = null;
    let transcodeProbeJson = null;

    if (
      transcodeSettings?.enabled
      && channel.mediaType !== 'audio'
      && video.durationSeconds
    ) {
      const analysis = await analyzePlaybackProbe(video.path, transcodeSettings);
      needsTranscode = analysis.needsTranscode;
      transcodeProbeJson = analysis.transcodeProbe
        ? JSON.stringify(analysis.transcodeProbe)
        : null;
    }

    upsertMediaRow(
      db,
      mediaRowFromVideo(channel.id, 'programme', video, {
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
        cacheKey,
        needsTranscode,
        transcodeProbeJson,
      }),
    );
  }

  for (const ident of channel.idents) {
    let cacheKey = null;
    try {
      cacheKey = computeCacheKey(ident.path);
    } catch {
      cacheKey = null;
    }

    let stat = { size: 0, mtimeMs: 0 };
    try {
      stat = fs.statSync(ident.path);
    } catch {
      // keep defaults
    }

    upsertMediaRow(
      db,
      mediaRowFromVideo(channel.id, 'ident', ident, {
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
        cacheKey,
      }),
    );
  }
}

async function importFromChannelsRoot(db, { channelsRoot, scanOptions, projectRoot, transcodeSettings }) {
  const scanned = await scanChannels(channelsRoot, scanOptions, projectRoot);

  for (const channel of scanned) {
    const channelDir = path.join(channelsRoot, channel.folderName);
    await persistScannedChannel(db, channel, channelDir, transcodeSettings);
  }

  return scanned.length;
}

function parseSourcePathsJson(sourcePathsJson) {
  try {
    const parsed = JSON.parse(sourcePathsJson || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function programmeSourcesFromChannelRow(row, channelsRoot) {
  const paths = parseSourcePathsJson(row.source_paths_json);
  if (paths.length === 0) {
    return [];
  }

  if (paths.length === 1) {
    const channelFolderPath = row.folder_name && channelsRoot
      ? normalizeDirectoryPath(path.join(channelsRoot, row.folder_name))
      : null;
    const isChannelRoot = channelFolderPath
      && normalizeDirectoryPath(paths[0]) === channelFolderPath;

    return [{
      path: paths[0],
      filenamePrefix: '',
      excludeDirNames: isChannelRoot ? new Set(['ident']) : new Set(),
    }];
  }

  const labeled = assignUniqueRootSlugs(paths);

  return labeled.map(({ absolutePath, slug }) => ({
    path: absolutePath,
    filenamePrefix: `${slug}/`,
    excludeDirNames: new Set(),
  }));
}

function extensionsForRow(row, scanOptions) {
  const mediaType = parseMediaType(row.media_type);
  return mediaType === 'audio' ? scanOptions.audioExtensions : scanOptions.videoExtensions;
}

async function resolveMediaProbe(
  channelId,
  kind,
  entry,
  existingRow,
  transcodeSettings,
  mediaType,
) {
  let cacheKey;
  try {
    cacheKey = computeCacheKey(entry.path);
  } catch {
    cacheKey = null;
  }

  if (
    existingRow
    && existingRow.size_bytes === entry.sizeBytes
    && existingRow.mtime_ms === entry.mtimeMs
    && existingRow.cache_key === cacheKey
    && existingRow.duration_seconds != null
  ) {
    return {
      filename: entry.filename,
      title: existingRow.title,
      path: entry.path,
      durationSeconds: existingRow.duration_seconds,
      cacheKey,
      needsTranscode: existingRow.needs_transcode,
      transcodeProbeJson: existingRow.transcode_probe_json,
      sizeBytes: entry.sizeBytes,
      mtimeMs: entry.mtimeMs,
      skippedProbe: true,
    };
  }

  const durationSeconds = await probeDurationSeconds(entry.path);
  const title = displayTitleFromFilename(entry.basename);

  let needsTranscode = null;
  let transcodeProbeJson = null;

  if (transcodeSettings?.enabled && mediaType !== 'audio' && durationSeconds) {
    const analysis = await analyzePlaybackProbe(entry.path, transcodeSettings);
    needsTranscode = analysis.needsTranscode;
    transcodeProbeJson = analysis.transcodeProbe
      ? JSON.stringify(analysis.transcodeProbe)
      : null;
  }

  return {
    filename: entry.filename,
    title,
    path: entry.path,
    durationSeconds,
    cacheKey,
    needsTranscode,
    transcodeProbeJson,
    sizeBytes: entry.sizeBytes,
    mtimeMs: entry.mtimeMs,
    skippedProbe: false,
  };
}

async function reconcileChannelMedia(db, row, { scanOptions, channelsRoot, transcodeSettings }) {
  const channelId = row.id;
  const extensions = extensionsForRow(row, scanOptions);
  const mediaType = parseMediaType(row.media_type);
  const recursive = row.scan_subfolders === 1;
  const programmeFilenames = [];

  const programmeSources = programmeSourcesFromChannelRow(row, channelsRoot);

  for (const source of programmeSources) {
    const entries = enumerateMediaFilesFromDirectory(source.path, extensions, {
      recursive,
      excludeDirNames: source.excludeDirNames,
      channelId,
      filenamePrefix: source.filenamePrefix,
    });

    for (const entry of entries) {
      programmeFilenames.push(entry.filename);
      const existingRow = getMediaRow(db, channelId, 'programme', entry.filename);
      const probed = await resolveMediaProbe(
        channelId,
        'programme',
        entry,
        existingRow,
        transcodeSettings,
        mediaType,
      );

      upsertMediaRow(
        db,
        mediaRowFromVideo(channelId, 'programme', probed, {
          sizeBytes: probed.sizeBytes,
          mtimeMs: probed.mtimeMs,
          cacheKey: probed.cacheKey,
          needsTranscode: probed.needsTranscode,
          transcodeProbeJson: probed.transcodeProbeJson,
        }),
      );
    }
  }

  deleteMediaNotInSet(db, channelId, 'programme', programmeFilenames);

  const identFilenames = [];

  if (row.ident_path) {
    const identEntries = enumerateMediaFilesFromDirectory(row.ident_path, extensions, {
      recursive: false,
      excludeDirNames: new Set(),
      channelId,
      filenamePrefix: '',
    });

    for (const entry of identEntries) {
      identFilenames.push(entry.filename);
      const existingRow = getMediaRow(db, channelId, 'ident', entry.filename);
      const probed = await resolveMediaProbe(
        channelId,
        'ident',
        entry,
        existingRow,
        null,
        mediaType,
      );

      upsertMediaRow(
        db,
        mediaRowFromVideo(channelId, 'ident', probed, {
          sizeBytes: probed.sizeBytes,
          mtimeMs: probed.mtimeMs,
          cacheKey: probed.cacheKey,
        }),
      );
    }
  }

  deleteMediaNotInSet(db, channelId, 'ident', identFilenames);
}

function mediaRowToRuntimeVideo(row) {
  let transcodeProbe = null;

  if (row.transcode_probe_json) {
    try {
      transcodeProbe = JSON.parse(row.transcode_probe_json);
    } catch {
      transcodeProbe = null;
    }
  }

  return {
    filename: row.filename,
    title: row.title,
    path: row.source_path,
    durationSeconds: row.duration_seconds,
    cacheKey: row.cache_key,
    needsTranscode: row.needs_transcode == null ? undefined : row.needs_transcode === 1,
    transcodeProbe,
    catalogueFromDb: true,
  };
}

function getMediaStatsByChannel(db) {
  const rows = db.prepare(`
    SELECT
      channel_id,
      kind,
      COUNT(*) AS item_count,
      SUM(CASE WHEN duration_seconds IS NULL OR duration_seconds <= 0 THEN 1 ELSE 0 END) AS unplayable_count,
      SUM(COALESCE(duration_seconds, 0)) AS total_duration
    FROM media_files
    GROUP BY channel_id, kind
  `).all();

  const statsByChannel = new Map();

  for (const row of rows) {
    if (!statsByChannel.has(row.channel_id)) {
      statsByChannel.set(row.channel_id, {
        programmeCount: 0,
        identCount: 0,
        unplayableProgrammeCount: 0,
        totalDurationSeconds: 0,
      });
    }

    const stats = statsByChannel.get(row.channel_id);

    if (row.kind === 'programme') {
      stats.programmeCount = row.item_count;
      stats.unplayableProgrammeCount = row.unplayable_count;
      stats.totalDurationSeconds = row.total_duration;
    } else if (row.kind === 'ident') {
      stats.identCount = row.item_count;
    }
  }

  return statsByChannel;
}

function channelRowToSlimRuntime(row, stats = {}) {
  const sourcePaths = parseSourcePathsJson(row.source_paths_json);

  return {
    id: row.id,
    folderName: row.folder_name,
    displayName: row.display_name,
    pageNumber: row.page_number,
    color: row.color,
    mediaType: parseMediaType(row.media_type),
    artworkPath: row.artwork_path,
    testCardPath: row.testcard_path,
    sourcePath: sourcePaths[0] || null,
    sourcePaths,
    scanSubfolders: row.scan_subfolders === 1,
    maxContentDuration: row.max_content_duration_minutes,
    identInterval: row.ident_interval ?? 0,
    adsEnabled: row.ads_enabled === 1,
    schedule: {
      startTime: row.schedule_start,
      endTime: row.schedule_end,
    },
    videos: [],
    idents: [],
    catalogueInDb: true,
    programmeCount: stats.programmeCount || 0,
    identCount: stats.identCount || 0,
    unplayableProgrammeCount: stats.unplayableProgrammeCount || 0,
    totalDurationSeconds: stats.totalDurationSeconds || 0,
  };
}

function channelRowToRuntime(row, mediaRows) {
  const sourcePaths = parseSourcePathsJson(row.source_paths_json);
  const programmes = mediaRows
    .filter((item) => item.kind === 'programme')
    .map(mediaRowToRuntimeVideo);
  const idents = mediaRows
    .filter((item) => item.kind === 'ident')
    .map(mediaRowToRuntimeVideo);

  return {
    id: row.id,
    folderName: row.folder_name,
    displayName: row.display_name,
    pageNumber: row.page_number,
    color: row.color,
    mediaType: parseMediaType(row.media_type),
    artworkPath: row.artwork_path,
    testCardPath: row.testcard_path,
    sourcePath: sourcePaths[0] || null,
    sourcePaths,
    scanSubfolders: row.scan_subfolders === 1,
    maxContentDuration: row.max_content_duration_minutes,
    identInterval: row.ident_interval ?? 0,
    adsEnabled: row.ads_enabled === 1,
    schedule: {
      startTime: row.schedule_start,
      endTime: row.schedule_end,
    },
    videos: programmes,
    idents,
  };
}

function hydrateAllChannels(db) {
  const rows = getAllChannelRows(db);
  return rows.map((row) => {
    const mediaRows = getMediaRows(db, row.id);
    return channelRowToRuntime(row, mediaRows);
  });
}

function hydrateAllChannelsSlim(db) {
  const rows = getAllChannelRows(db);
  const statsByChannel = getMediaStatsByChannel(db);

  return rows.map((row) => channelRowToSlimRuntime(row, statsByChannel.get(row.id)));
}

module.exports = {
  channelRowToRuntime,
  channelRowToSlimRuntime,
  getMediaStatsByChannel,
  hydrateAllChannels,
  hydrateAllChannelsSlim,
  importFromChannelsRoot,
  mediaRowToRuntimeVideo,
  parseSourcePathsJson,
  persistScannedChannel,
  reconcileChannelMedia,
};
