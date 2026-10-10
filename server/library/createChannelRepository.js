const { closeLibraryDatabase } = require('./db');
const { DatabaseChannelRepository } = require('./databaseChannelRepository');
const { DatabaseMediaCatalogue } = require('./mediaCatalogue');
const { createScheduleCacheService } = require('./scheduleCache');

function normalizeLibraryConfig(raw = {}) {
  return {
    rescanOnStartup: raw.rescanOnStartup === true,
  };
}

function createChannelRepository(appConfig, { projectRoot, dbConnection }) {
  if (!dbConnection?.db) {
    throw new Error('Database connection is required.');
  }

  const library = normalizeLibraryConfig(appConfig.library);
  const scanOptions = {
    videoExtensions: appConfig.videoExtensions,
    audioExtensions: appConfig.audioExtensions,
  };
  const transcodeSettings = appConfig.transcode || null;

  const repository = new DatabaseChannelRepository({
    db: dbConnection.db,
    library,
    scanOptions,
    transcodeSettings,
  });

  const mediaCatalogue = new DatabaseMediaCatalogue(dbConnection.db);
  const scheduleService = createScheduleCacheService({
    db: dbConnection.db,
    enabled: true,
    expandChannel: (channel) => mediaCatalogue.attachCatalogue(channel),
  });

  return {
    library,
    dbConnection,
    repository,
    mediaCatalogue,
    scheduleService,
    close() {
      repository.close();
      closeLibraryDatabase(dbConnection);
    },
  };
}

module.exports = {
  createChannelRepository,
  normalizeLibraryConfig,
};
