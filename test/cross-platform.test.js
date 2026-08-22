const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { parseAgentMetadata } = require('../src/merge/agent-merger');
const { parseSkillMetadata, loadSkillsFromSource } = require('../src/merge/skill-merger');
const { parseFrontmatter: parseIndexFrontmatter } = require('../src/cli/skill-index');
const { evaluateSkillQuality } = require('../src/utils/quality');
const { commandAvailable, getHarnessCommand } = require('../src/cli/doctor');
const { resolveSkillsDir } = require('../src/cli/skill-index');
const { bundleUpstream } = require('../scripts/bundle-upstream');

test('skill, agent, index, and quality parsers accept CRLF frontmatter', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-crlf-'));
  const skillDir = path.join(root, 'skills', 'demo');
  const skillFile = path.join(skillDir, 'SKILL.md');
  const agentFile = path.join(root, 'agent.md');
  const skill = [
    '---',
    'name: demo',
    'description: Use when testing Windows frontmatter parsing',
    '---',
    '# Demo',
    'Always run the example. Verify errors and use a fallback when it fails.',
  ].join('\r\n');

  await fsp.mkdir(skillDir, { recursive: true });
  await fsp.writeFile(skillFile, skill, 'utf8');
  await fsp.writeFile(agentFile, '---\r\nname: reviewer\r\ndescription: Review code\r\n---\r\nBody\r\n', 'utf8');

  assert.equal(parseSkillMetadata(skillDir).name, 'demo');
  assert.equal(loadSkillsFromSource(path.join(root, 'skills'), 'fixture').length, 1);
  assert.equal(parseAgentMetadata(agentFile).name, 'reviewer');
  assert.equal(parseIndexFrontmatter(skillFile).name, 'demo');
  assert.notEqual(evaluateSkillQuality({ name: 'demo', path: skillDir, metadata: {} }).dimensions.metadata, 0);
});

test('doctor uses where.exe on Windows and which elsewhere', () => {
  const calls = [];
  const spawn = (command, args) => {
    calls.push([command, args]);
    return { status: 0 };
  };

  assert.equal(commandAvailable('claude', { platform: 'win32', spawn }), true);
  assert.equal(commandAvailable('claude', { platform: 'linux', spawn }), true);
  assert.deepEqual(calls, [
    ['where.exe', ['claude']],
    ['which', ['claude']],
  ]);
});

test('doctor selects the executable for the effective harness', () => {
  assert.equal(getHarnessCommand('claude'), 'claude');
  assert.equal(getHarnessCommand('opencode'), 'opencode');
  assert.throws(() => getHarnessCommand('opencdoe'), /Invalid harness/);
});

test('skill index resolves harness-specific user and project directories', () => {
  const project = path.join(os.tmpdir(), 'omc-index-project');

  assert.equal(resolveSkillsDir('project', 'claude', project), path.join(project, '.claude', 'skills'));
  assert.equal(resolveSkillsDir('project', 'opencode', project), path.join(project, '.opencode', 'skills'));
  assert.equal(resolveSkillsDir('user', 'opencode', project), path.join(os.homedir(), '.config', 'opencode', 'skills'));
});

test('Node bundler copies sources and writes a manifest without shell tools', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-bundle-'));
  const upstreamDir = path.join(root, '.upstream');
  const bundledRoot = path.join(root, 'bundled');
  await fsp.mkdir(path.join(upstreamDir, 'demo', 'skills'), { recursive: true });
  await fsp.writeFile(path.join(upstreamDir, 'demo', 'skills', 'one.md'), 'one\n', 'utf8');

  const manifest = await bundleUpstream({ root, upstreamDir, bundledRoot });

  assert.deepEqual(manifest.sources, { demo: { artifacts: 1 } });
  assert.equal(fs.existsSync(path.join(bundledRoot, 'upstream', 'demo', 'skills', 'one.md')), true);
  assert.deepEqual(
    JSON.parse(await fsp.readFile(path.join(bundledRoot, 'manifest.json'), 'utf8')).sources,
    manifest.sources,
  );
});
