/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

/**
 * Load commands from a source directory (recursive .md files)
 */
function loadCommandsFromSource(sourceDir, sourceName) {
  if (!fs.existsSync(sourceDir)) return [];

  const items = [];

  function walk(dir, prefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, prefix ? `${prefix}/${entry.name}` : entry.name);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const baseName = path.basename(entry.name, '.md');
        const name = prefix ? `${prefix}/${baseName}` : baseName;
        items.push({
          name,
          path: fullPath,
          metadata: {},
        });
      }
    }
  }

  walk(sourceDir, '');
  return items;
}

module.exports = { loadCommandsFromSource };
