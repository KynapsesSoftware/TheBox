const keyLog = document.getElementById('key-log');
const lastKeyDisplay = document.getElementById('last-key-display');
const pageBufferDisplay = document.getElementById('page-buffer-display');
const statusText = document.getElementById('status-text');
const clockText = document.getElementById('clock-text');
const maxLogEntries = 30;

function updateClock() {
  clockText.textContent = new Date().toLocaleString();
}

function formatKeyEvent(event) {
  return [
    `key: ${event.key}`,
    `code: ${event.code}`,
    `keyCode: ${event.keyCode}`,
    `location: ${event.location}`,
    `repeat: ${event.repeat}`,
  ].join(' | ');
}

function appendLogEntry(event, mappedAction) {
  const entry = document.createElement('div');
  entry.className = 'remote-log-entry';
  entry.innerHTML = `
    <span class="remote-log-time">${new Date().toLocaleTimeString()}</span>
    <span class="remote-log-action">${mappedAction || 'unmapped'}</span>
    <span class="remote-log-detail">${formatKeyEvent(event)}</span>
  `;
  keyLog.prepend(entry);

  while (keyLog.children.length > maxLogEntries) {
    keyLog.removeChild(keyLog.lastChild);
  }
}

function updateLastKey(event, mappedAction) {
  lastKeyDisplay.innerHTML = `
    <div><strong>Mapped action:</strong> ${mappedAction || 'none'}</div>
    <div><strong>key:</strong> ${event.key}</div>
    <div><strong>code:</strong> ${event.code}</div>
    <div><strong>keyCode:</strong> ${event.keyCode}</div>
    <div><strong>location:</strong> ${event.location}</div>
  `;
}

TheBox.remote.register('remote-test', {
  onMount() {
    statusText.textContent = 'PRESS ANY REMOTE BUTTON';
  },

  onKeyDown(event) {
    const mappedAction = TheBox.remote.matchAction(event);
    const actionLabel = mappedAction?.type === 'digit'
      ? `digit:${mappedAction.value}`
      : mappedAction;

    updateLastKey(event, actionLabel);
    appendLogEntry(event, actionLabel);
    pageBufferDisplay.textContent = TheBox.remote.pageBuffer || '—';

    if (mappedAction?.type === 'digit') {
      TheBox.remote.queuePageDigit(mappedAction.value);
      pageBufferDisplay.textContent = TheBox.remote.pageBuffer || '—';
    } else if (mappedAction && TheBox.remote.handleGlobalAction(mappedAction)) {
      return true;
    }

    return true;
  },
});

updateClock();
setInterval(updateClock, 1000);
setInterval(() => {
  pageBufferDisplay.textContent = TheBox.remote.pageBuffer || '—';
}, 200);
TheBox.remote.mountPage('remote-test');
