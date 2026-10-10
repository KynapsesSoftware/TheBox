const {
  META_SETTINGS_IMPORTED,
  REGISTRY_KEYS,
  configObjectFromRows,
  defaultRowsFromSeed,
  flattenLegacyMergedConfig,
  resolveListenAddress,
} = require('../appSettingsRegistry');

function getSettingRow(db, key) {
  return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
}

function countRegistrySettings(db) {
  const placeholders = REGISTRY_KEYS.map(() => '?').join(', ');
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM app_settings WHERE key IN (${placeholders})`)
    .get(...REGISTRY_KEYS);
  return row?.count ?? 0;
}

function upsertSettingsRows(db, rows) {
  const stmt = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  for (const [key, value] of Object.entries(rows)) {
    stmt.run(key, value);
  }
}

function loadRowsFromDb(db) {
  const rows = {};
  for (const key of REGISTRY_KEYS) {
    const row = getSettingRow(db, key);
    if (row) {
      rows[key] = row.value;
    }
  }
  return rows;
}

function mergeRowsWithDefaults(partialRows) {
  return { ...defaultRowsFromSeed(), ...partialRows };
}

function initializeAppSettings(db, bootstrap) {
  const importedRow = getSettingRow(db, META_SETTINGS_IMPORTED);
  const alreadyImported = importedRow?.value === 'true';
  const registryCount = countRegistrySettings(db);

  const runImport = () => {
    if (!bootstrap.legacyMergedConfig) {
      return;
    }

    const rows = flattenLegacyMergedConfig(bootstrap.legacyMergedConfig);
    upsertSettingsRows(db, rows);
    upsertSettingsRows(db, { [META_SETTINGS_IMPORTED]: 'true' });
    console.log('Imported application settings from legacy config.json / config.local.json into database.');
  };

  const runSeed = () => {
    upsertSettingsRows(db, defaultRowsFromSeed());
  };

  db.transaction(() => {
    if (!alreadyImported && bootstrap.legacyMergedConfig) {
      runImport();
    } else if (registryCount === 0) {
      runSeed();
    }
  })();

  const partialRows = loadRowsFromDb(db);
  const mergedRows = mergeRowsWithDefaults(partialRows);
  const config = configObjectFromRows(mergedRows);
  const listen = resolveListenAddress(config);

  return {
    config,
    listen,
    settingsKeyCount: countRegistrySettings(db),
    settingsImportedFromJson: getSettingRow(db, META_SETTINGS_IMPORTED)?.value === 'true',
  };
}

function reloadAppConfigFromDb(db) {
  const partialRows = loadRowsFromDb(db);
  const mergedRows = mergeRowsWithDefaults(partialRows);
  const config = configObjectFromRows(mergedRows);
  const listen = resolveListenAddress(config);
  return {
    config,
    listen,
    settingsKeyCount: countRegistrySettings(db),
  };
}

module.exports = {
  initializeAppSettings,
  loadRowsFromDb,
  reloadAppConfigFromDb,
  upsertSettingsRows,
};
