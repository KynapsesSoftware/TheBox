const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { generateChannelSchedule, getDateKey } = require('../scheduler');
const { analyzePlaybackProbe, buildProbeOptions } = require('./probe');
const {
  computeCacheKey,
  ensureCacheDirectory,
  getCachedFilePath,
  isCachedAtPath,
  resolveCacheDirectory,
} = require('./cache');
const { resolveFfmpegPath, verifyFfmpeg } = require('./ffmpeg');

function findVideoByFilename(channel, filename) {
  const normalized = filename.replace(/\\/g, '/');
  return channel.videos.find((video) => video.filename === normalized);
}

function normalizeTranscodeConfig(config) {
  const raw = config?.transcode || {};
  const probeOptions = buildProbeOptions(raw);

  return {
    enabled: raw.enabled === true,
    cachePath: raw.cachePath || '',
    maxConcurrentJobs: Math.max(1, Number(raw.maxConcurrentJobs) || 1),
    maxHeight: Number(raw.maxHeight) || 0,
    preset: raw.preset || 'veryfast',
    scheduleAheadDays: Math.max(1, Number(raw.scheduleAheadDays) || 1),
    nativeVideoCodecs: probeOptions.nativeVideoCodecs,
    nativeAudioCodecs: probeOptions.nativeAudioCodecs,
    probeExtensions: probeOptions.probeExtensions,
  };
}

class TranscodeService {
  constructor(appConfig, projectRoot) {
    this.projectRoot = projectRoot;
    this.settings = normalizeTranscodeConfig(appConfig);
    this.cacheDir = resolveCacheDirectory(this.settings.cachePath, projectRoot);
    this.ffmpegPath = resolveFfmpegPath();
    this.ffmpegStatus = verifyFfmpeg(this.ffmpegPath);
    this.queue = [];
    this.activeJobs = new Map();
    this.failed = new Map();
    this.skippedKeys = new Set();
    this.runningCount = 0;
    this.lastDateKey = null;
    this.dayCheckTimer = null;
  }

  get enabled() {
    return this.settings.enabled && Boolean(this.cacheDir) && this.ffmpegStatus.ok;
  }

  async enrichChannelVideos(channel) {
    if (channel.mediaType === 'audio' || !this.settings.enabled) {
      for (const video of channel.videos) {
        video.needsTranscode = false;
        video.cacheKey = null;
        video.transcodeProbe = null;
      }
      return;
    }

    for (const video of channel.videos) {
      if (!video.path || !video.durationSeconds) {
        video.needsTranscode = false;
        video.cacheKey = null;
        video.transcodeProbe = null;
        continue;
      }

      video.cacheKey = computeCacheKey(video.path);
      const analysis = await analyzePlaybackProbe(video.path, this.settings);
      video.needsTranscode = analysis.needsTranscode;
      video.transcodeProbe = analysis.transcodeProbe;
    }
  }

  isVideoCached(video) {
    if (!video?.cacheKey || !this.cacheDir) {
      return false;
    }

    return isCachedAtPath(getCachedFilePath(this.cacheDir, video.cacheKey), video.path);
  }

  resolvePlaybackPath(video) {
    if (!video?.path) {
      return null;
    }

    if (!this.enabled || !video.needsTranscode) {
      return video.path;
    }

    if (this.isVideoCached(video)) {
      return getCachedFilePath(this.cacheDir, video.cacheKey);
    }

    return null;
  }

  canPlayVideo(video) {
    if (!video) {
      return false;
    }

    if (!this.enabled || !video.needsTranscode) {
      return true;
    }

    return this.isVideoCached(video);
  }

  getStatusForVideo(video, nowMs = Date.now()) {
    if (!video || !this.settings.enabled) {
      return 'native';
    }

    if (!video.needsTranscode) {
      return 'native';
    }

    if (this.isVideoCached(video)) {
      return 'cached';
    }

    if (this.failed.has(video.cacheKey)) {
      return 'failed';
    }

    if (this.activeJobs.has(video.cacheKey)) {
      return 'inProgress';
    }

    if (this.queue.some((job) => job.cacheKey === video.cacheKey)) {
      return 'queued';
    }

    if (this.skippedKeys.has(video.cacheKey)) {
      return 'skipped';
    }

    return 'required';
  }

  buildQueueFromChannels(channels, scheduleOptionsFactory) {
    this.queue = [];
    this.skippedKeys.clear();

    if (!this.enabled) {
      return;
    }

    ensureCacheDirectory(this.cacheDir);
    const nowMs = Date.now();
    const timezone = scheduleOptionsFactory().timezone;
    const fileEntries = new Map();

    for (const channel of channels) {
      if (channel.mediaType === 'audio') {
        continue;
      }

      for (let dayOffset = 0; dayOffset < this.settings.scheduleAheadDays; dayOffset += 1) {
        const date = new Date(nowMs + (dayOffset * 24 * 60 * 60 * 1000));
        const schedule = generateChannelSchedule(channel, scheduleOptionsFactory(date));

        for (const slot of schedule.slots) {
          if (slot.isAd || slot.isIdent) {
            continue;
          }

          const video = findVideoByFilename(channel, slot.filename);
          if (!video?.needsTranscode || this.isVideoCached(video)) {
            continue;
          }

          const startMs = Date.parse(slot.startsAt);
          const endMs = Date.parse(slot.endsAt);
          let entry = fileEntries.get(video.cacheKey);

          if (!entry) {
            entry = {
              cacheKey: video.cacheKey,
              video,
              channelId: channel.id,
              earliestFutureStart: Infinity,
              hasFutureSlot: false,
              hasInProgressSlot: false,
            };
            fileEntries.set(video.cacheKey, entry);
          }

          if (nowMs >= startMs && nowMs < endMs) {
            entry.hasInProgressSlot = true;
          }

          if (startMs > nowMs) {
            entry.hasFutureSlot = true;
            entry.earliestFutureStart = Math.min(entry.earliestFutureStart, startMs);
          }
        }
      }
    }

    const jobs = [];

    for (const entry of fileEntries.values()) {
      if (entry.hasFutureSlot) {
        jobs.push({
          cacheKey: entry.cacheKey,
          sourcePath: entry.video.path,
          filename: entry.video.filename,
          channelId: entry.channelId,
          priority: entry.earliestFutureStart,
        });
      } else if (entry.hasInProgressSlot) {
        this.skippedKeys.add(entry.cacheKey);
      }
    }

    jobs.sort((a, b) => a.priority - b.priority);
    this.queue = jobs.filter((job) => !this.failed.has(job.cacheKey));

    console.log(
      `Transcode queue: ${this.queue.length} job(s), ${this.skippedKeys.size} skipped (slot in progress).`,
    );
  }

  refreshQueue(channels, scheduleOptionsFactory) {
    if (!this.settings.enabled) {
      return;
    }

    if (!this.cacheDir) {
      console.warn('Transcode enabled but cachePath is not configured.');
      return;
    }

    if (!this.ffmpegStatus.ok) {
      console.warn(`Transcode enabled but FFmpeg unavailable: ${this.ffmpegStatus.error}`);
      return;
    }

    ensureCacheDirectory(this.cacheDir);
    this.buildQueueFromChannels(channels, scheduleOptionsFactory);
    this.pumpQueue();
  }

  pumpQueue() {
    while (this.runningCount < this.settings.maxConcurrentJobs && this.queue.length > 0) {
      const job = this.queue.shift();
      if (this.isVideoCached({ path: job.sourcePath, cacheKey: job.cacheKey })) {
        continue;
      }

      this.runJob(job);
    }
  }

  runJob(job) {
    const outputPath = getCachedFilePath(this.cacheDir, job.cacheKey);
    // FFmpeg chooses the muxer from the file extension; ".mp4.partial" is not MP4.
    const tempPath = outputPath.replace(/\.mp4$/i, '.partial.mp4');
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      job.sourcePath,
      '-c:v',
      'libx264',
      '-preset',
      this.settings.preset,
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
    ];

    if (this.settings.maxHeight > 0) {
      args.push('-vf', `scale=-2:min(${this.settings.maxHeight}\\,ih)`);
    }

    args.push(tempPath);

    this.runningCount += 1;
    this.activeJobs.set(job.cacheKey, job);
    this.failed.delete(job.cacheKey);

    console.log(`Transcode started: ${job.filename} (${job.channelId})`);

    const ffmpeg = spawn(this.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    ffmpeg.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });

    ffmpeg.on('close', (code) => {
      this.runningCount -= 1;
      this.activeJobs.delete(job.cacheKey);

      if (code === 0 && fs.existsSync(tempPath)) {
        fs.renameSync(tempPath, outputPath);
        console.log(`Transcode complete: ${job.filename}`);
      } else {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }

        const message = stderr.trim() || `FFmpeg exit code ${code}`;
        this.failed.set(job.cacheKey, message);
        console.error(`Transcode failed: ${job.filename} — ${message}`);
      }

      this.pumpQueue();
    });

    ffmpeg.on('error', (error) => {
      this.runningCount -= 1;
      this.activeJobs.delete(job.cacheKey);
      this.failed.set(job.cacheKey, error.message);
      console.error(`Transcode failed: ${job.filename} — ${error.message}`);
      this.pumpQueue();
    });
  }

  startDayRolloverWatch(scheduleOptionsFactory, getChannels) {
    if (this.dayCheckTimer) {
      clearInterval(this.dayCheckTimer);
    }

    if (!this.settings.enabled) {
      return;
    }

    const timezone = scheduleOptionsFactory().timezone;
    this.lastDateKey = getDateKey(new Date(), timezone);

    this.dayCheckTimer = setInterval(() => {
      const dateKey = getDateKey(new Date(), timezone);
      if (dateKey !== this.lastDateKey) {
        this.lastDateKey = dateKey;
        console.log(`Schedule day rollover (${dateKey}): refreshing transcode queue.`);
        this.refreshQueue(getChannels(), scheduleOptionsFactory);
      }
    }, 60 * 1000);
  }

  attachScheduleMeta(schedule, channel) {
    if (!this.settings.enabled) {
      return schedule;
    }

    const slots = schedule.slots.map((slot) => {
      if (slot.isAd || slot.isIdent) {
        return slot;
      }

      const video = findVideoByFilename(channel, slot.filename);
      return {
        ...slot,
        transcodeStatus: this.getStatusForVideo(video),
        transcodeProbe: video?.transcodeProbe ?? null,
      };
    });

    const counts = {
      native: 0,
      cached: 0,
      required: 0,
      queued: 0,
      inProgress: 0,
      skipped: 0,
      failed: 0,
    };

    for (const slot of slots) {
      if (slot.isAd || slot.isIdent || !slot.transcodeStatus) {
        continue;
      }

      counts[slot.transcodeStatus] = (counts[slot.transcodeStatus] || 0) + 1;
    }

    return {
      ...schedule,
      slots,
      meta: {
        ...(schedule.meta || {}),
        transcodeEnabled: this.enabled,
        transcodeCounts: counts,
        transcodeNativeVideoCodecs: this.settings.nativeVideoCodecs,
        transcodeNativeAudioCodecs: this.settings.nativeAudioCodecs,
        transcodeProbeExtensions: this.settings.probeExtensions,
      },
    };
  }
}

function createTranscodeService(appConfig, projectRoot) {
  return new TranscodeService(appConfig, projectRoot);
}

module.exports = {
  TranscodeService,
  createTranscodeService,
  findVideoByFilename,
  normalizeTranscodeConfig,
};
