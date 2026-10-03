const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function computeCacheKey(sourcePath) {
  const stat = fs.statSync(sourcePath);
  const input = `${path.resolve(sourcePath)}|${stat.size}|${stat.mtimeMs}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

function resolveCacheDirectory(rawPath, projectRoot) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return null;
  }

  const trimmed = rawPath.trim();
  const resolved = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(projectRoot, trimmed);

  return resolved;
}

function getCachedFilePath(cacheDir, cacheKey) {
  return path.join(cacheDir, `${cacheKey}.mp4`);
}

function isCachedAtPath(cachedFilePath, sourcePath) {
  if (!fs.existsSync(cachedFilePath)) {
    return false;
  }

  try {
    const cacheStat = fs.statSync(cachedFilePath);
    const sourceStat = fs.statSync(sourcePath);
    return cacheStat.size > 0 && cacheStat.mtimeMs >= sourceStat.mtimeMs;
  } catch {
    return false;
  }
}

function ensureCacheDirectory(cacheDir) {
  if (!cacheDir) {
    return false;
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  return true;
}

module.exports = {
  computeCacheKey,
  ensureCacheDirectory,
  getCachedFilePath,
  isCachedAtPath,
  resolveCacheDirectory,
};
