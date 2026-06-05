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

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
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

// Regression: `plan apply` with a selection file must validate selections
// against the full available artifact universe — not the source's current
// allowlist. Otherwise widening a curated allowlist is impossible because the
// catalog pre-filters itemNames to already-allowed names (chicken-and-egg).
test('plan apply grows a restrictive allowlist from a selection file', async () => {
  const home = await makeTempDir('omc-home-');
  const remote = await makeTempDir('omc-remote-');
  const selDir = await makeTempDir('omc-sel-');
  const sourceName = `curate-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const syncedRoot = path.join(repoRoot, '.upstream', sourceName);

  try {
    run('git', ['init', '-b', 'main'], { cwd: remote });
    await writeFile(path.join(remote, 'agents', 'alpha.md'), '# Alpha agent\n');
    await writeFile(path.join(remote, 'agents', 'beta.md'), '# Beta agent\n');
    run('git', ['add', '.'], { cwd: remote });
    run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], { cwd: remote });

    runCli(['source', 'add', sourceName, remote, '--artifacts', 'agents'], { home });
    runCli(['source', 'sync', sourceName], { home });

    // Establish a restrictive allowlist (alpha only).
    const selAlpha = path.join(selDir, 'alpha.json');
    await writeFile(selAlpha, JSON.stringify({ agents: ['alpha'] }));
    runCli(['plan', 'apply', sourceName, '--selection-file', selAlpha], { home });

    // Widen to alpha + beta. Under the chicken-and-egg bug this CLI call exits
    // non-zero ("Unknown agents selections: beta") and runCli's status assert
    // fails the test. The fix loads the full universe, so beta validates.
    const selBoth = path.join(selDir, 'both.json');
    await writeFile(selBoth, JSON.stringify({ agents: ['alpha', 'beta'] }));
    const widened = runCli(
      ['plan', 'apply', sourceName, '--selection-file', selBoth, '--json'],
      { home },
    );

    const { activation } = JSON.parse(widened.stdout);
    assert.deepEqual(activation.allowlist.agents, ['alpha', 'beta']);
  } finally {
    await fsp.rm(syncedRoot, { recursive: true, force: true });
    await fsp.rm(path.join(repoRoot, `.tmp-sync-${sourceName}`), { recursive: true, force: true });
  }
});
