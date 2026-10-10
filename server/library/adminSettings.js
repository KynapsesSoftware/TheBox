const path = require('path');
const { validateAdsConfig, normalizeAdsConfig } = require('../ads');
const { normalizeTranscodeConfig } = require('../transcode/service');
const {
  REGISTRY_KEYS,
  flattenConfigToRows,
  mergeSettingsPatch,
} = require('../appSettingsRegistry');

const TIME_PATTERN = /^(([01]?\d|2[0-3]):[0-5]\d|24:00)$/;

function validateAppSettings(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { ok: false, errors: ['settings object is required'] };
  }

  const port = Number.parseInt(config.port, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('port must be an integer between 1 and 65535');
  }

  if (typeof config.host !== 'string' || !config.host.trim()) {
    errors.push('host must be a non-empty string');
  }

  const scanInterval = Number.parseInt(config.scanIntervalMinutes, 10);
  if (!Number.isInteger(scanInterval) || scanInterval < 0) {
    errors.push('scanIntervalMinutes must be an integer >= 0');
  }

  if (!config.schedule?.timezone) {
    errors.push('schedule.timezone is required');
  }

  const hours = Number.parseInt(config.schedule?.hoursToGenerate, 10);
  if (!Number.isInteger(hours) || hours < 1) {
    errors.push('schedule.hoursToGenerate must be an integer >= 1');
  }

  if (!TIME_PATTERN.test(config.schedule?.defaultStartTime || '')) {
    errors.push('schedule.defaultStartTime must be HH:MM');
  }

  if (!TIME_PATTERN.test(config.schedule?.defaultEndTime || '')) {
    errors.push('schedule.defaultEndTime must be HH:MM');
  }

  if (!config.ui?.title?.trim()) {
    errors.push('ui.title is required');
  }

  const defaultPage = Number.parseInt(config.ui?.defaultPage, 10);
  if (!Number.isInteger(defaultPage) || defaultPage < 1) {
    errors.push('ui.defaultPage must be a positive integer');
  }

  if (!Array.isArray(config.videoExtensions) || config.videoExtensions.length === 0) {
    errors.push('videoExtensions must be a non-empty array');
  }

  if (!Array.isArray(config.audioExtensions) || config.audioExtensions.length === 0) {
    errors.push('audioExtensions must be a non-empty array');
  }

  const adsNorm = normalizeAdsConfig(config.ads || {});
  const adsValidation = validateAdsConfig(adsNorm);
  if (adsNorm.enabled && !adsValidation.valid) {
    errors.push(...adsValidation.errors);
  }

  if (adsNorm.enabled && adsNorm.path && !path.isAbsolute(adsNorm.path)) {
    errors.push('ads.path must be absolute when ads are enabled');
  }

  normalizeTranscodeConfig(config);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const normalized = mergeSettingsPatch({}, config);
  normalized.port = port;
  normalized.scanIntervalMinutes = scanInterval;
  normalized.ui.defaultPage = defaultPage;
  normalized.schedule.hoursToGenerate = hours;
  normalized.ads = adsNorm;

  return { ok: true, config: normalized };
}

function collectChangedKeys(beforeRows, afterRows) {
  const changed = [];
  for (const key of REGISTRY_KEYS) {
    if (beforeRows[key] !== afterRows[key]) {
      changed.push(key);
    }
  }
  return changed;
}

function prepareSettingsUpdate(currentConfig, patch) {
  const merged = mergeSettingsPatch(currentConfig, patch);
  const validation = validateAppSettings(merged);
  if (!validation.ok) {
    return validation;
  }

  const beforeRows = flattenConfigToRows(currentConfig);
  const afterRows = flattenConfigToRows(validation.config);
  const changedKeys = collectChangedKeys(beforeRows, afterRows);

  return {
    ok: true,
    config: validation.config,
    rows: afterRows,
    changedKeys,
  };
}

function settingsChangeNeedsRestart(changedKeys) {
  return changedKeys.includes('host') || changedKeys.includes('port');
}

function classifyInvalidation(changedKeys) {
  const flags = {
    schedule: false,
    ads: false,
    transcode: false,
    transcodeCachePath: false,
    extensions: false,
    scanInterval: false,
    testPattern: false,
    library: false,
  };

  for (const key of changedKeys) {
    if (key.startsWith('schedule.')) {
      flags.schedule = true;
    }
    if (key.startsWith('ads.')) {
      flags.ads = true;
    }
    if (key === 'transcode.cachePath') {
      flags.transcodeCachePath = true;
      flags.transcode = true;
    } else if (key.startsWith('transcode.')) {
      flags.transcode = true;
    }
    if (key === 'videoExtensions' || key === 'audioExtensions') {
      flags.extensions = true;
    }
    if (key === 'scanIntervalMinutes') {
      flags.scanInterval = true;
    }
    if (key === 'testPattern.path') {
      flags.testPattern = true;
    }
    if (key.startsWith('library.')) {
      flags.library = true;
    }
  }

  return flags;
}

module.exports = {
  classifyInvalidation,
  prepareSettingsUpdate,
  settingsChangeNeedsRestart,
  validateAppSettings,
};
