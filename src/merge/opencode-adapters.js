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
    for (const rawLine of frontmatter.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      map[key] = value;
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
};

function denyPermissionLines(disallowedTools) {
  const tools = String(disallowedTools || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const denies = [];
  for (const tool of tools) {
    const key = TOOL_PERMISSION_MAP[tool];
    if (key && !denies.includes(key)) denies.push(key);
  }
  if (denies.length === 0) return [];

  return ['permission:', ...denies.map((key) => `  ${key}: deny`)];
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
  lines.push(...denyPermissionLines(map.disallowedTools));

  return `---\n${lines.join('\n')}\n---\n${body}`;
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
  adaptClaudeSettingsForOpencode,
  serializeScalar,
};
