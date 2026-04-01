/* eslint-disable no-console */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { readConfig, setActiveSource, recordSync } = require('../config/sources');
const { getProjectRoot, getLocalSkillsDir, getUpstreamSkillsDir } = require('../config/paths');

async function syncSource(sourceName, config, flags = {}) {
  const sourceConfig = config.sources[sourceName];
  if (!sourceConfig) {
    console.error(`  Unknown source: ${sourceName}`);
    return false;
  }

  const root = getProjectRoot();
  const targetDir = sourceName === 'local'
    ? getLocalSkillsDir(root)
    : getUpstreamSkillsDir(root);

  console.log(`  Syncing ${sourceName} from ${sourceConfig.remote} (${sourceConfig.ref})...`);

  // If --local flag provided and source is local, copy from local path
  if (flags.local && sourceName === 'local') {
    const localSkillsDir = path.join(flags.local, 'skills');
    if (!fs.existsSync(localSkillsDir)) {
      console.error(`  Local skills dir not found: ${localSkillsDir}`);
      return false;
    }
    await fsp.rm(targetDir, { recursive: true, force: true });
    await copyDirRecursive(localSkillsDir, targetDir);
    console.log(`  Copied from local: ${localSkillsDir}`);
    return true;
  }

  // Shallow clone to temp dir, then copy skills/
  const tmpDir = path.join(root, '.tmp-sync-' + sourceName);
  try {
    // Clean up any previous temp dir
    if (fs.existsSync(tmpDir)) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }

    const cloneResult = spawnSync('git', [
      'clone', '--depth', '1', '--branch', sourceConfig.ref,
      '--single-branch', sourceConfig.remote, tmpDir,
    ], { encoding: 'utf8', timeout: 60000 });

    if (cloneResult.status !== 0) {
      console.error(`  Clone failed: ${cloneResult.stderr || cloneResult.error}`);
      return false;
    }

    const tmpSkillsDir = path.join(tmpDir, 'skills');
    if (!fs.existsSync(tmpSkillsDir)) {
      console.error(`  No skills/ directory found in ${sourceName}`);
      return false;
    }

    // Replace target with fresh copy
    await fsp.rm(targetDir, { recursive: true, force: true });
    await copyDirRecursive(tmpSkillsDir, targetDir);

    const count = fs.readdirSync(targetDir).filter(e =>
      fs.statSync(path.join(targetDir, e)).isDirectory()
    ).length;
    console.log(`  Synced ${count} skills to ${path.relative(root, targetDir)}`);
    return true;
  } finally {
    if (fs.existsSync(tmpDir)) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  }
}

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
        console.log(`${marker} ${name} (priority ${src.priority})`);
        console.log(`  ${src.remote} @ ${src.ref}`);
        console.log('');
      }
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
      console.log('Run "omc-manage setup --force" to reinstall from this source.');
      break;
    }

    case 'sync': {
      console.log('Syncing sources...');
      console.log('');
      const syncLocal = flags.local || flags.all || (!flags.local && !flags.upstream);
      const syncUpstream = flags.upstream || flags.all || (!flags.local && !flags.upstream);

      let success = true;

      if (syncLocal && config.sources.local?.remote) {
        const ok = await syncSource('local', config, flags);
        if (!ok) success = false;
      }

      if (syncUpstream) {
        const ok = await syncSource('upstream', config, flags);
        if (!ok) success = false;
      }

      await recordSync(success);
      console.log('');
      console.log(success ? 'Sync complete.' : 'Sync completed with errors.');
      break;
    }

    case 'status': {
      console.log('Source Status');
      console.log('=============');
      console.log(`Active: ${config.active}`);
      console.log('');

      const root = getProjectRoot();
      const localDir = getLocalSkillsDir(root);
      const upstreamDir = getUpstreamSkillsDir(root);

      if (fs.existsSync(localDir)) {
        const count = fs.readdirSync(localDir).filter(e =>
          fs.statSync(path.join(localDir, e)).isDirectory()
        ).length;
        console.log(`Local skills: ${count} (${path.relative(root, localDir)})`);
      } else {
        console.log('Local skills: none');
      }

      if (fs.existsSync(upstreamDir)) {
        const count = fs.readdirSync(upstreamDir).filter(e =>
          fs.statSync(path.join(upstreamDir, e)).isDirectory()
        ).length;
        console.log(`Upstream skills: ${count} (${path.relative(root, upstreamDir)})`);
      } else {
        console.log('Upstream skills: not synced yet');
      }

      console.log('');
      if (config.lastSync) {
        console.log(`Last sync: ${config.lastSync}`);
      } else {
        console.log('Never synced. Run: omc-manage source sync --all');
      }

      if (config.syncHistory.length > 0) {
        console.log('');
        console.log('Recent sync history:');
        config.syncHistory.slice(-5).forEach(record => {
          const status = record.success ? '✓' : '✗';
          console.log(`  ${status} ${record.timestamp}`);
        });
      }
      break;
    }

    default:
      throw new Error(`Unknown subcommand: ${cmd}. Use: list, set, sync, or status`);
  }
}

module.exports = { source, copyDirRecursive };
