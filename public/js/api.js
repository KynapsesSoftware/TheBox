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
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

window.TheBox = {
  // Set to true on any page to show the design / developer guide overlay
  devGuideEnabled: false,
  // Set to false to disable media remote / keyboard control
  remoteEnabled: true,
  // Set to true to show page number entry in the top-right corner
  remotePageOsdEnabled: true,
  apiGet,
  formatClock,
  formatDuration,
};
