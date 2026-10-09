const {
  createChannelRepository,
  normalizeLibraryConfig,
} = require('./createChannelRepository');
const { DatabaseChannelRepository } = require('./databaseChannelRepository');
const { FilesystemChannelRepository } = require('./filesystemChannelRepository');
const {
  CURRENT_SCHEMA_VERSION,
  closeLibraryDatabase,
  openLibraryDatabase,
  resolveDatabasePath,
} = require('./db');

module.exports = {
  CURRENT_SCHEMA_VERSION,
  DatabaseChannelRepository,
  FilesystemChannelRepository,
  closeLibraryDatabase,
  createChannelRepository,
  normalizeLibraryConfig,
  openLibraryDatabase,
  resolveDatabasePath,
};
