const path = require('path');
const os = require('os');
const { ARTIFACT_TYPES } = require('./artifact-types');

function getProjectRoot() {
  return path.resolve(__dirname, '..', '..');
}

// Generic: get source artifact directory
function getSourceArtifactDir(sourceName, artifactType, root) {
  root = root || getProjectRoot();
  if (sourceName === 'local') {
    return path.join(root, '.local', artifactType);
  }
  return path.join(root, '.upstream', sourceName, artifactType);
}

// Generic: get install target for an artifact type
function getInstallTarget(artifactType) {
  const type = ARTIFACT_TYPES[artifactType];
  if (!type) throw new Error(`Unknown artifact type: ${artifactType}`);
  return type.installTarget;
}

// Backward-compatible aliases
function getLocalSkillsDir(root) {
  return getSourceArtifactDir('local', 'skills', root);
}

function getUpstreamSkillsDir(root) {
  return getSourceArtifactDir('oh-my-claudecode', 'skills', root);
}

function getUserSkillsDir() {
  return ARTIFACT_TYPES.skills.installTarget;
}

function getProjectSkillsDir(cwd) {
  return path.join(cwd || process.cwd(), '.claude', 'skills');
}

function getSkillsDir(scope, cwd) {
  if (scope === 'project') {
    return getProjectSkillsDir(cwd);
  }
  return getUserSkillsDir();
}

function getMergeConfigPath(root) {
  return path.join(root || getProjectRoot(), 'templates', 'merge-config.json');
}

function getReportDir(root) {
  return path.join(root || getProjectRoot(), '.omc-manage');
}

module.exports = {
  getProjectRoot,
  getSourceArtifactDir,
  getInstallTarget,
  // Backward-compatible
  getLocalSkillsDir,
  getUpstreamSkillsDir,
  getUserSkillsDir,
  getProjectSkillsDir,
  getSkillsDir,
  getMergeConfigPath,
  getReportDir,
};
