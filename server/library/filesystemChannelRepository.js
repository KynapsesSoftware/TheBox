const { normalizeMediaPath, scanChannels } = require('../scanner');

class FilesystemChannelRepository {
  constructor({ channelsRoot, scanOptions, projectRoot }) {
    this.channelsRoot = channelsRoot;
    this.scanOptions = scanOptions;
    this.projectRoot = projectRoot;
    this._channels = [];
  }

  get mode() {
    return 'filesystem';
  }

  getChannels() {
    return this._channels;
  }

  async rescanAll() {
    this._channels = await scanChannels(
      this.channelsRoot,
      this.scanOptions,
      this.projectRoot,
    );
    return this._channels;
  }

  getMediaPath(channelId, mediaPath, mediaType = 'video') {
    const channel = this._channels.find((item) => item.id === channelId);
    if (!channel) {
      return null;
    }

    const normalizedPath = normalizeMediaPath(mediaPath);
    const list = mediaType === 'ident' ? channel.idents : channel.videos;
    const match = list.find((item) => item.filename === normalizedPath);
    return match?.path || null;
  }

  close() {
    // No resources to release in filesystem mode.
  }
}

module.exports = {
  FilesystemChannelRepository,
};
