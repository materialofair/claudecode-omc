const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'omc-manage.js');
const upstreamCommit = 'f4c9452f5ca091f1be7064d9faab1b001ea21645';

test('local eli5 skill preserves the upstream contract and Apache attribution', () => {
  const skill = fs.readFileSync(
    path.join(repoRoot, '.local', 'skills', 'eli5', 'SKILL.md'),
    'utf8',
  );
  const attribution = fs.readFileSync(
    path.join(repoRoot, '.local', 'skills', 'THIRD_PARTY_LICENSES', 'README.md'),
    'utf8',
  );
  const license = fs.readFileSync(
    path.join(
      repoRoot,
      '.local',
      'skills',
      'THIRD_PARTY_LICENSES',
      'Anthropic-claude-plugins-community.LICENSE',
    ),
    'utf8',
  );

  assert.match(skill, /^---\nname: eli5\ndescription: /);
  assert.match(skill, /dead-simple picture explainer/);
  assert.match(skill, /HTML artifact with big pictures and few words/);
  assert.match(skill, /Topic: \$ARGUMENTS/);
  assert.match(attribution, new RegExp(`claude-plugins-community.*${upstreamCommit}`));
  assert.match(attribution, /Anthropic-claude-plugins-community\.LICENSE/);
  assert.match(license, /^\s+Apache License\n\s+Version 2\.0, January 2004/);
});

test('Claude and OpenCode setup install the local eli5 skill', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-eli5-home-'));
  const projects = [];
  try {
    for (const harness of ['claude', 'opencode']) {
      const project = await fsp.mkdtemp(path.join(os.tmpdir(), `omc-eli5-${harness}-`));
      projects.push(project);
      const result = spawnSync(process.execPath, [
        cliPath,
        'setup',
        '--harness', harness,
        '--scope', 'project',
        '--type', 'skills',
      ], { cwd: project, env: { ...process.env, HOME: home }, encoding: 'utf8' });
      assert.equal(result.status, 0, `${harness} setup failed\n${result.stdout}\n${result.stderr}`);

      const skillsRoot = harness === 'claude'
        ? path.join(project, '.claude', 'skills')
        : path.join(project, '.opencode', 'skills');
      const installed = fs.readFileSync(path.join(skillsRoot, 'eli5', 'SKILL.md'), 'utf8');
      assert.match(installed, /^---\nname: eli5\n/);
      assert.match(installed, /Topic: \$ARGUMENTS/);
      assert.match(fs.readFileSync(path.join(skillsRoot, '_index.md'), 'utf8'), /`eli5`/);
    }
  } finally {
    await Promise.all([
      fsp.rm(home, { recursive: true, force: true }),
      ...projects.map((project) => fsp.rm(project, { recursive: true, force: true })),
    ]);
  }
});
