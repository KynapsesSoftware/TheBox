const {
  generateChannelSchedule,
  generateGuide,
  getDateKey,
  scheduleSeedForChannelDay,
} = require('../scheduler');
const {
  deleteAllSchedules,
  deleteSchedulesForChannel,
  getScheduleRow,
  upsertScheduleRow,
} = require('./scheduleDb');

function rowToSchedule(row) {
  return {
    channelId: row.channel_id,
    date: row.date_key,
    startTime: row.start_time,
    endTime: row.end_time,
    slots: JSON.parse(row.slots_json),
    programmes: row.programmes_json ? JSON.parse(row.programmes_json) : [],
  };
}

function persistSchedule(db, schedule) {
  const seed = scheduleSeedForChannelDay(schedule.channelId, schedule.date);

  upsertScheduleRow(db, {
    channel_id: schedule.channelId,
    date_key: schedule.date,
    seed,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    slots_json: JSON.stringify(schedule.slots),
    programmes_json: JSON.stringify(schedule.programmes || []),
  });
}

function createPassthroughScheduleService() {
  return {
    enabled: false,
    getSchedule(channel, scheduleOptions) {
      return generateChannelSchedule(channel, scheduleOptions);
    },
    generateGuide(channels, scheduleOptions) {
      return generateGuide(channels, scheduleOptions);
    },
    ensureAhead() {},
    invalidateAll() {},
    invalidateChannel() {},
    rebuildChannel() {},
  };
}

function createDatabaseScheduleService(db, { expandChannel = null } = {}) {
  function channelForSchedule(channel) {
    if (typeof expandChannel === 'function') {
      return expandChannel(channel);
    }

    return channel;
  }

  function buildAndPersist(channel, scheduleOptions) {
    const schedule = generateChannelSchedule(channelForSchedule(channel), scheduleOptions);
    persistSchedule(db, schedule);
    return schedule;
  }

  function readOrBuildSchedule(channel, scheduleOptions) {
    const dateKey = getDateKey(scheduleOptions.date, scheduleOptions.timezone);
    const cached = getScheduleRow(db, channel.id, dateKey);

    if (cached) {
      return rowToSchedule(cached);
    }

    return buildAndPersist(channel, scheduleOptions);
  }

  function ensureAhead(channels, scheduleOptionsFactory, dayCount, options = {}) {
    const force = options.force === true;
    const nowMs = Date.now();
    let built = 0;
    let reused = 0;

    for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
      const date = new Date(nowMs + (dayOffset * 24 * 60 * 60 * 1000));
      const scheduleOptions = scheduleOptionsFactory(date);

      for (const channel of channels) {
        const dateKey = getDateKey(date, scheduleOptions.timezone);
        const cached = !force ? getScheduleRow(db, channel.id, dateKey) : null;

        if (cached) {
          reused += 1;
          continue;
        }

        buildAndPersist(channel, scheduleOptions);
        built += 1;
      }
    }

    if (built > 0) {
      console.log(`Schedule cache: built ${built} row(s), ${reused} already cached.`);
    }
  }

  return {
    enabled: true,
    getSchedule(channel, scheduleOptions) {
      return readOrBuildSchedule(channel, scheduleOptions);
    },
    generateGuide(channels, scheduleOptions) {
      return channels.map((channel) => readOrBuildSchedule(channel, scheduleOptions));
    },
    ensureAhead(channels, scheduleOptionsFactory, dayCount, options) {
      ensureAhead(channels, scheduleOptionsFactory, dayCount, options);
    },
    invalidateAll() {
      deleteAllSchedules(db);
    },
    invalidateChannel(channelId) {
      deleteSchedulesForChannel(db, channelId);
    },
    rebuildChannel(channel, scheduleOptionsFactory, dayCount) {
      deleteSchedulesForChannel(db, channel.id);
      const nowMs = Date.now();

      for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
        const date = new Date(nowMs + (dayOffset * 24 * 60 * 60 * 1000));
        buildAndPersist(channel, scheduleOptionsFactory(date));
      }
    },
  };
}

function createScheduleCacheService({ db, enabled, expandChannel = null }) {
  if (!enabled || !db) {
    return createPassthroughScheduleService();
  }

  return createDatabaseScheduleService(db, { expandChannel });
}

module.exports = {
  createScheduleCacheService,
};
