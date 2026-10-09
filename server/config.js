const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  channelsRoot: './channels',
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
    mode: 'filesystem',
    databasePath: '',
    startupScan: 'if-empty',
    rescanOnStartup: false,
  },
};

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

const LOCAL_CONFIG_FILENAME = 'config.local.json';

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadConfig(configPath = './config.json') {
  const resolvedPath = path.resolve(configPath);
  const configDir = path.dirname(resolvedPath);
  const localConfigPath = path.join(configDir, LOCAL_CONFIG_FILENAME);

  let merged = { ...DEFAULT_CONFIG };

  if (fs.existsSync(resolvedPath)) {
    merged = deepMerge(merged, readJsonFile(resolvedPath));
  }

  const localConfigLoaded = fs.existsSync(localConfigPath);
  if (localConfigLoaded) {
    merged = deepMerge(merged, readJsonFile(localConfigPath));
  }

  return {
    ...merged,
    configPath: resolvedPath,
    localConfigPath: localConfigLoaded ? localConfigPath : null,
  };
}

function resolveChannelsRoot(config) {
  const configDir = path.dirname(config.configPath);
  return path.resolve(configDir, config.channelsRoot);
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  resolveChannelsRoot,
};
