const params = new URLSearchParams(window.location.search);
const channelId = params.get('channel');

const mediaStage = document.getElementById('media-stage');
const nowOverlay = document.getElementById('now-overlay');
const channelArtwork = document.getElementById('channel-artwork');
const videoPlayer = document.getElementById('video-player');
const audioPlayer = document.getElementById('audio-player');
const channelSubtitle = document.getElementById('channel-subtitle');
const watchHelp = document.getElementById('watch-help');
const nowTitle = document.getElementById('now-title');
const nowTimes = document.getElementById('now-times');
const channelName = document.getElementById('channel-name');
const channelPageNumber = document.getElementById('channel-page-number');
const statusText = document.getElementById('status-text');
const clockText = document.getElementById('clock-text');
const scheduleList = document.getElementById('schedule-list');

let channelConfig = null;
let currentMediaUrl = null;
let currentStartsAt = null;
let currentStopOffsetSeconds = null;
let lastScrolledStartsAt = null;
let scheduleFocusIndex = 0;
let watchRemoteMounted = false;
let fullscreenOverlayTimer = null;
let showingTestPattern = false;

const FULLSCREEN_OVERLAY_MS = 5000;
const TEST_PATTERN_SLOT_KEY = '__test_pattern__';
const UNAVAILABLE_MESSAGE = 'PROGRAMME NOT AVAILABLE AT THIS TIME';

function slotTranscodeBlocksPlayback(slot) {
  const status = slot?.transcodeStatus;
  if (!status || status === 'native' || status === 'cached') {
    return false;
  }

  return true;
}

function buildUnavailableNowFromSlot(nowBase, slot) {
  const { mediaUrl, ...rest } = slot;
  return {
    ...nowBase,
    ...rest,
    title: slot.title,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    offsetSeconds: slot.offsetSeconds ?? 0,
    playbackUnavailable: true,
    reason: slot.transcodeStatus === 'failed' ? 'transcodeFailed' : 'transcodePending',
  };
}

if (channelId) {
  sessionStorage.setItem('thebox:lastChannel', channelId);
}

function isAudioChannel() {
  return channelConfig?.mediaType === 'audio';
}

function getPlayer() {
  if (showingTestPattern) {
    return videoPlayer;
  }

  return isAudioChannel() ? audioPlayer : videoPlayer;
}

function applyTestPatternLayout() {
  showingTestPattern = true;
  mediaStage.classList.remove('audio-mode');
  videoPlayer.hidden = false;
  audioPlayer.hidden = true;
  channelArtwork.hidden = true;
  channelSubtitle.textContent = 'TEST SIGNAL';
}

function clearTestPatternLayout() {
  if (!showingTestPattern) {
    return;
  }

  showingTestPattern = false;
  videoPlayer.loop = false;
  applyChannelMode();
}

function updateClock() {
  clockText.textContent = TheBox.formatLocalDateTime();
}

function updateChannelPageLabel() {
  if (!channelPageNumber) {
    return;
  }

  const page = channelConfig?.pageNumber;
  channelPageNumber.textContent = Number.isInteger(page)
    ? `PAGE ${page}`
    : 'PAGE ---';
}

function applyChannelMode() {
  updateChannelPageLabel();

  const audio = isAudioChannel();

  mediaStage.classList.toggle('audio-mode', audio);
  videoPlayer.hidden = audio;
  audioPlayer.hidden = !audio;

  if (audio) {
    channelSubtitle.textContent = 'LIVE AUDIO BROADCAST';
    watchHelp.textContent = 'ENTER = FULL SCREEN | BACK = EXIT FULL SCREEN | MENU = NOW SHOWING';

    if (channelConfig?.artworkUrl) {
      channelArtwork.src = channelConfig.artworkUrl;
      channelArtwork.hidden = false;
    } else {
      channelArtwork.removeAttribute('src');
      channelArtwork.hidden = true;
    }
  } else {
    channelSubtitle.textContent = 'LIVE BROADCAST SIMULATION';
    watchHelp.textContent = 'ENTER = FULL SCREEN | BACK = EXIT FULL SCREEN | MENU = NOW SHOWING';
    channelArtwork.hidden = true;
  }
}

function scrollScheduleToNowPlaying() {
  const currentRow = scheduleList.querySelector('.now-playing');
  if (!currentRow) {
    return;
  }

  requestAnimationFrame(() => {
    currentRow.scrollIntoView({ block: 'center', inline: 'nearest' });
    highlightScheduleRow(currentRow);
  });
}

function getScheduleRows() {
  return [...scheduleList.querySelectorAll('.row')];
}

function highlightScheduleRow(row) {
  getScheduleRows().forEach((item) => item.classList.remove('remote-focus'));
  row?.classList.add('remote-focus');
}

function focusScheduleRow(index) {
  const rows = getScheduleRows();
  if (!rows.length) {
    return;
  }

  let nextIndex = index;
  if (nextIndex < 0) {
    nextIndex = rows.length - 1;
  }
  if (nextIndex >= rows.length) {
    nextIndex = 0;
  }

  scheduleFocusIndex = nextIndex;
  const row = rows[nextIndex];
  highlightScheduleRow(row);
  row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function isWatchFullscreen() {
  return document.fullscreenElement === mediaStage;
}

function clearFullscreenOverlayTimer() {
  if (fullscreenOverlayTimer) {
    clearTimeout(fullscreenOverlayTimer);
    fullscreenOverlayTimer = null;
  }
}

function hideFullscreenNowOverlay() {
  if (!isWatchFullscreen()) {
    return;
  }

  nowOverlay?.classList.add('fullscreen-hidden');
  clearFullscreenOverlayTimer();
}

function showFullscreenNowOverlay(autoHide = true) {
  if (!isWatchFullscreen()) {
    return;
  }

  nowOverlay?.classList.remove('fullscreen-hidden');
  clearFullscreenOverlayTimer();

  if (autoHide) {
    fullscreenOverlayTimer = setTimeout(hideFullscreenNowOverlay, FULLSCREEN_OVERLAY_MS);
  }
}

function toggleFullscreenNowOverlay() {
  if (!isWatchFullscreen()) {
    return;
  }

  if (nowOverlay?.classList.contains('fullscreen-hidden')) {
    showFullscreenNowOverlay(true);
  } else {
    hideFullscreenNowOverlay();
  }
}

function resetNowOverlayForWindowedView() {
  clearFullscreenOverlayTimer();
  nowOverlay?.classList.remove('fullscreen-hidden');
}

async function toggleWatchFullscreen() {
  try {
    if (isWatchFullscreen()) {
      await document.exitFullscreen();
      return;
    }

    if (mediaStage.requestFullscreen) {
      await mediaStage.requestFullscreen();
    } else if (mediaStage.webkitRequestFullscreen) {
      await mediaStage.webkitRequestFullscreen();
    }
  } catch {
    // Fullscreen may be blocked until the user interacts with the page.
  }
}

function updateWatchStatus() {
  if (isWatchFullscreen()) {
    statusText.textContent = 'FULL SCREEN';
    showFullscreenNowOverlay(true);
  } else {
    resetNowOverlayForWindowedView();
    if (statusText.textContent === 'FULL SCREEN') {
      statusText.textContent = 'ON AIR';
    }
  }
}

TheBox.remote.register('watch', {
  onMount() {
    focusScheduleRow(getScheduleRows().findIndex((row) => row.classList.contains('now-playing')));
  },

  onKeyDown(_event, action) {
    if (action === 'back' && document.fullscreenElement) {
      document.exitFullscreen();
      return true;
    }

    return false;
  },

  onAction(action) {
    const player = getPlayer();

    switch (action) {
      case 'enter':
      case 'fullscreen':
        toggleWatchFullscreen();
        return true;
      case 'up':
        focusScheduleRow(scheduleFocusIndex - 1);
        return true;
      case 'down':
        focusScheduleRow(scheduleFocusIndex + 1);
        return true;
      case 'pageUp':
        focusScheduleRow(scheduleFocusIndex - 5);
        return true;
      case 'pageDown':
        focusScheduleRow(scheduleFocusIndex + 5);
        return true;
      case 'playPause':
        if (player.paused) {
          player.play().catch(() => {});
        } else {
          player.pause();
        }
        return true;
      case 'stop':
        player.pause();
        player.currentTime = 0;
        return true;
      case 'rewind':
        player.currentTime = Math.max(0, player.currentTime - 30);
        return true;
      case 'forward':
        player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 30);
        return true;
      case 'left':
        TheBox.remote.goBack();
        return true;
      case 'right':
        TheBox.remote.goToPageNumber(200);
        return true;
      case 'contextMenu':
        if (isWatchFullscreen()) {
          toggleFullscreenNowOverlay();
          return true;
        }
        return false;
      default:
        return false;
    }
  },
});

async function loadNowPlaying(advanceFromEnded = false) {
  if (!channelId) {
    statusText.textContent = 'NO CHANNEL SELECTED';
    return;
  }

  try {
    const [nowPlaying, schedule] = await Promise.all([
      TheBox.apiGet(`/api/channels/${encodeURIComponent(channelId)}/now`),
      TheBox.apiGet(`/api/channels/${encodeURIComponent(channelId)}/schedule`),
    ]);

    let now = nowPlaying;

    if (advanceFromEnded && !now.isTestPattern && currentStartsAt && now.startsAt === currentStartsAt) {
      const currentIndex = schedule.slots.findIndex((slot) => slot.startsAt === currentStartsAt);
      if (currentIndex >= 0 && currentIndex < schedule.slots.length - 1) {
        const next = schedule.slots[currentIndex + 1];
        const nowBase = {
          channelId: now.channelId,
          channelName: now.channelName,
          mediaType: now.mediaType,
        };

        if (slotTranscodeBlocksPlayback(next)) {
          now = buildUnavailableNowFromSlot(nowBase, next);
        } else {
          now = {
            ...nowBase,
            ...next,
            offsetSeconds: next.offsetSeconds ?? 0,
          };
        }
      }
    }

    channelName.textContent = now.channelName;
    nowTitle.textContent = now.title;

    if (now.playbackUnavailable) {
      clearTestPatternLayout();
      const player = getPlayer();
      player.removeAttribute('src');
      player.pause();
      currentMediaUrl = null;
      currentStartsAt = now.startsAt;
      currentStopOffsetSeconds = null;

      channelName.textContent = now.channelName;
      nowTitle.textContent = UNAVAILABLE_MESSAGE;
      nowTimes.textContent = `${now.title} · ${TheBox.formatClock(now.startsAt)} - ${TheBox.formatClock(now.endsAt)}`;
      statusText.textContent = now.reason === 'transcodeFailed' ? 'ENCODE FAILED' : 'NOT AVAILABLE';
    } else if (now.isTestPattern) {
      applyTestPatternLayout();
      nowTimes.textContent = 'STANDBY · NO PROGRAMME';
      statusText.textContent = 'TEST SIGNAL';

      const sourceChanged = currentMediaUrl !== now.mediaUrl;
      const slotChanged = currentStartsAt !== TEST_PATTERN_SLOT_KEY;
      const player = videoPlayer;
      videoPlayer.loop = true;

      if (sourceChanged) {
        currentMediaUrl = now.mediaUrl;
        player.src = now.mediaUrl;
      }

      if (sourceChanged || slotChanged) {
        currentStartsAt = TEST_PATTERN_SLOT_KEY;
        player.currentTime = 0;
        await player.play().catch(() => {});
      }

      currentStopOffsetSeconds = null;
    } else {
      clearTestPatternLayout();
      const player = getPlayer();

      nowTimes.textContent = `${TheBox.formatClock(now.startsAt)} - ${TheBox.formatClock(now.endsAt)}`;
      statusText.textContent = 'ON AIR';

      const sourceChanged = currentMediaUrl !== now.mediaUrl;
      const slotChanged = currentStartsAt !== now.startsAt;

      if (sourceChanged) {
        currentMediaUrl = now.mediaUrl;
        player.src = now.mediaUrl;
      }

      if (sourceChanged || slotChanged) {
        currentStartsAt = now.startsAt;
        const seekTo = now.offsetSeconds || 0;
        player.currentTime = seekTo;
        await player.play().catch(() => {});
      }

      if (now.isAd || now.isIdent) {
        currentStopOffsetSeconds = null;
      } else if (Number.isFinite(now.stopOffsetSeconds)) {
        currentStopOffsetSeconds = now.stopOffsetSeconds;
      } else {
        currentStopOffsetSeconds = null;
      }
    }

    const programmeSlots = schedule.programmes?.length
      ? schedule.programmes
      : schedule.slots.filter((slot) => !slot.isIdent && !slot.isAd);
    const nowMs = Date.now();

    scheduleList.innerHTML = '';
    programmeSlots.forEach((slot) => {
      const row = document.createElement('div');
      row.className = 'row';
      const slotStartMs = Date.parse(slot.startsAt);
      const slotEndMs = Date.parse(slot.endsAt);
      if (nowMs >= slotStartMs && nowMs < slotEndMs) {
        row.classList.add('now-playing');
      }
      row.innerHTML = `
        <span class="time-col">${TheBox.formatClock(slot.startsAt)}</span>
        <span>${slot.title}</span>
        <span>${TheBox.formatDuration(slot.durationSeconds)}</span>
      `;
      scheduleList.appendChild(row);
    });

    const nowIndex = programmeSlots.findIndex((slot) => {
      const slotStartMs = Date.parse(slot.startsAt);
      const slotEndMs = Date.parse(slot.endsAt);
      return nowMs >= slotStartMs && nowMs < slotEndMs;
    });
    if (nowIndex >= 0) {
      scheduleFocusIndex = nowIndex;
    }

    const scrollKey = now.isTestPattern ? TEST_PATTERN_SLOT_KEY : now.startsAt;
    if (scrollKey !== lastScrolledStartsAt) {
      scrollScheduleToNowPlaying();
      lastScrolledStartsAt = scrollKey;
    } else {
      focusScheduleRow(scheduleFocusIndex);
    }

    if (!watchRemoteMounted) {
      TheBox.remote.mountPage('watch');
      watchRemoteMounted = true;
    }
  } catch (error) {
    statusText.textContent = 'ERROR';
    nowTitle.textContent = error.message;
  }
}

async function initWatchPage() {
  if (!channelId) {
    statusText.textContent = 'NO CHANNEL SELECTED';
    updateChannelPageLabel();
    return;
  }

  try {
    channelConfig = await TheBox.apiGet(`/api/channels/${encodeURIComponent(channelId)}`);
    applyChannelMode();
    await loadNowPlaying();
  } catch (error) {
    statusText.textContent = 'ERROR';
    nowTitle.textContent = error.message;
  }
}

function bindPlayerEvents(player) {
  player.addEventListener('ended', () => {
    loadNowPlaying(true);
  });

  player.addEventListener('timeupdate', () => {
    if (currentStopOffsetSeconds == null || player.paused) {
      return;
    }

    if (player.currentTime >= currentStopOffsetSeconds - 0.35) {
      currentStopOffsetSeconds = null;
      loadNowPlaying(true);
    }
  });
}

bindPlayerEvents(videoPlayer);
bindPlayerEvents(audioPlayer);

videoPlayer.addEventListener('click', () => {
  if (showingTestPattern || !isAudioChannel()) {
    toggleWatchFullscreen();
  }
});

mediaStage.addEventListener('click', (event) => {
  if (isAudioChannel() && event.target !== audioPlayer) {
    toggleWatchFullscreen();
  }
});

document.addEventListener('fullscreenchange', updateWatchStatus);

async function bootWatchPage() {
  await TheBox.ready;
  TheBox.applyDocumentTitle('Watch');
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(loadNowPlaying, 30000);
  initWatchPage();
}

bootWatchPage();
