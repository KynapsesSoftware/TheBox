const { channelAdsEnabled } = require('./ads');
const { enrichNowPlaying, generateScheduleWithAds } = require('./adScheduler');

function hashSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, seed) {
  const rng = createRng(seed);
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function getDateKey(date, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getTimezoneOffsetMs(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  }).formatToParts(date);

  const offsetPart = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3] || '0', 10);
  return sign * ((hours * 60) + minutes) * 60 * 1000;
}

function startOfDayMs(date, timezone) {
  const dateKey = getDateKey(date, timezone);
  const utcMidnight = Date.parse(`${dateKey}T00:00:00.000Z`);
  return utcMidnight - getTimezoneOffsetMs(new Date(utcMidnight), timezone);
}

function timeOnDateMs(dateKey, timeString, timezone) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeString);
  if (!match) {
    return startOfDayMs(new Date(`${dateKey}T12:00:00.000Z`), timezone);
  }

  const dayStartMs = startOfDayMs(new Date(`${dateKey}T12:00:00.000Z`), timezone);
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  return dayStartMs + (((hours * 60) + minutes) * 60 * 1000);
}

function resolveChannelWindow(channel, options) {
  const {
    date,
    timezone,
    defaultStartTime = '00:00',
    defaultEndTime = null,
    hoursToGenerate = 24,
  } = options;
  const dateKey = getDateKey(date, timezone);
  const dayStartMs = startOfDayMs(date, timezone);
  const startTime = channel.schedule?.startTime || defaultStartTime;
  const endTime = channel.schedule?.endTime ?? defaultEndTime;
  const windowStartMs = timeOnDateMs(dateKey, startTime, timezone);

  let windowEndMs;
  if (endTime === '24:00') {
    windowEndMs = dayStartMs + (24 * 60 * 60 * 1000);
  } else if (endTime) {
    windowEndMs = timeOnDateMs(dateKey, endTime, timezone);
  } else {
    windowEndMs = dayStartMs + (hoursToGenerate * 60 * 60 * 1000);
  }

  if (windowEndMs <= windowStartMs) {
    windowEndMs = windowStartMs + (hoursToGenerate * 60 * 60 * 1000);
  }

  return {
    dateKey,
    windowStartMs,
    windowEndMs,
    startTime,
    endTime,
  };
}

function buildPlaylist(videos, seed, maxContentDurationMinutes = null) {
  let playable = videos.filter((video) => video.durationSeconds && video.durationSeconds > 0);

  if (maxContentDurationMinutes) {
    const maxSeconds = maxContentDurationMinutes * 60;
    playable = playable.filter((video) => video.durationSeconds <= maxSeconds);
  }

  if (playable.length === 0) {
    return [];
  }

  return shuffle(playable, seed);
}

function buildIdentPlaylist(idents, seed) {
  const playable = idents.filter((ident) => ident.durationSeconds && ident.durationSeconds > 0);
  if (playable.length === 0) {
    return [];
  }

  return shuffle(playable, seed);
}

function encodeMediaPath(filename) {
  return filename.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function createScheduleSlot(channel, item, cursor, isIdent = false) {
  const durationMs = item.durationSeconds * 1000;
  const slotEnd = cursor + durationMs;
  const encodedFile = encodeMediaPath(item.filename);
  const mediaUrl = isIdent
    ? `/media/${encodeURIComponent(channel.id)}/ident/${encodedFile}`
    : `/media/${encodeURIComponent(channel.id)}/${encodedFile}`;

  return {
    title: item.title,
    filename: item.filename,
    startsAt: new Date(cursor).toISOString(),
    endsAt: new Date(slotEnd).toISOString(),
    durationSeconds: item.durationSeconds,
    mediaUrl,
    isIdent,
    isAd: false,
    offsetSeconds: 0,
    stopOffsetSeconds: item.durationSeconds,
  };
}

function generateChannelSchedule(channel, options) {
  const {
    dateKey,
    windowStartMs,
    windowEndMs,
    startTime,
    endTime,
  } = resolveChannelWindow(channel, options);
  const seed = hashSeed(`${channel.id}:${dateKey}`);
  const playlist = buildPlaylist(channel.videos, seed, channel.maxContentDuration);
  const identInterval = channel.identInterval || 0;
  const identPlaylist = identInterval > 0
    ? buildIdentPlaylist(channel.idents || [], hashSeed(`${channel.id}:idents:${dateKey}`))
    : [];

  if (playlist.length === 0) {
    return {
      channelId: channel.id,
      date: dateKey,
      startTime,
      endTime,
      slots: [],
      programmes: [],
    };
  }

  const adsLibrary = options.adsLibrary || null;
  if (adsLibrary && channelAdsEnabled(channel, adsLibrary)) {
    const window = { windowStartMs, windowEndMs };
    const { slots, programmes } = generateScheduleWithAds(
      channel,
      window,
      playlist,
      identPlaylist,
      identInterval,
      adsLibrary,
      dateKey,
      seed,
    );

    return {
      channelId: channel.id,
      date: dateKey,
      startTime,
      endTime,
      slots,
      programmes,
    };
  }

  const slots = [];
  let cursor = windowStartMs;
  let index = 0;
  let identIndex = 0;
  let videosSinceIdent = 0;

  while (cursor < windowEndMs) {
    const video = playlist[index % playlist.length];
    const videoSlot = createScheduleSlot(channel, video, cursor, false);

    slots.push(videoSlot);
    cursor = Date.parse(videoSlot.endsAt);
    index += 1;
    videosSinceIdent += 1;

    if (
      identInterval > 0
      && identPlaylist.length > 0
      && videosSinceIdent >= identInterval
      && cursor < windowEndMs
    ) {
      const ident = identPlaylist[identIndex % identPlaylist.length];
      const identSlot = createScheduleSlot(channel, ident, cursor, true);

      slots.push(identSlot);
      cursor = Date.parse(identSlot.endsAt);
      identIndex += 1;
      videosSinceIdent = 0;
    }

    if (index > playlist.length * 200) {
      break;
    }
  }

  const programmes = slots
    .filter((slot) => !slot.isIdent && !slot.isAd)
    .map((slot) => ({
      title: slot.title,
      filename: slot.filename,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      durationSeconds: slot.durationSeconds,
      mediaUrl: slot.mediaUrl,
      isIdent: false,
      isAd: false,
    }));

  return {
    channelId: channel.id,
    date: dateKey,
    startTime,
    endTime,
    slots,
    programmes,
  };
}

function findCurrentSlot(schedule, now = new Date()) {
  const nowMs = now.getTime();

  for (const slot of schedule.slots) {
    const startMs = Date.parse(slot.startsAt);
    const endMs = Date.parse(slot.endsAt);
    if (nowMs >= startMs && nowMs < endMs) {
      const elapsedInSlotSeconds = Math.floor((nowMs - startMs) / 1000);
      const fileOffsetAtSlotStart = slot.offsetSeconds || 0;
      return {
        ...slot,
        offsetSeconds: fileOffsetAtSlotStart + elapsedInSlotSeconds,
      };
    }
  }

  return null;
}

function generateGuide(channels, options) {
  return channels.map((channel) => generateChannelSchedule(channel, options));
}

function resolveNowPlaying(schedule, now = new Date()) {
  const current = findCurrentSlot(schedule, now);
  return enrichNowPlaying(schedule, current);
}

function scheduleSeedForChannelDay(channelId, dateKey) {
  return hashSeed(`${channelId}:${dateKey}`);
}

module.exports = {
  generateChannelSchedule,
  generateGuide,
  findCurrentSlot,
  resolveNowPlaying,
  getDateKey,
  resolveChannelWindow,
  scheduleSeedForChannelDay,
  timeOnDateMs,
};
