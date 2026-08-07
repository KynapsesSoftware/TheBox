const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execFileAsync = promisify(execFile);

function resolveFfprobePath() {
  try {
    return require('@ffprobe-installer/ffprobe').path;
  } catch {
    return 'ffprobe';
  }
}

const ffprobePath = resolveFfprobePath();

async function probeDurationSeconds(filePath) {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      filePath,
    ]);

    const payload = JSON.parse(stdout);
    const duration = Number.parseFloat(payload?.format?.duration);
    return Number.isFinite(duration) ? Math.round(duration) : null;
  } catch (error) {
    console.warn(`Could not probe duration for ${path.basename(filePath)}: ${error.message}`);
    return null;
  }
}

function displayTitleFromFilename(filename) {
  return path
    .parse(filename)
    .name.replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  ffprobePath,
  probeDurationSeconds,
  displayTitleFromFilename,
};
