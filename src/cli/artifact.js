/* eslint-disable no-console */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { getProjectRoot, getSourceArtifactDir, getMergeConfigPath, getReportDir } = require('../config/paths');
const { readConfig } = require('../config/sources');
const { ARTIFACT_TYPES, getArtifactTypeNames } = require('../config/artifact-types');
const { detectConflicts, resolveConflicts, applyResolutions, generateReport } = require('../merge/base-merger');
const { loadSkillsFromSource } = require('../merge/skill-merger');
const { loadAgentsFromSource } = require('../merge/agent-merger');
const { loadCommandsFromSource } = require('../merge/command-merger');
const { loadHookFilesFromSource } = require('../merge/hook-merger');
const { loadFilesFromSource } = require('../merge/file-merger');
const { loadClaudeMd } = require('../merge/claude-md-merger');

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

function getLoader(artifactType) {
  switch (artifactType) {
    case 'skills': return loadSkillsFromSource;
    case 'agents': return loadAgentsFromSource;
    case 'commands': return loadCommandsFromSource;
    case 'hooks': return loadHookFilesFromSource;
    case 'guidelines': return loadSectionDocumentFromSource;
    case 'claude-md': return loadSectionDocumentFromSource;
    case 'hud': return loadFilesFromSource;
    default: return null;
  }
}

function loadSourcesForType(artifactType, root) {
  const config = readConfig();
  const sources = [];
  const ordered = Object.entries(config.sources)
    .sort(([, a], [, b]) => a.priority - b.priority);

  const loader = getLoader(artifactType);
  if (!loader) return sources;

  for (const [name, src] of ordered) {
    if (src.role === 'reference') continue;
    if (!(src.artifacts || []).includes(artifactType)) continue;
    const dir = getSourceArtifactDir(name, artifactType, root);
    if (!fs.existsSync(dir)) continue;
    const items = loader(dir, name);
    if (items.length > 0) {
      sources.push({ name, items });
    }
  }

  if (sources.length === 0 && artifactType === 'claude-md') {
    return loadSourcesForType('guidelines', root);
  }

  return sources;
}

async function artifact(args, flags = {}) {
  const cmd = args[0] || 'list';
  const root = getProjectRoot();
  const artifactType = flags.type || 'skills';

  if (!ARTIFACT_TYPES[artifactType]) {
    throw new Error(`Unknown artifact type: ${artifactType}. Available: ${getArtifactTypeNames().join(', ')}`);
  }

  switch (cmd) {
    case 'list': {
      const sources = loadSourcesForType(artifactType, root);
      if (sources.length === 0) {
        console.log(`No ${artifactType} found. Run: omc-manage source sync`);
        return;
      }

      const artifactConfig = ARTIFACT_TYPES[artifactType];
      if (artifactConfig.mergeStrategy === 'section-concat') {
        const total = sources.reduce((sum, source) => sum + source.items.length, 0);
        console.log(`${artifactConfig.label} (${total} installable, additive merge, from ${sources.length} sources):`);
        console.log('');

        for (const source of sources) {
          console.log(`[${source.name}] (${source.items.length})`);
          for (const item of source.items) {
            const desc = item.metadata?.description || '';
            console.log(`  ${item.name}${desc ? ' — ' + desc : ''}`);
          }
          console.log('');
        }
        return;
      }

      const mergeConfigPath = getMergeConfigPath(root);
      let mergeConfig = { preferences: {} };
      if (fs.existsSync(mergeConfigPath)) {
        try { mergeConfig = JSON.parse(fs.readFileSync(mergeConfigPath, 'utf8')); } catch {}
      }

      const conflicts = detectConflicts(sources);
      const resolutions = resolveConflicts(conflicts, mergeConfig);
      let merged = applyResolutions(sources, resolutions);

      // Apply exclude list
      const excludeList = (mergeConfig.exclude && mergeConfig.exclude[artifactType]) || [];
      const excludeSet = new Set(excludeList);
      const excluded = merged.filter(item => excludeSet.has(item.name));
      merged = merged.filter(item => !excludeSet.has(item.name));

      console.log(`${ARTIFACT_TYPES[artifactType].label} (${merged.length} installable, ${excluded.length} excluded, from ${sources.length} sources):`);
      console.log('');

      const bySource = {};
      for (const item of merged) {
        const src = item.sourceName;
        if (!bySource[src]) bySource[src] = [];
        bySource[src].push(item);
      }

      for (const [source, items] of Object.entries(bySource)) {
        console.log(`[${source}] (${items.length})`);
        for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
          const desc = item.metadata?.description || '';
          const short = desc.length > 55 ? desc.slice(0, 52) + '...' : desc;
          console.log(`  ${item.name}${short ? ' — ' + short : ''}`);
        }
        console.log('');
      }

      if (excluded.length > 0) {
        console.log(`[excluded] (${excluded.length})`);
        for (const item of excluded.sort((a, b) => a.name.localeCompare(b.name))) {
          console.log(`  ${item.name} (${item.sourceName})`);
        }
        console.log('');
      }
      break;
    }

    case 'prefer': {
      if (ARTIFACT_TYPES[artifactType].mergeStrategy === 'section-concat') {
        throw new Error(`${artifactType} is merged additively and does not support source preferences.`);
      }
      const name = args[1];
      const source = args[2];
      if (!name || !source) {
        throw new Error(`Usage: omc-manage artifact prefer <name> <source> --type ${artifactType}`);
      }
      const configPath = getMergeConfigPath(root);
      let config = { preferences: {} };
      if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
      }
      config.preferences[name] = source;
      await fsp.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
      console.log(`Preference set: ${name} -> ${source}`);
      break;
    }

    case 'conflicts': {
      if (ARTIFACT_TYPES[artifactType].mergeStrategy === 'section-concat') {
        console.log(`${ARTIFACT_TYPES[artifactType].label} Conflict Report`);
        console.log('='.repeat(40));
        console.log('Section-concat artifacts are merged additively; no conflicts to resolve.');
        return;
      }

      const sources = loadSourcesForType(artifactType, root);
      if (sources.length < 2) {
        console.log(`Need at least 2 sources for ${artifactType}. Run: omc-manage source sync`);
        return;
      }

      const mergeConfigPath = getMergeConfigPath(root);
      let mergeConfig = { preferences: {} };
      if (fs.existsSync(mergeConfigPath)) {
        try { mergeConfig = JSON.parse(fs.readFileSync(mergeConfigPath, 'utf8')); } catch {}
      }

      const conflicts = detectConflicts(sources);
      const resolutions = resolveConflicts(conflicts, mergeConfig);
      const report = generateReport(artifactType, conflicts, resolutions);

      console.log(`${ARTIFACT_TYPES[artifactType].label} Conflict Report`);
      console.log('='.repeat(40));
      console.log(`Total: ${report.summary.total_conflicts}`);

      if (report.conflicts.length === 0) {
        console.log('No conflicts.');
        return;
      }

      for (const c of report.conflicts) {
        if (c.type === 'exact_name') {
          console.log(`  ${c.name}: ${c.resolution} -> ${c.winner?.source || 'namespaced'}`);
        } else {
          console.log(`  ⚠ ${c.name}: ${c.message}`);
        }
      }
      break;
    }

    default:
      throw new Error(`Unknown subcommand: ${cmd}. Use: list, prefer, or conflicts`);
  }
}

module.exports = { artifact, loadSourcesForType };
