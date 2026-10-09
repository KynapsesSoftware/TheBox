function getScheduleRow(db, channelId, dateKey) {
  return db
    .prepare(
      'SELECT * FROM schedules WHERE channel_id = ? AND date_key = ? AND invalidated_at IS NULL',
    )
    .get(channelId, dateKey);
}

function upsertScheduleRow(db, row) {
  db.prepare(`
    INSERT INTO schedules (
      channel_id, date_key, seed, start_time, end_time,
      slots_json, programmes_json, built_at, invalidated_at
    ) VALUES (
      @channel_id, @date_key, @seed, @start_time, @end_time,
      @slots_json, @programmes_json, datetime('now'), NULL
    )
    ON CONFLICT(channel_id, date_key) DO UPDATE SET
      seed = excluded.seed,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      slots_json = excluded.slots_json,
      programmes_json = excluded.programmes_json,
      built_at = datetime('now'),
      invalidated_at = NULL
  `).run(row);
}

function invalidateSchedulesForChannel(db, channelId) {
  db.prepare(
    'UPDATE schedules SET invalidated_at = datetime(\'now\') WHERE channel_id = ? AND invalidated_at IS NULL',
  ).run(channelId);
}

function deleteAllSchedules(db) {
  db.prepare('DELETE FROM schedules').run();
}

function deleteSchedulesForChannel(db, channelId) {
  db.prepare('DELETE FROM schedules WHERE channel_id = ?').run(channelId);
}

function countSchedules(db) {
  return db.prepare('SELECT COUNT(*) AS count FROM schedules').get().count;
}

module.exports = {
  countSchedules,
  deleteAllSchedules,
  deleteSchedulesForChannel,
  getScheduleRow,
  invalidateSchedulesForChannel,
  upsertScheduleRow,
};
