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
    env: {
      ...process.env,
      HOME: options.home,
    },
  });
}

async function writeFile(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, 'utf8');
}

test('source sync removes stale artifact directories when the remote path disappears', async () => {
  const home = await makeTempDir('omc-home-');
  const remote = await makeTempDir('omc-remote-');
  const sourceName = `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const syncedRoot = path.join(repoRoot, '.upstream', sourceName);

  try {
    run('git', ['init', '-b', 'main'], { cwd: remote });
    await writeFile(path.join(remote, 'skills', 'demo', 'SKILL.md'), [
      '---',
      'name: demo',
      'description: Use when testing sync behavior',
      '---',
      '',
      '# Demo',
      '',
    ].join('\n'));
    await writeFile(path.join(remote, 'agents', 'demo-agent.md'), '# Demo agent\n');
    run('git', ['add', '.'], { cwd: remote });
    run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial'], { cwd: remote });

    runCli(['source', 'add', sourceName, remote, '--artifacts', 'skills,agents'], { home });
    runCli(['source', 'sync', sourceName], { home });

    const syncedAgents = path.join(syncedRoot, 'agents');
    assert.equal(fs.existsSync(syncedAgents), true);

    await fsp.rm(path.join(remote, 'agents'), { recursive: true, force: true });
    run('git', ['add', '-A'], { cwd: remote });
    run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'remove agents'], { cwd: remote });

    runCli(['source', 'sync', sourceName], { home });

    assert.equal(fs.existsSync(syncedAgents), false);
  } finally {
    await fsp.rm(syncedRoot, { recursive: true, force: true });
    await fsp.rm(path.join(repoRoot, `.tmp-sync-${sourceName}`), { recursive: true, force: true });
  }
});
