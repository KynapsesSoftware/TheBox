const fs = require('fs');
const path = require('path');
const { resolveConfiguredTestPatternPath } = require('../testPattern');
const {
  normalizeDirectoryPath,
  parseAdsEnabled,
  parseIdentInterval,
  parseMaxContentDuration,
  parseMediaType,
  parseScanSubfolders,
  resolveSourcePath,
} = require('../scanner');
const {
  getAllChannelRows,
  getChannelRow,
  upsertChannelRow,
} = require('./channelDb');
const { getMediaStatsByChannel, parseSourcePathsJson } = require('./channelCatalogue');

const CHANNEL_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveOptionalPath(rawPath, projectRoot, { mustBeFile = false, mustBeDirectory = false } = {}) {
  if (rawPath === null || rawPath === undefined || rawPath === '') {
    return { path: null, error: null };
  }

  if (typeof rawPath !== 'string') {
    return { path: null, error: 'Path must be a string' };
  }

  const resolved = resolveSourcePath(rawPath, projectRoot)
    || resolveConfiguredTestPatternPath(rawPath, projectRoot);

  if (!resolved || !fs.existsSync(resolved)) {
    return { path: null, error: `Path not found: ${rawPath}` };
  }

  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (error) {
    return { path: null, error: error.message };
  }

  if (mustBeFile && !stat.isFile()) {
    return { path: null, error: `Must be a file: ${rawPath}` };
  }

  if (mustBeDirectory && !stat.isDirectory()) {
    return { path: null, error: `Must be a directory: ${rawPath}` };
  }

  return { path: resolved, error: null };
}

function normalizeSourcePathsInput(raw, projectRoot) {
  let paths = raw;

  if (typeof raw === 'string') {
    paths = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  if (!Array.isArray(paths)) {
    return { paths: null, error: 'sourcePaths must be an array of directory paths' };
  }

  if (paths.length === 0) {
    return { paths: null, error: 'At least one programme source path is required' };
  }

  const resolved = [];

  for (const entry of paths) {
    if (typeof entry !== 'string' || !entry.trim()) {
      continue;
    }

    const result = resolveOptionalPath(entry, projectRoot, { mustBeDirectory: true });
    if (result.error) {
      return { paths: null, error: result.error };
    }

    resolved.push(result.path);
  }

  if (resolved.length === 0) {
    return { paths: null, error: 'No valid programme source paths' };
  }

  return { paths: resolved, error: null };
}

function rowToAdminChannel(row, stats = {}) {
  const sourcePaths = parseSourcePathsJson(row.source_paths_json);

  return {
    id: row.id,
    displayName: row.display_name,
    pageNumber: row.page_number,
    color: row.color,
    mediaType: parseMediaType(row.media_type),
    sourcePaths,
    identPath: row.ident_path,
    testcardPath: row.testcard_path,
    artworkPath: row.artwork_path,
    schedule: {
      startTime: row.schedule_start,
      endTime: row.schedule_end,
    },
    maxContentDurationMinutes: row.max_content_duration_minutes,
    identInterval: row.ident_interval ?? 0,
    adsEnabled: row.ads_enabled === 1,
    scanSubfolders: row.scan_subfolders === 1,
    programmeCount: stats.programmeCount || 0,
    identCount: stats.identCount || 0,
    updatedAt: row.updated_at,
  };
}

function listAdminChannels(db) {
  const rows = getAllChannelRows(db);
  const statsByChannel = getMediaStatsByChannel(db);
  return rows.map((row) => rowToAdminChannel(row, statsByChannel.get(row.id)));
}

function getAdminChannel(db, channelId) {
  const row = getChannelRow(db, channelId);
  if (!row) {
    return null;
  }

  const stats = getMediaStatsByChannel(db).get(channelId) || {};
  return rowToAdminChannel(row, stats);
}

function validateAndBuildChannelRow(payload, projectRoot, { existingId = null } = {}) {
  const errors = [];

  let id = existingId;
  if (!existingId) {
    id = typeof payload.id === 'string' && payload.id.trim()
      ? payload.id.trim().toLowerCase()
      : slugify(payload.displayName || '');

    if (!id || !CHANNEL_ID_PATTERN.test(id)) {
      errors.push('id must be lowercase letters, numbers, and hyphens (e.g. comedy-2)');
    }
  }

  const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
  if (!displayName) {
    errors.push('displayName is required');
  }

  const sourceResult = normalizeSourcePathsInput(payload.sourcePaths, projectRoot);
  if (sourceResult.error) {
    errors.push(sourceResult.error);
  }

  let identPath = null;
  if (payload.identPath) {
    const identResult = resolveOptionalPath(payload.identPath, projectRoot, { mustBeDirectory: true });
    if (identResult.error) {
      errors.push(`identPath: ${identResult.error}`);
    } else {
      identPath = identResult.path;
    }
  }

  let testcardPath = null;
  if (payload.testcardPath) {
    const testResult = resolveOptionalPath(payload.testcardPath, projectRoot);
    if (testResult.error) {
      errors.push(`testcardPath: ${testResult.error}`);
    } else {
      testcardPath = testResult.path;
    }
  }

  let artworkPath = null;
  if (payload.artworkPath) {
    const artResult = resolveOptionalPath(payload.artworkPath, projectRoot, { mustBeFile: true });
    if (artResult.error) {
      errors.push(`artworkPath: ${artResult.error}`);
    } else {
      artworkPath = artResult.path;
    }
  }

  const mediaType = parseMediaType(payload.mediaType);
  if (mediaType === 'audio' && !artworkPath && payload.artworkPath) {
    errors.push('artworkPath must be a valid file for audio channels');
  }

  if (errors.length > 0) {
    return { errors };
  }

  const schedule = payload.schedule || {};

  return {
    row: {
      id,
      display_name: displayName,
      page_number: payload.pageNumber ?? null,
      color: typeof payload.color === 'string' && payload.color.trim() ? payload.color.trim() : 'cyan',
      media_type: mediaType,
      schedule_start: schedule.startTime || null,
      schedule_end: schedule.endTime || null,
      max_content_duration_minutes: parseMaxContentDuration(payload.maxContentDurationMinutes),
      ident_interval: parseIdentInterval(payload.identInterval),
      ads_enabled: parseAdsEnabled(payload.adsEnabled) ? 1 : 0,
      scan_subfolders: parseScanSubfolders(payload.scanSubfolders) ? 1 : 0,
      source_paths_json: JSON.stringify(sourceResult.paths.map((p) => normalizeDirectoryPath(p))),
      ident_path: identPath,
      testcard_path: testcardPath,
      artwork_path: artworkPath,
    },
    sourcePaths: sourceResult.paths,
  };
}

function createAdminChannel(db, payload, projectRoot) {
  const built = validateAndBuildChannelRow(payload, projectRoot);
  if (built.errors) {
    return { ok: false, errors: built.errors };
  }

  if (getChannelRow(db, built.row.id)) {
    return { ok: false, errors: [`Channel id "${built.row.id}" already exists`] };
  }

  upsertChannelRow(db, built.row);
  return { ok: true, channel: getAdminChannel(db, built.row.id) };
}

function updateAdminChannel(db, channelId, payload, projectRoot) {
  const existing = getChannelRow(db, channelId);
  if (!existing) {
    return { ok: false, errors: ['Channel not found'] };
  }

  const merged = {
    id: channelId,
    displayName: payload.displayName ?? existing.display_name,
    pageNumber: payload.pageNumber !== undefined ? payload.pageNumber : existing.page_number,
    color: payload.color ?? existing.color,
    mediaType: payload.mediaType ?? existing.media_type,
    sourcePaths: payload.sourcePaths ?? parseSourcePathsJson(existing.source_paths_json),
    identPath: payload.identPath !== undefined ? payload.identPath : existing.ident_path,
    testcardPath: payload.testcardPath !== undefined ? payload.testcardPath : existing.testcard_path,
    artworkPath: payload.artworkPath !== undefined ? payload.artworkPath : existing.artwork_path,
    schedule: {
      startTime: payload.schedule?.startTime ?? existing.schedule_start,
      endTime: payload.schedule?.endTime ?? existing.schedule_end,
    },
    maxContentDurationMinutes: payload.maxContentDurationMinutes !== undefined
      ? payload.maxContentDurationMinutes
      : existing.max_content_duration_minutes,
    identInterval: payload.identInterval !== undefined ? payload.identInterval : existing.ident_interval,
    adsEnabled: payload.adsEnabled !== undefined ? payload.adsEnabled : existing.ads_enabled === 1,
    scanSubfolders: payload.scanSubfolders !== undefined
      ? payload.scanSubfolders
      : existing.scan_subfolders === 1,
  };

  const built = validateAndBuildChannelRow(merged, projectRoot, { existingId: channelId });
  if (built.errors) {
    return { ok: false, errors: built.errors };
  }

  built.row.id = channelId;
  upsertChannelRow(db, built.row);

  const scheduleAffecting = JSON.stringify(parseSourcePathsJson(existing.source_paths_json))
    !== built.row.source_paths_json
    || existing.ident_path !== built.row.ident_path
    || existing.schedule_start !== built.row.schedule_start
    || existing.schedule_end !== built.row.schedule_end
    || existing.max_content_duration_minutes !== built.row.max_content_duration_minutes
    || existing.ident_interval !== built.row.ident_interval
    || existing.ads_enabled !== built.row.ads_enabled
    || existing.scan_subfolders !== built.row.scan_subfolders;

  return {
    ok: true,
    channel: getAdminChannel(db, channelId),
    scheduleAffecting,
    pathsAffectingMedia: built.row.source_paths_json !== existing.source_paths_json
      || existing.ident_path !== built.row.ident_path,
  };
}

function deleteAdminChannel(db, channelId) {
  const existing = getChannelRow(db, channelId);
  if (!existing) {
    return { ok: false, errors: ['Channel not found'] };
  }

  db.prepare('DELETE FROM channels WHERE id = ?').run(channelId);
  return { ok: true };
}

function channelPathsChanged(existingRow, newRow) {
  return existingRow.source_paths_json !== newRow.source_paths_json
    || existingRow.ident_path !== newRow.ident_path;
}

module.exports = {
  createAdminChannel,
  deleteAdminChannel,
  getAdminChannel,
  listAdminChannels,
  updateAdminChannel,
};
