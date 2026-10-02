const fs = require('fs');
const path = require('path');

const TESTCARD_FILENAMES = ['testcard.mp4', 'testcard.mkv'];

function findTestCardInDirectory(directoryPath) {
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    return null;
  }

  let stat;
  try {
    stat = fs.statSync(directoryPath);
  } catch {
    return null;
  }

  if (!stat.isDirectory()) {
    return null;
  }

  for (const name of TESTCARD_FILENAMES) {
    const candidate = path.join(directoryPath, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function resolveConfiguredTestPatternPath(rawPath, projectRoot) {
  if (typeof rawPath !== 'string') {
    return null;
  }

  const trimmed = rawPath.trim();
  if (!trimmed) {
    return null;
  }

  const resolved = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(projectRoot, trimmed);

  if (!fs.existsSync(resolved)) {
    return null;
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    return resolved;
  }

  if (stat.isDirectory()) {
    return findTestCardInDirectory(resolved);
  }

  return null;
}

function resolveChannelTestCardPath(channelDir) {
  return findTestCardInDirectory(channelDir);
}

function resolveEffectiveTestCardPath(channel, globalTestCardPath) {
  if (channel?.testCardPath) {
    return {
      path: channel.testCardPath,
      scope: 'channel',
    };
  }

  if (globalTestCardPath) {
    return {
      path: globalTestCardPath,
      scope: 'global',
    };
  }

  return null;
}

function buildTestPatternMediaUrl(scope, channelId) {
  if (scope === 'channel') {
    return `/media/${encodeURIComponent(channelId)}/testcard`;
  }

  return '/media/testcard/global';
}

function buildTestPatternNowPlaying(channel, testCard) {
  return {
    channelId: channel.id,
    channelName: channel.displayName,
    mediaType: 'video',
    isTestPattern: true,
    title: 'TEST CARD',
    mediaUrl: buildTestPatternMediaUrl(testCard.scope, channel.id),
    offsetSeconds: 0,
  };
}

function isTestCardFilename(filename) {
  const base = path.basename(filename).toLowerCase();
  return TESTCARD_FILENAMES.includes(base);
}

module.exports = {
  TESTCARD_FILENAMES,
  buildTestPatternMediaUrl,
  buildTestPatternNowPlaying,
  findTestCardInDirectory,
  isTestCardFilename,
  resolveChannelTestCardPath,
  resolveConfiguredTestPatternPath,
  resolveEffectiveTestCardPath,
};
