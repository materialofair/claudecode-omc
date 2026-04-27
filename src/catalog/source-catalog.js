const fs = require('fs');
const path = require('path');
const { readConfig } = require('../config/sources');
const { getProjectRoot, getSourceArtifactDir, getSourceMetadataDir, getSourceRootDir } = require('../config/paths');
const { loadSkillsFromSource } = require('../merge/skill-merger');
const { loadAgentsFromSource } = require('../merge/agent-merger');
const { loadCommandsFromSource } = require('../merge/command-merger');
const { loadHookFilesFromSource } = require('../merge/hook-merger');
const { filterItemsByAllowlist } = require('../config/sources');

const KNOWN_ARTIFACT_TYPES = new Set(['skills', 'agents', 'hooks', 'commands', 'guidelines', 'settings', 'hud', 'claude-md']);

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function parseSimpleYaml(content) {
  const result = {};
  let currentListKey = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentListKey) {
      result[currentListKey].push(listMatch[1].trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!keyMatch) continue;

    const [, key, value] = keyMatch;
    if (!value) {
      currentListKey = key;
      result[key] = [];
      continue;
    }

    currentListKey = null;
    result[key] = value.trim().replace(/^['"]|['"]$/g, '');
  }

  return result;
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function manifestTypeForPath(manifestPath) {
  if (manifestPath.endsWith('package.json')) return 'package.json';
  if (manifestPath.endsWith('plugin.json')) return 'plugin.json';
  if (manifestPath.endsWith('.yaml') || manifestPath.endsWith('.yml')) return 'yaml';
  return 'text';
}

function parseManifestDocument(filePath, manifestPath) {
  const type = manifestTypeForPath(manifestPath);
  if (type === 'package.json' || type === 'plugin.json') {
    return safeReadJson(filePath);
  }
  if (type === 'yaml') {
    const content = safeReadText(filePath);
    return content ? parseSimpleYaml(content) : null;
  }
  return safeReadText(filePath);
}

function countSurfaceEntries(surfacePath) {
  if (!fs.existsSync(surfacePath)) return 0;
  const stat = fs.statSync(surfacePath);
  if (stat.isFile()) return 1;
  return fs.readdirSync(surfacePath).length;
}

function getArtifactLoader(artifactType) {
  switch (artifactType) {
    case 'skills': return loadSkillsFromSource;
    case 'agents': return loadAgentsFromSource;
    case 'commands': return loadCommandsFromSource;
    case 'hooks': return loadHookFilesFromSource;
    default: return null;
  }
}

function classifyPackageFile(entry) {
  const [topLevel] = entry.split('/');
  switch (topLevel) {
    case '.claude':
    case '.claude-plugin':
      return { name: topLevel, harness: 'claude', category: 'manifest', installable: false, adapter: 'claude-plugin-adapter' };
    case '.codex':
    case '.codex-plugin':
      return { name: topLevel, harness: 'codex', category: 'harness-surface', installable: false, adapter: 'harness-dir-adapter' };
    case '.cursor':
      return { name: topLevel, harness: 'cursor', category: 'harness-surface', installable: false, adapter: 'harness-dir-adapter' };
    case '.gemini':
      return { name: topLevel, harness: 'gemini', category: 'harness-surface', installable: false, adapter: 'harness-dir-adapter' };
    case '.opencode':
      return { name: topLevel, harness: 'opencode', category: 'harness-surface', installable: false, adapter: 'harness-dir-adapter' };
    case 'rules':
      return { name: topLevel, harness: 'generic', category: 'reference', installable: false, adapter: 'rules-adapter' };
    case 'mcp-configs':
      return { name: topLevel, harness: 'generic', category: 'tooling', installable: false, adapter: 'mcp-config-adapter' };
    case 'schemas':
    case 'manifests':
      return { name: topLevel, harness: 'generic', category: 'manifest', installable: false, adapter: 'manifest-adapter' };
    case 'scripts':
      return { name: topLevel, harness: 'generic', category: 'tooling', installable: false, adapter: 'tooling-script-adapter' };
    case 'skills':
    case 'agents':
    case 'hooks':
    case 'commands':
      return { name: topLevel, harness: 'claude', category: 'runtime', installable: true, artifactType: topLevel, adapter: 'flat-dir-adapter' };
    default:
      return null;
  }
}

function upsertSurface(surfaces, nextSurface) {
  const key = [nextSurface.name, nextSurface.harness, nextSurface.category, nextSurface.artifactType || ''].join('::');
  const existing = surfaces.get(key);
  if (!existing) {
    surfaces.set(key, { ...nextSurface });
    return;
  }

  existing.present = existing.present || nextSurface.present;
  existing.installable = existing.installable || nextSurface.installable;
  existing.count = Math.max(existing.count || 0, nextSurface.count || 0);
  existing.adapter = existing.adapter || nextSurface.adapter;
  existing.sources = [...new Set([...(existing.sources || []), ...(nextSurface.sources || [])])];
}

function listManifestFiles(sourceName, sourceConfig, root) {
  const sourceRoot = getSourceRootDir(sourceName, root);
  const metadataDir = getSourceMetadataDir(sourceName, root);

  return (sourceConfig.manifests || []).map((manifestPath) => {
    const localCandidate = path.join(sourceRoot, manifestPath);
    const cachedCandidate = path.join(metadataDir, 'manifests', manifestPath);
    const filePath = fs.existsSync(localCandidate) ? localCandidate : cachedCandidate;
    const present = fs.existsSync(filePath);
    return {
      path: manifestPath,
      filePath,
      present,
      type: manifestTypeForPath(manifestPath),
      data: present ? parseManifestDocument(filePath, manifestPath) : null,
    };
  });
}

async function buildSourceCatalog(sourceName, root = getProjectRoot()) {
  const config = readConfig();
  const sourceConfig = config.sources[sourceName];
  if (!sourceConfig) {
    throw new Error(`Unknown source: ${sourceName}`);
  }

  const manifests = listManifestFiles(sourceName, sourceConfig, root);
  const surfaces = new Map();
  const warnings = [];

  for (const artifactType of sourceConfig.artifacts || []) {
    const artifactPath = getSourceArtifactDir(sourceName, artifactType, root);
    const present = fs.existsSync(artifactPath);
    const loader = getArtifactLoader(artifactType);
    const loadedItems = (present && loader)
      ? filterItemsByAllowlist(sourceConfig, artifactType, loader(artifactPath, sourceName))
      : [];
    upsertSurface(surfaces, {
      name: artifactType,
      harness: 'claude',
      category: KNOWN_ARTIFACT_TYPES.has(artifactType) ? 'runtime' : 'unknown',
      artifactType,
      // `installable` describes intrinsic capability so `plan install` can
      // model transitions out of role=reference. Actual install gating lives
      // in setup.js/artifact.js (role + installMode checks).
      installable: KNOWN_ARTIFACT_TYPES.has(artifactType),
      count: loader ? loadedItems.length : (present ? countSurfaceEntries(artifactPath) : 0),
      itemNames: loadedItems.length > 0 ? loadedItems.map(item => item.name).sort() : undefined,
      present,
      sourcePath: artifactPath,
      adapter: 'flat-dir-adapter',
      sources: ['config.artifacts'],
    });
  }

  for (const manifest of manifests) {
    if (!manifest.present) {
      warnings.push(`Manifest not found: ${manifest.path}`);
      continue;
    }

    if (manifest.path.endsWith('package.json') && manifest.data && Array.isArray(manifest.data.files)) {
      for (const fileEntry of manifest.data.files) {
        const classified = classifyPackageFile(fileEntry);
        if (!classified) continue;
        if (classified.artifactType && (sourceConfig.artifacts || []).includes(classified.artifactType)) {
          continue;
        }
        upsertSurface(surfaces, {
          ...classified,
          count: 1,
          present: true,
          sourcePath: fileEntry,
          sources: ['package.json'],
        });
      }
    }

    if (manifest.path.endsWith('plugin.json') && manifest.data) {
      const pluginData = manifest.data;
      if (Array.isArray(pluginData.skills) && pluginData.skills.length > 0) {
        upsertSurface(surfaces, {
          name: 'skills',
          harness: 'claude',
          category: 'runtime',
          artifactType: 'skills',
          installable: true,
          count: pluginData.skills.length,
          present: true,
          sourcePath: manifest.path,
          adapter: 'claude-plugin-adapter',
          sources: ['plugin.json'],
        });
      }
      if (Array.isArray(pluginData.commands) && pluginData.commands.length > 0) {
        upsertSurface(surfaces, {
          name: 'commands',
          harness: 'claude',
          category: 'runtime',
          artifactType: 'commands',
          installable: true,
          count: pluginData.commands.length,
          present: true,
          sourcePath: manifest.path,
          adapter: 'claude-plugin-adapter',
          sources: ['plugin.json'],
        });
      }
    }

    if ((manifest.path.endsWith('agent.yaml') || manifest.path.endsWith('agent.yml')) && manifest.data) {
      const yamlData = manifest.data;
      for (const key of ['skills', 'commands']) {
        if (Array.isArray(yamlData[key]) && yamlData[key].length > 0) {
          upsertSurface(surfaces, {
            name: key,
            harness: 'claude',
            category: key === 'skills' || key === 'commands' ? 'runtime' : 'manifest',
            artifactType: key,
            installable: key === 'skills' || key === 'commands',
            count: yamlData[key].length,
            present: true,
            sourcePath: manifest.path,
            adapter: 'catalog-manifest-adapter',
            sources: ['agent.yaml'],
          });
        }
      }
    }
  }

  return {
    sourceName,
    kind: sourceConfig.kind || 'content-repo',
    installMode: sourceConfig.installMode || 'auto',
    role: sourceConfig.role || null,
    harnesses: sourceConfig.harnesses || ['claude'],
    profiles: sourceConfig.profiles || ['claude-runtime', 'reference-only'],
    manifests,
    surfaces: [...surfaces.values()].sort((a, b) => a.name.localeCompare(b.name) || a.harness.localeCompare(b.harness)),
    warnings,
  };
}

function buildInstallPlan(catalog, profileName = 'claude-runtime') {
  const supportedProfiles = new Set(catalog.profiles || []);
  if (!supportedProfiles.has(profileName)) {
    throw new Error(`Profile "${profileName}" is not declared for source "${catalog.sourceName}"`);
  }

  let selected;
  if (profileName === 'claude-runtime') {
    selected = catalog.surfaces.filter(surface => (
      surface.category === 'runtime'
      && surface.harness === 'claude'
      && surface.installable
      && (surface.count || 0) > 0
    ));
  } else if (profileName === 'reference-only') {
    selected = catalog.surfaces.filter(surface => surface.category !== 'runtime' || !surface.installable);
  } else {
    selected = catalog.surfaces.filter(surface => surface.present);
  }

  const selectedKeys = new Set(selected.map(surface => [surface.name, surface.harness, surface.category].join('::')));
  const skipped = catalog.surfaces.filter(surface => !selectedKeys.has([surface.name, surface.harness, surface.category].join('::')));

  const actions = selected.map((surface) => {
    if (surface.category === 'runtime' && surface.artifactType) {
      return {
        type: 'install-artifact',
        artifactType: surface.artifactType,
        adapter: surface.adapter || 'flat-dir-adapter',
        source: surface.sourcePath,
        count: surface.count || 0,
        itemNames: surface.itemNames || [],
      };
    }

    return {
      type: 'reference-surface',
      surface: surface.name,
      adapter: surface.adapter || null,
      source: surface.sourcePath,
      count: surface.count || 0,
    };
  });

  const warnings = [...catalog.warnings];
  if (catalog.kind === 'distribution-repo') {
    const nonClaude = catalog.surfaces.filter(surface => surface.harness !== 'claude' && surface.present);
    if (nonClaude.length > 0 && profileName === 'claude-runtime') {
      warnings.push(`Skipped ${nonClaude.length} non-Claude harness surfaces for profile "${profileName}".`);
    }
  }

  return {
    sourceName: catalog.sourceName,
    kind: catalog.kind,
    installMode: catalog.installMode,
    profile: profileName,
    actions,
    selectedSurfaces: selected,
    skippedSurfaces: skipped,
    warnings,
  };
}

function deriveSourceActivation(planResult, currentSource = {}) {
  const installArtifacts = [...new Set(
    planResult.actions
      .filter(action => action.type === 'install-artifact' && action.artifactType)
      .map(action => action.artifactType),
  )];

  if (planResult.profile === 'reference-only') {
    // Preserve the discoverable artifact list so the source can round-trip back
    // to claude-runtime later. setup.js/artifact.js already gate installation on
    // role==='reference' and installMode!=='auto', so retaining artifacts here
    // does not risk accidental install.
    const preserved = Array.isArray(currentSource.artifacts) && currentSource.artifacts.length > 0
      ? [...currentSource.artifacts]
      : installArtifacts;
    return {
      installMode: 'planned',
      role: 'reference',
      artifacts: preserved,
      allowlist: undefined,
      appliedProfile: planResult.profile,
    };
  }

  return {
    installMode: 'auto',
    role: null,
    artifacts: installArtifacts,
    allowlist: undefined,
    appliedProfile: planResult.profile,
  };
}

module.exports = {
  buildSourceCatalog,
  buildInstallPlan,
  deriveSourceActivation,
};
