/* eslint-disable no-console */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
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

// --- Provenance: content hashes + upstream commit, recorded per sync so drift
// (local edits, upstream changes pulled in) can be detected later. This is what
// separates a governed source from a blind copy.
function hashFile(filePath) {
  return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// Map of POSIX relative path → content hash for every file under dir (recursive,
// so skill directories and flat .md files hash uniformly).
function hashTree(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    out[path.basename(dir)] = hashFile(dir);
    return out;
  }
  const walk = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(current, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile()) out[rel] = hashFile(abs);
    }
  };
  walk(dir, '');
  return out;
}

// Strip any inline credentials (https://user:token@host/…) before a remote URL
// is logged to stdout or persisted into bundle.json/provenance.json.
function redactRemote(remote) {
  try {
    const u = new URL(remote);
    if (u.username || u.password) { u.username = ''; u.password = ''; return u.toString(); }
  } catch { /* non-URL (e.g. scp-style or local path) — return as-is */ }
  return remote;
}

function diffHashTrees(recorded = {}, current = {}) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const key of Object.keys(current)) {
    if (!(key in recorded)) added.push(key);
    else if (recorded[key] !== current[key]) changed.push(key);
  }
  for (const key of Object.keys(recorded)) {
    if (!(key in current)) removed.push(key);
  }
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

// --- Lockfile: pins each source to an exact upstream commit for reproducible
// syncs. Lives in-repo at .omc-curation/sources.lock.json so it ships and is
// version-controlled alongside the curation it locks.
function getLockPath(root) {
  return path.join(root, '.omc-curation', 'sources.lock.json');
}

function readLock(root) {
  try {
    const data = JSON.parse(fs.readFileSync(getLockPath(root), 'utf8'));
    return data && typeof data.sources === 'object' ? data : { sources: {} };
  } catch {
    return { sources: {} };
  }
}

async function writeLock(root, lock) {
  const lockPath = getLockPath(root);
  await fsp.mkdir(path.dirname(lockPath), { recursive: true });
  await fsp.writeFile(lockPath, JSON.stringify({
    _comment: 'Pinned upstream commits for reproducible `source sync --frozen`. Update with `omc-manage source lock`.',
    ...lock,
  }, null, 2) + '\n', 'utf8');
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

// Fetch the source into tmpDir. With pinnedCommit, fetch that exact SHA for a
// reproducible (frozen) checkout; otherwise shallow-clone the ref tip.
function fetchSource(tmpDir, remote, ref, pinnedCommit) {
  const opts = { encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] };
  if (pinnedCommit) {
    // Defense-in-depth: a pinned commit comes from the lockfile JSON. Require a
    // bare hex SHA so a crafted value can't be read as a git option, and pass it
    // after `--` so it's unambiguously a ref, never a flag.
    if (!/^[0-9a-f]{7,40}$/i.test(pinnedCommit)) {
      return { status: 1, stderr: `Invalid pinned commit (not a hex SHA): ${JSON.stringify(pinnedCommit)}` };
    }
    fs.mkdirSync(tmpDir, { recursive: true });
    const steps = [
      ['init', '-q', tmpDir],
      ['-C', tmpDir, 'remote', 'add', 'origin', remote],
      ['-C', tmpDir, 'fetch', '--depth', '1', 'origin', '--', pinnedCommit],
      ['-C', tmpDir, 'checkout', '-q', 'FETCH_HEAD'],
    ];
    let last;
    for (const args of steps) {
      last = spawnSync('git', args, opts);
      if (last.status !== 0) return last;
    }
    return last;
  }
  return spawnSync('git', [
    'clone', '--depth', '1', '--branch', ref, '--single-branch', remote, tmpDir,
  ], opts);
}

async function syncRemoteSource(sourceName, sourceConfig, root, pinnedCommit = null) {
  const refLabel = pinnedCommit ? `${sourceConfig.ref} @ ${pinnedCommit.slice(0, 12)} (frozen)` : sourceConfig.ref;
  console.log(`  Syncing ${sourceName} from ${redactRemote(sourceConfig.remote)} (${refLabel})...`);

  const tmpDir = getSyncTempDir(sourceName, root);
  try {
    if (fs.existsSync(tmpDir)) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }

    const cloneResult = fetchSource(tmpDir, sourceConfig.remote, sourceConfig.ref, pinnedCommit);

    if (cloneResult.status !== 0) {
      console.error(`  Clone failed: ${cloneResult.stderr || cloneResult.error}`);
      return false;
    }

    // Resolve the exact upstream commit this sync pulled (provenance + lock).
    const headResult = spawnSync('git', ['-C', tmpDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    const commit = headResult.status === 0 ? headResult.stdout.trim() : null;

    // Copy each declared artifact type
    const artifacts = sourceConfig.artifacts || ['skills'];
    const mapping = sourceConfig.mapping || {};
    const provenance = {};

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
        provenance[artifactType] = hashTree(destPath);
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
    const syncedAt = new Date().toISOString();
    await fsp.writeFile(path.join(metadataDir, 'bundle.json'), JSON.stringify({
      syncedAt,
      sourceName,
      remote: redactRemote(sourceConfig.remote),
      ref: sourceConfig.ref,
      commit,
      kind: sourceConfig.kind || 'content-repo',
      harnesses: sourceConfig.harnesses || ['claude'],
      artifacts: sourceConfig.artifacts || [],
      manifests: manifestFiles,
      profiles: sourceConfig.profiles || [],
    }, null, 2) + '\n', 'utf8');

    // Provenance: per-file content hashes + the resolved commit, so `source drift`
    // can later distinguish local edits from upstream changes.
    await fsp.writeFile(path.join(metadataDir, 'provenance.json'), JSON.stringify({
      syncedAt,
      sourceName,
      remote: redactRemote(sourceConfig.remote),
      ref: sourceConfig.ref,
      commit,
      artifacts: provenance,
    }, null, 2) + '\n', 'utf8');

    if (commit) console.log(`    commit: ${commit.slice(0, 12)}`);

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
      const lock = flags.frozen ? readLock(root) : { sources: {} };
      if (flags.frozen) console.log('(frozen: syncing to locked commits)\n');
      let success = true;

      for (const [name, src] of Object.entries(config.sources)) {
        if (name === 'local') continue; // local is in-repo, no sync needed
        if (targetName && name !== targetName) continue;
        if (!src.remote) continue;

        let pinnedCommit = null;
        if (flags.frozen) {
          pinnedCommit = (lock.sources[name] || {}).commit || null;
          if (!pinnedCommit) console.log(`  ${name}: no lock entry, syncing ref tip`);
        }
        const ok = await syncRemoteSource(name, src, root, pinnedCommit);
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
        const bundlePath = path.join(getSourceMetadataDir(name, root), 'bundle.json');
        if (fs.existsSync(bundlePath)) {
          try {
            const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
            if (bundle.commit) console.log(`  commit: ${bundle.commit.slice(0, 12)}`);
          } catch { /* ignore unreadable bundle metadata */ }
        }
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

    case 'lock': {
      const root = getProjectRoot();
      const targetName = args[1];
      const lock = readLock(root);
      let locked = 0;
      const missing = [];

      for (const [name, src] of Object.entries(config.sources)) {
        if (targetName && name !== targetName) continue;
        if (!src.remote) continue;
        const bundlePath = path.join(getSourceMetadataDir(name, root), 'bundle.json');
        let commit = null;
        if (fs.existsSync(bundlePath)) {
          try { commit = JSON.parse(fs.readFileSync(bundlePath, 'utf8')).commit || null; } catch { /* ignore */ }
        }
        if (!commit) { missing.push(name); continue; }
        // Preserve lockedAt when the commit hasn't changed, to avoid timestamp
        // churn in the version-controlled lockfile.
        const prev = lock.sources[name];
        const lockedAt = (prev && prev.commit === commit && prev.lockedAt) ? prev.lockedAt : new Date().toISOString();
        lock.sources[name] = { commit, ref: src.ref || 'main', lockedAt };
        locked += 1;
      }

      if (targetName && !config.sources[targetName]) {
        const validNames = Object.keys(config.sources).join(', ');
        throw new Error(`Invalid source. Use: ${validNames}`);
      }

      await writeLock(root, { sources: lock.sources });
      console.log(`Locked ${locked} source(s) → ${path.relative(root, getLockPath(root))}`);
      for (const [name, entry] of Object.entries(lock.sources)) {
        if (!targetName || name === targetName) console.log(`  ${name}: ${entry.commit.slice(0, 12)} (${entry.ref})`);
      }
      if (missing.length > 0) {
        console.log(`  unlocked (no synced commit): ${missing.join(', ')} — run "omc-manage source sync" first`);
      }
      break;
    }

    case 'drift': {
      const root = getProjectRoot();
      const targetName = args[1];
      const report = {};
      let anyDrift = false;
      let anyChecked = false;

      for (const [name, src] of Object.entries(config.sources)) {
        if (targetName && name !== targetName) continue;
        if (name === 'local') continue; // in-repo, nothing to compare against
        const provPath = path.join(getSourceMetadataDir(name, root), 'provenance.json');
        if (!fs.existsSync(provPath)) {
          report[name] = { status: 'no-provenance' };
          continue;
        }
        let prov;
        try {
          prov = JSON.parse(fs.readFileSync(provPath, 'utf8'));
        } catch {
          report[name] = { status: 'corrupt-provenance' };
          anyDrift = true; // integrity problem — fail CI like drift
          continue;
        }
        anyChecked = true;
        const perType = {};
        let sourceDrift = false;
        for (const artifactType of Object.keys(prov.artifacts || {})) {
          const dir = getSourceArtifactDir(name, artifactType, root);
          const delta = diffHashTrees(prov.artifacts[artifactType], hashTree(dir));
          if (delta.added.length || delta.removed.length || delta.changed.length) {
            perType[artifactType] = delta;
            sourceDrift = true;
          }
        }
        report[name] = { status: sourceDrift ? 'drift' : 'clean', commit: prov.commit, syncedAt: prov.syncedAt, drift: perType };
        if (sourceDrift) anyDrift = true;
      }

      if (targetName && !(targetName in report)) {
        const validNames = Object.keys(config.sources).join(', ');
        throw new Error(`Invalid source. Use: ${validNames}`);
      }

      if (flags.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log('Drift Report');
        console.log('============');
        for (const [name, r] of Object.entries(report)) {
          if (r.status === 'no-provenance') {
            console.log(`○ ${name}: no provenance (run "omc-manage source sync ${name}")`);
            continue;
          }
          if (r.status === 'corrupt-provenance') {
            console.log(`✗ ${name}: corrupt provenance (re-sync to repair)`);
            continue;
          }
          const marker = r.status === 'drift' ? '✗' : '✓';
          console.log(`${marker} ${name}: ${r.status}${r.commit ? ` @ ${r.commit.slice(0, 12)}` : ''}`);
          for (const [type, delta] of Object.entries(r.drift || {})) {
            for (const f of delta.changed) console.log(`    ~ ${type}/${f}`);
            for (const f of delta.added) console.log(`    + ${type}/${f}`);
            for (const f of delta.removed) console.log(`    - ${type}/${f}`);
          }
        }
        if (!anyChecked) console.log('(no synced sources with provenance)');
      }

      if (anyDrift) process.exitCode = 1;
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
      throw new Error(`Unknown subcommand: ${cmd}. Use: list, add, remove, set, sync, lock, status, drift, or inspect`);
  }
}

module.exports = { source, copyDirRecursive };
