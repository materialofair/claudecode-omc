/* eslint-disable no-console */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { getProjectRoot, getSourceArtifactDir, getInstallTarget, getMergeConfigPath, getReportDir } = require('../config/paths');
const { readConfig, filterItemsByAllowlist } = require('../config/sources');
const { getArtifactTypeNames, ARTIFACT_TYPES } = require('../config/artifact-types');
const { detectConflicts, resolveConflicts, applyResolutions, generateReport } = require('../merge/base-merger');
const { loadSkillsFromSource } = require('../merge/skill-merger');
const { loadAgentsFromSource } = require('../merge/agent-merger');
const { loadCommandsFromSource } = require('../merge/command-merger');
const { loadHookFilesFromSource, loadHooksConfig, mergeHooksConfigs, hasHookLib } = require('../merge/hook-merger');
const { loadClaudeMd, mergeIntoExisting, assembleSections } = require('../merge/claude-md-merger');
const { loadSettingsFragment, mergeSettingsFragments } = require('../merge/settings-merger');
const { loadFilesFromSource } = require('../merge/file-merger');
const { evaluateSkillQuality } = require('../utils/quality');
const { copyDirRecursive } = require('./source');

const OMC_VERSION_PATH = path.join(os.homedir(), '.claude', '.omc-version.json');
const OMC_CONFIG_PATH = path.join(os.homedir(), '.claude', '.omc-config.json');
const OMC_INSTALL_MANIFEST_PATH = path.join(os.homedir(), '.claude', '.omc-install-manifest.json');
const LEGACY_HOOK_PATHS = [
  'hooks.json',
  'hooks-cursor.json',
  'run-hook.cmd',
  'session-start',
  'session-start.mjs',
  'keyword-detector.mjs',
  'persistent-mode.mjs',
  'post-tool-use-failure.mjs',
  'post-tool-use.mjs',
  'pre-tool-use.mjs',
  'stop-continuation.mjs',
  'lib',
];

function getPackageVersion(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function writeInstallMetadata(root) {
  const now = new Date().toISOString();
  const metadata = {
    version: getPackageVersion(root),
    installedAt: now,
    installMethod: fs.existsSync(path.join(root, '.git')) ? 'local-dev' : 'npm',
    lastCheckAt: now,
  };

  await fsp.mkdir(path.dirname(OMC_VERSION_PATH), { recursive: true });
  await fsp.writeFile(OMC_VERSION_PATH, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function uniq(values) {
  return [...new Set(values)];
}

function getManagedMetadataPaths(scope) {
  const baseDir = scope === 'project'
    ? path.join(process.cwd(), '.claude')
    : path.join(os.homedir(), '.claude');

  return {
    configPath: path.join(baseDir, '.omc-config.json'),
    manifestPath: path.join(baseDir, '.omc-install-manifest.json'),
  };
}

function existingRelativePaths(installTarget, candidates) {
  return uniq(candidates).filter(relativePath => fs.existsSync(path.join(installTarget, relativePath)));
}

function inferLegacyManagedPaths(artifactType, installTarget, desiredPaths, extra = {}) {
  if (!fs.existsSync(installTarget) || !fs.statSync(installTarget).isDirectory()) {
    return [];
  }

  switch (artifactType) {
    case 'skills': {
      const candidates = [...desiredPaths, ...(extra.excludedNames || [])];
      return existingRelativePaths(installTarget, candidates);
    }
    case 'agents': {
      const candidates = [];
      for (const relativePath of desiredPaths) {
        candidates.push(relativePath);
        candidates.push(`${relativePath}.md`);
        if (relativePath.endsWith('.md')) {
          candidates.push(relativePath.slice(0, -3));
        }
      }
      return existingRelativePaths(installTarget, candidates);
    }
    case 'commands': {
      const candidates = [...desiredPaths];
      const entries = fs.readdirSync(installTarget);
      for (const entry of entries) {
        if (entry.startsWith('oh-my-claudecode:') && entry.endsWith('.md')) {
          candidates.push(entry);
        }
      }
      return existingRelativePaths(installTarget, candidates);
    }
    case 'hooks': {
      return existingRelativePaths(installTarget, [...desiredPaths, ...LEGACY_HOOK_PATHS]);
    }
    case 'hud':
      return existingRelativePaths(installTarget, desiredPaths);
    default:
      return [];
  }
}

async function pruneManagedPaths(installTarget, previousPaths, desiredPaths, flags) {
  if (!fs.existsSync(installTarget) || !fs.statSync(installTarget).isDirectory()) {
    return 0;
  }

  const desiredSet = new Set(desiredPaths);
  const toRemove = uniq(previousPaths)
    .filter(relativePath => !desiredSet.has(relativePath))
    .sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);

  if (toRemove.length === 0) return 0;

  if (flags.dryRun) {
    for (const relativePath of toRemove) {
      console.log(`    would prune ${relativePath}`);
    }
    return toRemove.length;
  }

  for (const relativePath of toRemove) {
    await fsp.rm(path.join(installTarget, relativePath), { recursive: true, force: true });
  }

  return toRemove.length;
}

async function writeOmcConfig(root, scope) {
  if (scope !== 'user') return;

  const now = new Date().toISOString();
  const version = getPackageVersion(root);
  const existing = await readJsonFile(OMC_CONFIG_PATH, {});
  const next = {
    ...existing,
    configuredAt: existing.configuredAt || now,
    updateRepository: 'materialofair/claudecode-omc',
    updateBranch: 'main',
    setupCompleted: now,
    setupVersion: version,
  };

  await fsp.mkdir(path.dirname(OMC_CONFIG_PATH), { recursive: true });
  await fsp.writeFile(OMC_CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

async function copyDirectory(src, dest, options = {}) {
  if (!fs.existsSync(src)) return 0;
  if (!options.dryRun) await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += await copyDirectory(from, to, options);
    } else if (entry.isFile()) {
      if (!options.force && fs.existsSync(to)) continue;
      if (!options.dryRun) {
        await fsp.mkdir(path.dirname(to), { recursive: true });
        await fsp.copyFile(from, to);
      }
      count += 1;
    }
  }
  return count;
}

function getLoader(artifactType) {
  switch (artifactType) {
    case 'skills': return loadSkillsFromSource;
    case 'agents': return loadAgentsFromSource;
    case 'commands': return loadCommandsFromSource;
    case 'hooks': return loadHookFilesFromSource;
    case 'hud': return loadFilesFromSource;
    default: return null;
  }
}

function collectSourcesForType(artifactType, orderedSources, root) {
  const sourcesForType = [];

  for (const [name, src] of orderedSources) {
    // Skip reference-only sources (e.g. anthropic-skills) — they provide
    // evaluation standards, not installable artifacts.
    if (src.role === 'reference') continue;
    if (src.installMode && src.installMode !== 'auto') continue;
    const declaredArtifacts = src.artifacts || [];
    if (!declaredArtifacts.includes(artifactType)) continue;

    const dir = getSourceArtifactDir(name, artifactType, root);
    if (fs.existsSync(dir)) {
      sourcesForType.push({ name, dir, priority: src.priority, config: src });
    }
  }

  if (sourcesForType.length === 0 && artifactType === 'claude-md') {
    return collectSourcesForType('guidelines', orderedSources, root);
  }

  return sourcesForType;
}

async function installNameBasedArtifacts(artifactType, sources, mergeConfig, installTarget, flags) {
  const loader = getLoader(artifactType);
  if (!loader) return { count: 0, total: 0 };

  const loaded = [];
  for (const { name, dir, config } of sources) {
    const items = filterItemsByAllowlist(config, artifactType, loader(dir, name));
    if (items.length > 0) {
      loaded.push({ name, items });
    }
  }

  if (loaded.length === 0) return { count: 0, total: 0 };

  const conflicts = detectConflicts(loaded);
  const resolutions = resolveConflicts(conflicts, mergeConfig);
  let merged = applyResolutions(loaded, resolutions);

  // Apply exclude list
  const excludeList = (mergeConfig.exclude && mergeConfig.exclude[artifactType]) || [];
  if (excludeList.length > 0) {
    const excludeSet = new Set(excludeList);
    const before = merged.length;
    merged = merged.filter(item => !excludeSet.has(item.name));
    const excluded = before - merged.length;
    if (excluded > 0) {
      console.log(`    excluded ${excluded} items: ${excludeList.filter(n => merged.every(m => m.name !== n)).join(', ')}`);
    }
  }

  if (flags.dryRun) {
    for (const item of merged.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`    ${item.name} (${item.sourceName})`);
    }
    return {
      count: 0,
      total: merged.length,
      conflicts: conflicts.length,
      managedPaths: merged.map(item => item.name),
      excludedNames: excludeList,
    };
  }

  await fsp.mkdir(installTarget, { recursive: true });
  let fileCount = 0;

  for (const item of merged) {
    if (artifactType === 'skills' || item.isDirectory) {
      const dest = path.join(installTarget, item.name);
      fileCount += await copyDirectory(item.path, dest, flags);
    } else {
      // Single file copy. Loaders strip `.md` from item.name for matching/allowlist purposes;
      // re-attach the source extension on disk so Claude Code's `*.md` loader picks them up.
      const sourceExt = path.extname(item.path);
      const destName = sourceExt && !item.name.endsWith(sourceExt) ? `${item.name}${sourceExt}` : item.name;
      const dest = path.join(installTarget, destName);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(item.path, dest);
      fileCount += 1;
    }
  }

  return {
    count: fileCount,
    total: merged.length,
    conflicts: conflicts.length,
    managedPaths: merged.map(item => item.name),
    excludedNames: excludeList,
  };
}

async function installHooks(sources, installTarget, flags) {
  // 1. Install hook files (name-based merge)
  const result = await installNameBasedArtifacts('hooks', sources, {}, installTarget, flags);

  // 2. Merge hooks.json configs
  const configs = [];
  for (const { name, dir } of sources) {
    const config = loadHooksConfig(dir);
    // $CLAUDE_PLUGIN_ROOT points to the source root, not the hooks/ subdir
    const sourceRoot = path.dirname(dir);
    if (config) configs.push({ sourceName: name, config, sourceDir: sourceRoot });
  }

  if (configs.length > 0 && !flags.dryRun) {
    const merged = mergeHooksConfigs(configs);
    const destPath = path.join(installTarget, 'hooks.json');
    await fsp.writeFile(destPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    console.log(`    hooks.json: merged from ${configs.length} sources`);
  }

  // 3. Copy lib/ directories
  for (const { name, dir } of sources) {
    if (hasHookLib(dir) && !flags.dryRun) {
      const libSrc = path.join(dir, 'lib');
      const libDest = path.join(installTarget, 'lib');
      await copyDirectory(libSrc, libDest, { ...flags, force: true });
    }
  }

  const managedPaths = [...(result.managedPaths || []), 'hooks.json'];
  if (sources.some(({ dir }) => hasHookLib(dir))) {
    managedPaths.push('lib');
  }
  if (sources.some(({ dir }) => fs.existsSync(path.join(dir, 'hooks-cursor.json')))) {
    managedPaths.push('hooks-cursor.json');
  }
  if (sources.some(({ dir }) => fs.existsSync(path.join(dir, 'run-hook.cmd')))) {
    managedPaths.push('run-hook.cmd');
  }
  if (sources.some(({ dir }) => fs.existsSync(path.join(dir, 'session-start')))) {
    managedPaths.push('session-start');
  }

  result.managedPaths = uniq(managedPaths);
  return result;
}

async function installSectionDocument(artifactType, sources, installTarget, flags) {
  const sections = [];
  // Collect in reverse priority order (lowest priority first)
  const sorted = [...sources].reverse();

  for (const { name, dir } of sorted) {
    const content = loadClaudeMd(dir);
    if (content) sections.push({ sourceName: name, content });
  }

  if (sections.length === 0) return { count: 0, total: 0 };

  if (flags.dryRun) {
    for (const s of sections) {
      console.log(`    section from: ${s.sourceName} (${s.content.length} chars)`);
    }
    return { count: 0, total: sections.length, managedPaths: [path.basename(installTarget)] };
  }

  let finalContent;
  if (fs.existsSync(installTarget)) {
    const existing = fs.readFileSync(installTarget, 'utf8');
    finalContent = mergeIntoExisting(existing, sections, {
      markerNamespace: artifactType,
      legacyMarkerKeys: (sourceName) => {
        if (artifactType === 'guidelines') {
          return [sourceName, `claude-md:${sourceName}`];
        }
        return [sourceName];
      },
    });
  } else {
    finalContent = assembleSections(sections);
  }

  await fsp.mkdir(path.dirname(installTarget), { recursive: true });
  await fsp.writeFile(installTarget, finalContent, 'utf8');

  return { count: 1, total: sections.length, managedPaths: [path.basename(installTarget)] };
}

async function installSettings(sources, installTarget, flags) {
  const fragments = [];
  const sorted = [...sources].reverse();

  for (const { name, dir } of sorted) {
    const fragment = loadSettingsFragment(dir);
    if (fragment) fragments.push({ sourceName: name, fragment });
  }

  if (fragments.length === 0) return { count: 0, total: 0 };

  if (flags.dryRun) {
    for (const f of fragments) {
      console.log(`    fragment from: ${f.sourceName} (${Object.keys(f.fragment).join(', ')})`);
    }
    return { count: 0, total: fragments.length, managedPaths: [path.basename(installTarget)] };
  }

  let existing = {};
  if (fs.existsSync(installTarget)) {
    try {
      existing = JSON.parse(fs.readFileSync(installTarget, 'utf8'));
    } catch {}
  }

  const merged = mergeSettingsFragments(existing, fragments);
  await fsp.mkdir(path.dirname(installTarget), { recursive: true });
  await fsp.writeFile(installTarget, JSON.stringify(merged, null, 2) + '\n', 'utf8');

  return { count: 1, total: fragments.length, managedPaths: [path.basename(installTarget)] };
}

async function setup(args, flags = {}) {
  const root = getProjectRoot();
  const config = readConfig();
  const scope = flags.scope || 'user';
  const { manifestPath } = getManagedMetadataPaths(scope);
  const typeFilter = flags.type
    ? [...new Set(flags.type.split(',').map(type => (type === 'claude-md' ? 'guidelines' : type)))]
    : null;

  console.log('claudecode-omc setup');
  console.log('====================');
  console.log(`Scope: ${scope}`);
  if (typeFilter) console.log(`Types: ${typeFilter.join(', ')}`);
  console.log('');

  // Load merge config
  const mergeConfigPath = getMergeConfigPath(root);
  let mergeConfig = { preferences: {} };
  if (fs.existsSync(mergeConfigPath)) {
    try { mergeConfig = JSON.parse(fs.readFileSync(mergeConfigPath, 'utf8')); } catch {}
  }

  // Get ordered sources (by priority)
  const orderedSources = Object.entries(config.sources)
    .sort(([, a], [, b]) => a.priority - b.priority);

  const allTypes = getArtifactTypeNames().filter(type => type !== 'claude-md');
  const typesToInstall = typeFilter || allTypes;
  const previousManifest = await readJsonFile(manifestPath, { artifacts: {} });
  const nextManifest = {
    updatedAt: new Date().toISOString(),
    scope,
    artifacts: {},
  };
  let step = 0;
  const totalSteps = typesToInstall.length;

  for (const artifactType of typesToInstall) {
    step++;
    const typeConfig = ARTIFACT_TYPES[artifactType];
    if (!typeConfig) {
      console.log(`[${step}/${totalSteps}] ${artifactType}: unknown type, skipping`);
      continue;
    }

    const sourcesForType = collectSourcesForType(artifactType, orderedSources, root);

    const installTarget = (artifactType === 'skills' && scope === 'project')
      ? path.join(process.cwd(), '.claude', 'skills')
      : typeConfig.installTarget;

    console.log(`[${step}/${totalSteps}] ${typeConfig.label} (${sourcesForType.length} sources)`);

    if (sourcesForType.length === 0) {
      console.log('    no sources available');
      continue;
    }

    let result;
    switch (typeConfig.mergeStrategy) {
      case 'name-based':
        result = await installNameBasedArtifacts(artifactType, sourcesForType, mergeConfig, installTarget, flags);
        break;
      case 'config-merge':
        result = await installHooks(sourcesForType, installTarget, flags);
        break;
      case 'section-concat':
        result = await installSectionDocument(artifactType, sourcesForType, installTarget, flags);
        break;
      case 'deep-merge':
        result = await installSettings(sourcesForType, installTarget, flags);
        break;
      default:
        result = await installNameBasedArtifacts(artifactType, sourcesForType, mergeConfig, installTarget, flags);
    }

    if (flags.dryRun) {
      console.log(`    would install ${result.total} items`);
    } else {
      console.log(`    installed ${result.count} files (${result.total} items)`);
    }

    if (typeConfig.format !== 'single-file' && typeConfig.format !== 'json') {
      const previousPaths = previousManifest.artifacts?.[artifactType]?.paths;
      const managedPaths = uniq(result.managedPaths || []);
      const bootstrapPaths = previousPaths || inferLegacyManagedPaths(
        artifactType,
        installTarget,
        managedPaths,
        result,
      );
      const pruned = await pruneManagedPaths(installTarget, bootstrapPaths, managedPaths, flags);
      if (pruned > 0) {
        console.log(flags.dryRun ? `    would prune ${pruned} stale entries` : `    pruned ${pruned} stale entries`);
      }

      nextManifest.artifacts[artifactType] = {
        target: installTarget,
        paths: managedPaths,
      };
    } else {
      nextManifest.artifacts[artifactType] = {
        target: installTarget,
        paths: result.managedPaths || [path.basename(installTarget)],
      };
    }

    if (result.conflicts > 0) {
      console.log(`    resolved ${result.conflicts} conflicts`);
    }
  }

  if (!flags.dryRun && scope === 'user') {
    await writeInstallMetadata(root);
    await writeOmcConfig(root, scope);
    await fsp.writeFile(manifestPath, JSON.stringify(nextManifest, null, 2) + '\n', 'utf8');
  } else if (!flags.dryRun && scope === 'project') {
    await fsp.mkdir(path.dirname(manifestPath), { recursive: true });
    await fsp.writeFile(manifestPath, JSON.stringify(nextManifest, null, 2) + '\n', 'utf8');
  }

  console.log('\nDone.');
}

module.exports = { setup };
