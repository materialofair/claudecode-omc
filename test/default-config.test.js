const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

async function makeTempDir(prefix) {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

// Read the effective config a fresh install would see (no ~/.omc-manage/sources.json),
// by running in a throwaway HOME so os.homedir() resolves there.
function readDefaultConfig(home) {
  const script = "process.stdout.write(JSON.stringify(require(process.argv[1]).readConfig()))";
  const modulePath = path.join(repoRoot, 'src', 'config', 'sources.js');
  const result = spawnSync(process.execPath, ['-e', script, modulePath], {
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `readConfig failed:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

// A fresh install must ship the curated ECC subset by default, and that allowlist
// must come from .omc-curation/ecc-selection.json — not a hardcoded duplicate that
// could silently drift from the curation source of truth.
test('default config exposes ECC with its allowlist sourced from the curation file', async () => {
  const home = await makeTempDir('omc-home-');
  try {
    const config = readDefaultConfig(home);
    const ecc = config.sources.ecc;
    assert.ok(ecc, 'ecc source should be present in the default config');
    assert.equal(ecc.kind, 'distribution-repo');

    const selection = JSON.parse(
      fs.readFileSync(path.join(repoRoot, '.omc-curation', 'ecc-selection.json'), 'utf8'),
    );
    for (const type of ['skills', 'agents', 'commands']) {
      assert.deepEqual(
        [...ecc.allowlist[type]].sort(),
        [...selection[type]].sort(),
        `default ECC ${type} allowlist must equal the curation file`,
      );
    }
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
});
