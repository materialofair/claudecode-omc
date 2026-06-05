const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.omc-manage');
const CONFIG_PATH = path.join(CONFIG_DIR, 'sources.json');

// Package root (src/config/sources.js → ../../). Holds the shipped .omc-curation
// selection files that drive distribution-repo allowlists.
const PKG_ROOT = path.resolve(__dirname, '..', '..');

// The unified governance manifest: single authoritative source for cross-source
// policy (per-source priority + allowlist, and conflict resolution). Cached per
// process. Returns {} when absent so callers can fall back to legacy config.
let _governanceCache;
function loadGovernance() {
  if (_governanceCache !== undefined) return _governanceCache;
  try {
    const data = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, '.omc-curation', 'governance.json'), 'utf8'));
    _governanceCache = data && typeof data === 'object' ? data : {};
  } catch {
    _governanceCache = {};
  }
  return _governanceCache;
}

// Load a source's curated allowlist from the in-repo .omc-curation/<name>-selection.json.
// This is the single source of truth shared by `plan apply` (maintainer) and the
// end-user default config below — no hardcoded duplicate that could drift.
function loadCurationAllowlist(sourceName) {
  const selectionPath = path.join(PKG_ROOT, '.omc-curation', `${sourceName}-selection.json`);
  try {
    const data = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
    if (!data || typeof data !== 'object') return undefined;
    const allowlist = {};
    for (const type of ['skills', 'agents', 'commands', 'hooks']) {
      if (Array.isArray(data[type]) && data[type].length > 0) allowlist[type] = data[type];
    }
    return Object.keys(allowlist).length > 0 ? allowlist : undefined;
  } catch {
    return undefined;
  }
}

const DEFAULT_DISTRIBUTION_MANIFESTS = [
  'package.json',
  '.claude-plugin/plugin.json',
  'agent.yaml',
];

const DEFAULT_INSTALL_PROFILES = ['claude-runtime', 'reference-only'];

function getDefaultConfig() {
  return {
    active: 'local',
    sources: {
      local: {
        path: '.local',
        priority: 1,
        artifacts: ['skills', 'agents', 'hooks', 'commands', 'guidelines', 'settings', 'hud'],
        kind: 'content-repo',
        harnesses: ['claude'],
        profiles: DEFAULT_INSTALL_PROFILES,
      },
      'oh-my-claudecode': {
        remote: 'https://github.com/Yeachan-Heo/oh-my-claudecode.git',
        ref: 'main',
        priority: 2,
        artifacts: ['skills', 'agents', 'hooks'],
        mapping: {
          skills: 'skills',
          agents: 'agents',
          hooks: 'hooks',
        },
        kind: 'content-repo',
        harnesses: ['claude'],
        profiles: DEFAULT_INSTALL_PROFILES,
      },
      superpowers: {
        remote: 'https://github.com/obra/superpowers.git',
        ref: 'main',
        priority: 3,
        artifacts: ['skills', 'agents', 'hooks', 'commands'],
        mapping: {
          skills: 'skills',
          agents: 'agents',
          hooks: 'hooks',
          commands: 'commands',
        },
        kind: 'content-repo',
        harnesses: ['claude'],
        profiles: DEFAULT_INSTALL_PROFILES,
      },
      ecc: {
        remote: 'https://github.com/affaan-m/everything-claude-code.git',
        ref: 'main',
        priority: 4,
        artifacts: ['agents', 'commands', 'skills'],
        kind: 'distribution-repo',
        installMode: 'auto',
        harnesses: ['claude'],
        manifests: ['plugin.json', 'marketplace.json', '.claude-plugin/marketplace.json'],
        // Allowlist is applied generically in normalizeSourceConfig from
        // .omc-curation/ecc-selection.json (a fresh install gets the vetted
        // slice, not all 251 skills / 63 agents) — same path as every source.
        appliedProfile: 'claude-runtime',
        profiles: DEFAULT_INSTALL_PROFILES,
      },
      'anthropic-skills': {
        remote: 'https://github.com/anthropics/skills.git',
        ref: 'main',
        priority: 99,
        artifacts: ['skills'],
        mapping: {
          skills: 'skills',
          spec: 'spec',
          template: 'template',
        },
        role: 'reference',
        kind: 'content-repo',
        harnesses: ['claude'],
        profiles: ['reference-only'],
      },
    },
    lastSync: null,
    syncHistory: [],
  };
}

function dedupeArtifacts(artifacts) {
  return [...new Set((artifacts || []).filter(Boolean))];
}

function dedupeStrings(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normalizeAllowlist(allowlist) {
  if (!allowlist || typeof allowlist !== 'object') return undefined;
  const next = {};
  for (const [artifactType, names] of Object.entries(allowlist)) {
    const uniqueNames = dedupeStrings(Array.isArray(names) ? names : []);
    if (uniqueNames.length > 0) {
      next[artifactType] = uniqueNames.sort();
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function normalizeSourceConfig(name, source) {
  source.artifacts = dedupeArtifacts(source.artifacts);
  source.mapping = source.mapping || {};

  // Migrate local prompt guidance from legacy claude-md to guidelines.
  if (name === 'local' && source.artifacts.includes('claude-md') && !source.artifacts.includes('guidelines')) {
    source.artifacts = source.artifacts.map((artifact) => (
      artifact === 'claude-md' ? 'guidelines' : artifact
    ));
  }

  source.kind = source.kind || 'content-repo';
  source.installMode = source.installMode || (source.kind === 'distribution-repo' ? 'planned' : 'auto');
  source.harnesses = dedupeStrings(source.harnesses || ['claude']);
  source.manifests = dedupeStrings(source.manifests || (source.kind === 'distribution-repo'
    ? DEFAULT_DISTRIBUTION_MANIFESTS
    : []));
  source.profiles = dedupeStrings(source.profiles || DEFAULT_INSTALL_PROFILES);

  // Unified governance.json is the authoritative cross-source policy.
  const govSource = (loadGovernance().sources || {})[name] || {};
  // Priority: governance wins when it declares one (single source of truth).
  if (typeof govSource.priority === 'number') source.priority = govSource.priority;
  // Allowlist authority: explicit config (e.g. `plan apply`) > governance.json
  // inline allowlist > per-source .omc-curation/<name>-selection.json > none
  // (no allowlist → install everything).
  source.allowlist = normalizeAllowlist(source.allowlist)
    || normalizeAllowlist(govSource.allowlist)
    || normalizeAllowlist(loadCurationAllowlist(name));

  if (source.role === 'reference' && !source.profiles.includes('reference-only')) {
    source.profiles.push('reference-only');
  }

  return source;
}

function normalizeConfig(config) {
  const normalized = config || getDefaultConfig();
  normalized.sources = normalized.sources || {};

  for (const [name, source] of Object.entries(normalized.sources)) {
    normalizeSourceConfig(name, source);
  }

  return normalized;
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return normalizeConfig(getDefaultConfig());
  }
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch {
    return normalizeConfig(getDefaultConfig());
  }
}

async function writeConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    await fsp.mkdir(CONFIG_DIR, { recursive: true });
  }
  await fsp.writeFile(CONFIG_PATH, JSON.stringify(normalizeConfig(config), null, 2) + '\n', 'utf8');
}

function getActiveSource() {
  return readConfig().active;
}

async function setActiveSource(source) {
  const config = readConfig();
  config.active = source;
  await writeConfig(config);
}

async function recordSync(success, details = {}) {
  const config = readConfig();
  const record = {
    timestamp: new Date().toISOString(),
    success,
    ...details,
  };
  config.syncHistory.push(record);
  if (success) {
    config.lastSync = record.timestamp;
  }
  if (config.syncHistory.length > 50) {
    config.syncHistory = config.syncHistory.slice(-50);
  }
  await writeConfig(config);
}

async function addSource(name, remote, options = {}) {
  const config = readConfig();
  if (config.sources[name]) {
    throw new Error(`Source "${name}" already exists`);
  }
  config.sources[name] = normalizeSourceConfig(name, {
    remote,
    ref: options.ref || 'main',
    priority: options.priority || Object.keys(config.sources).length + 1,
    artifacts: options.artifacts || ['skills'],
    mapping: options.mapping || {},
    role: options.role,
    kind: options.kind,
    installMode: options.installMode,
    harnesses: options.harnesses,
    manifests: options.manifests,
    profiles: options.profiles,
  });
  await writeConfig(config);
}

async function removeSource(name) {
  const config = readConfig();
  if (!config.sources[name]) {
    throw new Error(`Source "${name}" not found`);
  }
  if (name === 'local') {
    throw new Error('Cannot remove the local source');
  }
  delete config.sources[name];
  await writeConfig(config);
}

async function updateSource(name, mutator) {
  const config = readConfig();
  if (!config.sources[name]) {
    throw new Error(`Source "${name}" not found`);
  }

  const current = { ...config.sources[name] };
  const next = mutator ? (await mutator(current, config)) : current;
  config.sources[name] = normalizeSourceConfig(name, next || current);
  await writeConfig(config);
  return config.sources[name];
}

function getSourceAllowlist(source, artifactType) {
  if (!source || !source.allowlist) return null;
  const names = source.allowlist[artifactType];
  if (!Array.isArray(names) || names.length === 0) return null;
  return new Set(names);
}

function filterItemsByAllowlist(source, artifactType, items) {
  const allowlist = getSourceAllowlist(source, artifactType);
  if (!allowlist) return items;
  return items.filter(item => allowlist.has(item.name));
}

module.exports = {
  readConfig,
  writeConfig,
  getActiveSource,
  setActiveSource,
  recordSync,
  addSource,
  removeSource,
  updateSource,
  getSourceAllowlist,
  filterItemsByAllowlist,
  loadGovernance,
  normalizeConfig,
  normalizeSourceConfig,
  DEFAULT_DISTRIBUTION_MANIFESTS,
  DEFAULT_INSTALL_PROFILES,
  CONFIG_DIR,
  CONFIG_PATH,
};
