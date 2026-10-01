const guideHeader = document.getElementById('guide-header');
const guideBody = document.getElementById('guide-body');
const statusText = document.getElementById('status-text');
const clockText = document.getElementById('clock-text');
const dateText = document.getElementById('date-text');

function updateClock() {
  clockText.textContent = new Date().toLocaleString();
}

const GUIDE_HEADERS = ['ON NOW', 'NEXT', 'THEN', 'LATER'];
const GUIDE_REFRESH_MS = 60_000;

function findUpcomingStartIndex(slots, now = new Date()) {
  const nowMs = now.getTime();

  for (let i = 0; i < slots.length; i += 1) {
    const startMs = Date.parse(slots[i].startsAt);
    const endMs = Date.parse(slots[i].endsAt);
    if (nowMs >= startMs && nowMs < endMs) {
      return i;
    }
  }

  for (let i = 0; i < slots.length; i += 1) {
    if (Date.parse(slots[i].startsAt) > nowMs) {
      return i;
    }
  }

  return slots.length;
}

function isSlotOnNow(slot, now = new Date()) {
  const nowMs = now.getTime();
  const startMs = Date.parse(slot.startsAt);
  const endMs = Date.parse(slot.endsAt);
  return nowMs >= startMs && nowMs < endMs;
}

TheBox.remote.register('guide', {
  onMount() {
    TheBox.remote.focusList = TheBox.remote.createFocusList(
      guideBody,
      'a.guide-cell.channel-name',
    );
    TheBox.remote.focusList?.focus(0);
  },

  onAction(action) {
    const focusList = TheBox.remote.focusList;
    if (!focusList) {
      return false;
    }

    switch (action) {
      case 'up':
        focusList.move(-1);
        return true;
      case 'down':
        focusList.move(1);
        return true;
      case 'enter':
        focusList.activate();
        return true;
      case 'pageUp':
        focusList.focus(Math.max(0, focusList.index - 3));
        return true;
      case 'pageDown':
        focusList.focus(focusList.index + 3);
        return true;
      default:
        return false;
    }
  },
});

async function renderGuide() {
  const previousFocusIndex = TheBox.remote.focusList?.index ?? 0;
  statusText.textContent = 'BUILDING GUIDE...';
  guideHeader.innerHTML = '';
  guideBody.innerHTML = '';

  try {
    const guide = await TheBox.apiGet('/api/guide');
    const now = new Date();

    if (dateText) {
      dateText.textContent = guide.date;
    }
    statusText.textContent = 'NOW SHOWING';

    guideHeader.appendChild(Object.assign(document.createElement('div'), {
      className: 'guide-cell channel-name',
      textContent: 'CHANNEL',
    }));

    GUIDE_HEADERS.forEach((header) => {
      guideHeader.appendChild(Object.assign(document.createElement('div'), {
        className: 'guide-cell time-header',
        textContent: header,
      }));
    });

    guide.channels.forEach((channelSchedule) => {
      const channelLink = document.createElement('a');
      channelLink.className = 'guide-cell channel-name';
      channelLink.href = `watch.html?channel=${encodeURIComponent(channelSchedule.channelId)}`;
      channelLink.textContent = channelSchedule.channelId.toUpperCase();
      guideBody.appendChild(channelLink);

      const programmeSlots = channelSchedule.programmes?.length
        ? channelSchedule.programmes
        : channelSchedule.slots.filter((slot) => !slot.isIdent && !slot.isAd);
      const startIndex = findUpcomingStartIndex(programmeSlots, now);
      const upcoming = programmeSlots.slice(startIndex, startIndex + 4);

      for (let i = 0; i < 4; i += 1) {
        const cell = document.createElement('div');
        cell.className = 'guide-cell';
        if (upcoming[i]) {
          if (i === 0 && isSlotOnNow(upcoming[i], now)) {
            cell.classList.add('on-now');
          }
          cell.innerHTML = `<div class="guide-time">${TheBox.formatClock(upcoming[i].startsAt)}</div><div class="guide-title">${upcoming[i].title}</div>`;
        } else {
          cell.textContent = '---';
        }
        guideBody.appendChild(cell);
      }
    });

    TheBox.remote.mountPage('guide');
    TheBox.remote.focusList?.focus(previousFocusIndex);
  } catch (error) {
    statusText.textContent = 'ERROR';
    guideBody.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

updateClock();
setInterval(updateClock, 1000);
renderGuide();
setInterval(renderGuide, GUIDE_REFRESH_MS);
