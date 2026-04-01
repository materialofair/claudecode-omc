/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

/**
 * Load a settings fragment from a source directory
 */
function loadSettingsFragment(sourceDir) {
  const candidates = [
    path.join(sourceDir, 'settings.json'),
    path.join(sourceDir, 'settings.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Deep merge settings fragments into an existing settings object
 * Later fragments override earlier ones for scalar values; arrays are merged
 */
function mergeSettingsFragments(existing, fragments) {
  let result = JSON.parse(JSON.stringify(existing));

  for (const { fragment } of fragments) {
    result = deepMerge(result, fragment);
  }

  return result;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else if (Array.isArray(value) && Array.isArray(result[key])) {
      // Merge arrays, deduplicating by JSON representation
      const combined = [...result[key]];
      for (const item of value) {
        const itemStr = JSON.stringify(item);
        if (!combined.some(e => JSON.stringify(e) === itemStr)) {
          combined.push(item);
        }
      }
      result[key] = combined;
    } else {
      result[key] = value;
    }
  }
  return result;
}

module.exports = { loadSettingsFragment, mergeSettingsFragments };
