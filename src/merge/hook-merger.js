/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

/**
 * Load hook script files from a source directory
 */
function loadHookFilesFromSource(sourceDir, sourceName) {
  if (!fs.existsSync(sourceDir)) return [];

  const items = [];
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === 'hooks.json') continue;
    const fullPath = path.join(sourceDir, entry.name);
    items.push({
      name: entry.name,
      path: fullPath,
      metadata: {},
    });
  }

  return items;
}

/**
 * Load hooks.json config from a source directory
 */
function loadHooksConfig(sourceDir) {
  const configPath = path.join(sourceDir, 'hooks.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Merge multiple hooks.json configs together
 */
function mergeHooksConfigs(configs) {
  const merged = {};
  for (const { config } of configs) {
    for (const [event, hooks] of Object.entries(config)) {
      if (!merged[event]) merged[event] = [];
      if (Array.isArray(hooks)) {
        merged[event].push(...hooks);
      }
    }
  }
  return merged;
}

/**
 * Check if a source directory has a lib/ subdirectory
 */
function hasHookLib(sourceDir) {
  return fs.existsSync(path.join(sourceDir, 'lib'));
}

module.exports = { loadHookFilesFromSource, loadHooksConfig, mergeHooksConfigs, hasHookLib };
