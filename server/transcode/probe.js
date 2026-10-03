const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { ffprobePath } = require('../metadata');

const execFileAsync = promisify(execFile);

const DEFAULT_NATIVE_VIDEO_CODECS = ['h264'];
const DEFAULT_NATIVE_AUDIO_CODECS = ['aac', 'mp3'];
const DEFAULT_PROBE_EXTENSIONS = ['.mkv'];

function normalizeCodecList(raw, defaults) {
  if (!Array.isArray(raw)) {
    return [...defaults];
  }

  const list = raw.map((codec) => String(codec).toLowerCase().trim()).filter(Boolean);
  return list.length > 0 ? list : [...defaults];
}

function normalizeProbeExtensions(raw, defaults) {
  if (!Array.isArray(raw)) {
    return [...defaults];
  }

  const list = raw
    .map((ext) => {
      const trimmed = String(ext).toLowerCase().trim();
      if (!trimmed) {
        return null;
      }

      return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
    })
    .filter(Boolean);

  return list.length > 0 ? list : [...defaults];
}

function buildProbeOptions(settings = {}) {
  return {
    nativeVideoCodecs: normalizeCodecList(
      settings.nativeVideoCodecs,
      DEFAULT_NATIVE_VIDEO_CODECS,
    ),
    nativeAudioCodecs: normalizeCodecList(
      settings.nativeAudioCodecs,
      DEFAULT_NATIVE_AUDIO_CODECS,
    ),
    probeExtensions: normalizeProbeExtensions(
      settings.probeExtensions,
      DEFAULT_PROBE_EXTENSIONS,
    ),
  };
}

async function probeMediaStreams(filePath) {
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,codec_name',
    '-show_entries',
    'format=format_name',
    '-of',
    'json',
    filePath,
  ]);

  return JSON.parse(stdout);
}

function extractStreamCodecs(probePayload) {
  const streams = probePayload?.streams || [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const audioStream = streams.find((stream) => stream.codec_type === 'audio');

  return {
    videoCodec: videoStream ? (videoStream.codec_name || '').toLowerCase() : null,
    audioCodec: audioStream ? (audioStream.codec_name || '').toLowerCase() : null,
    formatName: probePayload?.format?.format_name || null,
  };
}

function isNativeContainerPlayback(codecs, filePath, probeOptions) {
  if (!codecs.videoCodec) {
    return false;
  }

  if (!probeOptions.nativeVideoCodecs.includes(codecs.videoCodec)) {
    return false;
  }

  if (codecs.audioCodec && !probeOptions.nativeAudioCodecs.includes(codecs.audioCodec)) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (probeOptions.probeExtensions.includes(ext)) {
    return true;
  }

  const formatName = (codecs.formatName || '').toLowerCase();
  const mp4Like = formatName.includes('mp4') || formatName.includes('mov');
  if (!mp4Like) {
    return false;
  }

  return ext === '.mp4' || ext === '.m4v' || ext === '.mov';
}

async function analyzePlaybackProbe(filePath, settings = {}) {
  const probeOptions = buildProbeOptions(settings);
  const ext = path.extname(filePath).toLowerCase();

  if (!probeOptions.probeExtensions.includes(ext)) {
    return {
      probed: false,
      needsTranscode: false,
      transcodeProbe: null,
    };
  }

  try {
    const payload = await probeMediaStreams(filePath);
    const codecs = extractStreamCodecs(payload);
    const needsTranscode = !isNativeContainerPlayback(
      { ...codecs, formatName: codecs.formatName },
      filePath,
      probeOptions,
    );

    return {
      probed: true,
      needsTranscode,
      transcodeProbe: {
        videoCodec: codecs.videoCodec,
        audioCodec: codecs.audioCodec,
        formatName: codecs.formatName,
        needsTranscode,
      },
    };
  } catch (error) {
    return {
      probed: true,
      needsTranscode: true,
      transcodeProbe: {
        videoCodec: null,
        audioCodec: null,
        formatName: null,
        probeError: error.message || 'ffprobe failed',
        needsTranscode: true,
      },
    };
  }
}

async function probeNeedsTranscode(filePath, settings = {}) {
  const result = await analyzePlaybackProbe(filePath, settings);
  return result.needsTranscode;
}

module.exports = {
  DEFAULT_NATIVE_VIDEO_CODECS,
  DEFAULT_NATIVE_AUDIO_CODECS,
  DEFAULT_PROBE_EXTENSIONS,
  buildProbeOptions,
  extractStreamCodecs,
  analyzePlaybackProbe,
  probeNeedsTranscode,
};
