function encodeMediaPath(filename) {
  return filename.split('/').map((segment) => encodeURIComponent(segment)).join('/');
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

function jitterMs(rng, jitterMinutes) {
  if (!jitterMinutes) {
    return 0;
  }
  const span = jitterMinutes * 60 * 1000;
  return Math.floor((rng() * 2 - 1) * span);
}

function generateBreakTargets(windowStartMs, windowEndMs, intervalMinutes, jitterMinutes, seed) {
  const rng = createRng(seed);
  const intervalMs = intervalMinutes * 60 * 1000;
  const targets = [];
  let t = windowStartMs + intervalMs + jitterMs(rng, jitterMinutes);

  while (t < windowEndMs) {
    targets.push(t);
    t += intervalMs + jitterMs(rng, jitterMinutes);
  }

  return targets;
}

function pickAdsForBreak(rng, ads, minAds, maxAds) {
  const count = minAds + Math.floor(rng() * (maxAds - minAds + 1));
  const pool = shuffle(ads, Math.floor(rng() * 4294967295));
  return pool.slice(0, Math.min(count, pool.length));
}

function createProgrammeSegmentSlot(channel, video, cursor, offsetSeconds, durationSeconds, meta) {
  const durationMs = durationSeconds * 1000;
  const encodedFile = encodeMediaPath(video.filename);
  return {
    title: video.title,
    filename: video.filename,
    startsAt: new Date(cursor).toISOString(),
    endsAt: new Date(cursor + durationMs).toISOString(),
    durationSeconds,
    offsetSeconds,
    mediaUrl: `/media/${encodeURIComponent(channel.id)}/${encodedFile}`,
    isIdent: false,
    isAd: false,
    broadcastProgrammeId: meta.broadcastProgrammeId,
    overlayTitle: meta.overlayTitle,
    overlayStartsAt: meta.overlayStartsAt,
    overlayEndsAt: meta.overlayEndsAt,
    adPlacement: null,
    stopOffsetSeconds: offsetSeconds + durationSeconds,
  };
}

function createAdSlots(ads, cursor, meta) {
  const slots = [];
  let c = cursor;
  for (const ad of ads) {
    const durationMs = ad.durationSeconds * 1000;
    const encodedFile = encodeMediaPath(ad.filename);
    slots.push({
      title: ad.title,
      filename: ad.filename,
      startsAt: new Date(c).toISOString(),
      endsAt: new Date(c + durationMs).toISOString(),
      durationSeconds: ad.durationSeconds,
      offsetSeconds: 0,
      mediaUrl: `/media/ads/${encodedFile}`,
      isIdent: false,
      isAd: true,
      broadcastProgrammeId: meta.broadcastProgrammeId || null,
      overlayTitle: meta.overlayTitle,
      overlayStartsAt: meta.overlayStartsAt,
      overlayEndsAt: meta.overlayEndsAt,
      adPlacement: meta.adPlacement,
      nextOverlayTitle: meta.nextOverlayTitle || null,
      nextOverlayStartsAt: meta.nextOverlayStartsAt || null,
      nextOverlayEndsAt: meta.nextOverlayEndsAt || null,
    });
    c += durationMs;
  }
  return { slots, endCursor: c };
}

function createIdentSlot(channel, ident, cursor) {
  const durationMs = ident.durationSeconds * 1000;
  const encodedFile = encodeMediaPath(ident.filename);
  return {
    title: ident.title,
    filename: ident.filename,
    startsAt: new Date(cursor).toISOString(),
    endsAt: new Date(cursor + durationMs).toISOString(),
    durationSeconds: ident.durationSeconds,
    offsetSeconds: 0,
    mediaUrl: `/media/${encodeURIComponent(channel.id)}/ident/${encodedFile}`,
    isIdent: true,
    isAd: false,
    offsetSeconds: 0,
  };
}

function insertAdBreak(ctx, cursor, meta) {
  const ads = pickAdsForBreak(
    ctx.rng,
    ctx.ads,
    ctx.adsConfig.breakMinAds,
    ctx.adsConfig.breakMaxAds,
  );
  if (ads.length === 0) {
    return cursor;
  }
  const { slots, endCursor } = createAdSlots(ads, cursor, meta);
  ctx.slots.push(...slots);
  return endCursor;
}

function playProgrammeWithMidroll(ctx, video, programmeIndex) {
  const contentTotalMs = video.durationSeconds * 1000;
  const broadcastProgrammeId = `${ctx.dateKey}:${programmeIndex}:${video.filename}`;
  let fileOffsetMs = 0;
  let blockWallStart = ctx.cursor;
  const endGuardMs = ctx.adsConfig.programEndGuardMinutes * 60 * 1000;

  while (fileOffsetMs < contentTotalMs && ctx.cursor < ctx.windowEndMs) {
    const remainingContentMs = contentTotalMs - fileOffsetMs;
    const programmeContentEndWall = ctx.cursor + remainingContentMs;

    while (ctx.targetIndex < ctx.targets.length && ctx.targets[ctx.targetIndex] < ctx.cursor) {
      ctx.targetIndex += 1;
    }

    const nextTarget = ctx.targets[ctx.targetIndex];
    if (nextTarget === undefined || nextTarget >= programmeContentEndWall) {
      const segmentSeconds = Math.ceil(remainingContentMs / 1000);
      const overlayEndsAt = new Date(ctx.cursor + remainingContentMs).toISOString();
      ctx.slots.push(createProgrammeSegmentSlot(
        ctx.channel,
        video,
        ctx.cursor,
        Math.floor(fileOffsetMs / 1000),
        segmentSeconds,
        {
          broadcastProgrammeId,
          overlayTitle: video.title,
          overlayStartsAt: new Date(blockWallStart).toISOString(),
          overlayEndsAt,
        },
      ));
      ctx.cursor += remainingContentMs;
      fileOffsetMs = contentTotalMs;
      break;
    }

    const segmentMs = nextTarget - ctx.cursor;
    const contentOffsetAtBreak = fileOffsetMs + segmentMs;

    if (contentOffsetAtBreak > contentTotalMs - endGuardMs) {
      if (!ctx.postProgrammeDeferredBreak) {
        ctx.postProgrammeDeferredBreak = true;
      }
      ctx.targetIndex += 1;
      continue;
    }

    const segmentSeconds = Math.max(1, Math.ceil(segmentMs / 1000));
    ctx.slots.push(createProgrammeSegmentSlot(
      ctx.channel,
      video,
      ctx.cursor,
      Math.floor(fileOffsetMs / 1000),
      segmentSeconds,
      {
        broadcastProgrammeId,
        overlayTitle: video.title,
        overlayStartsAt: new Date(blockWallStart).toISOString(),
        overlayEndsAt: new Date(blockWallStart + contentTotalMs).toISOString(),
      },
    ));
    ctx.cursor += segmentMs;
    fileOffsetMs += segmentMs;

    const overlayEndsAt = new Date(blockWallStart + contentTotalMs).toISOString();
    ctx.cursor = insertAdBreak(ctx, ctx.cursor, {
      broadcastProgrammeId,
      overlayTitle: video.title,
      overlayStartsAt: new Date(blockWallStart).toISOString(),
      overlayEndsAt,
      adPlacement: 'midProgramme',
    });
    ctx.targetIndex += 1;
  }

  return broadcastProgrammeId;
}

function betweenProgrammeMeta(nextVideo) {
  if (!nextVideo) {
    return {
      adPlacement: 'betweenProgrammes',
      overlayTitle: 'Nothing scheduled right now',
      nextOverlayTitle: 'Nothing scheduled right now',
      broadcastProgrammeId: null,
    };
  }

  return {
    adPlacement: 'betweenProgrammes',
    overlayTitle: nextVideo.title,
    nextOverlayTitle: nextVideo.title,
    broadcastProgrammeId: null,
  };
}

function processGapBeforeNextProgramme(ctx, nextVideo) {
  if (ctx.postProgrammeDeferredBreak) {
    ctx.cursor = insertAdBreak(ctx, ctx.cursor, betweenProgrammeMeta(nextVideo));
    ctx.postProgrammeDeferredBreak = false;
  }

  while (
    ctx.targetIndex < ctx.targets.length
    && ctx.targets[ctx.targetIndex] <= ctx.cursor
    && ctx.cursor < ctx.windowEndMs
  ) {
    ctx.cursor = insertAdBreak(ctx, ctx.cursor, betweenProgrammeMeta(nextVideo));
    ctx.targetIndex += 1;
  }
}

function generateScheduleWithAds(channel, window, playlist, identPlaylist, identInterval, adsLibrary, dateKey, seed) {
  const targets = generateBreakTargets(
    window.windowStartMs,
    window.windowEndMs,
    adsLibrary.config.intervalMinutes,
    adsLibrary.config.intervalJitterMinutes,
    hashSeed(`${channel.id}:ad-targets:${dateKey}`),
  );

  const ctx = {
    channel,
    windowEndMs: window.windowEndMs,
    dateKey,
    ads: adsLibrary.ads,
    adsConfig: adsLibrary.config,
    rng: createRng(hashSeed(`${channel.id}:ad-picks:${dateKey}`)),
    slots: [],
    cursor: window.windowStartMs,
    targets,
    targetIndex: 0,
    postProgrammeDeferredBreak: false,
  };

  let index = 0;
  let identIndex = 0;
  let videosSinceIdent = 0;

  while (ctx.cursor < ctx.windowEndMs && index < playlist.length * 200) {
    const video = playlist[index % playlist.length];

    processGapBeforeNextProgramme(ctx, video);

    if (ctx.cursor >= ctx.windowEndMs) {
      break;
    }

    playProgrammeWithMidroll(ctx, video, index);
    index += 1;
    videosSinceIdent += 1;

    const upcoming = playlist[index % playlist.length];
    processGapBeforeNextProgramme(ctx, upcoming);

    if (
      identInterval > 0
      && identPlaylist.length > 0
      && videosSinceIdent >= identInterval
      && ctx.cursor < ctx.windowEndMs
    ) {
      const ident = identPlaylist[identIndex % identPlaylist.length];
      ctx.slots.push(createIdentSlot(ctx.channel, ident, ctx.cursor));
      ctx.cursor += ident.durationSeconds * 1000;
      identIndex += 1;
      videosSinceIdent = 0;
    }
  }

  const programmes = buildDisplayProgrammes(ctx.slots);
  updateBetweenProgrammeOverlay(ctx.slots, programmes);

  return {
    slots: ctx.slots,
    programmes,
  };
}

function hashSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildDisplayProgrammes(slots) {
  const programmes = [];
  let current = null;

  for (const slot of slots) {
    if (slot.isAd || slot.isIdent) {
      if (current) {
        current.endsAt = slot.endsAt;
        current.durationSeconds = Math.round(
          (Date.parse(current.endsAt) - Date.parse(current.startsAt)) / 1000,
        );
      }
      continue;
    }

    if (!slot.broadcastProgrammeId) {
      continue;
    }

    if (!current || current.broadcastProgrammeId !== slot.broadcastProgrammeId) {
      if (current) {
        programmes.push(current);
      }
      current = {
        title: slot.title,
        filename: slot.filename,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        durationSeconds: slot.durationSeconds,
        broadcastProgrammeId: slot.broadcastProgrammeId,
        mediaUrl: slot.mediaUrl,
        isIdent: false,
        isAd: false,
      };
    } else {
      current.endsAt = slot.endsAt;
      current.durationSeconds = Math.round(
        (Date.parse(current.endsAt) - Date.parse(current.startsAt)) / 1000,
      );
    }
  }

  if (current) {
    programmes.push(current);
  }

  return programmes;
}

function updateBetweenProgrammeOverlay(slots, programmes) {
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (!slot.isAd || slot.adPlacement !== 'betweenProgrammes') {
      continue;
    }

    const nextProgramme = programmes.find(
      (programme) => Date.parse(programme.startsAt) >= Date.parse(slot.endsAt),
    );

    if (nextProgramme) {
      slot.nextOverlayTitle = nextProgramme.title;
      slot.nextOverlayStartsAt = nextProgramme.startsAt;
      slot.nextOverlayEndsAt = nextProgramme.endsAt;
      slot.overlayTitle = nextProgramme.title;
      slot.overlayStartsAt = nextProgramme.startsAt;
      slot.overlayEndsAt = nextProgramme.endsAt;
    } else {
      slot.nextOverlayTitle = 'Nothing scheduled right now';
      slot.overlayTitle = 'Nothing scheduled right now';
    }
  }
}

function enrichNowPlaying(schedule, slot) {
  if (!slot) {
    return null;
  }

  if (slot.isAd) {
    if (slot.adPlacement === 'betweenProgrammes') {
      const title = slot.nextOverlayTitle || slot.overlayTitle || 'Nothing scheduled right now';
      const startsAt = slot.nextOverlayStartsAt || slot.startsAt;
      const endsAt = slot.nextOverlayEndsAt || slot.endsAt;
      return {
        ...slot,
        overlayTitle: title,
        overlayStartsAt: startsAt,
        overlayEndsAt: endsAt,
        displayTitle: title,
        displayStartsAt: startsAt,
        displayEndsAt: endsAt,
      };
    }

    return {
      ...slot,
      overlayTitle: slot.overlayTitle || slot.title,
      overlayStartsAt: slot.overlayStartsAt || slot.startsAt,
      overlayEndsAt: slot.overlayEndsAt || slot.endsAt,
      displayTitle: slot.overlayTitle || slot.title,
      displayStartsAt: slot.overlayStartsAt || slot.startsAt,
      displayEndsAt: slot.overlayEndsAt || slot.endsAt,
    };
  }

  return {
    ...slot,
    displayTitle: slot.title,
    displayStartsAt: slot.startsAt,
    displayEndsAt: slot.endsAt,
    overlayTitle: slot.title,
    overlayStartsAt: slot.startsAt,
    overlayEndsAt: slot.endsAt,
  };
}

module.exports = {
  buildDisplayProgrammes,
  enrichNowPlaying,
  generateScheduleWithAds,
};
