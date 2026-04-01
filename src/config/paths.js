const path = require('path');
const os = require('os');
const fs = require('fs');
const { ARTIFACT_TYPES } = require('./artifact-types');

const USER_DATA_DIR = path.join(os.homedir(), '.omc-manage');

function getProjectRoot() {
  return path.resolve(__dirname, '..', '..');
}

/**
 * Detect if running from an npm-installed package (no .git dir, has bundled/)
 */
function isDistributionMode() {
  const root = getProjectRoot();
  return !fs.existsSync(path.join(root, '.git'))
    && fs.existsSync(path.join(root, 'bundled', 'upstream'));
}

/**
 * Get the directory for a source's artifact type.
 *
 * Resolution order:
 *   Dev mode:
 *     local  → <repo>/.local/<type>
 *     other  → <repo>/.upstream/<source>/<type>
 *
 *   Distribution mode:
 *     local  → ~/.omc-manage/local/<type>
 *     other  → ~/.omc-manage/upstream/<source>/<type>  (if synced)
 *              → <pkg>/bundled/upstream/<source>/<type> (fallback)
 */
function getSourceArtifactDir(sourceName, artifactType, root) {
  root = root || getProjectRoot();

  if (isDistributionMode()) {
    if (sourceName === 'local') {
      // Check user-customized local first, then fall back to bundled .local/
      const userLocal = path.join(USER_DATA_DIR, 'local', artifactType);
      if (fs.existsSync(userLocal)) {
        return userLocal;
      }
      return path.join(root, '.local', artifactType);
    }
    // Check user-synced first, then fall back to bundled
    const synced = path.join(USER_DATA_DIR, 'upstream', sourceName, artifactType);
    if (fs.existsSync(synced)) {
      return synced;
    }
    return path.join(root, 'bundled', 'upstream', sourceName, artifactType);
  }

  // Dev mode
  if (sourceName === 'local') {
    return path.join(root, '.local', artifactType);
  }
  return path.join(root, '.upstream', sourceName, artifactType);
}

/**
 * Get the write target for source sync.
 * In distribution mode, synced data goes to ~/.omc-manage/upstream/
 * In dev mode, it goes to <repo>/.upstream/
 */
function getSyncTargetDir(sourceName, artifactType, root) {
  root = root || getProjectRoot();

  if (isDistributionMode()) {
    return path.join(USER_DATA_DIR, 'upstream', sourceName, artifactType);
  }
  return path.join(root, '.upstream', sourceName, artifactType);
}

/**
 * Get the temp directory for sync operations.
 * In distribution mode, use ~/.omc-manage/tmp/
 * In dev mode, use <repo>/.tmp-sync-{source}
 */
function getSyncTempDir(sourceName, root) {
  root = root || getProjectRoot();

  if (isDistributionMode()) {
    return path.join(USER_DATA_DIR, 'tmp', 'sync-' + sourceName);
  }
  return path.join(root, '.tmp-sync-' + sourceName);
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
  if (isDistributionMode()) {
    return path.join(USER_DATA_DIR, 'reports');
  }
  return path.join(root || getProjectRoot(), '.omc-manage');
}

module.exports = {
  getProjectRoot,
  isDistributionMode,
  getSourceArtifactDir,
  getSyncTargetDir,
  getSyncTempDir,
  getInstallTarget,
  USER_DATA_DIR,
  // Backward-compatible
  getLocalSkillsDir,
  getUpstreamSkillsDir,
  getUserSkillsDir,
  getProjectSkillsDir,
  getSkillsDir,
  getMergeConfigPath,
  getReportDir,
};
