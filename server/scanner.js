const fs = require('fs');
const path = require('path');
const { probeDurationSeconds, displayTitleFromFilename } = require('./metadata');
const { isTestCardFilename, resolveChannelTestCardPath } = require('./testPattern');

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readChannelMeta(channelDir) {
  const metaPath = path.join(channelDir, 'channel.json');
  if (!fs.existsSync(metaPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return {};
  }
}

const DEFAULT_ARTWORK_NAMES = [
  'artwork.png',
  'artwork.jpg',
  'artwork.jpeg',
  'artwork.webp',
  'cover.png',
  'cover.jpg',
];

function parseMediaType(value) {
  return value === 'audio' ? 'audio' : 'video';
}

function isMediaFile(filename, extensions) {
  const ext = path.extname(filename).toLowerCase();
  return extensions.includes(ext);
}

function resolveArtworkPath(channelDir, meta) {
  const candidates = [];

  if (typeof meta.artwork === 'string' && meta.artwork.trim()) {
    candidates.push(path.basename(meta.artwork.trim()));
  }

  for (const name of DEFAULT_ARTWORK_NAMES) {
    if (!candidates.includes(name)) {
      candidates.push(name);
    }
  }

  for (const name of candidates) {
    const artworkPath = path.join(channelDir, name);
    if (fs.existsSync(artworkPath) && fs.statSync(artworkPath).isFile()) {
      return artworkPath;
    }
  }

  return null;
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

function resolveSourcePathsFromMeta(meta, projectRoot) {
  if (!Array.isArray(meta.sourcePaths) || meta.sourcePaths.length === 0) {
    return null;
  }

  const resolved = [];

  for (const entry of meta.sourcePaths) {
    if (typeof entry !== 'string') {
      continue;
    }

    const resolvedPath = resolveSourcePath(entry, projectRoot);
    if (resolvedPath) {
      resolved.push(resolvedPath);
    }
  }

  return resolved.length > 0 ? resolved : null;
}

function resolveProgrammeSourcePlan(meta, channelDir, projectRoot) {
  const multiPaths = resolveSourcePathsFromMeta(meta, projectRoot);

  if (multiPaths) {
    const labeledRoots = assignUniqueRootSlugs(multiPaths);

    return {
      mode: 'multi',
      sources: labeledRoots.map(({ absolutePath, slug }) => ({
        path: absolutePath,
        filenamePrefix: `${slug}/`,
        excludeDirNames: new Set(),
      })),
      sourcePath: multiPaths[0],
      sourcePaths: multiPaths,
    };
  }

  const legacyPath = resolveSourcePath(meta.sourcePath, projectRoot);

  if (legacyPath) {
    return {
      mode: 'legacy-single',
      sources: [{
        path: legacyPath,
        filenamePrefix: '',
        excludeDirNames: new Set(),
      }],
      sourcePath: legacyPath,
      sourcePaths: [legacyPath],
    };
  }

  return {
    mode: 'channel',
    sources: [{
      path: channelDir,
      filenamePrefix: '',
      excludeDirNames: new Set(['ident']),
    }],
    sourcePath: null,
    sourcePaths: [],
  };
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

async function scanVideoDirectory(videoDir, extensions, options = {}) {
  if (!fs.existsSync(videoDir)) {
    return {
      videos: [],
      warning: `Video source not found: ${videoDir}`,
    };
  }

  let stat;
  try {
    stat = fs.statSync(videoDir);
  } catch (error) {
    return {
      videos: [],
      warning: `Video source is not accessible: ${videoDir} (${error.message})`,
    };
  }

  if (!stat.isDirectory()) {
    return {
      videos: [],
      warning: `Video source is not a directory: ${videoDir}`,
    };
  }

  const videos = await collectVideosFromDirectory(videoDir, extensions, options);

  return { videos };
}

async function scanOptionalVideoDirectory(videoDir, extensions) {
  if (!fs.existsSync(videoDir)) {
    return [];
  }

  const { videos } = await scanVideoDirectory(videoDir, extensions);
  return videos;
}

async function scanChannelFolder(channelDir, scanOptions, projectRoot) {
  const { videoExtensions, audioExtensions } = scanOptions;
  const folderName = path.basename(channelDir);
  const meta = readChannelMeta(channelDir);
  const channelId = meta.id || slugify(folderName) || folderName;
  const mediaType = parseMediaType(meta.mediaType);
  const extensions = mediaType === 'audio' ? audioExtensions : videoExtensions;
  const scanSubfolders = parseScanSubfolders(meta.scanSubfolders);
  const sourcePlan = resolveProgrammeSourcePlan(meta, channelDir, projectRoot);
  const videos = [];
  const seenFilenames = new Set();

  for (const source of sourcePlan.sources) {
    const { videos: rootVideos, warning } = await scanVideoDirectory(source.path, extensions, {
      recursive: scanSubfolders,
      excludeDirNames: source.excludeDirNames,
      channelId,
      filenamePrefix: source.filenamePrefix,
    });

    if (warning) {
      const label = source.filenamePrefix
        ? source.filenamePrefix.replace(/\/$/, '')
        : source.path;
      console.warn(`Channel "${channelId}" (${label}): ${warning}`);
    }

    for (const video of rootVideos) {
      if (seenFilenames.has(video.filename)) {
        console.warn(
          `Channel "${channelId}": duplicate media path "${video.filename}" (skipped)`,
        );
        continue;
      }

      seenFilenames.add(video.filename);
      videos.push(video);
    }
  }

  videos.sort((a, b) => a.filename.localeCompare(b.filename));

  const identDir = path.join(channelDir, 'ident');
  const idents = await scanOptionalVideoDirectory(identDir, extensions);
  const testCardPath = resolveChannelTestCardPath(channelDir);
  const artworkPath = mediaType === 'audio' ? resolveArtworkPath(channelDir, meta) : null;

  return {
    id: channelId,
    folderName,
    displayName: meta.displayName || folderName.replace(/[-_]+/g, ' '),
    pageNumber: meta.pageNumber ?? null,
    color: meta.color || 'cyan',
    mediaType,
    artworkPath,
    testCardPath,
    sourcePath: sourcePlan.sourcePath,
    sourcePaths: sourcePlan.sourcePaths,
    scanSubfolders,
    maxContentDuration: parseMaxContentDuration(meta.maxContentDuration),
    identInterval: parseIdentInterval(meta.identInterval),
    adsEnabled: parseAdsEnabled(meta.adsEnabled),
    schedule: {
      startTime: meta.schedule?.startTime || null,
      endTime: meta.schedule?.endTime || null,
    },
    videos,
    idents,
  };
}

async function scanChannels(channelsRoot, scanOptions, projectRoot = path.dirname(channelsRoot)) {
  if (!fs.existsSync(channelsRoot)) {
    fs.mkdirSync(channelsRoot, { recursive: true });
    return [];
  }

  const entries = fs.readdirSync(channelsRoot, { withFileTypes: true });
  const channels = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const channelDir = path.join(channelsRoot, entry.name);
    const channel = await scanChannelFolder(channelDir, scanOptions, projectRoot);
    channels.push(channel);
  }

  channels.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return channels;
}

module.exports = {
  assignUniqueRootSlugs,
  isMediaFile,
  normalizeDirectoryPath,
  normalizeMediaPath,
  parseIdentInterval,
  parseMaxContentDuration,
  parseMediaType,
  parseScanSubfolders,
  parseAdsEnabled,
  resolveArtworkPath,
  resolveProgrammeSourcePlan,
  resolveSourcePath,
  resolveSourcePathsFromMeta,
  rootSlugFromAbsolutePath,
  scanChannels,
  scanChannelFolder,
  scanOptionalVideoDirectory,
  scanVideoDirectory,
  collectVideosFromDirectory,
};
