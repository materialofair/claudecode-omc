const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const modulePath = path.join(repoRoot, 'src', 'config', 'sources.js');

async function makeTempDir(prefix) {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

function readDefaultConfig(home) {
  const r = spawnSync(process.execPath, [
    '-e', "process.stdout.write(JSON.stringify(require(process.argv[1]).readConfig()))", modulePath,
  ], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

// governance.json is the single authoritative manifest: per-source priority and
// allowlist flow from it into the effective config.
test('governance.json drives priority and allowlist for the default config', async () => {
  const home = await makeTempDir('omc-home-');
  try {
    const gov = JSON.parse(fs.readFileSync(path.join(repoRoot, '.omc-curation', 'governance.json'), 'utf8'));
    const config = readDefaultConfig(home);

    for (const [name, govSource] of Object.entries(gov.sources)) {
      assert.ok(config.sources[name], `${name} should exist in config`);
      assert.equal(config.sources[name].priority, govSource.priority, `${name} priority from governance`);
      if (govSource.allowlist) {
        for (const type of Object.keys(govSource.allowlist)) {
          assert.deepEqual(
            [...config.sources[name].allowlist[type]].sort(),
            [...govSource.allowlist[type]].sort(),
            `${name} ${type} allowlist from governance`,
          );
        }
      }
    }

    // Conflict policy block is present for setup to consume.
    assert.ok(gov.conflict && typeof gov.conflict === 'object');
    assert.ok(Array.isArray(gov.conflict.exclude.skills));
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
});

// governance.json inlines ECC's allowlist and takes precedence over
// ecc-selection.json, so the two must not silently drift.
test('governance ECC allowlist stays in sync with ecc-selection.json', () => {
  const dir = path.join(repoRoot, '.omc-curation');
  const gov = JSON.parse(fs.readFileSync(path.join(dir, 'governance.json'), 'utf8'));
  const sel = JSON.parse(fs.readFileSync(path.join(dir, 'ecc-selection.json'), 'utf8'));
  for (const type of ['skills', 'agents', 'commands']) {
    assert.deepEqual(
      [...gov.sources.ecc.allowlist[type]].sort(),
      [...sel[type]].sort(),
      `governance.ecc.allowlist.${type} must equal ecc-selection.json`,
    );
  }
});

// An explicit allowlist in the user's config (e.g. written by `plan apply`)
// must override governance's inline allowlist.
test('explicit config allowlist overrides governance', async () => {
  const home = await makeTempDir('omc-home-');
  const omcDir = path.join(home, '.omc-manage');
  try {
    await fsp.mkdir(omcDir, { recursive: true });
    // Minimal config that pins ecc to a one-item allowlist.
    await fsp.writeFile(path.join(omcDir, 'sources.json'), JSON.stringify({
      active: 'local',
      sources: {
        ecc: {
          remote: 'https://example.invalid/ecc.git', ref: 'main', priority: 4,
          artifacts: ['agents'], kind: 'distribution-repo',
          allowlist: { agents: ['only-this-one'] },
        },
      },
    }), 'utf8');

    const config = readDefaultConfig(home);
    assert.deepEqual(config.sources.ecc.allowlist.agents, ['only-this-one']);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
});
