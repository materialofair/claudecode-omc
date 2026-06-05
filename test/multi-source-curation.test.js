const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'omc-manage.js');
const modulePath = path.join(repoRoot, 'src', 'config', 'sources.js');

async function makeTempDir(prefix) {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

function runCli(args, home) {
  const r = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot, env: { ...process.env, HOME: home }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, `${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r;
}

function readConfig(home) {
  const r = spawnSync(process.execPath, [
    '-e', "process.stdout.write(JSON.stringify(require(process.argv[1]).readConfig()))", modulePath,
  ], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

// Curation is not ECC-specific: dropping .omc-curation/<name>-selection.json for
// ANY source governs that source's allowlist through the same generic path.
test('any source is governed by its own .omc-curation/<name>-selection.json', async () => {
  const home = await makeTempDir('omc-home-');
  const sourceName = `zz-curation-test-${Math.random().toString(16).slice(2)}`;
  const selectionPath = path.join(repoRoot, '.omc-curation', `${sourceName}-selection.json`);

  try {
    // No curation file yet → source has no allowlist (installs everything).
    runCli(['source', 'add', sourceName, 'https://example.invalid/x.git', '--artifacts', 'skills'], home);
    assert.equal(readConfig(home).sources[sourceName].allowlist, undefined);

    // Drop a curation file for this source → allowlist now governed by it.
    await fsp.writeFile(selectionPath, JSON.stringify({ skills: ['keep-a', 'keep-b'] }), 'utf8');
    const governed = readConfig(home).sources[sourceName];
    assert.deepEqual([...governed.allowlist.skills].sort(), ['keep-a', 'keep-b']);
  } finally {
    await fsp.rm(selectionPath, { force: true });
    await fsp.rm(home, { recursive: true, force: true });
  }
});
