'use strict';

// EXPERIMENTAL (not load-bearing): for surgical edits, `.local` whole-file
// override usually suffices. This solves a thinner, potential need — keep it
// opt-in and don't treat it as a core guarantee.
//
// Content-level patching for installed artifacts. A patch is declared inline in
// governance.json under sources.<name>.patches["<type>/<artifact>"] and is
// applied at install time, after the winning source is chosen and before the
// file is written to ~/.claude. Markdown + YAML-frontmatter aware.
//
// Patch ops (all optional, applied in this order):
//   frontmatter: { key: value }   merge/override scalar frontmatter keys
//   replace:     [{ find, with }] literal string replacements in the body
//   prepend:     "text"           prepended to the body
//   append:      "text"           appended to the body

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitFrontmatter(content) {
  // CRLF-tolerant: match \r?\n so Windows-authored artifacts are parsed as
  // frontmatter rather than slipping through as body (which would then get a
  // second, duplicate frontmatter block prepended by a frontmatter patch).
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!m) return { frontmatter: null, body: content };
  // Normalize CRs in the frontmatter block (we re-emit it as \n-joined lines);
  // the body is left byte-for-byte so user content keeps its own line endings.
  return { frontmatter: m[1].replace(/\r/g, ''), body: content.slice(m[0].length) };
}

// Serialize a scalar for a simple `key: value` frontmatter line, quoting only
// when the value would otherwise break a bare YAML scalar.
function serializeScalar(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const s = String(value);
  if (s === '' || s.trim() !== s || /[:#"'\n[\]{}&*!|>%@`]/.test(s)) {
    return JSON.stringify(s); // valid double-quoted YAML, escapes as needed
  }
  return s;
}

// Line-based override of scalar frontmatter keys: replace the key's line if
// present, else append it. Deliberately scalar-only — nested/list overrides
// are out of scope and should use `replace`.
function mergeFrontmatter(block, overrides) {
  let next = block || '';
  for (const [key, value] of Object.entries(overrides)) {
    const line = `${key}: ${serializeScalar(value)}`;
    const re = new RegExp(`^${escapeRegExp(key)}\\s*:.*$`, 'm');
    if (re.test(next)) next = next.replace(re, line);
    else next = next ? `${next}\n${line}` : line;
  }
  return next;
}

// Apply a patch spec to file content. Returns { content, warnings }.
// Unknown/empty patch → content unchanged.
function applyContentPatch(content, patch) {
  const warnings = [];
  if (!patch || typeof patch !== 'object') return { content, warnings };

  let { frontmatter, body } = splitFrontmatter(content);

  if (patch.frontmatter && typeof patch.frontmatter === 'object') {
    frontmatter = mergeFrontmatter(frontmatter, patch.frontmatter);
  }

  if (Array.isArray(patch.replace)) {
    for (const rule of patch.replace) {
      if (!rule || typeof rule.find !== 'string' || rule.find === '') continue;
      if (!body.includes(rule.find)) {
        warnings.push(`replace target not found: ${JSON.stringify(rule.find.slice(0, 40))}`);
        continue;
      }
      body = body.split(rule.find).join(rule.with == null ? '' : String(rule.with));
    }
  }

  if (typeof patch.prepend === 'string') body = patch.prepend + body;
  if (typeof patch.append === 'string') body = body + patch.append;

  const out = frontmatter != null ? `---\n${frontmatter}\n---\n${body}` : body;
  return { content: out, warnings };
}

module.exports = { applyContentPatch };
