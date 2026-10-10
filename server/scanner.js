const fs = require('fs');
const path = require('path');
const { probeDurationSeconds, displayTitleFromFilename } = require('./metadata');
const { isTestCardFilename } = require('./testPattern');

function parseMediaType(value) {
  return value === 'audio' ? 'audio' : 'video';
}

function isMediaFile(filename, extensions) {
  const ext = path.extname(filename).toLowerCase();
  return extensions.includes(ext);
}

function parseIdentInterval(value) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const interval = Number(value);
  if (!Number.isInteger(interval) || interval < 0) {
    return 0;
  }

  return interval;
}

function parseMaxContentDuration(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }

  return minutes;
}

function parseScanSubfolders(value) {
  return value === true || value === 'true';
}

function parseAdsEnabled(value) {
  return value === true || value === 'true';
}

function normalizeMediaPath(mediaPath) {
  return mediaPath.replace(/\\/g, '/');
}

function normalizeDirectoryPath(directoryPath) {
  const normalized = path.resolve(directoryPath);
  if (normalized.length <= 1) {
    return normalized;
  }

  return normalized.replace(/[/\\]+$/, '');
}

function resolveSourcePath(sourcePath, projectRoot) {
  if (typeof sourcePath !== 'string') {
    return null;
  }

  const trimmed = sourcePath.trim();
  if (!trimmed) {
    return null;
  }

  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(projectRoot, trimmed);

  return normalizeDirectoryPath(resolved);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function rootSlugFromAbsolutePath(absolutePath) {
  const base = path.basename(normalizeDirectoryPath(absolutePath));
  return slugify(base) || 'root';
}

function assignUniqueRootSlugs(resolvedPaths) {
  const slugUseCount = new Map();

  return resolvedPaths.map((absolutePath) => {
    const baseSlug = rootSlugFromAbsolutePath(absolutePath);
    const seen = slugUseCount.get(baseSlug) || 0;
    slugUseCount.set(baseSlug, seen + 1);
    const slug = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;

    return {
      absolutePath,
      slug,
    };
  });
}

async function collectVideosFromDirectory(rootDir, extensions, options = {}) {
  const {
    recursive = false,
    excludeDirNames = new Set(['ident']),
    channelId = 'channel',
    filenamePrefix = '',
  } = options;
  const videos = [];
  const seenPaths = new Set();

  async function walk(currentDir, relativePrefix = '') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelativePath = relativePrefix
        ? `${relativePrefix}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        if (!recursive) {
          continue;
        }

        if (excludeDirNames.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }

        await walk(path.join(currentDir, entry.name), entryRelativePath);
        continue;
      }

      if (!entry.isFile() || !isMediaFile(entry.name, extensions)) {
        continue;
      }

      if (isTestCardFilename(entry.name)) {
        continue;
      }

      const relativeFilename = normalizeMediaPath(entryRelativePath);
      const filename = filenamePrefix
        ? normalizeMediaPath(`${filenamePrefix}${relativeFilename}`)
        : relativeFilename;

      if (seenPaths.has(filename)) {
        console.warn(`Channel "${channelId}": duplicate media path "${filename}"`);
        continue;
      }

      seenPaths.add(filename);
      const absolutePath = path.join(currentDir, entry.name);
      const durationSeconds = await probeDurationSeconds(absolutePath);

      videos.push({
        filename,
        title: displayTitleFromFilename(entry.name),
        path: absolutePath,
        durationSeconds,
      });
    }
  }

  await walk(rootDir);
  videos.sort((a, b) => a.filename.localeCompare(b.filename));

  return videos;
}

module.exports = {
  assignUniqueRootSlugs,
  collectVideosFromDirectory,
  isMediaFile,
  normalizeDirectoryPath,
  normalizeMediaPath,
  parseAdsEnabled,
  parseIdentInterval,
  parseMaxContentDuration,
  parseMediaType,
  parseScanSubfolders,
  resolveSourcePath,
  rootSlugFromAbsolutePath,
};
