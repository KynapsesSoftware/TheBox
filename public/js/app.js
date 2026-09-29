// Design / developer guide — set to true to show the layout overlay
TheBox.devGuideEnabled = false;

const channelList = document.getElementById('channel-list');
const statusText = document.getElementById('status-text');
const clockText = document.getElementById('clock-text');

function updateClock() {
  clockText.textContent = new Date().toLocaleString();
}

TheBox.remote.register('index', {
  onMount() {
    const container = document.getElementById('channel-list');
    TheBox.remote.focusList = TheBox.remote.createFocusList(container, 'a.row.clickable');
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
        focusList.focus(Math.max(0, focusList.index - 5));
        return true;
      case 'pageDown':
        focusList.focus(focusList.index + 5);
        return true;
      default:
        return false;
    }
  },
});

async function renderChannels() {
  statusText.textContent = 'LOADING CHANNELS...';
  channelList.innerHTML = '';

  try {
    const channels = await TheBox.apiGet('/api/channels');
    statusText.textContent = `${channels.length} CHANNEL(S) AVAILABLE`;

    if (channels.length === 0) {
      channelList.innerHTML = '<p class="help">Add media files to folders under <span class="color-yellow">channels/</span>, then rescan.</p>';
      TheBox.remote.mountPage('index');
      return;
    }

    const header = document.createElement('div');
    header.className = 'row header-row-grid channel-list-row';
    header.innerHTML = '<span>PAGE</span><span>CHANNEL</span><span>TYPE</span><span>ITEMS</span>';
    channelList.appendChild(header);

    channels.forEach((channel) => {
      const row = document.createElement('a');
      row.className = 'row clickable channel-list-row';
      row.href = `watch.html?channel=${encodeURIComponent(channel.id)}`;
      row.innerHTML = `
        <span class="color-${channel.color}">${channel.pageNumber ?? '---'}</span>
        <span>${channel.displayName}</span>
        <span>${channel.mediaType === 'audio' ? 'AUDIO' : 'VIDEO'}</span>
        <span>${channel.videoCount}</span>
      `;
      channelList.appendChild(row);
    });

    TheBox.remote.mountPage('index');
  } catch (error) {
    statusText.textContent = 'ERROR';
    channelList.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

updateClock();
setInterval(updateClock, 1000);
renderChannels();
