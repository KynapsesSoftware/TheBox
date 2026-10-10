const { normalizeMediaPath } = require('../scanner');
const { countChannels, getAllChannelRows } = require('./channelDb');
const { getChannelRow, getMediaRow } = require('./channelDb');
const {
  hydrateAllChannelsSlim,
  reconcileChannelMedia,
} = require('./channelCatalogue');

class DatabaseChannelRepository {
  constructor({
    db,
    library,
    scanOptions,
    transcodeSettings,
  }) {
    this.db = db;
    this.library = library;
    this.scanOptions = scanOptions;
    this.transcodeSettings = transcodeSettings || null;
    this._channels = [];
  }

  get mode() {
    return 'database';
  }

  getChannels() {
    return this._channels;
  }

  async rescanAll(options = {}) {
    const forceReconcile = options.forceReconcile === true;
    const rescanOnStartup = options.rescanOnStartup === true;
    const channelCount = countChannels(this.db);

    if (channelCount > 0 && (forceReconcile || rescanOnStartup)) {
      const rows = getAllChannelRows(this.db);
      for (const row of rows) {
        await reconcileChannelMedia(this.db, row, {
          scanOptions: this.scanOptions,
          transcodeSettings: this.transcodeSettings,
        });
      }
    }

    this._channels = hydrateAllChannelsSlim(this.db);
    return this._channels;
  }

  async reconcileOneChannel(channelId) {
    const row = getChannelRow(this.db, channelId);
    if (!row) {
      return false;
    }

    await reconcileChannelMedia(this.db, row, {
      scanOptions: this.scanOptions,
      transcodeSettings: this.transcodeSettings,
    });

    this._channels = hydrateAllChannelsSlim(this.db);
    return true;
  }

  getMediaPath(channelId, mediaPath, mediaType = 'video') {
    const normalizedPath = normalizeMediaPath(mediaPath);
    const kind = mediaType === 'ident' ? 'ident' : 'programme';
    const row = getMediaRow(this.db, channelId, kind, normalizedPath);
    return row?.source_path || null;
  }

  close() {
    this._channels = [];
  }
}

module.exports = {
  DatabaseChannelRepository,
};
