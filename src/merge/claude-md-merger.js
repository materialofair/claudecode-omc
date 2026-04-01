/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

/**
 * Load CLAUDE.md content from a source directory
 */
function loadClaudeMd(sourceDir) {
  const candidates = [
    path.join(sourceDir, 'CLAUDE.md'),
    path.join(sourceDir, 'claude.md'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  }
  return null;
}

/**
 * Assemble sections from multiple sources into a single CLAUDE.md
 */
function assembleSections(sections) {
  return sections.map(s => s.content).join('\n\n').trimEnd() + '\n';
}

/**
 * Merge new sections into an existing CLAUDE.md
 * Wraps each source block in OMC markers to allow idempotent updates
 */
function mergeIntoExisting(existing, sections) {
  let result = existing;

  for (const { sourceName, content } of sections) {
    const startMarker = `<!-- OMC:${sourceName}:START -->`;
    const endMarker = `<!-- OMC:${sourceName}:END -->`;
    const block = `${startMarker}\n${content.trimEnd()}\n${endMarker}`;

    const startIdx = result.indexOf(startMarker);
    const endIdx = result.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1) {
      // Replace existing block
      result = result.slice(0, startIdx) + block + result.slice(endIdx + endMarker.length);
    } else {
      // Append new block
      result = result.trimEnd() + '\n\n' + block + '\n';
    }
  }

  return result;
}

module.exports = { loadClaudeMd, assembleSections, mergeIntoExisting };
