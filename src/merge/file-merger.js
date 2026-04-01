/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

/**
 * Load files from a source directory
 */
function loadFilesFromSource(sourceDir, sourceName) {
  if (!fs.existsSync(sourceDir)) return [];

  const items = [];
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(sourceDir, entry.name);
    if (entry.isFile()) {
      items.push({
        name: entry.name,
        path: fullPath,
        metadata: { name: entry.name },
      });
    } else if (entry.isDirectory()) {
      items.push({
        name: entry.name,
        path: fullPath,
        isDirectory: true,
        metadata: { name: entry.name },
      });
    }
  }

  return items;
}

module.exports = { loadFilesFromSource };
