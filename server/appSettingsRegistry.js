const { DEFAULT_CONFIG } = require('./config');

const META_SETTINGS_IMPORTED = 'meta.settingsImportedFromJson';

const REGISTRY_KEYS = [
  'host',
  'port',
  'scanIntervalMinutes',
  'videoExtensions',
  'audioExtensions',
  'schedule.timezone',
  'schedule.seedBy',
  'schedule.hoursToGenerate',
  'schedule.defaultStartTime',
  'schedule.defaultEndTime',
  'ui.title',
  'ui.defaultPage',
  'ads.enabled',
  'ads.path',
  'ads.breakMinAds',
  'ads.breakMaxAds',
  'ads.intervalMinutes',
  'ads.intervalJitterMinutes',
  'ads.programEndGuardMinutes',
  'testPattern.path',
  'transcode.enabled',
  'transcode.cachePath',
  'transcode.maxConcurrentJobs',
  'transcode.videoCodec',
  'transcode.audioCodec',
  'transcode.maxHeight',
  'transcode.preset',
  'transcode.scheduleAheadDays',
  'transcode.nativeVideoCodecs',
  'transcode.nativeAudioCodecs',
  'transcode.probeExtensions',
  'library.rescanOnStartup',
];

const JSON_ARRAY_KEYS = new Set([
  'videoExtensions',
  'audioExtensions',
  'transcode.nativeVideoCodecs',
  'transcode.nativeAudioCodecs',
  'transcode.probeExtensions',
]);

const BOOLEAN_KEYS = new Set([
  'ads.enabled',
  'transcode.enabled',
  'library.rescanOnStartup',
]);

const INTEGER_KEYS = new Set([
  'port',
  'scanIntervalMinutes',
  'schedule.hoursToGenerate',
  'ui.defaultPage',
  'ads.breakMinAds',
  'ads.breakMaxAds',
  'ads.intervalMinutes',
  'ads.intervalJitterMinutes',
  'ads.programEndGuardMinutes',
  'transcode.maxConcurrentJobs',
  'transcode.maxHeight',
  'transcode.scheduleAheadDays',
]);

function defaultRowsFromSeed() {
  const c = DEFAULT_CONFIG;
  return {
    host: String(c.host),
    port: String(c.port),
    scanIntervalMinutes: String(c.scanIntervalMinutes),
    videoExtensions: JSON.stringify(c.videoExtensions),
    audioExtensions: JSON.stringify(c.audioExtensions),
    'schedule.timezone': String(c.schedule.timezone),
    'schedule.seedBy': String(c.schedule.seedBy),
    'schedule.hoursToGenerate': String(c.schedule.hoursToGenerate),
    'schedule.defaultStartTime': String(c.schedule.defaultStartTime),
    'schedule.defaultEndTime': String(c.schedule.defaultEndTime),
    'ui.title': String(c.ui.title),
    'ui.defaultPage': String(c.ui.defaultPage),
    'ads.enabled': c.ads.enabled ? 'true' : 'false',
    'ads.path': String(c.ads.path || ''),
    'ads.breakMinAds': String(c.ads.breakMinAds),
    'ads.breakMaxAds': String(c.ads.breakMaxAds),
    'ads.intervalMinutes': String(c.ads.intervalMinutes),
    'ads.intervalJitterMinutes': String(c.ads.intervalJitterMinutes),
    'ads.programEndGuardMinutes': String(c.ads.programEndGuardMinutes),
    'testPattern.path': String(c.testPattern.path || ''),
    'transcode.enabled': c.transcode.enabled ? 'true' : 'false',
    'transcode.cachePath': String(c.transcode.cachePath || ''),
    'transcode.maxConcurrentJobs': String(c.transcode.maxConcurrentJobs),
    'transcode.videoCodec': String(c.transcode.videoCodec),
    'transcode.audioCodec': String(c.transcode.audioCodec),
    'transcode.maxHeight': String(c.transcode.maxHeight),
    'transcode.preset': String(c.transcode.preset),
    'transcode.scheduleAheadDays': String(c.transcode.scheduleAheadDays),
    'transcode.nativeVideoCodecs': JSON.stringify(c.transcode.nativeVideoCodecs),
    'transcode.nativeAudioCodecs': JSON.stringify(c.transcode.nativeAudioCodecs),
    'transcode.probeExtensions': JSON.stringify(c.transcode.probeExtensions),
    'library.rescanOnStartup': c.library.rescanOnStartup ? 'true' : 'false',
  };
}

function flattenConfigToRows(config) {
  return flattenLegacyMergedConfig({
    ...config,
    library: config.library,
  });
}

function flattenLegacyMergedConfig(merged) {
  const c = merged;
  const rows = defaultRowsFromSeed();

  if (c.host !== undefined) rows.host = String(c.host);
  if (c.port !== undefined) rows.port = String(c.port);
  if (c.scanIntervalMinutes !== undefined) rows.scanIntervalMinutes = String(c.scanIntervalMinutes);
  if (c.videoExtensions) rows.videoExtensions = JSON.stringify(c.videoExtensions);
  if (c.audioExtensions) rows.audioExtensions = JSON.stringify(c.audioExtensions);

  if (c.schedule) {
    if (c.schedule.timezone !== undefined) rows['schedule.timezone'] = String(c.schedule.timezone);
    if (c.schedule.seedBy !== undefined) rows['schedule.seedBy'] = String(c.schedule.seedBy);
    if (c.schedule.hoursToGenerate !== undefined) {
      rows['schedule.hoursToGenerate'] = String(c.schedule.hoursToGenerate);
    }
    if (c.schedule.defaultStartTime !== undefined) {
      rows['schedule.defaultStartTime'] = String(c.schedule.defaultStartTime);
    }
    if (c.schedule.defaultEndTime !== undefined) {
      rows['schedule.defaultEndTime'] = String(c.schedule.defaultEndTime);
    }
  }

  if (c.ui) {
    if (c.ui.title !== undefined) rows['ui.title'] = String(c.ui.title);
    if (c.ui.defaultPage !== undefined) rows['ui.defaultPage'] = String(c.ui.defaultPage);
  }

  if (c.ads) {
    if (c.ads.enabled !== undefined) rows['ads.enabled'] = c.ads.enabled ? 'true' : 'false';
    if (c.ads.path !== undefined) rows['ads.path'] = String(c.ads.path);
    if (c.ads.breakMinAds !== undefined) rows['ads.breakMinAds'] = String(c.ads.breakMinAds);
    if (c.ads.breakMaxAds !== undefined) rows['ads.breakMaxAds'] = String(c.ads.breakMaxAds);
    if (c.ads.intervalMinutes !== undefined) rows['ads.intervalMinutes'] = String(c.ads.intervalMinutes);
    if (c.ads.intervalJitterMinutes !== undefined) {
      rows['ads.intervalJitterMinutes'] = String(c.ads.intervalJitterMinutes);
    }
    if (c.ads.programEndGuardMinutes !== undefined) {
      rows['ads.programEndGuardMinutes'] = String(c.ads.programEndGuardMinutes);
    }
  }

  if (c.testPattern?.path !== undefined) {
    rows['testPattern.path'] = String(c.testPattern.path);
  }

  if (c.transcode) {
    const t = c.transcode;
    if (t.enabled !== undefined) rows['transcode.enabled'] = t.enabled ? 'true' : 'false';
    if (t.cachePath !== undefined) rows['transcode.cachePath'] = String(t.cachePath);
    if (t.maxConcurrentJobs !== undefined) rows['transcode.maxConcurrentJobs'] = String(t.maxConcurrentJobs);
    if (t.videoCodec !== undefined) rows['transcode.videoCodec'] = String(t.videoCodec);
    if (t.audioCodec !== undefined) rows['transcode.audioCodec'] = String(t.audioCodec);
    if (t.maxHeight !== undefined) rows['transcode.maxHeight'] = String(t.maxHeight);
    if (t.preset !== undefined) rows['transcode.preset'] = String(t.preset);
    if (t.scheduleAheadDays !== undefined) rows['transcode.scheduleAheadDays'] = String(t.scheduleAheadDays);
    if (t.nativeVideoCodecs) rows['transcode.nativeVideoCodecs'] = JSON.stringify(t.nativeVideoCodecs);
    if (t.nativeAudioCodecs) rows['transcode.nativeAudioCodecs'] = JSON.stringify(t.nativeAudioCodecs);
    if (t.probeExtensions) rows['transcode.probeExtensions'] = JSON.stringify(t.probeExtensions);
  }

  if (c.library) {
    if (c.library.rescanOnStartup !== undefined) {
      rows['library.rescanOnStartup'] = c.library.rescanOnStartup ? 'true' : 'false';
    }
  }

  return rows;
}

function parseJsonArray(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function configObjectFromRows(rows) {
  const port = Number.parseInt(rows.port, 10);

  return {
    host: rows.host || DEFAULT_CONFIG.host,
    port: Number.isFinite(port) ? port : DEFAULT_CONFIG.port,
    scanIntervalMinutes: Number.parseInt(rows.scanIntervalMinutes, 10) || 0,
    videoExtensions: parseJsonArray(rows.videoExtensions, DEFAULT_CONFIG.videoExtensions),
    audioExtensions: parseJsonArray(rows.audioExtensions, DEFAULT_CONFIG.audioExtensions),
    schedule: {
      timezone: rows['schedule.timezone'] || DEFAULT_CONFIG.schedule.timezone,
      seedBy: rows['schedule.seedBy'] || DEFAULT_CONFIG.schedule.seedBy,
      hoursToGenerate:
        Number.parseInt(rows['schedule.hoursToGenerate'], 10) || DEFAULT_CONFIG.schedule.hoursToGenerate,
      defaultStartTime: rows['schedule.defaultStartTime'] || DEFAULT_CONFIG.schedule.defaultStartTime,
      defaultEndTime: rows['schedule.defaultEndTime'] || DEFAULT_CONFIG.schedule.defaultEndTime,
    },
    ui: {
      title: rows['ui.title'] || DEFAULT_CONFIG.ui.title,
      defaultPage: Number.parseInt(rows['ui.defaultPage'], 10) || DEFAULT_CONFIG.ui.defaultPage,
    },
    ads: {
      enabled: rows['ads.enabled'] === 'true',
      path: rows['ads.path'] || '',
      breakMinAds: Number.parseInt(rows['ads.breakMinAds'], 10) || DEFAULT_CONFIG.ads.breakMinAds,
      breakMaxAds: Number.parseInt(rows['ads.breakMaxAds'], 10) || DEFAULT_CONFIG.ads.breakMaxAds,
      intervalMinutes:
        Number.parseInt(rows['ads.intervalMinutes'], 10) || DEFAULT_CONFIG.ads.intervalMinutes,
      intervalJitterMinutes:
        Number.parseInt(rows['ads.intervalJitterMinutes'], 10) || DEFAULT_CONFIG.ads.intervalJitterMinutes,
      programEndGuardMinutes:
        Number.parseInt(rows['ads.programEndGuardMinutes'], 10)
        || DEFAULT_CONFIG.ads.programEndGuardMinutes,
    },
    testPattern: {
      path: rows['testPattern.path'] || '',
    },
    transcode: {
      enabled: rows['transcode.enabled'] === 'true',
      cachePath: rows['transcode.cachePath'] || '',
      maxConcurrentJobs:
        Number.parseInt(rows['transcode.maxConcurrentJobs'], 10)
        || DEFAULT_CONFIG.transcode.maxConcurrentJobs,
      videoCodec: rows['transcode.videoCodec'] || DEFAULT_CONFIG.transcode.videoCodec,
      audioCodec: rows['transcode.audioCodec'] || DEFAULT_CONFIG.transcode.audioCodec,
      maxHeight: Number.parseInt(rows['transcode.maxHeight'], 10) || DEFAULT_CONFIG.transcode.maxHeight,
      preset: rows['transcode.preset'] || DEFAULT_CONFIG.transcode.preset,
      scheduleAheadDays:
        Number.parseInt(rows['transcode.scheduleAheadDays'], 10)
        || DEFAULT_CONFIG.transcode.scheduleAheadDays,
      nativeVideoCodecs: parseJsonArray(
        rows['transcode.nativeVideoCodecs'],
        DEFAULT_CONFIG.transcode.nativeVideoCodecs,
      ),
      nativeAudioCodecs: parseJsonArray(
        rows['transcode.nativeAudioCodecs'],
        DEFAULT_CONFIG.transcode.nativeAudioCodecs,
      ),
      probeExtensions: parseJsonArray(
        rows['transcode.probeExtensions'],
        DEFAULT_CONFIG.transcode.probeExtensions,
      ),
    },
    library: {
      rescanOnStartup: rows['library.rescanOnStartup'] === 'true',
    },
  };
}

function resolveListenAddress(config) {
  const envPort = process.env.PORT;
  const envHost = process.env.HOST;

  let port = config.port;
  let host = config.host;
  let portSource = 'db';
  let hostSource = 'db';

  if (envPort !== undefined && envPort !== '') {
    const parsed = Number.parseInt(envPort, 10);
    if (Number.isFinite(parsed)) {
      port = parsed;
      portSource = 'env';
    }
  }

  if (envHost !== undefined && envHost !== '') {
    host = envHost;
    hostSource = 'env';
  }

  return {
    host,
    port,
    portSource,
    hostSource,
    envOverrides: {
      host: hostSource === 'env',
      port: portSource === 'env',
    },
  };
}

function flattenPatchToRows(patch) {
  const rows = {};
  const unknown = [];

  function walk(prefix, value) {
    if (value === undefined) {
      return;
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, nested] of Object.entries(value)) {
        walk(prefix ? `${prefix}.${key}` : key, nested);
      }
      return;
    }

    const fullKey = prefix;
    if (!REGISTRY_KEYS.includes(fullKey)) {
      unknown.push(fullKey);
      return;
    }

    if (JSON_ARRAY_KEYS.has(fullKey)) {
      rows[fullKey] = JSON.stringify(Array.isArray(value) ? value : []);
    } else if (BOOLEAN_KEYS.has(fullKey)) {
      rows[fullKey] = value === true || value === 'true' ? 'true' : 'false';
    } else if (INTEGER_KEYS.has(fullKey)) {
      rows[fullKey] = String(value);
    } else {
      rows[fullKey] = String(value ?? '');
    }
  }

  walk('', patch);
  return { rows, unknown };
}

function mergeSettingsPatch(current, patch) {
  const next = JSON.parse(JSON.stringify(current));

  for (const [key, value] of Object.entries(patch || {})) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = { ...(next[key] || {}), ...value };
    } else {
      next[key] = value;
    }
  }

  return next;
}

module.exports = {
  BOOLEAN_KEYS,
  INTEGER_KEYS,
  JSON_ARRAY_KEYS,
  META_SETTINGS_IMPORTED,
  REGISTRY_KEYS,
  configObjectFromRows,
  defaultRowsFromSeed,
  flattenConfigToRows,
  flattenLegacyMergedConfig,
  flattenPatchToRows,
  mergeSettingsPatch,
  resolveListenAddress,
};
