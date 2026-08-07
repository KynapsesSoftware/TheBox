const guideGrid = document.getElementById('guide-grid');
const statusText = document.getElementById('status-text');
const clockText = document.getElementById('clock-text');
const dateText = document.getElementById('date-text');

function updateClock() {
  clockText.textContent = new Date().toLocaleString();
}

function buildTimeHeaders() {
  const now = new Date();
  const headers = [];
  for (let i = 0; i < 4; i += 1) {
    const slot = new Date(now.getTime() + (i * 60 * 60 * 1000));
    slot.setMinutes(0, 0, 0);
    headers.push(TheBox.formatClock(slot));
  }
  return headers;
}

TheBox.remote.register('guide', {
  onMount() {
    TheBox.remote.focusList = TheBox.remote.createFocusList(
      guideGrid,
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
  statusText.textContent = 'BUILDING GUIDE...';
  guideGrid.innerHTML = '';

  try {
    const guide = await TheBox.apiGet('/api/guide');
    if (dateText) {
      dateText.textContent = guide.date;
    }
    statusText.textContent = 'NOW SHOWING';

    const headers = buildTimeHeaders();
    guideGrid.appendChild(Object.assign(document.createElement('div'), {
      className: 'guide-cell channel-name',
      textContent: 'CHANNEL',
    }));

    headers.forEach((header) => {
      guideGrid.appendChild(Object.assign(document.createElement('div'), {
        className: 'guide-cell time-header',
        textContent: header,
      }));
    });

    guide.channels.forEach((channelSchedule) => {
      const channelLink = document.createElement('a');
      channelLink.className = 'guide-cell channel-name';
      channelLink.href = `watch.html?channel=${encodeURIComponent(channelSchedule.channelId)}`;
      channelLink.textContent = channelSchedule.channelId.toUpperCase();
      guideGrid.appendChild(channelLink);

      const upcoming = channelSchedule.slots.slice(0, 4);
      for (let i = 0; i < 4; i += 1) {
        const cell = document.createElement('div');
        cell.className = 'guide-cell';
        if (upcoming[i]) {
          cell.innerHTML = `<div>${TheBox.formatClock(upcoming[i].startsAt)}</div><div>${upcoming[i].title}</div>`;
        } else {
          cell.textContent = '---';
        }
        guideGrid.appendChild(cell);
      }
    });

    TheBox.remote.mountPage('guide');
  } catch (error) {
    statusText.textContent = 'ERROR';
    guideGrid.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

updateClock();
setInterval(updateClock, 1000);
renderGuide();
