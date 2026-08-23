const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const sourcesModule = path.join(repoRoot, 'src', 'config', 'sources.js');
const cliPath = path.join(repoRoot, 'bin', 'omc-manage.js');
const hasBundledEmil = fs.existsSync(path.join(
  repoRoot, 'bundled', 'upstream', 'emilkowalski', 'skills', 'animate', 'SKILL.md',
));
const requireDistribution = process.env.OMC_REQUIRE_DISTRIBUTION_TEST === '1';
const expectedSkills = [
  'animate',
  'animate-expo',
  'animation-vocabulary',
  'apple-design',
  'ask-sonner',
  'find-animation-opportunities',
  'improve-animations',
  'pick-ui-library',
  'prototype',
  'review-animations',
];

function readDefaultConfig(home) {
  const result = spawnSync(process.execPath, [
    '-e',
    'process.stdout.write(JSON.stringify(require(process.argv[1]).readConfig()))',
    sourcesModule,
  ], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('emilkowalski is a pinned curated default source', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-emil-home-'));
  try {
    const config = readDefaultConfig(home);
    const source = config.sources.emilkowalski;
    const governance = JSON.parse(fs.readFileSync(
      path.join(repoRoot, '.omc-curation', 'governance.json'), 'utf8',
    ));
    const selection = JSON.parse(fs.readFileSync(
      path.join(repoRoot, '.omc-curation', 'emilkowalski-selection.json'), 'utf8',
    ));
    const lock = JSON.parse(fs.readFileSync(
      path.join(repoRoot, '.omc-curation', 'sources.lock.json'), 'utf8',
    ));

    assert.equal(source.remote, 'https://github.com/emilkowalski/skills.git');
    assert.equal(source.priority, 6);
    assert.deepEqual(source.artifacts, ['skills']);
    assert.deepEqual(source.harnesses, ['claude', 'opencode']);
    assert.deepEqual(source.manifests, ['LICENSE', 'README.md']);
    assert.deepEqual([...source.allowlist.skills].sort(), [...expectedSkills].sort());
    assert.deepEqual(
      [...governance.sources.emilkowalski.allowlist.skills].sort(),
      [...selection.skills].sort(),
    );
    assert.deepEqual([...selection.skills].sort(), [...expectedSkills].sort());
    assert.equal(selection.skills.includes('emil-design-eng'), false);
    assert.equal(selection.skills.includes('write-swift'), false);
    assert.equal(governance.conflict.preferences['prompt-optimizer'], 'local');
    assert.match(lock.sources.emilkowalski.commit, /^[0-9a-f]{40}$/);
    const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
    assert.match(readme, /source sync emilkowalski --frozen/);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
});

test('bundled Emil source preserves license and the curated skill catalog', {
  skip: !hasBundledEmil && !requireDistribution
    ? 'run source sync --frozen and bundle before distribution tests'
    : false,
}, () => {
  assert.equal(hasBundledEmil, true, 'bundled Emil snapshot is required for release validation');
  const sourceRoot = path.join(repoRoot, 'bundled', 'upstream', 'emilkowalski');
  const skillsRoot = path.join(sourceRoot, 'skills');
  const license = path.join(sourceRoot, '.omc-source', 'manifests', 'LICENSE');

  assert.equal(fs.existsSync(license), true, 'upstream MIT license must ship in the bundle');
  for (const skill of expectedSkills) {
    assert.equal(
      fs.existsSync(path.join(skillsRoot, skill, 'SKILL.md')),
      true,
      `${skill} must be bundled`,
    );
  }
});

test('prompt optimization skills recommend a stack-aware UI and motion chain', () => {
  const optimizer = fs.readFileSync(
    path.join(repoRoot, '.local', 'skills', 'prompt-optimizer', 'SKILL.md'), 'utf8',
  );
  const pilot = fs.readFileSync(
    path.join(repoRoot, '.local', 'skills', 'prompt-pilot', 'SKILL.md'), 'utf8',
  );
  const uiRouting = fs.readFileSync(
    path.join(
      repoRoot,
      '.local',
      'skills',
      'prompt-optimizer',
      'references',
      'ui-interaction-routing.md',
    ),
    'utf8',
  );

  assert.match(optimizer, /UI Interaction Optimization/);
  assert.match(optimizer, /references\/ui-interaction-routing\.md/);
  assert.match(
    optimizer,
    /\| \*\*UI Interaction Optimization\*\* \| — \| Select 3–5 skills from `references\/ui-interaction-routing\.md`/,
  );
  assert.match(uiRouting, /impeccable[\s\S]*prototype[\s\S]*find-animation-opportunities/);
  assert.match(uiRouting, /find-animation-opportunities[\s\S]*animate[\s\S]*review-animations/);
  assert.match(uiRouting, /review-animations[\s\S]*visual-verdict/);
  assert.match(uiRouting, /React Native \/ Expo[\s\S]*animate-expo/);
  assert.match(uiRouting, /React Native \/ Expo[\s\S]*Do not append `review-animations`/);
  assert.match(uiRouting, /SwiftUI[\s\S]*swiftui-ui-patterns/);
  assert.match(uiRouting, /Do not recommend `emil-design-eng` or `write-swift`/);
  assert.match(optimizer, /\.claude\/skills\/_index\.md/);
  assert.match(optimizer, /\.opencode\/skills\/_index\.md/);
  assert.match(optimizer, /OpenCode:[\s\S]*\.opencode[\s\S]*~\/\.config\/opencode/);
  assert.match(optimizer, /Claude Code:[\s\S]*\.claude[\s\S]*~\/\.claude/);
  assert.match(optimizer, /harness is unknown[\s\S]*intersection/);

  assert.match(pilot, /UI\/interaction\/motion/);
  assert.match(pilot, /impeccable/);
  assert.match(pilot, /find-animation-opportunities/);
  assert.match(pilot, /review-animations/);
  assert.match(pilot, /visual-verdict/);
});

test('prompt-optimizer preference keeps the local skill ahead of a newer upstream version', () => {
  const { resolveConflicts } = require('../src/merge/base-merger');
  const governance = JSON.parse(fs.readFileSync(
    path.join(repoRoot, '.omc-curation', 'governance.json'), 'utf8',
  ));
  const [resolution] = resolveConflicts([{
    type: 'exact_name',
    name: 'prompt-optimizer',
    versions: [
      { name: 'prompt-optimizer', sourceName: 'local', metadata: { version: '1.0.0' } },
      { name: 'prompt-optimizer', sourceName: 'ecc', metadata: { version: '99.0.0' } },
    ],
  }], governance.conflict);

  assert.equal(resolution.resolution, 'user-preference');
  assert.equal(resolution.winner.sourceName, 'local');
});

test('Claude and OpenCode setup install only the curated Emil skills', {
  skip: !hasBundledEmil && !requireDistribution
    ? 'run source sync --frozen and bundle before distribution tests'
    : false,
}, async () => {
  assert.equal(hasBundledEmil, true, 'bundled Emil snapshot is required for release validation');
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-emil-install-home-'));
  const claudeProject = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-emil-claude-'));
  const opencodeProject = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-emil-opencode-'));
  try {
    for (const [harness, project, relativeSkillsDir] of [
      ['claude', claudeProject, path.join('.claude', 'skills')],
      ['opencode', opencodeProject, path.join('.opencode', 'skills')],
    ]) {
      const result = spawnSync(process.execPath, [
        cliPath,
        'setup',
        '--harness', harness,
        '--scope', 'project',
        '--type', 'skills',
      ], { cwd: project, env: { ...process.env, HOME: home }, encoding: 'utf8' });
      assert.equal(result.status, 0, `${harness} setup failed\n${result.stdout}\n${result.stderr}`);

      const skillsDir = path.join(project, relativeSkillsDir);
      for (const skill of expectedSkills) {
        assert.equal(fs.existsSync(path.join(skillsDir, skill, 'SKILL.md')), true, `${harness}: ${skill}`);
      }
      assert.equal(fs.existsSync(path.join(skillsDir, 'emil-design-eng')), false);
      assert.equal(fs.existsSync(path.join(skillsDir, 'write-swift')), false);

      const index = fs.readFileSync(path.join(skillsDir, '_index.md'), 'utf8');
      assert.match(index, /`animate`/);
      assert.match(index, /`prototype`/);
      assert.match(index, /`review-animations`/);
    }

    const opencodePrototype = fs.readFileSync(
      path.join(opencodeProject, '.opencode', 'skills', 'prototype', 'SKILL.md'), 'utf8',
    );
    assert.doesNotMatch(opencodePrototype, /^disable-model-invocation:/m);
    assert.match(opencodePrototype, /^---\nname: prototype\n/m);
    assert.match(opencodePrototype, /OMC explicit-invocation policy/);
  } finally {
    await Promise.all([
      fsp.rm(home, { recursive: true, force: true }),
      fsp.rm(claudeProject, { recursive: true, force: true }),
      fsp.rm(opencodeProject, { recursive: true, force: true }),
    ]);
  }
});

test('release source sync uses an isolated default config instead of maintainer HOME', () => {
  const { createIsolatedSourceEnvironment } = require('../scripts/release-workspaces');
  const isolated = createIsolatedSourceEnvironment({
    ...process.env,
    HOME: '/maintainer/home-with-old-config',
    USERPROFILE: 'C:\\maintainer-old-config',
  });
  try {
    assert.notEqual(isolated.env.HOME, '/maintainer/home-with-old-config');
    assert.equal(isolated.env.HOME, isolated.env.USERPROFILE);
    assert.equal(fs.existsSync(isolated.env.HOME), true);
    assert.equal(fs.readdirSync(isolated.env.HOME).length, 0);
  } finally {
    isolated.cleanup();
  }
  assert.equal(fs.existsSync(isolated.env.HOME), false);
});
