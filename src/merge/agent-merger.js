/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

/**
 * Parse agent metadata from .md frontmatter
 */
function parseAgentMetadata(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: path.basename(filePath, '.md') };

  const metadata = {};
  match[1].split('\n').forEach((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;
    metadata[line.slice(0, colonIndex).trim()] = line.slice(colonIndex + 1).trim();
  });
  return metadata;
}

/**
 * Load agents from a source directory
 */
function loadAgentsFromSource(sourceDir, sourceName) {
  if (!fs.existsSync(sourceDir)) return [];

  const entries = fs.readdirSync(sourceDir);
  const items = [];

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = path.join(sourceDir, entry);
    if (!fs.statSync(filePath).isFile()) continue;

    const metadata = parseAgentMetadata(filePath);
    items.push({
      name: path.basename(entry, '.md'),
      path: filePath,
      metadata,
    });
  }

  return items;
}

module.exports = { parseAgentMetadata, loadAgentsFromSource };
