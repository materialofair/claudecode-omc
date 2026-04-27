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
    if (entry.name.toLowerCase().endsWith('.md')) continue;
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
 * Load hooks.json config from a source directory.
 * Skips configs that only reference $CLAUDE_PLUGIN_ROOT/scripts/ (compiled plugin hooks
 * that can't work standalone).
 */
function loadHooksConfig(sourceDir) {
  const configPath = path.join(sourceDir, 'hooks.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // Check if all commands reference plugin-internal scripts (not usable standalone)
    const json = JSON.stringify(config);
    if (json.includes('CLAUDE_PLUGIN_ROOT') && json.includes('/scripts/run.cjs')) {
      // This is a compiled plugin hooks.json — skip it
      return null;
    }
    return config;
  } catch {
    return null;
  }
}

/**
 * Rewrite $CLAUDE_PLUGIN_ROOT references to an absolute path
 */
function rewritePluginRoot(obj, absolutePath) {
  const json = JSON.stringify(obj);
  const rewritten = json
    .replace(/\$CLAUDE_PLUGIN_ROOT|\$\{CLAUDE_PLUGIN_ROOT\}/g, absolutePath);
  return JSON.parse(rewritten);
}

/**
 * Merge multiple hooks.json configs together.
 * Handles the nested structure: { description?: string, hooks: { EventName: [...] } }
 */
function mergeHooksConfigs(configs) {
  const merged = { hooks: {} };

  for (const { sourceName, config, sourceDir } of configs) {
    // The actual event map lives under config.hooks (not config directly)
    const eventMap = config.hooks || config;

    for (const [event, rules] of Object.entries(eventMap)) {
      // Skip non-array entries (e.g. "description" string)
      if (!Array.isArray(rules)) continue;

      if (!merged.hooks[event]) {
        merged.hooks[event] = [];
      }

      // Rewrite $CLAUDE_PLUGIN_ROOT to the actual source directory
      let processedRules = rules;
      if (sourceDir) {
        processedRules = rewritePluginRoot(rules, sourceDir);
      }

      merged.hooks[event].push(...processedRules);
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
