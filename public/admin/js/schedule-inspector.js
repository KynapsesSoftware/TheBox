const channelSelect = document.getElementById('channel-select');
const scheduleDateInput = document.getElementById('schedule-date');
const refreshBtn = document.getElementById('refresh-btn');
const rescanBtn = document.getElementById('rescan-btn');
const inspectorBody = document.getElementById('inspector-body');
const inspectorSummary = document.getElementById('inspector-summary');
const statusText = document.getElementById('status-text');
const clockText = document.getElementById('clock-text');

function updateClock() {
  if (clockText) {
    clockText.textContent = new Date().toLocaleString();
  }
}

function todayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function describeSlot(slot) {
  if (slot.isIdent) {
    return { label: 'Ident', className: 'slot-ident' };
  }

  if (slot.isAd) {
    const label = slot.adPlacement === 'midProgramme' ? 'Ad · mid-roll' : 'Ad · gap';
    return { label, className: 'slot-ad' };
  }

  if (slot.offsetSeconds > 0) {
    return { label: 'Programme · part', className: 'slot-programme-part' };
  }

  return { label: 'Programme', className: 'slot-programme' };
}

function formatOffsetRange(slot) {
  if (slot.isAd || slot.isIdent) {
    return slot.filename || '';
  }

  const start = slot.offsetSeconds || 0;
  const end = slot.stopOffsetSeconds ?? (start + (slot.durationSeconds || 0));
  return `${start}s → ${end}s · ${slot.filename || ''}`;
}

function isSlotOnNow(slot, nowMs) {
  const startMs = Date.parse(slot.startsAt);
  const endMs = Date.parse(slot.endsAt);
  return nowMs >= startMs && nowMs < endMs;
}

async function loadChannels() {
  const channels = await TheBox.apiGet('/api/channels');
  channelSelect.innerHTML = '';

  channels.forEach((channel) => {
    const option = document.createElement('option');
    option.value = channel.id;
    option.textContent = `${channel.displayName} (${channel.id})`;
    channelSelect.appendChild(option);
  });

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('channel');
  if (requested && channels.some((channel) => channel.id === requested)) {
    channelSelect.value = requested;
  }
}

function buildSummary(schedule) {
  const slots = schedule.slots || [];
  const programmes = schedule.programmes || [];
  const meta = schedule.meta || {};

  const counts = {
    programme: 0,
    part: 0,
    ad: 0,
    ident: 0,
  };

  slots.forEach((slot) => {
    const { className } = describeSlot(slot);
    if (className === 'slot-ident') {
      counts.ident += 1;
    } else if (className === 'slot-ad') {
      counts.ad += 1;
    } else if (className === 'slot-programme-part') {
      counts.part += 1;
    } else {
      counts.programme += 1;
    }
  });

  const adsNote = meta.adsLibraryActive
    ? (meta.channelAdsEnabled ? 'Ads on for channel' : 'Ads off for channel (global library OK)')
    : 'Ads library inactive';

  const identNote = meta.identInterval > 0
    ? `Idents every ${meta.identInterval} programme(s) · ${meta.identCount} file(s)`
    : 'Idents off';

  return [
    `Date ${schedule.date} · ${meta.timezone || '—'} · window ${schedule.startTime}–${schedule.endTime}`,
    `${slots.length} playback slots (${counts.programme} programme, ${counts.part} part, ${counts.ad} ad, ${counts.ident} ident) · ${programmes.length} on-air rows`,
    `${adsNote} · ${identNote}`,
  ].join(' · ');
}

function renderSchedule(schedule) {
  inspectorSummary.textContent = buildSummary(schedule);
  inspectorBody.innerHTML = '';

  const slots = schedule.slots || [];
  if (slots.length === 0) {
    inspectorBody.innerHTML = '<p class="admin-summary">No slots scheduled for this day.</p>';
    statusText.textContent = 'Empty schedule';
    return;
  }

  const nowMs = Date.now();
  const scheduleDate = schedule.date;
  const todayKey = todayDateInputValue();
  const highlightNow = scheduleDate === todayKey;

  const table = document.createElement('table');
  table.className = 'admin-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Start</th>
        <th>End</th>
        <th>Type</th>
        <th>Title</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');

  slots.forEach((slot, index) => {
    const { label, className } = describeSlot(slot);
    const row = document.createElement('tr');
    row.className = className;

    if (highlightNow && isSlotOnNow(slot, nowMs)) {
      row.classList.add('slot-now');
    }

    row.innerHTML = `
      <td class="col-num">${index + 1}</td>
      <td class="col-time">${TheBox.formatClock(slot.startsAt)}</td>
      <td class="col-time">${TheBox.formatClock(slot.endsAt)}</td>
      <td class="col-type">${label}</td>
      <td>${slot.title}</td>
      <td class="col-details">${formatOffsetRange(slot)}</td>
    `;
    tbody.appendChild(row);
  });

  inspectorBody.appendChild(table);
  statusText.textContent = `${slots.length} slots`;

  if (highlightNow) {
    const currentRow = tbody.querySelector('.slot-now');
    currentRow?.scrollIntoView({ block: 'center' });
  }
}

async function loadSchedule() {
  const channelId = channelSelect.value;
  const date = scheduleDateInput.value;

  if (!channelId) {
    statusText.textContent = 'No channel';
    return;
  }

  statusText.textContent = 'Loading…';

  try {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const schedule = await TheBox.apiGet(
      `/api/channels/${encodeURIComponent(channelId)}/schedule${query}`,
    );
    renderSchedule(schedule);

    const url = new URL(window.location.href);
    url.searchParams.set('channel', channelId);
    if (date) {
      url.searchParams.set('date', date);
    }
    window.history.replaceState({}, '', url);
  } catch (error) {
    statusText.textContent = 'Error';
    inspectorBody.innerHTML = `<p class="admin-error">${error.message}</p>`;
  }
}

async function rescanChannels() {
  statusText.textContent = 'Rescanning…';
  rescanBtn.disabled = true;

  try {
    await fetch('/api/admin/rescan', { method: 'POST' });
    await loadChannels();
    await loadSchedule();
    statusText.textContent = 'Rescan complete';
  } catch (error) {
    statusText.textContent = 'Rescan failed';
    inspectorSummary.textContent = error.message;
  } finally {
    rescanBtn.disabled = false;
  }
}

async function initInspector() {
  scheduleDateInput.value = todayDateInputValue();

  const params = new URLSearchParams(window.location.search);
  const requestedDate = params.get('date');
  if (requestedDate) {
    scheduleDateInput.value = requestedDate;
  }

  await loadChannels();
  await loadSchedule();
}

refreshBtn.addEventListener('click', () => {
  loadSchedule();
});

rescanBtn.addEventListener('click', () => {
  rescanChannels();
});

channelSelect.addEventListener('change', () => {
  loadSchedule();
});

scheduleDateInput.addEventListener('change', () => {
  loadSchedule();
});

updateClock();
setInterval(updateClock, 1000);
setInterval(() => {
  if (scheduleDateInput.value === todayDateInputValue()) {
    loadSchedule();
  }
}, 60000);

initInspector();
