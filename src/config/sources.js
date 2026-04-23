const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.omc-manage');
const CONFIG_PATH = path.join(CONFIG_DIR, 'sources.json');

function getDefaultConfig() {
  return {
    active: 'local',
    sources: {
      local: {
        path: '.local',
        priority: 1,
        artifacts: ['skills', 'agents', 'hooks', 'commands', 'guidelines', 'settings', 'hud'],
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
      },
    },
    lastSync: null,
    syncHistory: [],
  };
}

function dedupeArtifacts(artifacts) {
  return [...new Set((artifacts || []).filter(Boolean))];
}

function normalizeConfig(config) {
  const normalized = config || getDefaultConfig();
  normalized.sources = normalized.sources || {};

  for (const [name, source] of Object.entries(normalized.sources)) {
    source.artifacts = dedupeArtifacts(source.artifacts);

    // Migrate local prompt guidance from legacy claude-md to guidelines.
    if (name === 'local' && source.artifacts.includes('claude-md') && !source.artifacts.includes('guidelines')) {
      source.artifacts = source.artifacts.map((artifact) => (
        artifact === 'claude-md' ? 'guidelines' : artifact
      ));
    }
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
  config.sources[name] = {
    remote,
    ref: options.ref || 'main',
    priority: options.priority || Object.keys(config.sources).length + 1,
    artifacts: options.artifacts || ['skills'],
    mapping: options.mapping || {},
    role: options.role,
  };
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

module.exports = {
  readConfig,
  writeConfig,
  getActiveSource,
  setActiveSource,
  recordSync,
  addSource,
  removeSource,
  normalizeConfig,
  CONFIG_DIR,
  CONFIG_PATH,
};
