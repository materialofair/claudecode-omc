/* eslint-disable no-console */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { readConfig, setActiveSource, recordSync, addSource, removeSource } = require('../config/sources');
const { getProjectRoot, getSourceArtifactDir, getSyncTargetDir, getSyncTempDir, getSourceMetadataDir } = require('../config/paths');
const { buildSourceCatalog } = require('../catalog/source-catalog');

async function copyDirRecursive(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(from, to);
    } else if (entry.isFile()) {
      await fsp.copyFile(from, to);
    }
  }
}

function copyFileRecursive(src, dest) {
  return fsp.mkdir(path.dirname(dest), { recursive: true })
    .then(() => fsp.copyFile(src, dest));
}

function parseMappingFlag(mappingFlag) {
  if (!mappingFlag) return {};

  const entries = mappingFlag
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  const mapping = {};
  for (const entry of entries) {
    const [artifactType, ...rest] = entry.split('=');
    const target = rest.join('=').trim();
    if (!artifactType || !target) {
      throw new Error(`Invalid mapping entry "${entry}". Use artifact=path.`);
    }
    mapping[artifactType.trim()] = target;
  }
  return mapping;
}

async function syncRemoteSource(sourceName, sourceConfig, root) {
  console.log(`  Syncing ${sourceName} from ${sourceConfig.remote} (${sourceConfig.ref})...`);

  const tmpDir = getSyncTempDir(sourceName, root);
  try {
    if (fs.existsSync(tmpDir)) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }

    const cloneResult = spawnSync('git', [
      'clone', '--depth', '1', '--branch', sourceConfig.ref,
      '--single-branch', sourceConfig.remote, tmpDir,
    ], { encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] });

    if (cloneResult.status !== 0) {
      console.error(`  Clone failed: ${cloneResult.stderr || cloneResult.error}`);
      return false;
    }

    // Copy each declared artifact type
    const artifacts = sourceConfig.artifacts || ['skills'];
    const mapping = sourceConfig.mapping || {};

    for (const artifactType of artifacts) {
      const srcSubdir = mapping[artifactType] || artifactType;
      const srcPath = path.join(tmpDir, srcSubdir);
      const destPath = getSyncTargetDir(sourceName, artifactType, root);

      await fsp.rm(destPath, { recursive: true, force: true });
      if (fs.existsSync(srcPath)) {
        if (fs.statSync(srcPath).isDirectory()) {
          await copyDirRecursive(srcPath, destPath);
        } else {
          await fsp.mkdir(path.dirname(destPath), { recursive: true });
          await fsp.copyFile(srcPath, destPath);
        }
        const count = fs.statSync(destPath).isDirectory()
          ? fs.readdirSync(destPath).length : 1;
        console.log(`    ${artifactType}: ${count} items`);
      }
    }

    const metadataDir = getSourceMetadataDir(sourceName, root);
    await fsp.rm(path.join(metadataDir, 'manifests'), { recursive: true, force: true });
    const manifestFiles = [];
    for (const manifestPath of sourceConfig.manifests || []) {
      const srcPath = path.join(tmpDir, manifestPath);
      if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isFile()) continue;
      const destPath = path.join(metadataDir, 'manifests', manifestPath);
      await copyFileRecursive(srcPath, destPath);
      manifestFiles.push(manifestPath);
    }

    await fsp.mkdir(metadataDir, { recursive: true });
    await fsp.writeFile(path.join(metadataDir, 'bundle.json'), JSON.stringify({
      syncedAt: new Date().toISOString(),
      sourceName,
      remote: sourceConfig.remote,
      ref: sourceConfig.ref,
      kind: sourceConfig.kind || 'content-repo',
      harnesses: sourceConfig.harnesses || ['claude'],
      artifacts: sourceConfig.artifacts || [],
      manifests: manifestFiles,
      profiles: sourceConfig.profiles || [],
    }, null, 2) + '\n', 'utf8');

    return true;
  } finally {
    if (fs.existsSync(tmpDir)) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  }
}

async function source(args, flags = {}) {
  const cmd = args[0] || 'list';
  const config = readConfig();

  switch (cmd) {
    case 'list': {
      const active = config.active;
      console.log('Configured sources:');
      console.log('');
      for (const [name, src] of Object.entries(config.sources)) {
        const marker = active === name ? '●' : '○';
        const location = src.remote || src.path || 'local';
        console.log(`${marker} ${name} (priority ${src.priority})`);
        console.log(`  ${location}`);
        console.log(`  artifacts: ${(src.artifacts || []).join(', ')}`);
        console.log(`  kind: ${src.kind || 'content-repo'}`);
        console.log(`  installMode: ${src.installMode || 'auto'}`);
        console.log(`  harnesses: ${(src.harnesses || ['claude']).join(', ')}`);
        console.log(`  profiles: ${(src.profiles || []).join(', ')}`);
        if (src.appliedProfile) {
          console.log(`  appliedProfile: ${src.appliedProfile}`);
        }
        if (src.allowlist && Object.keys(src.allowlist).length > 0) {
          const allowlist = Object.entries(src.allowlist)
            .map(([artifactType, names]) => `${artifactType}(${names.length})`)
            .join(', ');
          console.log(`  allowlist: ${allowlist}`);
        }
        if (src.role) {
          console.log(`  role: ${src.role}`);
        }
        if (src.mapping && Object.keys(src.mapping).length > 0) {
          const mapping = Object.entries(src.mapping)
            .map(([artifact, target]) => `${artifact}=${target}`)
            .join(', ');
          console.log(`  mapping: ${mapping}`);
        }
        if (src.manifests && src.manifests.length > 0) {
          console.log(`  manifests: ${src.manifests.join(', ')}`);
        }
        console.log('');
      }
      break;
    }

    case 'add': {
      const name = args[1];
      const remote = args[2];
      if (!name || !remote) {
        throw new Error('Usage: omc-manage source add <name> <remote-url> [--ref main] [--priority N] [--artifacts skills,agents,guidelines] [--mapping guidelines=CLAUDE.md] [--role guidelines] [--kind distribution-repo] [--install-mode planned] [--harnesses claude,codex] [--manifests package.json,agent.yaml] [--profiles claude-runtime,reference-only]');
      }
      await addSource(name, remote, {
        ref: flags.ref,
        priority: flags.priority,
        artifacts: flags.artifacts,
        mapping: parseMappingFlag(flags.mapping),
        role: flags.role,
        kind: flags.kind,
        installMode: flags.installMode,
        harnesses: flags.harnesses,
        manifests: flags.manifests,
        profiles: flags.profiles,
      });
      console.log(`Source "${name}" added.`);
      console.log(`Run "omc-manage source sync ${name}" to fetch artifacts.`);
      break;
    }

    case 'remove': {
      const name = args[1];
      if (!name) throw new Error('Usage: omc-manage source remove <name>');
      await removeSource(name);
      // Clean up upstream directories (both dev and user-synced)
      const root = getProjectRoot();
      const devDir = path.join(root, '.upstream', name);
      const userDir = path.join(require('../config/paths').USER_DATA_DIR, 'upstream', name);
      if (fs.existsSync(devDir)) await fsp.rm(devDir, { recursive: true, force: true });
      if (fs.existsSync(userDir)) await fsp.rm(userDir, { recursive: true, force: true });
      console.log(`Source "${name}" removed.`);
      break;
    }

    case 'set': {
      const name = args[1];
      if (!name || !config.sources[name]) {
        const validNames = Object.keys(config.sources).join(', ');
        throw new Error(`Invalid source. Use: ${validNames}`);
      }
      await setActiveSource(name);
      console.log(`Active source set to: ${name}`);
      break;
    }

    case 'sync': {
      console.log('Syncing sources...');
      console.log('');

      const root = getProjectRoot();
      const targetName = args[1]; // optional: specific source name
      let success = true;

      for (const [name, src] of Object.entries(config.sources)) {
        if (name === 'local') continue; // local is in-repo, no sync needed
        if (targetName && name !== targetName) continue;
        if (!flags.all && !targetName && !flags[name]) {
          // Default: sync all remote sources
        }

        if (!src.remote) continue;
        const ok = await syncRemoteSource(name, src, root);
        if (!ok) success = false;
        console.log('');
      }

      await recordSync(success);
      console.log(success ? 'Sync complete.' : 'Sync completed with errors.');
      break;
    }

    case 'status': {
      console.log('Source Status');
      console.log('=============');
      console.log(`Active: ${config.active}`);
      console.log('');

      const root = getProjectRoot();

      for (const [name, src] of Object.entries(config.sources)) {
        console.log(`[${name}] (priority ${src.priority})`);
        console.log(`  kind: ${src.kind || 'content-repo'}`);
        console.log(`  installMode: ${src.installMode || 'auto'}`);
        if (src.appliedProfile) {
          console.log(`  appliedProfile: ${src.appliedProfile}`);
        }
        if (src.allowlist && Object.keys(src.allowlist).length > 0) {
          const allowlist = Object.entries(src.allowlist)
            .map(([artifactType, names]) => `${artifactType}(${names.length})`)
            .join(', ');
          console.log(`  allowlist: ${allowlist}`);
        }
        if (src.role) {
          console.log(`  role: ${src.role}`);
        }
        const artifacts = src.artifacts || [];
        for (const type of artifacts) {
          const dir = getSourceArtifactDir(name, type, root);
          if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            const count = fs.readdirSync(dir).length;
            console.log(`  ${type}: ${count} items`);
          } else if (fs.existsSync(dir)) {
            console.log(`  ${type}: present`);
          } else {
            console.log(`  ${type}: not synced`);
          }
        }
        console.log('');
      }

      if (config.lastSync) {
        console.log(`Last sync: ${config.lastSync}`);
      } else {
        console.log('Never synced. Run: omc-manage source sync');
      }
      break;
    }

    case 'inspect': {
      const name = args[1];
      if (!name || !config.sources[name]) {
        const validNames = Object.keys(config.sources).join(', ');
        throw new Error(`Invalid source. Use: ${validNames}`);
      }

      const catalog = await buildSourceCatalog(name, getProjectRoot());
      if (flags.json) {
        console.log(JSON.stringify(catalog, null, 2));
        break;
      }

      console.log(`Source Inspection: ${name}`);
      console.log('='.repeat(40));
      console.log(`kind: ${catalog.kind}`);
      console.log(`installMode: ${catalog.installMode}`);
      console.log(`role: ${catalog.role || 'installable'}`);
      console.log(`harnesses: ${catalog.harnesses.join(', ')}`);
      console.log(`profiles: ${catalog.profiles.join(', ')}`);
      console.log(`manifests discovered: ${catalog.manifests.filter(m => m.present).length}/${catalog.manifests.length}`);
      console.log('');

      console.log('Surfaces:');
      for (const surface of catalog.surfaces) {
        const bits = [
          surface.category,
          surface.harness,
          surface.installable ? 'installable' : 'non-installable',
        ];
        if (surface.artifactType) bits.push(`artifact=${surface.artifactType}`);
        if (surface.count != null) bits.push(`count=${surface.count}`);
        console.log(`  ${surface.name} — ${bits.join(', ')}`);
      }

      if (catalog.warnings.length > 0) {
        console.log('');
        console.log('Warnings:');
        for (const warning of catalog.warnings) {
          console.log(`  - ${warning}`);
        }
      }
      break;
    }

    default:
      throw new Error(`Unknown subcommand: ${cmd}. Use: list, add, remove, set, sync, status, or inspect`);
  }
}

module.exports = { source, copyDirRecursive };
