const params = new URLSearchParams(window.location.search);
const channelId = params.get('channel');

const player = document.getElementById('player');
const nowTitle = document.getElementById('now-title');
const nowTimes = document.getElementById('now-times');
const channelName = document.getElementById('channel-name');
const statusText = document.getElementById('status-text');
const clockText = document.getElementById('clock-text');
const scheduleList = document.getElementById('schedule-list');

let currentMediaUrl = null;
let currentStartsAt = null;
let lastScrolledStartsAt = null;
let scheduleFocusIndex = 0;
let watchRemoteMounted = false;

if (channelId) {
  sessionStorage.setItem('thebox:lastChannel', channelId);
}

function updateClock() {
  clockText.textContent = new Date().toLocaleString();
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

function isVideoFullscreen() {
  return document.fullscreenElement === player;
}

async function toggleVideoFullscreen() {
  try {
    if (isVideoFullscreen()) {
      await document.exitFullscreen();
      return;
    }

    if (player.requestFullscreen) {
      await player.requestFullscreen();
    } else if (player.webkitRequestFullscreen) {
      await player.webkitRequestFullscreen();
    }
  } catch {
    // Fullscreen may be blocked until the user interacts with the page.
  }
}

function updateWatchStatus() {
  if (isVideoFullscreen()) {
    statusText.textContent = 'FULL SCREEN';
  } else if (statusText.textContent === 'FULL SCREEN') {
    statusText.textContent = 'ON AIR';
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
    switch (action) {
      case 'enter':
      case 'fullscreen':
        toggleVideoFullscreen();
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

    if (advanceFromEnded && currentStartsAt && now.startsAt === currentStartsAt) {
      const currentIndex = schedule.slots.findIndex((slot) => slot.startsAt === currentStartsAt);
      if (currentIndex >= 0 && currentIndex < schedule.slots.length - 1) {
        const next = schedule.slots[currentIndex + 1];
        now = {
          channelId: now.channelId,
          channelName: now.channelName,
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

    scheduleList.innerHTML = '';
    schedule.slots.forEach((slot) => {
      const row = document.createElement('div');
      row.className = 'row';
      if (slot.startsAt === now.startsAt) {
        row.classList.add('now-playing');
      }
      row.innerHTML = `
        <span class="time-col">${TheBox.formatClock(slot.startsAt)}</span>
        <span>${slot.title}</span>
        <span>${TheBox.formatDuration(slot.durationSeconds)}</span>
      `;
      scheduleList.appendChild(row);
    });

    const nowIndex = schedule.slots.findIndex((slot) => slot.startsAt === now.startsAt);
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

player.addEventListener('ended', () => {
  loadNowPlaying(true);
});

player.addEventListener('click', () => {
  toggleVideoFullscreen();
});

document.addEventListener('fullscreenchange', updateWatchStatus);

updateClock();
setInterval(updateClock, 1000);
setInterval(loadNowPlaying, 30000);
loadNowPlaying();
