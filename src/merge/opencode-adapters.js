'use strict';

// Adapters that translate Claude Code artifact formats into OpenCode's native
// conventions at install time. OpenCode reads most of the same markdown shapes
// (SKILL.md, command/agent markdown), but its frontmatter keys and a few config
// keys differ from Claude Code. These adapters are applied only when the
// target harness is "opencode" — Claude installs are untouched.

function splitFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!m) return { frontmatter: null, body: content };
  return { frontmatter: m[1].replace(/\r/g, ''), body: content.slice(m[0].length) };
}

// Serialize a scalar for a bare `key: value` YAML line, quoting only values
// that would otherwise break as a plain scalar (mirrors content-patch.js).
function serializeScalar(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const s = String(value);
  if (s === '' || s.trim() !== s || /[:#"'\n[\]{}&*!|>%@`]/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function parseScalarFrontmatter(content) {
  const { frontmatter, body } = splitFrontmatter(content);
  const map = {};
  if (frontmatter != null) {
    let listKey = null;
    for (const rawLine of frontmatter.split('\n')) {
      const listItem = rawLine.match(/^\s+-\s+(.+)$/);
      if (listItem && listKey) {
        map[listKey].push(listItem[1].trim().replace(/^['"]|['"]$/g, ''));
        continue;
      }
      if (/^\s/.test(rawLine)) continue;
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (value === '') {
        map[key] = [];
        listKey = key;
      } else {
        map[key] = value;
        listKey = null;
      }
    }
  }
  return { hasFrontmatter: frontmatter != null, map, body };
}

// Claude Code agent tool names -> OpenCode permission keys.
const TOOL_PERMISSION_MAP = {
  write: 'edit',
  edit: 'edit',
  bash: 'bash',
  read: 'read',
  glob: 'glob',
  grep: 'grep',
  webfetch: 'webfetch',
  websearch: 'websearch',
  task: 'task',
  skill: 'skill',
  askuserquestion: 'question',
  todowrite: 'todowrite',
  todoread: 'todowrite',
  list: 'list',
  lsp: 'lsp',
};

function parseTools(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return values
    .flatMap((tool) => String(tool).split(','))
    .map((tool) => {
      const normalized = tool.trim().toLowerCase();
      const scoped = normalized.match(/^([^()]+)\((.*)\)$/);
      return scoped
        ? { name: scoped[1].trim(), pattern: scoped[2].trim().replace(/:\*$/, ' *') }
        : { name: normalized, pattern: null };
    })
    .filter((tool) => tool.name);
}

function permissionKey(tool) {
  return TOOL_PERMISSION_MAP[tool] || tool;
}

function permissionLines(allowedTools, disallowedTools) {
  const allowed = parseTools(allowedTools);
  const disallowed = parseTools(disallowedTools);
  const permissions = new Map();

  const setScoped = (tool, action, fallback) => {
    const key = permissionKey(tool.name);
    if (!tool.pattern) {
      permissions.set(key, action);
      return;
    }
    const existing = permissions.get(key);
    const rules = existing instanceof Map ? existing : new Map([['*', fallback]]);
    rules.set(tool.pattern, action);
    permissions.set(key, rules);
  };

  if (allowed.length > 0) {
    permissions.set('*', 'deny');
    for (const tool of allowed) setScoped(tool, 'allow', 'deny');
  }
  for (const tool of disallowed) setScoped(tool, 'deny', allowed.length > 0 ? 'deny' : 'allow');

  if (permissions.size === 0) return [];

  return [
    'permission:',
    ...[...permissions].flatMap(([key, action]) => {
      if (!(action instanceof Map)) return [`  ${serializeScalar(key)}: ${action}`];
      return [
        `  ${serializeScalar(key)}:`,
        ...[...action].map(([pattern, scopedAction]) => `    ${serializeScalar(pattern)}: ${scopedAction}`),
      ];
    }),
  ];
}

// OpenCode names an agent by its markdown filename, so `name` is dropped. The
// `model` key uses provider/model-id semantics in OpenCode (vs `opus`/`sonnet`),
// so it is intentionally dropped to inherit the configured default model.
function adaptAgentMarkdown(item, content) {
  const { hasFrontmatter, map, body } = parseScalarFrontmatter(content);
  if (!hasFrontmatter) return content;

  const description = map.description || map.name || item.name || 'Specialized agent';
  const lines = [`description: ${serializeScalar(description)}`];
  lines.push('mode: subagent');
  lines.push(...permissionLines(map.tools, map.disallowedTools));

  return `---\n${lines.join('\n')}\n---\n${body}`;
}

// OpenCode requires a skill's frontmatter name to match its directory name.
// The body normalization covers the most common Claude-specific invocation and
// install-path forms without altering source artifacts used by Claude installs.
function adaptSkillMarkdown(item, content) {
  const { frontmatter, body } = splitFrontmatter(content);
  if (frontmatter == null) return content;

  const nameLine = `name: ${serializeScalar(item.name)}`;
  const allowedKeys = new Set(['name', 'description', 'license', 'compatibility', 'metadata']);
  const frontmatterLines = frontmatter.split('\n');
  const keptLines = [];
  let keepBlock = false;
  for (const line of frontmatterLines) {
    const keyMatch = line.match(/^([A-Za-z_-][\w-]*)\s*:/);
    if (keyMatch) keepBlock = allowedKeys.has(keyMatch[1]);
    if (keepBlock) keptLines.push(line);
  }
  const filteredFrontmatter = keptLines.join('\n');
  const normalizedFrontmatter = /^name\s*:/m.test(filteredFrontmatter)
    ? filteredFrontmatter.replace(/^name\s*:.*$/m, nameLine)
    : `${nameLine}\n${filteredFrontmatter}`;
  const normalizedBody = body
    .replace(/oh-my-claudecode:/g, '')
    .replace(/Skill\((["'])([^"']+)\1\)/g, 'skill(name="$2")')
    .replace(/\b(?:Task|Agent)\(/g, 'task(')
    .replace(/\bSkill\(/g, 'skill(')
    .replace(/,\s*model\s*=\s*["'][^"']+["']/g, '')
    .replace(/model\s*=\s*["'][^"']+["']\s*,\s*/g, '')
    .replace(/~\/\.claude\/skills/g, '~/.config/opencode/skills')
    .replace(/\.claude\/skills/g, '.opencode/skills')
    .replace(/CLAUDE_CONFIG_DIR/g, 'OPENCODE_CONFIG_DIR')
    .replace(/~\/\.claude/g, '~/.config/opencode')
    .replace(/\.claude\//g, '.opencode/')
    .replace(/CLAUDE\.md/g, 'AGENTS.md');

  return `---\n${normalizedFrontmatter}\n---\n${normalizedBody}`;
}

// OpenCode commands keep the body as the prompt template and support
// $ARGUMENTS natively, so only the frontmatter keys need normalization.
// `argument-hint` and `allowed-tools` have no OpenCode equivalent and are
// dropped; `model` is dropped so commands inherit the default model.
function adaptCommandMarkdown(item, content) {
  const { hasFrontmatter, map, body } = parseScalarFrontmatter(content);
  if (!hasFrontmatter) return content;

  const description = map.description || item.name || 'Command';
  return `---\ndescription: ${serializeScalar(description)}\n---\n${body}`;
}

// Claude Code settings.json -> OpenCode opencode.json. Only the surfaces that
// have a safe, mechanical mapping are carried over; everything else is dropped
// rather than guessed (OpenCode and Claude settings are not schema-compatible).
function adaptClaudeSettingsForOpencode(fragment) {
  const out = {};
  if (!fragment || typeof fragment !== 'object') return out;

  const servers = fragment.mcpServers;
  if (servers && typeof servers === 'object') {
    const mcp = {};
    for (const [name, server] of Object.entries(servers)) {
      if (!server || typeof server !== 'object') continue;
      const entry = { type: 'local' };

      const command = [];
      if (typeof server.command === 'string') command.push(server.command);
      if (Array.isArray(server.args)) command.push(...server.args);
      if (command.length > 0) entry.command = command;

      if (server.env && typeof server.env === 'object') entry.environment = server.env;
      if (typeof server.cwd === 'string') entry.cwd = server.cwd;

      mcp[name] = entry;
    }
    if (Object.keys(mcp).length > 0) out.mcp = mcp;
  }

  return out;
}

module.exports = {
  adaptAgentMarkdown,
  adaptCommandMarkdown,
  adaptSkillMarkdown,
  adaptClaudeSettingsForOpencode,
  serializeScalar,
};
