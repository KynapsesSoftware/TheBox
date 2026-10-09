const { normalizeMediaPath } = require('../scanner');
const { countChannels, getAllChannelRows } = require('./channelDb');
const { getChannelRow, getMediaRow } = require('./channelDb');
const {
  hydrateAllChannelsSlim,
  importFromChannelsRoot,
  reconcileChannelMedia,
} = require('./channelCatalogue');

class DatabaseChannelRepository {
  constructor({
    db,
    library,
    channelsRoot,
    scanOptions,
    projectRoot,
    transcodeSettings,
  }) {
    this.db = db;
    this.library = library;
    this.channelsRoot = channelsRoot;
    this.scanOptions = scanOptions;
    this.projectRoot = projectRoot;
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
    let channelCount = countChannels(this.db);

    if (channelCount === 0 && this.library.startupScan === 'if-empty') {
      const imported = await importFromChannelsRoot(this.db, {
        channelsRoot: this.channelsRoot,
        scanOptions: this.scanOptions,
        projectRoot: this.projectRoot,
        transcodeSettings: this.transcodeSettings,
      });
      console.log(`Library import: seeded ${imported} channel(s) from ${this.channelsRoot}`);
      channelCount = imported;
    }

    if (channelCount > 0 && (forceReconcile || rescanOnStartup)) {
      const rows = getAllChannelRows(this.db);
      for (const row of rows) {
        await reconcileChannelMedia(this.db, row, {
          scanOptions: this.scanOptions,
          channelsRoot: this.channelsRoot,
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
      channelsRoot: this.channelsRoot,
      transcodeSettings: this.transcodeSettings,
    });

    this._channels = hydrateAllChannelsSlim(this.db);
    return true;
  }

  async importFromChannelsRoot() {
    const count = await importFromChannelsRoot(this.db, {
      channelsRoot: this.channelsRoot,
      scanOptions: this.scanOptions,
      projectRoot: this.projectRoot,
      transcodeSettings: this.transcodeSettings,
    });
    this._channels = hydrateAllChannelsSlim(this.db);
    return count;
  }

  getMediaPath(channelId, mediaPath, mediaType = 'video') {
    const normalizedPath = normalizeMediaPath(mediaPath);
    const kind = mediaType === 'ident' ? 'ident' : 'programme';
    const row = getMediaRow(this.db, channelId, kind, normalizedPath);
    return row?.source_path || null;
  }

  close() {
    // Database connection closed by library runtime.
  }
}

module.exports = {
  DatabaseChannelRepository,
};
