function countChannels(db) {
  return db.prepare('SELECT COUNT(*) AS count FROM channels').get().count;
}

function getAllChannelRows(db) {
  return db
    .prepare('SELECT * FROM channels ORDER BY display_name COLLATE NOCASE')
    .all();
}

function getChannelRow(db, channelId) {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
}

function deleteChannelMedia(db, channelId, kind = null) {
  if (kind) {
    db.prepare('DELETE FROM media_files WHERE channel_id = ? AND kind = ?').run(channelId, kind);
    return;
  }

  db.prepare('DELETE FROM media_files WHERE channel_id = ?').run(channelId);
}

function deleteMediaNotInSet(db, channelId, kind, filenames) {
  const rows = db
    .prepare('SELECT filename FROM media_files WHERE channel_id = ? AND kind = ?')
    .all(channelId, kind);

  const keep = new Set(filenames);
  const deleteStmt = db.prepare(
    'DELETE FROM media_files WHERE channel_id = ? AND kind = ? AND filename = ?',
  );

  for (const row of rows) {
    if (!keep.has(row.filename)) {
      deleteStmt.run(channelId, kind, row.filename);
    }
  }
}

function getMediaRows(db, channelId, kind = null) {
  if (kind) {
    return db
      .prepare(
        'SELECT * FROM media_files WHERE channel_id = ? AND kind = ? ORDER BY filename COLLATE NOCASE',
      )
      .all(channelId, kind);
  }

  return db
    .prepare('SELECT * FROM media_files WHERE channel_id = ? ORDER BY kind, filename COLLATE NOCASE')
    .all(channelId);
}

function getMediaRow(db, channelId, kind, filename) {
  return db
    .prepare(
      'SELECT * FROM media_files WHERE channel_id = ? AND kind = ? AND filename = ?',
    )
    .get(channelId, kind, filename);
}

function upsertChannelRow(db, row) {
  db.prepare(`
    INSERT INTO channels (
      id, display_name, page_number, color, media_type,
      schedule_start, schedule_end, max_content_duration_minutes,
      ident_interval, ads_enabled, scan_subfolders,
      source_paths_json, ident_path, testcard_path, artwork_path, updated_at
    ) VALUES (
      @id, @display_name, @page_number, @color, @media_type,
      @schedule_start, @schedule_end, @max_content_duration_minutes,
      @ident_interval, @ads_enabled, @scan_subfolders,
      @source_paths_json, @ident_path, @testcard_path, @artwork_path, datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      page_number = excluded.page_number,
      color = excluded.color,
      media_type = excluded.media_type,
      schedule_start = excluded.schedule_start,
      schedule_end = excluded.schedule_end,
      max_content_duration_minutes = excluded.max_content_duration_minutes,
      ident_interval = excluded.ident_interval,
      ads_enabled = excluded.ads_enabled,
      scan_subfolders = excluded.scan_subfolders,
      source_paths_json = excluded.source_paths_json,
      ident_path = excluded.ident_path,
      testcard_path = excluded.testcard_path,
      artwork_path = excluded.artwork_path,
      updated_at = datetime('now')
  `).run(row);
}

function upsertMediaRow(db, row) {
  db.prepare(`
    INSERT INTO media_files (
      channel_id, kind, filename, source_path, title,
      duration_seconds, size_bytes, mtime_ms, cache_key,
      needs_transcode, transcode_probe_json, last_scanned_at
    ) VALUES (
      @channel_id, @kind, @filename, @source_path, @title,
      @duration_seconds, @size_bytes, @mtime_ms, @cache_key,
      @needs_transcode, @transcode_probe_json, datetime('now')
    )
    ON CONFLICT(channel_id, kind, filename) DO UPDATE SET
      source_path = excluded.source_path,
      title = excluded.title,
      duration_seconds = excluded.duration_seconds,
      size_bytes = excluded.size_bytes,
      mtime_ms = excluded.mtime_ms,
      cache_key = excluded.cache_key,
      needs_transcode = excluded.needs_transcode,
      transcode_probe_json = excluded.transcode_probe_json,
      last_scanned_at = datetime('now')
  `).run(row);
}

module.exports = {
  countChannels,
  deleteChannelMedia,
  deleteMediaNotInSet,
  getAllChannelRows,
  getChannelRow,
  getMediaRow,
  getMediaRows,
  upsertChannelRow,
  upsertMediaRow,
};
