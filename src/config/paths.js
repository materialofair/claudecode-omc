const path = require('path');
const os = require('os');

function getUserSkillsDir() {
  return path.join(os.homedir(), '.claude', 'skills');
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

function getProjectRoot() {
  return path.resolve(__dirname, '..', '..');
}

function getLocalSkillsDir(root) {
  return path.join(root || getProjectRoot(), '.local', 'skills');
}

function getUpstreamSkillsDir(root) {
  return path.join(root || getProjectRoot(), '.upstream', 'skills');
}

function getMergeConfigPath(root) {
  return path.join(root || getProjectRoot(), 'templates', 'merge-config.json');
}

function getReportDir(root) {
  return path.join(root || getProjectRoot(), '.omc-manage');
}

module.exports = {
  getUserSkillsDir,
  getProjectSkillsDir,
  getSkillsDir,
  getProjectRoot,
  getLocalSkillsDir,
  getUpstreamSkillsDir,
  getMergeConfigPath,
  getReportDir,
};
