/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

/**
 * Parse skill metadata from SKILL.md frontmatter
 */
function parseSkillMetadata(skillPath) {
  const skillFile = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return null;

  const content = fs.readFileSync(skillFile, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const metadata = {};
  match[1].split('\n').forEach((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;
    metadata[line.slice(0, colonIndex).trim()] = line.slice(colonIndex + 1).trim();
  });
  return metadata;
}

/**
 * Load skills from a source directory
 */
function loadSkillsFromSource(sourceDir, sourceName) {
  if (!fs.existsSync(sourceDir)) return [];

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(sourceDir, entry.name);
    const metadata = parseSkillMetadata(skillPath);
    if (metadata) {
      items.push({ name: entry.name, path: skillPath, metadata });
    }
  }

  return items;
}

// Re-export shared conflict resolution from base-merger for backward compatibility
const {
  calculateDescriptionSimilarity,
  compareVersions,
  detectConflicts,
  resolveConflicts,
  applyResolutions,
  generateReport,
} = require('./base-merger');

module.exports = {
  parseSkillMetadata,
  loadSkillsFromSource,
  calculateDescriptionSimilarity,
  compareVersions,
  detectConflicts,
  resolveConflicts,
  applyResolutions,
  generateReport,
};
