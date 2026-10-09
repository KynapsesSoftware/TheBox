const fs = require('fs');
const path = require('path');
const { isMediaFile, normalizeMediaPath } = require('../scanner');
const { isTestCardFilename } = require('../testPattern');

function enumerateMediaFilesFromDirectory(rootDir, extensions, options = {}) {
  const {
    recursive = false,
    excludeDirNames = new Set(['ident']),
    channelId = 'channel',
    filenamePrefix = '',
  } = options;

  const entries = [];
  const seenFilenames = new Set();

  function walk(currentDir, relativePrefix = '') {
    if (!fs.existsSync(currentDir)) {
      return;
    }

    let dirEntries;
    try {
      dirEntries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      const entryRelativePath = relativePrefix
        ? `${relativePrefix}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        if (!recursive) {
          continue;
        }

        if (excludeDirNames.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }

        walk(path.join(currentDir, entry.name), entryRelativePath);
        continue;
      }

      if (!entry.isFile() || !isMediaFile(entry.name, extensions)) {
        continue;
      }

      if (isTestCardFilename(entry.name)) {
        continue;
      }

      const relativeFilename = normalizeMediaPath(entryRelativePath);
      const filename = filenamePrefix
        ? normalizeMediaPath(`${filenamePrefix}${relativeFilename}`)
        : relativeFilename;

      if (seenFilenames.has(filename)) {
        console.warn(`Channel "${channelId}": duplicate media path "${filename}"`);
        continue;
      }

      seenFilenames.add(filename);

      const absolutePath = path.join(currentDir, entry.name);
      let stat;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }

      entries.push({
        filename,
        path: absolutePath,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
        basename: entry.name,
      });
    }
  }

  walk(rootDir);
  entries.sort((a, b) => a.filename.localeCompare(b.filename));
  return entries;
}

module.exports = {
  enumerateMediaFilesFromDirectory,
};
