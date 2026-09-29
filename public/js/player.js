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
const statusText = document.getElementById('status-text');
const clockText = document.getElementById('clock-text');
const scheduleList = document.getElementById('schedule-list');

let channelConfig = null;
let currentMediaUrl = null;
let currentStartsAt = null;
let lastScrolledStartsAt = null;
let scheduleFocusIndex = 0;
let watchRemoteMounted = false;
let fullscreenOverlayTimer = null;

const FULLSCREEN_OVERLAY_MS = 5000;

if (channelId) {
  sessionStorage.setItem('thebox:lastChannel', channelId);
}

function isAudioChannel() {
  return channelConfig?.mediaType === 'audio';
}

function getPlayer() {
  return isAudioChannel() ? audioPlayer : videoPlayer;
}

function updateClock() {
  clockText.textContent = new Date().toLocaleString();
}

function applyChannelMode() {
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
    const player = getPlayer();

    if (advanceFromEnded && currentStartsAt && now.startsAt === currentStartsAt) {
      const currentIndex = schedule.slots.findIndex((slot) => slot.startsAt === currentStartsAt);
      if (currentIndex >= 0 && currentIndex < schedule.slots.length - 1) {
        const next = schedule.slots[currentIndex + 1];
        now = {
          channelId: now.channelId,
          channelName: now.channelName,
          mediaType: now.mediaType,
          ...next,
          offsetSeconds: 0,
        };
      }
    }

    channelName.textContent = now.channelName;
    nowTitle.textContent = now.title;
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
      player.currentTime = now.offsetSeconds || 0;
      await player.play().catch(() => {});
    }

    const programmeSlots = schedule.slots.filter((slot) => !slot.isIdent);

    scheduleList.innerHTML = '';
    programmeSlots.forEach((slot) => {
      const row = document.createElement('div');
      row.className = 'row';
      if (!now.isIdent && slot.startsAt === now.startsAt) {
        row.classList.add('now-playing');
      }
      row.innerHTML = `
        <span class="time-col">${TheBox.formatClock(slot.startsAt)}</span>
        <span>${slot.title}</span>
        <span>${TheBox.formatDuration(slot.durationSeconds)}</span>
      `;
      scheduleList.appendChild(row);
    });

    const nowIndex = programmeSlots.findIndex((slot) => slot.startsAt === now.startsAt);
    if (nowIndex >= 0) {
      scheduleFocusIndex = nowIndex;
    }

    if (now.startsAt !== lastScrolledStartsAt) {
      scrollScheduleToNowPlaying();
      lastScrolledStartsAt = now.startsAt;
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
}

bindPlayerEvents(videoPlayer);
bindPlayerEvents(audioPlayer);

videoPlayer.addEventListener('click', () => {
  if (!isAudioChannel()) {
    toggleWatchFullscreen();
  }
});

mediaStage.addEventListener('click', (event) => {
  if (isAudioChannel() && event.target !== audioPlayer) {
    toggleWatchFullscreen();
  }
});

document.addEventListener('fullscreenchange', updateWatchStatus);

updateClock();
setInterval(updateClock, 1000);
setInterval(loadNowPlaying, 30000);
initWatchPage();
