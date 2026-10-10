const fs = require('fs');
const path = require('path');
const {
  applySchemaVersion2,
  applySchemaVersion3,
  applySchemaVersion4,
  applySchemaVersion5,
  applySchemaVersion6,
} = require('./schema');

const CURRENT_SCHEMA_VERSION = 6;

function resolveDatabasePath(rawPath, projectRoot) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return null;
  }

  const trimmed = rawPath.trim();
  return path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(projectRoot, trimmed);
}

function migrateSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get();
  let applied = row?.version ?? 0;

  while (applied < CURRENT_SCHEMA_VERSION) {
    const next = applied + 1;

    if (next === 2) {
      applySchemaVersion2(db);
    }

    if (next === 3) {
      applySchemaVersion3(db);
    }

    if (next === 4) {
      applySchemaVersion4(db);
    }

    if (next === 5) {
      applySchemaVersion5(db);
    }

    if (next === 6) {
      applySchemaVersion6(db);
    }

    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(next);
    applied = next;
  }
}

function openLibraryDatabase(databasePath, projectRoot) {
  const resolvedPath = resolveDatabasePath(databasePath, projectRoot);
  if (!resolvedPath) {
    return null;
  }

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const Database = require('better-sqlite3');
  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrateSchema(db);

  return {
    db,
    path: resolvedPath,
  };
}

function closeLibraryDatabase(connection) {
  if (connection?.db) {
    connection.db.close();
  }
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  closeLibraryDatabase,
  migrateSchema,
  openLibraryDatabase,
  resolveDatabasePath,
};
