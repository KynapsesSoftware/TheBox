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

function loadConfig(configPath = './config.json') {
  const resolvedPath = path.resolve(configPath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      ...DEFAULT_CONFIG,
      configPath: resolvedPath,
    };
  }

  const userConfig = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  return {
    ...deepMerge(DEFAULT_CONFIG, userConfig),
    configPath: resolvedPath,
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
