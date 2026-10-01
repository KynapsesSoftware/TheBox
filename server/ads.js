const fs = require('fs');
const path = require('path');
const { collectVideosFromDirectory, normalizeDirectoryPath } = require('./scanner');

const DEFAULT_ADS_CONFIG = {
  enabled: false,
  path: '',
  breakMinAds: 1,
  breakMaxAds: 3,
  intervalMinutes: 15,
  intervalJitterMinutes: 3,
  programEndGuardMinutes: 5,
};

function normalizeAdsConfig(raw = {}) {
  return {
    enabled: raw.enabled === true,
    path: typeof raw.path === 'string' ? raw.path.trim() : '',
    breakMinAds: Number.parseInt(raw.breakMinAds, 10),
    breakMaxAds: Number.parseInt(raw.breakMaxAds, 10),
    intervalMinutes: Number.parseInt(raw.intervalMinutes, 10),
    intervalJitterMinutes: Number.parseInt(raw.intervalJitterMinutes, 10),
    programEndGuardMinutes: Number.parseInt(raw.programEndGuardMinutes, 10),
  };
}

function validateAdsConfig(adsConfig) {
  const errors = [];

  if (!adsConfig.enabled) {
    return { valid: false, enabled: false, errors: [] };
  }

  if (!Number.isInteger(adsConfig.breakMinAds) || adsConfig.breakMinAds < 1) {
    errors.push('ads.breakMinAds must be an integer >= 1');
  }
  if (!Number.isInteger(adsConfig.breakMaxAds) || adsConfig.breakMaxAds < 1) {
    errors.push('ads.breakMaxAds must be an integer >= 1');
  }
  if (
    Number.isInteger(adsConfig.breakMinAds)
    && Number.isInteger(adsConfig.breakMaxAds)
    && adsConfig.breakMinAds > adsConfig.breakMaxAds
  ) {
    errors.push('ads.breakMinAds cannot be greater than ads.breakMaxAds');
  }
  if (!Number.isInteger(adsConfig.intervalMinutes) || adsConfig.intervalMinutes <= 0) {
    errors.push('ads.intervalMinutes must be an integer > 0');
  }
  if (
    !Number.isInteger(adsConfig.intervalJitterMinutes)
    || adsConfig.intervalJitterMinutes < 0
  ) {
    errors.push('ads.intervalJitterMinutes must be an integer >= 0');
  }
  if (
    Number.isInteger(adsConfig.intervalMinutes)
    && Number.isInteger(adsConfig.intervalJitterMinutes)
    && adsConfig.intervalJitterMinutes > adsConfig.intervalMinutes
  ) {
    errors.push('ads.intervalJitterMinutes cannot be greater than ads.intervalMinutes');
  }
  if (
    !Number.isInteger(adsConfig.programEndGuardMinutes)
    || adsConfig.programEndGuardMinutes < 0
  ) {
    errors.push('ads.programEndGuardMinutes must be an integer >= 0');
  }
  if (!adsConfig.path) {
    errors.push('ads.path must be set to an absolute folder path when ads are enabled');
  } else if (!path.isAbsolute(adsConfig.path)) {
    errors.push('ads.path must be an absolute path');
  }

  return {
    valid: errors.length === 0,
    enabled: adsConfig.enabled,
    errors,
  };
}

async function scanAdsDirectory(adsPath, videoExtensions) {
  const normalizedPath = normalizeDirectoryPath(adsPath);

  if (!fs.existsSync(normalizedPath)) {
    return {
      ads: [],
      warning: `Ads path not found: ${normalizedPath}`,
    };
  }

  let stat;
  try {
    stat = fs.statSync(normalizedPath);
  } catch (error) {
    return {
      ads: [],
      warning: `Ads path is not accessible: ${normalizedPath} (${error.message})`,
    };
  }

  if (!stat.isDirectory()) {
    return {
      ads: [],
      warning: `Ads path is not a directory: ${normalizedPath}`,
    };
  }

  const ads = await collectVideosFromDirectory(normalizedPath, videoExtensions, {
    recursive: true,
    excludeDirNames: new Set(['.git']),
    channelId: 'ads',
  });

  return { ads, warning: null };
}

async function loadAdsLibrary(config) {
  const adsConfig = normalizeAdsConfig(config.ads || DEFAULT_ADS_CONFIG);
  const validation = validateAdsConfig(adsConfig);

  if (!adsConfig.enabled) {
    return {
      config: adsConfig,
      ads: [],
      active: false,
      validation,
    };
  }

  if (!validation.valid) {
    for (const error of validation.errors) {
      console.warn(`Ads disabled: ${error}`);
    }
    return {
      config: adsConfig,
      ads: [],
      active: false,
      validation,
    };
  }

  const { ads, warning } = await scanAdsDirectory(adsConfig.path, config.videoExtensions);

  if (warning) {
    console.warn(`Ads disabled: ${warning}`);
    return {
      config: adsConfig,
      ads: [],
      active: false,
      validation,
    };
  }

  const playable = ads.filter((ad) => ad.durationSeconds && ad.durationSeconds > 0);
  if (playable.length === 0) {
    console.warn('Ads disabled: no playable ad files found in ads path');
    return {
      config: adsConfig,
      ads: [],
      active: false,
      validation,
    };
  }

  if (playable.length < adsConfig.breakMaxAds) {
    console.warn(
      `Ads disabled: found ${playable.length} ad(s) but ads.breakMaxAds is ${adsConfig.breakMaxAds}`,
    );
    return {
      config: adsConfig,
      ads: playable,
      active: false,
      validation,
    };
  }

  return {
    config: adsConfig,
    ads: playable,
    active: true,
    validation,
  };
}

function channelAdsEnabled(channel, adsLibrary) {
  return adsLibrary.active
    && channel.mediaType !== 'audio'
    && channel.adsEnabled === true;
}

module.exports = {
  DEFAULT_ADS_CONFIG,
  channelAdsEnabled,
  loadAdsLibrary,
  normalizeAdsConfig,
  validateAdsConfig,
};
