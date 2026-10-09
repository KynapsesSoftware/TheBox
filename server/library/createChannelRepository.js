const { CURRENT_SCHEMA_VERSION, openLibraryDatabase, closeLibraryDatabase } = require('./db');
const { DatabaseChannelRepository } = require('./databaseChannelRepository');
const { FilesystemChannelRepository } = require('./filesystemChannelRepository');
const { DatabaseMediaCatalogue } = require('./mediaCatalogue');
const { createScheduleCacheService } = require('./scheduleCache');

function normalizeLibraryConfig(raw = {}) {
  const mode = raw.mode === 'database' ? 'database' : 'filesystem';
  return {
    mode,
    databasePath: raw.databasePath || '',
    startupScan: raw.startupScan === 'never' ? 'never' : 'if-empty',
    rescanOnStartup: raw.rescanOnStartup === true,
  };
}

function createChannelRepository(appConfig, { projectRoot, channelsRoot }) {
  const library = normalizeLibraryConfig(appConfig.library);
  const scanOptions = {
    videoExtensions: appConfig.videoExtensions,
    audioExtensions: appConfig.audioExtensions,
  };
  const transcodeSettings = appConfig.transcode || null;

  let dbConnection = null;

  if (library.databasePath) {
    dbConnection = openLibraryDatabase(library.databasePath, projectRoot);
    if (dbConnection) {
      console.log(
        `Library database ready (schema v${CURRENT_SCHEMA_VERSION}): ${dbConnection.path}`,
      );
    }
  }

  if (library.mode === 'database') {
    if (!dbConnection) {
      throw new Error('library.mode is "database" but library.databasePath is missing or invalid.');
    }

    const repository = new DatabaseChannelRepository({
      db: dbConnection.db,
      library,
      channelsRoot,
      scanOptions,
      projectRoot,
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

  const repository = new FilesystemChannelRepository({
    channelsRoot,
    scanOptions,
    projectRoot,
  });

  const scheduleService = createScheduleCacheService({
    db: dbConnection?.db || null,
    enabled: false,
  });

  return {
    library,
    dbConnection,
    repository,
    mediaCatalogue: null,
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
