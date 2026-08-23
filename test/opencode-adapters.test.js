const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  adaptAgentMarkdown,
  adaptCommandMarkdown,
  adaptSkillMarkdown,
  adaptClaudeSettingsForOpencode,
} = require('../src/merge/opencode-adapters');

test('agent adapter maps Claude frontmatter to OpenCode (description/mode/permission)', () => {
  const input = [
    '---',
    'name: code-reviewer',
    'description: Expert review specialist',
    'model: opus',
    'level: 3',
    'disallowedTools: Write, Edit',
    '---',
    '',
    'Body content',
  ].join('\n');

  const out = adaptAgentMarkdown({ name: 'code-reviewer' }, input);

  assert.match(out, /^---\n/);
  assert.match(out, /description: Expert review specialist/);
  assert.match(out, /mode: subagent/);
  assert.match(out, /permission:\n  edit: deny/);
  assert.ok(!/name: code-reviewer/.test(out), 'Claude name key should be dropped');
  assert.ok(!/model: opus/.test(out), 'Claude model alias should be dropped');
  assert.match(out, /Body content/);
});

test('agent adapter preserves a tools allowlist as restrictive OpenCode permissions', () => {
  const input = [
    '---',
    'name: code-explorer',
    'description: Read-only explorer',
    'tools:',
    '  - Read',
    '  - Grep',
    '  - Glob',
    '---',
    'Explore the repository.',
  ].join('\r\n');

  const out = adaptAgentMarkdown({ name: 'code-explorer' }, input);

  assert.match(out, /permission:\n  "\*": deny/);
  assert.match(out, /  read: allow/);
  assert.match(out, /  grep: allow/);
  assert.match(out, /  glob: allow/);
  assert.ok(!/  edit: allow/.test(out));
  assert.ok(!/  bash: allow/.test(out));
});

test('agent adapter preserves scoped Bash allowlists without granting all shell commands', () => {
  const input = [
    '---',
    'name: git-reader',
    'description: Inspect git state',
    'tools: Read, Bash(git:*)',
    '---',
    'Inspect the repository.',
  ].join('\n');

  const out = adaptAgentMarkdown({ name: 'git-reader' }, input);

  assert.match(out, /  bash:\n    "\*": deny\n    "git \*": allow/);
  assert.ok(!/  bash: allow/.test(out));
});

test('skill adapter matches the OpenCode directory name and normalizes common invocations', () => {
  const input = [
    '---',
    'name: omc-plan',
    'description: Plan work',
    'argument-hint: "<task>"',
    '---',
    'Use Task(subagent_type="oh-my-claudecode:architect", model="opus").',
    'Then invoke Skill("oh-my-claudecode:verify").',
    'Read ~/.claude/skills/verify/SKILL.md.',
  ].join('\n');

  const out = adaptSkillMarkdown({ name: 'plan' }, input);

  assert.match(out, /^---\nname: plan\n/);
  assert.match(out, /task\(subagent_type="architect"\)/);
  assert.match(out, /skill\(name="verify"\)/);
  assert.match(out, /~\/\.config\/opencode\/skills\/verify/);
  assert.doesNotMatch(out, /^argument-hint:/m);
});

test('skill adapter preserves explicit-invocation policy in the OpenCode body', () => {
  const input = [
    '---',
    'name: prototype',
    'description: Build UI variants only when explicitly invoked.',
    'disable-model-invocation: true',
    '---',
    'Build isolated variants.',
  ].join('\n');

  const out = adaptSkillMarkdown({ name: 'prototype' }, input);

  assert.doesNotMatch(out, /^disable-model-invocation:/m);
  assert.match(out, /OMC explicit-invocation policy/);
  assert.match(out, /only when the user explicitly names `prototype`/);
});

test('command adapter keeps description and drops Claude-only keys', () => {
  const input = [
    '---',
    'description: Create a PR',
    'argument-hint: "[base]"',
    'allowed-tools: Bash(git:*), Read',
    'model: sonnet',
    '---',
    '',
    '# Prompt body',
    'Run $ARGUMENTS',
  ].join('\n');

  const out = adaptCommandMarkdown({ name: 'pr' }, input);

  assert.match(out, /description: Create a PR/);
  assert.ok(!/argument-hint/.test(out));
  assert.ok(!/allowed-tools/.test(out));
  assert.ok(!/model: sonnet/.test(out));
  assert.match(out, /Run \$ARGUMENTS/);
});

test('settings adapter maps mcpServers to opencode mcp (local type + command array)', () => {
  const out = adaptClaudeSettingsForOpencode({
    $schema: 'https://json.schemastore.org/claude-settings.json',
    mcpServers: {
      gitnexus: { command: 'npx', args: ['-y', 'gitnexus@latest', 'mcp'], env: { FOO: 'bar' } },
    },
    permissions: { deny: ['Bash(npm run build)'] },
  });

  assert.deepEqual(out, {
    mcp: {
      gitnexus: {
        type: 'local',
        command: ['npx', '-y', 'gitnexus@latest', 'mcp'],
        environment: { FOO: 'bar' },
      },
    },
  });
});

test('opencode setup (project scope) installs to .opencode and adapts artifacts', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-home-'));
  const project = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-project-'));

  const cliPath = path.resolve(__dirname, '..', 'bin', 'omc-manage.js');
  const result = spawnSync(
    process.execPath,
    [cliPath, 'setup', '--harness', 'opencode', '--scope', 'project', '--type', 'skills,agents,settings'],
    { cwd: project, env: { ...process.env, HOME: home }, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, `CLI failed\n${result.stdout}\n${result.stderr}`);

  // Agents land under .opencode/agents and get adapted frontmatter.
  const agentPath = path.join(project, '.opencode', 'agents', 'code-reviewer.md');
  assert.equal(fs.existsSync(agentPath), true);
  const agent = fs.readFileSync(agentPath, 'utf8');
  assert.match(agent, /mode: subagent/);
  assert.ok(!/name: code-reviewer/.test(agent));

  // Settings land in project opencode.json with the GLM provider + mapped MCP.
  const configPath = path.join(project, 'opencode.json');
  assert.equal(fs.existsSync(configPath), true);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.model, 'zhipuai/glm-5.2');
  assert.equal(config.$schema, 'https://opencode.ai/config.json');
  assert.equal(config.provider, undefined);
  assert.equal(config.mcp.gitnexus.type, 'local');

  const skillPath = path.join(project, '.opencode', 'skills', 'plan', 'SKILL.md');
  assert.equal(fs.existsSync(skillPath), true);
  assert.match(fs.readFileSync(skillPath, 'utf8'), /^---\nname: plan\n/);

  const skillIndexPath = path.join(project, '.opencode', 'skills', '_index.md');
  assert.equal(fs.existsSync(skillIndexPath), true, 'OpenCode setup should generate a skill index');
  assert.match(fs.readFileSync(skillIndexPath, 'utf8'), /`prompt-optimizer`/);

  for (const skillDir of fs.readdirSync(path.join(project, '.opencode', 'skills'))) {
    const installedSkill = path.join(project, '.opencode', 'skills', skillDir, 'SKILL.md');
    if (!fs.existsSync(installedSkill)) continue;
    const content = fs.readFileSync(installedSkill, 'utf8');
    const installedFrontmatter = content.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
    assert.doesNotMatch(content, /\b(?:Task|Agent|Skill)\(/, `${skillDir} has a Claude-only tool call`);
    assert.doesNotMatch(content, /oh-my-claudecode:/, `${skillDir} has a Claude-only namespace`);
    assert.doesNotMatch(
      installedFrontmatter,
      /^(?:argument-hint|disable-model-invocation|user-invocable|allowed-tools|model|level|pipeline|handoff(?:-policy)?)\s*:/m,
      `${skillDir} has Claude/OMC-only frontmatter`,
    );
  }

  // Nothing should have leaked into a Claude home dir.
  assert.equal(fs.existsSync(path.join(home, '.claude', 'agents', 'code-reviewer.md')), false);
});

test('opencode setup rejects an unknown harness instead of writing Claude paths', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'omc-project-'));
  const cliPath = path.resolve(__dirname, '..', 'bin', 'omc-manage.js');
  const result = spawnSync(
    process.execPath,
    [cliPath, 'setup', '--harness', 'opencdoe', '--scope', 'project', '--type', 'settings'],
    { cwd: project, encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid harness/);
  assert.equal(fs.existsSync(path.join(project, '.claude')), false);
});
