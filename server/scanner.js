const fs = require('fs');
const path = require('path');
const { probeDurationSeconds, displayTitleFromFilename } = require('./metadata');

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

function isVideoFile(filename, extensions) {
  const ext = path.extname(filename).toLowerCase();
  return extensions.includes(ext);
}

async function scanChannelFolder(channelDir, extensions) {
  const folderName = path.basename(channelDir);
  const meta = readChannelMeta(channelDir);
  const channelId = meta.id || slugify(folderName) || folderName;
  const entries = fs.readdirSync(channelDir, { withFileTypes: true });
  const videos = [];

  for (const entry of entries) {
    if (!entry.isFile() || !isVideoFile(entry.name, extensions)) {
      continue;
    }

    const absolutePath = path.join(channelDir, entry.name);
    const durationSeconds = await probeDurationSeconds(absolutePath);

    videos.push({
      filename: entry.name,
      title: displayTitleFromFilename(entry.name),
      path: absolutePath,
      durationSeconds,
    });
  }

  videos.sort((a, b) => a.filename.localeCompare(b.filename));

  return {
    id: channelId,
    folderName,
    displayName: meta.displayName || folderName.replace(/[-_]+/g, ' '),
    pageNumber: meta.pageNumber ?? null,
    color: meta.color || 'cyan',
    schedule: {
      startTime: meta.schedule?.startTime || null,
      endTime: meta.schedule?.endTime || null,
    },
    videos,
  };
}

async function scanChannels(channelsRoot, extensions) {
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
    const channel = await scanChannelFolder(channelDir, extensions);
    channels.push(channel);
  }

  channels.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return channels;
}

module.exports = {
  scanChannels,
};
