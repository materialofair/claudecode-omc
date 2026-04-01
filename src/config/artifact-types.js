const path = require('path');
const os = require('os');

const ARTIFACT_TYPES = {
  skills: {
    label: 'Skills',
    installTarget: path.join(os.homedir(), '.claude', 'skills'),
    sourceSubdir: 'skills',
    format: 'directory',       // each artifact = a directory with SKILL.md
    metadataFile: 'SKILL.md',
    mergeStrategy: 'name-based',
  },
  agents: {
    label: 'Agents',
    installTarget: path.join(os.homedir(), '.claude', 'agents'),
    sourceSubdir: 'agents',
    format: 'file',            // each artifact = a .md file
    metadataFile: null,        // metadata in the file itself
    filePattern: '*.md',
    mergeStrategy: 'name-based',
  },
  hooks: {
    label: 'Hooks',
    installTarget: path.join(os.homedir(), '.claude', 'hooks'),
    sourceSubdir: 'hooks',
    format: 'mixed',           // .mjs files + hooks.json config + lib/
    metadataFile: null,
    mergeStrategy: 'config-merge',
  },
  commands: {
    label: 'Commands',
    installTarget: path.join(os.homedir(), '.claude', 'commands'),
    sourceSubdir: 'commands',
    format: 'file-tree',       // .md files, may be in subdirectories
    metadataFile: null,
    mergeStrategy: 'name-based',
  },
  'claude-md': {
    label: 'CLAUDE.md',
    installTarget: path.join(os.homedir(), '.claude', 'CLAUDE.md'),
    sourceSubdir: 'claude-md',
    format: 'single-file',
    metadataFile: null,
    mergeStrategy: 'section-concat',
  },
  settings: {
    label: 'Settings',
    installTarget: path.join(os.homedir(), '.claude', 'settings.json'),
    sourceSubdir: 'settings',
    format: 'json',
    metadataFile: null,
    mergeStrategy: 'deep-merge',
  },
  hud: {
    label: 'HUD',
    installTarget: path.join(os.homedir(), '.claude', 'hud'),
    sourceSubdir: 'hud',
    format: 'file',
    metadataFile: null,
    mergeStrategy: 'name-based',
  },
};

function getArtifactTypes() {
  return ARTIFACT_TYPES;
}

function getArtifactType(name) {
  return ARTIFACT_TYPES[name] || null;
}

function getArtifactTypeNames() {
  return Object.keys(ARTIFACT_TYPES);
}

module.exports = { ARTIFACT_TYPES, getArtifactTypes, getArtifactType, getArtifactTypeNames };
