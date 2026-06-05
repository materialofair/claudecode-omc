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
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result;
}

function runCli(args, options = {}) {
  return run(process.execPath, [cliPath, ...args], {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, HOME: options.home },
  });
}

async function writeFile(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, 'utf8');
}

function commitAll(remote, message) {
  run('git', ['add', '-A'], { cwd: remote });
  run('git', ['-c', 'user.name=T', '-c', 'user.email=t@e.co', 'commit', '-m', message], { cwd: remote });
  return run('git', ['rev-parse', 'HEAD'], { cwd: remote }).stdout.trim();
}

// `source lock` pins the current commit; `source sync --frozen` then reproduces
// that exact commit even after the remote advances.
test('source lock + sync --frozen pins a source to the locked commit', async () => {
  const home = await makeTempDir('omc-home-');
  const remote = await makeTempDir('omc-remote-');
  const sourceName = `lock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const syncedRoot = path.join(repoRoot, '.upstream', sourceName);
  const lockPath = path.join(repoRoot, '.omc-curation', 'sources.lock.json');
  const lockExisted = fs.existsSync(lockPath);
  const lockBefore = lockExisted ? fs.readFileSync(lockPath, 'utf8') : null;
  const agentFile = path.join(syncedRoot, 'agents', 'alpha.md');

  try {
    run('git', ['init', '-b', 'main'], { cwd: remote });
    run('git', ['config', 'uploadpack.allowAnySHA1InWant', 'true'], { cwd: remote });
    await writeFile(path.join(remote, 'agents', 'alpha.md'), '# version A\n');
    const commitA = commitAll(remote, 'A');

    runCli(['source', 'add', sourceName, remote, '--artifacts', 'agents'], { home });
    runCli(['source', 'sync', sourceName], { home });
    assert.equal(fs.readFileSync(agentFile, 'utf8'), '# version A\n');

    runCli(['source', 'lock', sourceName], { home });
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(lock.sources[sourceName].commit, commitA);

    // Advance the remote.
    await writeFile(path.join(remote, 'agents', 'alpha.md'), '# version B\n');
    commitAll(remote, 'B');

    // Plain sync follows the tip (version B).
    runCli(['source', 'sync', sourceName], { home });
    assert.equal(fs.readFileSync(agentFile, 'utf8'), '# version B\n');

    // Frozen sync reproduces the locked commit (version A).
    runCli(['source', 'sync', sourceName, '--frozen'], { home });
    assert.equal(fs.readFileSync(agentFile, 'utf8'), '# version A\n');
  } finally {
    await fsp.rm(syncedRoot, { recursive: true, force: true });
    await fsp.rm(path.join(repoRoot, `.tmp-sync-${sourceName}`), { recursive: true, force: true });
    // Restore the repo's real lockfile (the test source must not leak into it).
    if (lockExisted) await fsp.writeFile(lockPath, lockBefore, 'utf8');
    else await fsp.rm(lockPath, { force: true });
  }
});
