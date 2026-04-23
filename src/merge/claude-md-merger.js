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

function getMarkers(markerKey) {
  return {
    start: `<!-- OMC:${markerKey}:START -->`,
    end: `<!-- OMC:${markerKey}:END -->`,
  };
}

function replaceFirstMatchingBlock(result, markerKeys, block) {
  for (const markerKey of markerKeys) {
    const { start, end } = getMarkers(markerKey);
    const startIdx = result.indexOf(start);
    const endIdx = result.indexOf(end);

    if (startIdx !== -1 && endIdx !== -1) {
      return result.slice(0, startIdx) + block + result.slice(endIdx + end.length);
    }
  }

  return null;
}

/**
 * Merge new sections into an existing CLAUDE.md
 * Wraps each source block in OMC markers to allow idempotent updates
 */
function mergeIntoExisting(existing, sections, options = {}) {
  const markerNamespace = options.markerNamespace || 'claude-md';
  let result = existing;

  for (const { sourceName, content } of sections) {
    const markerKey = `${markerNamespace}:${sourceName}`;
    const { start: startMarker, end: endMarker } = getMarkers(markerKey);
    const block = `${startMarker}\n${content.trimEnd()}\n${endMarker}`;
    const legacyMarkerKeys = options.legacyMarkerKeys
      ? options.legacyMarkerKeys(sourceName)
      : [sourceName];
    const replaced = replaceFirstMatchingBlock(result, [markerKey, ...legacyMarkerKeys], block);

    if (replaced !== null) {
      result = replaced;
      continue;
    }

    // Append new block
    result = result.trimEnd() + '\n\n' + block + '\n';
  }

  return result;
}

module.exports = { loadClaudeMd, assembleSections, mergeIntoExisting };
