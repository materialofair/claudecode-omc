const path = require('path');
const os = require('os');
const fs = require('fs');
const { ARTIFACT_TYPES } = require('./artifact-types');

const USER_DATA_DIR = path.join(os.homedir(), '.omc-manage');

function getProjectRoot() {
  return path.resolve(__dirname, '..', '..');
}

function getSourceRootDir(sourceName, root) {
  root = root || getProjectRoot();

  if (isDistributionMode()) {
    if (sourceName === 'local') {
      const userLocal = path.join(USER_DATA_DIR, 'local');
      if (fs.existsSync(userLocal)) {
        return userLocal;
      }
      return path.join(root, '.local');
    }

    const synced = path.join(USER_DATA_DIR, 'upstream', sourceName);
    if (fs.existsSync(synced)) {
      return synced;
    }
    return path.join(root, 'bundled', 'upstream', sourceName);
  }

  if (sourceName === 'local') {
    return path.join(root, '.local');
  }
  return path.join(root, '.upstream', sourceName);
}

function getSourceMetadataDir(sourceName, root) {
  return path.join(getSourceRootDir(sourceName, root), '.omc-source');
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

  const legacyArtifactType = artifactType === 'guidelines' ? 'claude-md' : null;
  const modernArtifactType = artifactType === 'claude-md' ? 'guidelines' : null;

  if (isDistributionMode()) {
    if (sourceName === 'local') {
      // Check user-customized local first, then fall back to bundled .local/
      const userLocal = path.join(USER_DATA_DIR, 'local', artifactType);
      if (fs.existsSync(userLocal)) {
        return userLocal;
      }
      if (legacyArtifactType) {
        const userLegacy = path.join(USER_DATA_DIR, 'local', legacyArtifactType);
        if (fs.existsSync(userLegacy)) {
          return userLegacy;
        }
      }
      if (modernArtifactType) {
        const userModern = path.join(USER_DATA_DIR, 'local', modernArtifactType);
        if (fs.existsSync(userModern)) {
          return userModern;
        }
      }
      const bundledLocal = path.join(root, '.local', artifactType);
      if (fs.existsSync(bundledLocal)) {
        return bundledLocal;
      }
      if (legacyArtifactType) {
        const bundledLegacy = path.join(root, '.local', legacyArtifactType);
        if (fs.existsSync(bundledLegacy)) {
          return bundledLegacy;
        }
      }
      if (modernArtifactType) {
        const bundledModern = path.join(root, '.local', modernArtifactType);
        if (fs.existsSync(bundledModern)) {
          return bundledModern;
        }
      }
      return bundledLocal;
    }
    // Check user-synced first, then fall back to bundled
    const synced = path.join(USER_DATA_DIR, 'upstream', sourceName, artifactType);
    if (fs.existsSync(synced)) {
      return synced;
    }
    if (legacyArtifactType) {
      const syncedLegacy = path.join(USER_DATA_DIR, 'upstream', sourceName, legacyArtifactType);
      if (fs.existsSync(syncedLegacy)) {
        return syncedLegacy;
      }
    }
    if (modernArtifactType) {
      const syncedModern = path.join(USER_DATA_DIR, 'upstream', sourceName, modernArtifactType);
      if (fs.existsSync(syncedModern)) {
        return syncedModern;
      }
    }
    const bundled = path.join(root, 'bundled', 'upstream', sourceName, artifactType);
    if (fs.existsSync(bundled)) {
      return bundled;
    }
    if (legacyArtifactType) {
      const bundledLegacy = path.join(root, 'bundled', 'upstream', sourceName, legacyArtifactType);
      if (fs.existsSync(bundledLegacy)) {
        return bundledLegacy;
      }
    }
    if (modernArtifactType) {
      const bundledModern = path.join(root, 'bundled', 'upstream', sourceName, modernArtifactType);
      if (fs.existsSync(bundledModern)) {
        return bundledModern;
      }
    }
    return bundled;
  }

  // Dev mode
  if (sourceName === 'local') {
    const localDir = path.join(root, '.local', artifactType);
    if (fs.existsSync(localDir)) {
      return localDir;
    }
    if (legacyArtifactType) {
      const legacyDir = path.join(root, '.local', legacyArtifactType);
      if (fs.existsSync(legacyDir)) {
        return legacyDir;
      }
    }
    if (modernArtifactType) {
      const modernDir = path.join(root, '.local', modernArtifactType);
      if (fs.existsSync(modernDir)) {
        return modernDir;
      }
    }
    return localDir;
  }
  const upstreamDir = path.join(root, '.upstream', sourceName, artifactType);
  if (fs.existsSync(upstreamDir)) {
    return upstreamDir;
  }
  if (legacyArtifactType) {
    const legacyDir = path.join(root, '.upstream', sourceName, legacyArtifactType);
    if (fs.existsSync(legacyDir)) {
      return legacyDir;
    }
  }
  if (modernArtifactType) {
    const modernDir = path.join(root, '.upstream', sourceName, modernArtifactType);
    if (fs.existsSync(modernDir)) {
      return modernDir;
    }
  }
  return upstreamDir;
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

function getScopedInstallTarget(artifactType, scope = 'user', cwd = process.cwd()) {
  if (scope !== 'project') {
    return getInstallTarget(artifactType);
  }

  if (artifactType === 'guidelines' || artifactType === 'claude-md') {
    return path.join(cwd, '.claude', 'CLAUDE.md');
  }
  if (artifactType === 'settings') {
    return path.join(cwd, '.claude', 'settings.json');
  }

  const type = ARTIFACT_TYPES[artifactType];
  if (!type) throw new Error(`Unknown artifact type: ${artifactType}`);
  return path.join(cwd, '.claude', type.sourceSubdir);
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
  getSourceRootDir,
  getSourceMetadataDir,
  getSourceArtifactDir,
  getSyncTargetDir,
  getSyncTempDir,
  getInstallTarget,
  getScopedInstallTarget,
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
