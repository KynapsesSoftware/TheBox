async function apiGet(path) {
  const response = await fetch(path);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

function formatClock(dateInput) {
  const date = new Date(dateInput);
  const options = { hour: '2-digit', minute: '2-digit' };
  if (window.TheBox?.scheduleTimezone) {
    options.timeZone = window.TheBox.scheduleTimezone;
  }
  return date.toLocaleTimeString([], options);
}

function formatLocalDateTime(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const options = { dateStyle: 'short', timeStyle: 'medium' };
  if (window.TheBox?.scheduleTimezone) {
    options.timeZone = window.TheBox.scheduleTimezone;
  }
  return date.toLocaleString([], options);
}

function formatDuration(seconds) {
  if (!seconds) {
    return '--:--';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function applyDocumentTitle(pageLabel) {
  const base = window.TheBox?.publicSettings?.title || 'The Box';
  document.title = pageLabel ? `${base} - ${pageLabel}` : base;
}

async function loadPublicSettings() {
  const defaults = {
    title: 'The Box',
    defaultPage: 100,
    timezone: null,
  };

  try {
    const settings = await apiGet('/api/settings/public');
    window.TheBox.publicSettings = {
      title: settings.title || defaults.title,
      defaultPage: Number(settings.defaultPage) || defaults.defaultPage,
      timezone: settings.timezone || null,
    };
  } catch {
    window.TheBox.publicSettings = { ...defaults };
  }

  window.TheBox.scheduleTimezone = window.TheBox.publicSettings.timezone;
  return window.TheBox.publicSettings;
}

window.TheBox = {
  devGuideEnabled: false,
  remoteEnabled: true,
  remotePageOsdEnabled: true,
  publicSettings: {
    title: 'The Box',
    defaultPage: 100,
    timezone: null,
  },
  scheduleTimezone: null,
  apiGet,
  applyDocumentTitle,
  formatClock,
  formatDuration,
  formatLocalDateTime,
  loadPublicSettings,
  ready: loadPublicSettings(),
};
