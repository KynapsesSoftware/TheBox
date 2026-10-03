const { execFileSync } = require('child_process');
const fs = require('fs');

function resolveFfmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  const systemCandidates = ['ffmpeg', '/usr/bin/ffmpeg'];
  for (const candidate of systemCandidates) {
    try {
      execFileSync(candidate, ['-version'], { stdio: ['ignore', 'ignore', 'pipe'] });
      return candidate;
    } catch {
      /* try next */
    }
  }

  return 'ffmpeg';
}

function verifyFfmpeg(ffmpegPath = resolveFfmpegPath()) {
  try {
    execFileSync(ffmpegPath, ['-version'], { stdio: ['ignore', 'ignore', 'pipe'] });
    return { ok: true, path: ffmpegPath };
  } catch (error) {
    return {
      ok: false,
      path: ffmpegPath,
      error: error.message || 'FFmpeg is not installed or not executable',
    };
  }
}

module.exports = {
  resolveFfmpegPath,
  verifyFfmpeg,
};
