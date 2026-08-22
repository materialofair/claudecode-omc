const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CLAUDE_BIN = path.join(ROOT, 'packages', 'claudecode-omc', 'bin', 'omc-manage.js');
const OPENCODE_BIN = path.join(ROOT, 'packages', 'opencode-omc', 'bin', 'opencode-omc.js');
const { PACKAGES: RELEASE_ORDER } = require('../scripts/release-workspaces');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function run(bin, args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
  });
}

test('workspace manifests keep shared assets in core and global bins distinct', () => {
  const root = readJson('package.json');
  const core = readJson('packages/omc-core/package.json');
  const claude = readJson('packages/claudecode-omc/package.json');
  const opencode = readJson('packages/opencode-omc/package.json');

  assert.equal(root.private, true);
  assert.deepEqual(root.workspaces, ['packages/*']);
  assert.equal(core.name, '@ah-wq/omc-core');
  assert.deepEqual(claude.bin, { 'omc-manage': 'bin/omc-manage.js' });
  assert.deepEqual(opencode.bin, { 'opencode-omc': 'bin/opencode-omc.js' });
  assert.equal(claude.dependencies[core.name], core.version);
  assert.equal(opencode.dependencies[core.name], core.version);
  assert.equal(Object.hasOwn(opencode.bin, 'omc-manage'), false);
  assert.match(core.scripts.prepublishOnly, /assert-release-ready/);
  assert.match(claude.scripts.prepublishOnly, /--require-core/);
  assert.match(opencode.scripts.prepublishOnly, /--require-core/);
  assert.deepEqual(RELEASE_ORDER.map((entry) => entry.workspace), [
    '@ah-wq/omc-core', 'opencode-omc', 'claudecode-omc',
  ]);
});

test('facade help uses the package brand and command name', () => {
  const claude = run(CLAUDE_BIN, ['--help']);
  const opencode = run(OPENCODE_BIN, ['--help']);

  assert.equal(claude.status, 0, claude.stderr);
  assert.match(claude.stdout, /claudecode-omc — Claude Code harness manager/);
  assert.match(claude.stdout, /Usage: omc-manage <command>/);
  assert.equal(opencode.status, 0, opencode.stderr);
  assert.match(opencode.stdout, /opencode-omc — OpenCode harness manager/);
  assert.match(opencode.stdout, /Usage: opencode-omc <command>/);
});

test('facades apply their default harness and allow an explicit override', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-workspace-home-'));
  const claudeProject = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-claude-project-'));
  const opencodeProject = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-opencode-project-'));
  const overrideProject = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-override-project-'));
  const legacyOverrideProject = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-legacy-override-project-'));
  const args = ['setup', '--scope', 'project', '--type', 'settings'];

  const claude = run(CLAUDE_BIN, args, { cwd: claudeProject, env: { HOME: home } });
  assert.equal(claude.status, 0, `${claude.stdout}\n${claude.stderr}`);
  assert.equal(fs.existsSync(path.join(claudeProject, '.claude', 'settings.json')), true);

  const opencode = run(OPENCODE_BIN, args, { cwd: opencodeProject, env: { HOME: home } });
  assert.equal(opencode.status, 0, `${opencode.stdout}\n${opencode.stderr}`);
  assert.equal(fs.existsSync(path.join(opencodeProject, 'opencode.json')), true);
  assert.equal(fs.existsSync(path.join(opencodeProject, '.claude')), false);

  const override = run(OPENCODE_BIN, [...args, '--harness', 'claude'], {
    cwd: overrideProject,
    env: { HOME: home },
  });
  assert.equal(override.status, 0, `${override.stdout}\n${override.stderr}`);
  assert.equal(fs.existsSync(path.join(overrideProject, '.claude', 'settings.json')), true);

  const legacyOverride = run(CLAUDE_BIN, [...args, '--harness', 'opencode'], {
    cwd: legacyOverrideProject,
    env: { HOME: home },
  });
  assert.equal(legacyOverride.status, 0, `${legacyOverride.stdout}\n${legacyOverride.stderr}`);
  assert.equal(fs.existsSync(path.join(legacyOverrideProject, 'opencode.json')), true);
});

test('facades reject an unknown harness before dispatching a command', () => {
  for (const bin of [CLAUDE_BIN, OPENCODE_BIN]) {
    const result = run(bin, ['doctor', '--harness', 'opencdoe']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid harness/);
  }
});

test('doctor returns a failing status when the harness executable is unavailable', () => {
  const result = run(OPENCODE_BIN, ['doctor'], { env: { PATH: '' } });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /opencode CLI available/);
  assert.match(result.stdout, /opencode not found in PATH/);
});
