const { normalizeMediaPath } = require('../scanner');
const { getMediaRow, getMediaRows } = require('./channelDb');
const { mediaRowToRuntimeVideo } = require('./channelCatalogue');

function normalizeFilename(filename) {
  return normalizeMediaPath(filename);
}

class DatabaseMediaCatalogue {
  constructor(db) {
    this.db = db;
  }

  getProgramme(channelId, filename) {
    const row = getMediaRow(this.db, channelId, 'programme', normalizeFilename(filename));
    return row ? mediaRowToRuntimeVideo(row) : null;
  }

  getIdent(channelId, filename) {
    const row = getMediaRow(this.db, channelId, 'ident', normalizeFilename(filename));
    return row ? mediaRowToRuntimeVideo(row) : null;
  }

  getMediaItem(channelId, filename, mediaType = 'video') {
    const kind = mediaType === 'ident' ? 'ident' : 'programme';
    const row = getMediaRow(this.db, channelId, kind, normalizeFilename(filename));
    return row ? mediaRowToRuntimeVideo(row) : null;
  }

  attachCatalogue(channelMeta) {
    const mediaRows = getMediaRows(this.db, channelMeta.id);
    const programmes = mediaRows
      .filter((item) => item.kind === 'programme')
      .map(mediaRowToRuntimeVideo);
    const idents = mediaRows
      .filter((item) => item.kind === 'ident')
      .map(mediaRowToRuntimeVideo);

    return {
      ...channelMeta,
      videos: programmes,
      idents,
    };
  }

  listProgrammeSummaries(channelId, { limit = 100, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    return this.db
      .prepare(`
        SELECT filename, title, duration_seconds AS durationSeconds
        FROM media_files
        WHERE channel_id = ? AND kind = 'programme'
        ORDER BY filename COLLATE NOCASE
        LIMIT ? OFFSET ?
      `)
      .all(channelId, safeLimit, safeOffset);
  }
}

module.exports = {
  DatabaseMediaCatalogue,
};
