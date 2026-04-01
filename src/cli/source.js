/* eslint-disable no-console */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { readConfig, setActiveSource, recordSync, addSource, removeSource } = require('../config/sources');
const { getProjectRoot, getSourceArtifactDir } = require('../config/paths');

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

async function syncRemoteSource(sourceName, sourceConfig, root) {
  console.log(`  Syncing ${sourceName} from ${sourceConfig.remote} (${sourceConfig.ref})...`);

  const tmpDir = path.join(root, '.tmp-sync-' + sourceName);
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
      const destPath = getSourceArtifactDir(sourceName, artifactType, root);

      if (fs.existsSync(srcPath)) {
        await fsp.rm(destPath, { recursive: true, force: true });
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
        console.log('');
      }
      break;
    }

    case 'add': {
      const name = args[1];
      const remote = args[2];
      if (!name || !remote) {
        throw new Error('Usage: omc-manage source add <name> <remote-url> [--ref main] [--priority N] [--artifacts skills,agents]');
      }
      await addSource(name, remote, {
        ref: flags.ref,
        priority: flags.priority,
        artifacts: flags.artifacts,
      });
      console.log(`Source "${name}" added.`);
      console.log(`Run "omc-manage source sync ${name}" to fetch artifacts.`);
      break;
    }

    case 'remove': {
      const name = args[1];
      if (!name) throw new Error('Usage: omc-manage source remove <name>');
      await removeSource(name);
      // Clean up upstream directory
      const root = getProjectRoot();
      const upstreamDir = path.join(root, '.upstream', name);
      if (fs.existsSync(upstreamDir)) {
        await fsp.rm(upstreamDir, { recursive: true, force: true });
      }
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

    default:
      throw new Error(`Unknown subcommand: ${cmd}. Use: list, add, remove, set, sync, or status`);
  }
}

module.exports = { source, copyDirRecursive };
