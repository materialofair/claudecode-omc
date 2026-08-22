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
    [cliPath, 'setup', '--harness', 'opencode', '--scope', 'project', '--type', 'agents,settings'],
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
  assert.equal(config.model, 'zhipu/glm-5.2');
  assert.ok(config.provider.zhipu.models['glm-5.2']);
  assert.ok(config.provider.zhipu.models['glm-5.3']);
  assert.equal(config.mcp.gitnexus.type, 'local');

  // Nothing should have leaked into a Claude home dir.
  assert.equal(fs.existsSync(path.join(home, '.claude', 'agents', 'code-reviewer.md')), false);
});
