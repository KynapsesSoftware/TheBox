function normalizeCacheKeyInput(raw) {
  if (typeof raw !== 'string') {
    return null;
  }

  let key = raw.trim();
  if (!key) {
    return null;
  }

  if (key.toLowerCase().endsWith('.mp4')) {
    key = key.slice(0, -4);
  }

  return key;
}

function upsertTranscodeCacheEntry(db, entry) {
  db.prepare(`
    INSERT INTO transcode_cache_entries (
      cache_key, channel_id, filename, source_path, completed_at, ffmpeg_exit_note
    ) VALUES (
      @cache_key, @channel_id, @filename, @source_path, datetime('now'), @ffmpeg_exit_note
    )
    ON CONFLICT(cache_key) DO UPDATE SET
      channel_id = excluded.channel_id,
      filename = excluded.filename,
      source_path = excluded.source_path,
      completed_at = datetime('now'),
      ffmpeg_exit_note = excluded.ffmpeg_exit_note
  `).run(entry);
}

function getTranscodeCacheEntry(db, cacheKey) {
  return db.prepare('SELECT * FROM transcode_cache_entries WHERE cache_key = ?').get(cacheKey);
}

function lookupTranscodeCache(db, cacheKeyInput) {
  const cacheKey = normalizeCacheKeyInput(cacheKeyInput);
  if (!cacheKey) {
    return { cacheKey: null, entry: null, mediaFiles: [] };
  }

  const entry = getTranscodeCacheEntry(db, cacheKey);
  const mediaFiles = db
    .prepare(`
      SELECT channel_id, kind, filename, source_path, title, duration_seconds, cache_key
      FROM media_files
      WHERE cache_key = ?
      ORDER BY channel_id, filename
    `)
    .all(cacheKey);

  return { cacheKey, entry, mediaFiles };
}

module.exports = {
  lookupTranscodeCache,
  normalizeCacheKeyInput,
  upsertTranscodeCacheEntry,
};
