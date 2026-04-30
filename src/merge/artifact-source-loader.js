const fs = require('fs');
const { getProjectRoot, getSourceArtifactDir } = require('../config/paths');
const { readConfig, filterItemsByAllowlist } = require('../config/sources');
const { loadSkillsFromSource } = require('./skill-merger');
const { loadAgentsFromSource } = require('./agent-merger');
const { loadCommandsFromSource } = require('./command-merger');
const { loadHookFilesFromSource } = require('./hook-merger');
const { loadFilesFromSource } = require('./file-merger');
const { loadClaudeMd } = require('./claude-md-merger');

function loadSectionDocumentFromSource(sourceDir) {
  const content = loadClaudeMd(sourceDir);
  if (!content) return [];
  return [{
    name: 'CLAUDE.md',
    path: sourceDir,
    metadata: {
      description: `${content.length} chars of prompt guidelines`,
    },
  }];
}

function getArtifactLoader(artifactType, options = {}) {
  switch (artifactType) {
    case 'skills': return loadSkillsFromSource;
    case 'agents': return loadAgentsFromSource;
    case 'commands': return loadCommandsFromSource;
    case 'hooks': return loadHookFilesFromSource;
    case 'hud': return loadFilesFromSource;
    case 'guidelines':
    case 'claude-md':
      return options.includeSectionDocuments ? loadSectionDocumentFromSource : null;
    default: return null;
  }
}

function getOrderedInstallableSources(config) {
  return Object.entries(config.sources || {})
    .sort(([, a], [, b]) => a.priority - b.priority)
    .filter(([, src]) => src.role !== 'reference')
    .filter(([, src]) => !src.installMode || src.installMode === 'auto');
}

function collectSourceDirsForType(artifactType, root = getProjectRoot(), config = readConfig()) {
  const sourcesForType = [];

  for (const [name, src] of getOrderedInstallableSources(config)) {
    if (!(src.artifacts || []).includes(artifactType)) continue;

    const dir = getSourceArtifactDir(name, artifactType, root);
    if (fs.existsSync(dir)) {
      sourcesForType.push({ name, dir, priority: src.priority, config: src });
    }
  }

  if (sourcesForType.length === 0 && artifactType === 'claude-md') {
    return collectSourceDirsForType('guidelines', root, config);
  }

  return sourcesForType;
}

function loadSourcesForType(artifactType, root = getProjectRoot(), options = {}) {
  const config = options.config || readConfig();
  const loader = getArtifactLoader(artifactType, { includeSectionDocuments: true });
  if (!loader) return [];

  const sources = [];
  for (const source of collectSourceDirsForType(artifactType, root, config)) {
    const items = filterItemsByAllowlist(
      source.config,
      artifactType,
      loader(source.dir, source.name),
    );
    if (items.length > 0) {
      sources.push({ name: source.name, items });
    }
  }

  if (sources.length === 0 && artifactType === 'claude-md') {
    return loadSourcesForType('guidelines', root, options);
  }

  return sources;
}

module.exports = {
  collectSourceDirsForType,
  getArtifactLoader,
  loadSectionDocumentFromSource,
  loadSourcesForType,
};
