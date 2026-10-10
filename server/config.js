const fs = require('fs');
const path = require('path');

const DEFAULT_DATABASE_PATH = './database/thebox.db';

const DEFAULT_CONFIG = {
  host: '0.0.0.0',
  port: 8080,
  videoExtensions: ['.mp4', '.mkv', '.webm', '.mov', '.avi'],
  audioExtensions: ['.mp3', '.flac', '.ogg', '.m4a', '.wav', '.aac'],
  scanIntervalMinutes: 60,
  schedule: {
    timezone: 'Europe/London',
    seedBy: 'day',
    hoursToGenerate: 24,
    defaultStartTime: '00:00',
    defaultEndTime: '24:00',
  },
  ui: {
    title: 'The Box',
    defaultPage: 100,
  },
  ads: {
    enabled: false,
    path: '',
    breakMinAds: 1,
    breakMaxAds: 3,
    intervalMinutes: 15,
    intervalJitterMinutes: 3,
    programEndGuardMinutes: 5,
  },
  testPattern: {
    path: '',
  },
  transcode: {
    enabled: false,
    cachePath: '',
    maxConcurrentJobs: 1,
    videoCodec: 'h264',
    audioCodec: 'aac',
    maxHeight: 720,
    preset: 'veryfast',
    scheduleAheadDays: 1,
    nativeVideoCodecs: ['h264'],
    nativeAudioCodecs: ['aac', 'mp3'],
    probeExtensions: ['.mkv'],
  },
  library: {
    rescanOnStartup: false,
  },
};

const LOCAL_CONFIG_FILENAME = 'config.local.json';

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') {
    return base;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key]) {
      result[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveDatabasePathFromObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  if (typeof obj.databasePath === 'string' && obj.databasePath.trim()) {
    return obj.databasePath.trim();
  }

  if (typeof obj.library?.databasePath === 'string' && obj.library.databasePath.trim()) {
    return obj.library.databasePath.trim();
  }

  return null;
}

function hasNonBootstrapKeys(obj) {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'databasePath') {
      continue;
    }

    if (key === 'library' && value && typeof value === 'object') {
      for (const libraryKey of Object.keys(value)) {
        if (libraryKey === 'databasePath' || libraryKey === 'mode') {
          continue;
        }
        return true;
      }
      continue;
    }

    return true;
  }

  return false;
}

function loadLegacyMergedConfig(configPath) {
  const resolvedPath = path.resolve(configPath);
  const configDir = path.dirname(resolvedPath);
  const localConfigPath = path.join(configDir, LOCAL_CONFIG_FILENAME);

  let merged = { ...DEFAULT_CONFIG };

  if (fs.existsSync(resolvedPath)) {
    merged = deepMerge(merged, readJsonFile(resolvedPath));
  }

  if (fs.existsSync(localConfigPath)) {
    merged = deepMerge(merged, readJsonFile(localConfigPath));
  }

  return merged;
}

function loadBootstrapConfig(configPath = './config.json') {
  const resolvedPath = path.resolve(configPath);
  const configDir = path.dirname(resolvedPath);
  const projectRoot = configDir;
  const localConfigPath = path.join(configDir, LOCAL_CONFIG_FILENAME);

  let mainConfig = {};
  if (fs.existsSync(resolvedPath)) {
    mainConfig = readJsonFile(resolvedPath);
  }

  let localConfig = {};
  const localConfigLoaded = fs.existsSync(localConfigPath);
  if (localConfigLoaded) {
    localConfig = readJsonFile(localConfigPath);
  }

  const legacyJsonKeysIgnored =
    hasNonBootstrapKeys(mainConfig) || hasNonBootstrapKeys(localConfig);

  const explicitDatabasePath =
    resolveDatabasePathFromObject(localConfig)
    || resolveDatabasePathFromObject(mainConfig);

  let databasePath = explicitDatabasePath || DEFAULT_DATABASE_PATH;

  let legacyMergedConfig = null;
  if (legacyJsonKeysIgnored) {
    legacyMergedConfig = loadLegacyMergedConfig(resolvedPath);
    if (!explicitDatabasePath) {
      const legacyPath = resolveDatabasePathFromObject(legacyMergedConfig);
      if (legacyPath) {
        databasePath = legacyPath;
      }
    }
  }

  return {
    databasePath,
    configPath: resolvedPath,
    localConfigPath: localConfigLoaded ? localConfigPath : null,
    projectRoot,
    legacyJsonKeysIgnored,
    legacyMergedConfig,
  };
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_DATABASE_PATH,
  loadBootstrapConfig,
  loadLegacyMergedConfig,
};
