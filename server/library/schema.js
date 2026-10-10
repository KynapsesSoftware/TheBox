const CHANNELS_DDL = `
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  page_number INTEGER,
  color TEXT NOT NULL DEFAULT 'cyan',
  media_type TEXT NOT NULL DEFAULT 'video',
  schedule_start TEXT,
  schedule_end TEXT,
  max_content_duration_minutes REAL,
  ident_interval INTEGER NOT NULL DEFAULT 0,
  ads_enabled INTEGER NOT NULL DEFAULT 0,
  scan_subfolders INTEGER NOT NULL DEFAULT 0,
  source_paths_json TEXT NOT NULL DEFAULT '[]',
  ident_path TEXT,
  testcard_path TEXT,
  artwork_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const MEDIA_FILES_DDL = `
CREATE TABLE IF NOT EXISTS media_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'programme',
  filename TEXT NOT NULL,
  source_path TEXT NOT NULL,
  title TEXT NOT NULL,
  duration_seconds INTEGER,
  size_bytes INTEGER NOT NULL,
  mtime_ms REAL NOT NULL,
  cache_key TEXT,
  needs_transcode INTEGER,
  transcode_probe_json TEXT,
  last_scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(channel_id, kind, filename),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_media_files_channel ON media_files(channel_id);
`;

const SCHEDULES_DDL = `
CREATE TABLE IF NOT EXISTS schedules (
  channel_id TEXT NOT NULL,
  date_key TEXT NOT NULL,
  built_at TEXT NOT NULL DEFAULT (datetime('now')),
  seed INTEGER NOT NULL,
  start_time TEXT,
  end_time TEXT,
  slots_json TEXT NOT NULL,
  programmes_json TEXT,
  invalidated_at TEXT,
  PRIMARY KEY (channel_id, date_key),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date_key);
`;

function applySchemaVersion2(db) {
  db.exec(CHANNELS_DDL);
  db.exec(MEDIA_FILES_DDL);
}

function applySchemaVersion3(db) {
  db.exec(SCHEDULES_DDL);
}

const TRANSCODE_CACHE_DDL = `
CREATE TABLE IF NOT EXISTS transcode_cache_entries (
  cache_key TEXT PRIMARY KEY,
  channel_id TEXT,
  filename TEXT,
  source_path TEXT,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  ffmpeg_exit_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_transcode_cache_channel ON transcode_cache_entries(channel_id);
`;

function applySchemaVersion4(db) {
  db.exec(TRANSCODE_CACHE_DDL);
}

const APP_SETTINGS_DDL = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function applySchemaVersion5(db) {
  db.exec(APP_SETTINGS_DDL);
}

function applySchemaVersion6(db) {
  const columns = db.prepare('PRAGMA table_info(channels)').all();
  if (columns.some((column) => column.name === 'folder_name')) {
    db.exec('ALTER TABLE channels DROP COLUMN folder_name');
  }
}

module.exports = {
  applySchemaVersion2,
  applySchemaVersion3,
  applySchemaVersion4,
  applySchemaVersion5,
  applySchemaVersion6,
};
