const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'omc-manage.js');

async function makeTempDir(prefix) {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    encoding: 'utf8',
  });
  if (!options.allowFailure) {
    assert.equal(result.status, 0, `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function runCli(args, options = {}) {
  return run(process.execPath, [cliPath, ...args], {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, HOME: options.home },
    allowFailure: options.allowFailure,
  });
}

async function writeFile(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, 'utf8');
}

// `source sync` must record per-file content hashes + the resolved upstream
// commit, and `source drift` must detect later divergence (a governed source,
// not a blind copy).
test('source sync records provenance and source drift detects local edits', async () => {
  const home = await makeTempDir('omc-home-');
  const remote = await makeTempDir('omc-remote-');
  const sourceName = `prov-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const syncedRoot = path.join(repoRoot, '.upstream', sourceName);

  try {
    run('git', ['init', '-b', 'main'], { cwd: remote });
    await writeFile(path.join(remote, 'agents', 'alpha.md'), '# Alpha\n');
    await writeFile(path.join(remote, 'agents', 'beta.md'), '# Beta\n');
    run('git', ['add', '.'], { cwd: remote });
    run('git', ['-c', 'user.name=T', '-c', 'user.email=t@e.co', 'commit', '-m', 'init'], { cwd: remote });
    const head = run('git', ['rev-parse', 'HEAD'], { cwd: remote }).stdout.trim();

    runCli(['source', 'add', sourceName, remote, '--artifacts', 'agents'], { home });
    runCli(['source', 'sync', sourceName], { home });

    // Provenance recorded with the resolved commit + a hash per file.
    const prov = JSON.parse(fs.readFileSync(path.join(syncedRoot, '.omc-source', 'provenance.json'), 'utf8'));
    assert.equal(prov.commit, head);
    assert.ok(prov.artifacts.agents['alpha.md'].startsWith('sha256:'));
    assert.ok(prov.artifacts.agents['beta.md']);

    // Clean immediately after sync → exit 0.
    const clean = runCli(['source', 'drift', sourceName, '--json'], { home, allowFailure: true });
    assert.equal(clean.status, 0);
    assert.equal(JSON.parse(clean.stdout)[sourceName].status, 'clean');

    // Edit a synced artifact → drift detected, non-zero exit.
    await writeFile(path.join(syncedRoot, 'agents', 'alpha.md'), '# Alpha EDITED\n');
    const drifted = runCli(['source', 'drift', sourceName, '--json'], { home, allowFailure: true });
    assert.equal(drifted.status, 1);
    const r = JSON.parse(drifted.stdout)[sourceName];
    assert.equal(r.status, 'drift');
    assert.deepEqual(r.drift.agents.changed, ['alpha.md']);
  } finally {
    await fsp.rm(syncedRoot, { recursive: true, force: true });
    await fsp.rm(path.join(repoRoot, `.tmp-sync-${sourceName}`), { recursive: true, force: true });
  }
});
