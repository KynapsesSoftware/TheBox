const statusText = document.getElementById('status-text');
const channelsBody = document.getElementById('channels-body');
const editorPanel = document.getElementById('editor-panel');
const editorTitle = document.getElementById('editor-title');
const channelForm = document.getElementById('channel-form');
const formError = document.getElementById('form-error');
const fieldId = document.getElementById('field-id');

let editingId = null;

const CHANNEL_COLORS = ['cyan', 'green', 'yellow', 'red', 'blue', 'magenta'];

function setStatus(message) {
  statusText.textContent = message;
}

function showError(message) {
  formError.hidden = false;
  formError.textContent = message;
}

function clearError() {
  formError.hidden = true;
  formError.textContent = '';
}

function sourcePathsToText(paths) {
  return (paths || []).join('\n');
}

function readFormPayload() {
  const sourcePaths = document.getElementById('field-sourcePaths').value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    id: fieldId.value.trim(),
    displayName: document.getElementById('field-displayName').value.trim(),
    pageNumber: document.getElementById('field-pageNumber').value
      ? Number(document.getElementById('field-pageNumber').value)
      : null,
    color: document.getElementById('field-color').value,
    mediaType: document.getElementById('field-mediaType').value,
    sourcePaths,
    identPath: document.getElementById('field-identPath').value.trim(),
    testcardPath: document.getElementById('field-testcardPath').value.trim(),
    artworkPath: document.getElementById('field-artworkPath').value.trim(),
    schedule: {
      startTime: document.getElementById('field-scheduleStart').value.trim() || null,
      endTime: document.getElementById('field-scheduleEnd').value.trim() || null,
    },
    identInterval: Number(document.getElementById('field-identInterval').value) || 0,
    maxContentDurationMinutes: document.getElementById('field-maxDuration').value
      ? Number(document.getElementById('field-maxDuration').value)
      : null,
    scanSubfolders: document.getElementById('field-scanSubfolders').checked,
    adsEnabled: document.getElementById('field-adsEnabled').checked,
  };
}

function fillForm(channel) {
  fieldId.value = channel.id;
  fieldId.readOnly = Boolean(editingId);
  document.getElementById('field-displayName').value = channel.displayName || '';
  document.getElementById('field-pageNumber').value = channel.pageNumber ?? '';
  const colorSelect = document.getElementById('field-color');
  const color = (channel.color || 'cyan').toLowerCase();
  if (CHANNEL_COLORS.includes(color)) {
    colorSelect.value = color;
  } else {
    colorSelect.value = 'cyan';
  }
  document.getElementById('field-mediaType').value = channel.mediaType || 'video';
  document.getElementById('field-sourcePaths').value = sourcePathsToText(channel.sourcePaths);
  document.getElementById('field-identPath').value = channel.identPath || '';
  document.getElementById('field-testcardPath').value = channel.testcardPath || '';
  document.getElementById('field-artworkPath').value = channel.artworkPath || '';
  document.getElementById('field-scheduleStart').value = channel.schedule?.startTime || '';
  document.getElementById('field-scheduleEnd').value = channel.schedule?.endTime || '';
  document.getElementById('field-identInterval').value = channel.identInterval ?? 0;
  document.getElementById('field-maxDuration').value = channel.maxContentDurationMinutes ?? '';
  document.getElementById('field-scanSubfolders').checked = channel.scanSubfolders === true;
  document.getElementById('field-adsEnabled').checked = channel.adsEnabled === true;
}

function openEditor(mode, channel = null) {
  clearError();
  editingId = mode === 'edit' ? channel.id : null;
  editorTitle.textContent = mode === 'edit' ? `Edit ${channel.id}` : 'New channel';
  fieldId.readOnly = mode === 'edit';
  document.getElementById('rescan-channel-btn').hidden = mode !== 'edit';
  document.getElementById('rebuild-channel-btn').hidden = mode !== 'edit';

  if (mode === 'edit') {
    fillForm(channel);
  } else {
    channelForm.reset();
    fieldId.readOnly = false;
    document.getElementById('field-color').value = 'cyan';
    document.getElementById('field-identInterval').value = '0';
  }

  editorPanel.hidden = false;
  editorPanel.scrollIntoView({ behavior: 'smooth' });
}

function closeEditor() {
  editorPanel.hidden = true;
  editingId = null;
}

async function loadChannels() {
  setStatus('Loading…');
  const data = await TheBox.apiGet('/api/admin/channels');
  channelsBody.innerHTML = '';

  for (const channel of data.channels) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><code>${channel.id}</code></td>
      <td>${channel.displayName}</td>
      <td>${channel.pageNumber ?? '—'}</td>
      <td>${channel.programmeCount ?? 0}</td>
      <td class="admin-table-actions"></td>
    `;

    const actions = row.querySelector('.admin-table-actions');
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'admin-btn admin-btn-secondary admin-btn-sm';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditor('edit', channel));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'admin-btn admin-btn-danger admin-btn-sm';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm(`Delete channel "${channel.id}"?`)) {
        return;
      }

      await fetch(`/api/admin/channels/${encodeURIComponent(channel.id)}`, { method: 'DELETE' });
      await loadChannels();
    });

    actions.append(editBtn, deleteBtn);
    channelsBody.appendChild(row);
  }

  setStatus(`${data.channels.length} channel(s)`);
}

channelForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const payload = readFormPayload();

  try {
    if (editingId) {
      await fetch(`/api/admin/channels/${encodeURIComponent(editingId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(async (response) => {
        if (!response.ok) {
          const body = await response.json();
          throw new Error((body.details || [body.error]).join('; '));
        }
      });
    } else {
      await fetch('/api/admin/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(async (response) => {
        if (!response.ok) {
          const body = await response.json();
          throw new Error((body.details || [body.error]).join('; '));
        }
      });
    }

    closeEditor();
    await loadChannels();
  } catch (error) {
    showError(error.message);
  }
});

document.getElementById('new-channel-btn').addEventListener('click', () => openEditor('new'));
document.getElementById('cancel-edit-btn').addEventListener('click', closeEditor);

document.getElementById('rescan-channel-btn').addEventListener('click', async () => {
  if (!editingId) {
    return;
  }

  setStatus('Rescanning…');
  await fetch(`/api/admin/channels/${encodeURIComponent(editingId)}/rescan`, { method: 'POST' });
  await loadChannels();
});

document.getElementById('rebuild-channel-btn').addEventListener('click', async () => {
  if (!editingId) {
    return;
  }

  setStatus('Rebuilding schedule…');
  await fetch('/api/admin/rebuild-schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId: editingId }),
  });
  setStatus('Schedule rebuilt');
});

document.getElementById('import-btn').addEventListener('click', async () => {
  if (!window.confirm('Import/merge all channels from channelsRoot into the database?')) {
    return;
  }

  setStatus('Importing…');
  await fetch('/api/admin/import-from-folders', { method: 'POST' });
  await loadChannels();
});

document.getElementById('rebuild-all-btn').addEventListener('click', async () => {
  setStatus('Rebuilding schedules…');
  await fetch('/api/admin/rebuild-schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  setStatus('Schedules rebuilt');
});

document.getElementById('global-rescan-btn').addEventListener('click', async () => {
  setStatus('Rescanning…');
  await fetch('/api/admin/rescan', { method: 'POST' });
  await loadChannels();
});

loadChannels().catch((error) => {
  setStatus('Database admin unavailable');
  document.getElementById('library-hint').textContent = error.message;
});
