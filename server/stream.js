const fs = require('fs');
const path = require('path');
const { normalizeMediaPath } = require('./scanner');

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
};

function contentTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function findMediaFile(channel, mediaPath, mediaType = 'video') {
  const normalizedPath = normalizeMediaPath(mediaPath);
  const list = mediaType === 'ident' ? channel.idents : channel.videos;
  const match = list.find((item) => item.filename === normalizedPath);
  return match?.path || null;
}

function getRequestedMediaPath(req) {
  const wildcardPath = req.params[0];
  if (typeof wildcardPath === 'string' && wildcardPath.length > 0) {
    return normalizeMediaPath(decodeURIComponent(wildcardPath));
  }

  return normalizeMediaPath(path.basename(req.path));
}

function streamMediaFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = contentTypeForPath(filePath);

  if (!range) {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
    res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  const chunkSize = (end - start) + 1;
  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': contentType,
  });

  fs.createReadStream(filePath, { start, end }).pipe(res);
}

function createMediaHandler(
  getChannelById,
  mediaType = 'video',
  resolvePlaybackPath = null,
  resolveMediaItem = null,
) {
  return (req, res) => {
    const channel = getChannelById(req.params.channelId);
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const mediaPath = getRequestedMediaPath(req);
    const normalizedPath = normalizeMediaPath(mediaPath);
    let match = null;

    if (typeof resolveMediaItem === 'function') {
      match = resolveMediaItem(channel, normalizedPath, mediaType);
    } else {
      const list = mediaType === 'ident' ? channel.idents : channel.videos;
      match = list.find((item) => item.filename === normalizedPath);
    }

    if (!match?.path) {
      res.status(404).json({ error: 'Media file not found' });
      return;
    }

    let filePath = match.path;
    if (resolvePlaybackPath && mediaType !== 'ident') {
      const resolved = resolvePlaybackPath(match);
      if (!resolved) {
        res.status(503).json({ error: 'Playback not available' });
        return;
      }

      filePath = resolved;
    }

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Media file not found' });
      return;
    }

    streamMediaFile(req, res, filePath);
  };
}

function findAdFile(adsLibrary, mediaPath) {
  const normalizedPath = normalizeMediaPath(mediaPath);
  const match = adsLibrary.ads.find((item) => item.filename === normalizedPath);
  return match?.path || null;
}

function createAdMediaHandler(getAdsLibrary) {
  return (req, res) => {
    const adsLibrary = getAdsLibrary();
    if (!adsLibrary?.active) {
      res.status(404).json({ error: 'Ads are not available' });
      return;
    }

    const mediaPath = getRequestedMediaPath(req);
    const filePath = findAdFile(adsLibrary, mediaPath);

    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Media file not found' });
      return;
    }

    streamMediaFile(req, res, filePath);
  };
}

function createGlobalTestCardHandler(getGlobalTestCardPath) {
  return (req, res) => {
    const filePath = getGlobalTestCardPath();
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Global test card not found' });
      return;
    }

    streamMediaFile(req, res, filePath);
  };
}

function createChannelTestCardHandler(getChannelById) {
  return (req, res) => {
    const channel = getChannelById(req.params.channelId);
    if (!channel?.testCardPath || !fs.existsSync(channel.testCardPath)) {
      res.status(404).json({ error: 'Channel test card not found' });
      return;
    }

    streamMediaFile(req, res, channel.testCardPath);
  };
}

module.exports = {
  contentTypeForPath,
  createAdMediaHandler,
  createChannelTestCardHandler,
  createGlobalTestCardHandler,
  createMediaHandler,
  findAdFile,
  findMediaFile,
  getRequestedMediaPath,
  streamMediaFile,
};
