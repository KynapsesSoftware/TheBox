const statusText = document.getElementById('status-text');
const cacheInput = document.getElementById('cache-input');
const resultJson = document.getElementById('result-json');

function setStatus(message) {
  statusText.textContent = message;
}

async function runLookup() {
  const raw = cacheInput.value.trim();
  if (!raw) {
    setStatus('Enter a cache key');
    return;
  }

  setStatus('Looking up…');
  resultJson.hidden = true;

  const key = encodeURIComponent(raw);
  const data = await TheBox.apiGet(`/api/admin/transcode-cache?key=${key}`);
  resultJson.hidden = false;
  resultJson.textContent = JSON.stringify(data, null, 2);

  const matchCount = data.mediaFiles?.length || 0;
  setStatus(matchCount ? `${matchCount} catalogue match(es)` : 'No catalogue matches');
}

document.getElementById('lookup-btn').addEventListener('click', () => {
  runLookup().catch((error) => {
    setStatus(error.message);
    resultJson.hidden = true;
  });
});

cacheInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runLookup();
  }
});

setStatus('Ready');
