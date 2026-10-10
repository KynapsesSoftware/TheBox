const statusText = document.getElementById('status-text');
const listenSummary = document.getElementById('listen-summary');
const saveNotice = document.getElementById('save-notice');
const formError = document.getElementById('form-error');
const settingsForm = document.getElementById('settings-form');

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

function listToCsv(items) {
  return (items || []).join(', ');
}

function csvToList(raw) {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function renderListen(listen) {
  const envBadge =
    listen.envOverrides?.host || listen.envOverrides?.port
      ? ' (HOST/PORT env overrides active)'
      : '';
  listenSummary.textContent = `Listening on ${listen.host}:${listen.port}${envBadge} — database host/port: ${listen.databaseHost}:${listen.databasePort}`;
}

function fillForm(settings) {
  document.getElementById('field-host').value = settings.host ?? '';
  document.getElementById('field-port').value = settings.port ?? '';
  document.getElementById('field-scanInterval').value = settings.scanIntervalMinutes ?? 0;
  document.getElementById('field-timezone').value = settings.schedule?.timezone ?? '';
  document.getElementById('field-hoursToGenerate').value = settings.schedule?.hoursToGenerate ?? 24;
  document.getElementById('field-defaultStart').value = settings.schedule?.defaultStartTime ?? '';
  document.getElementById('field-defaultEnd').value = settings.schedule?.defaultEndTime ?? '';
  document.getElementById('field-uiTitle').value = settings.ui?.title ?? '';
  document.getElementById('field-defaultPage').value = settings.ui?.defaultPage ?? 100;
  document.getElementById('field-videoExtensions').value = listToCsv(settings.videoExtensions);
  document.getElementById('field-audioExtensions').value = listToCsv(settings.audioExtensions);
  document.getElementById('field-adsEnabled').checked = settings.ads?.enabled === true;
  document.getElementById('field-adsPath').value = settings.ads?.path ?? '';
  document.getElementById('field-breakMin').value = settings.ads?.breakMinAds ?? 1;
  document.getElementById('field-breakMax').value = settings.ads?.breakMaxAds ?? 3;
  document.getElementById('field-intervalMin').value = settings.ads?.intervalMinutes ?? 15;
  document.getElementById('field-intervalJitter').value = settings.ads?.intervalJitterMinutes ?? 3;
  document.getElementById('field-programEndGuard').value = settings.ads?.programEndGuardMinutes ?? 5;
  document.getElementById('field-testPattern').value = settings.testPattern?.path ?? '';
  document.getElementById('field-transcodeEnabled').checked = settings.transcode?.enabled === true;
  document.getElementById('field-cachePath').value = settings.transcode?.cachePath ?? '';
  document.getElementById('field-maxConcurrent').value = settings.transcode?.maxConcurrentJobs ?? 1;
  document.getElementById('field-maxHeight').value = settings.transcode?.maxHeight ?? 720;
  document.getElementById('field-scheduleAhead').value = settings.transcode?.scheduleAheadDays ?? 1;
  document.getElementById('field-videoCodec').value = settings.transcode?.videoCodec ?? 'h264';
  document.getElementById('field-audioCodec').value = settings.transcode?.audioCodec ?? 'aac';
  document.getElementById('field-preset').value = settings.transcode?.preset ?? 'veryfast';
  document.getElementById('field-nativeVideo').value = listToCsv(settings.transcode?.nativeVideoCodecs);
  document.getElementById('field-nativeAudio').value = listToCsv(settings.transcode?.nativeAudioCodecs);
  document.getElementById('field-probeExt').value = listToCsv(settings.transcode?.probeExtensions);
  document.getElementById('field-rescanOnStartup').checked = settings.library?.rescanOnStartup === true;
}

function readFormSettings() {
  return {
    host: document.getElementById('field-host').value.trim(),
    port: Number(document.getElementById('field-port').value),
    scanIntervalMinutes: Number(document.getElementById('field-scanInterval').value),
    videoExtensions: csvToList(document.getElementById('field-videoExtensions').value),
    audioExtensions: csvToList(document.getElementById('field-audioExtensions').value),
    schedule: {
      timezone: document.getElementById('field-timezone').value.trim(),
      hoursToGenerate: Number(document.getElementById('field-hoursToGenerate').value),
      defaultStartTime: document.getElementById('field-defaultStart').value.trim(),
      defaultEndTime: document.getElementById('field-defaultEnd').value.trim(),
    },
    ui: {
      title: document.getElementById('field-uiTitle').value.trim(),
      defaultPage: Number(document.getElementById('field-defaultPage').value),
    },
    ads: {
      enabled: document.getElementById('field-adsEnabled').checked,
      path: document.getElementById('field-adsPath').value.trim(),
      breakMinAds: Number(document.getElementById('field-breakMin').value),
      breakMaxAds: Number(document.getElementById('field-breakMax').value),
      intervalMinutes: Number(document.getElementById('field-intervalMin').value),
      intervalJitterMinutes: Number(document.getElementById('field-intervalJitter').value),
      programEndGuardMinutes: Number(document.getElementById('field-programEndGuard').value),
    },
    testPattern: {
      path: document.getElementById('field-testPattern').value.trim(),
    },
    transcode: {
      enabled: document.getElementById('field-transcodeEnabled').checked,
      cachePath: document.getElementById('field-cachePath').value.trim(),
      maxConcurrentJobs: Number(document.getElementById('field-maxConcurrent').value),
      maxHeight: Number(document.getElementById('field-maxHeight').value),
      scheduleAheadDays: Number(document.getElementById('field-scheduleAhead').value),
      videoCodec: document.getElementById('field-videoCodec').value.trim(),
      audioCodec: document.getElementById('field-audioCodec').value.trim(),
      preset: document.getElementById('field-preset').value.trim(),
      nativeVideoCodecs: csvToList(document.getElementById('field-nativeVideo').value),
      nativeAudioCodecs: csvToList(document.getElementById('field-nativeAudio').value),
      probeExtensions: csvToList(document.getElementById('field-probeExt').value),
    },
    library: {
      rescanOnStartup: document.getElementById('field-rescanOnStartup').checked,
    },
  };
}

async function loadSettings() {
  clearError();
  saveNotice.hidden = true;
  setStatus('Loading…');
  const response = await fetch('/api/admin/settings');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  fillForm(payload.settings);
  renderListen(payload.listen);
  setStatus('Ready');
}

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  saveNotice.hidden = true;
  setStatus('Saving…');

  try {
    const response = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: readFormSettings() }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const details = (payload.details || []).join(' ');
      showError(details || payload.error || 'Save failed');
      setStatus('Save failed');
      return;
    }

    fillForm(payload.settings);
    renderListen(payload.listen);
    setStatus('Saved');

    if (payload.restartRequired) {
      saveNotice.hidden = false;
      saveNotice.textContent =
        'Host or port changed in the database. Restart the server for the new listen address to take effect (unless HOST/PORT env overrides bind).';
    }
  } catch (error) {
    showError(error.message);
    setStatus('Save failed');
  }
});

document.getElementById('reload-btn').addEventListener('click', () => {
  loadSettings().catch((error) => {
    showError(error.message);
    setStatus('Load failed');
  });
});

loadSettings().catch((error) => {
  showError(error.message);
  setStatus('Load failed');
});
