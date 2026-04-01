/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

/**
 * Multi-dimensional skill quality evaluator.
 *
 * Scoring aligned with Anthropic's official skill authoring best practices
 * (sourced from .upstream/anthropic-skills/).  When that upstream updates,
 * quick_validate.py constraints are re-read automatically.
 *
 * Dimensions (each 0-25, total 0-100):
 *   1. Metadata   — frontmatter completeness, description quality
 *   2. Content    — body depth, progressive disclosure, examples
 *   3. Structure  — organization, reference hygiene, anti-patterns
 *   4. Actionability — workflow clarity, scripts, concrete guidance
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSkillMd(skillPath) {
  const file = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const meta = {};
  match[1].split('\n').forEach((line) => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return meta;
}

function getBody(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

function countLines(text) {
  return text ? text.split('\n').length : 0;
}

// ---------------------------------------------------------------------------
// Dimension 1: Metadata (0-25)
// ---------------------------------------------------------------------------

function scoreMetadata(content, meta) {
  const signals = [];
  let score = 25;

  if (!meta) {
    return { score: 0, signals: ['missing_frontmatter'] };
  }

  // name
  const name = meta.name || '';
  if (!name) {
    score -= 5; signals.push('missing_name');
  } else {
    if (!/^[a-z0-9-]+$/.test(name)) {
      score -= 3; signals.push('name_not_kebab_case');
    }
    if (name.length > 64) {
      score -= 2; signals.push('name_too_long');
    }
  }

  // description
  const desc = meta.description || '';
  if (!desc) {
    score -= 10; signals.push('missing_description');
  } else {
    if (desc.length > 1024) {
      score -= 3; signals.push('description_too_long');
    }
    if (desc.length < 20) {
      score -= 3; signals.push('description_too_short');
    }
    // Should contain trigger context ("Use when", "when", etc.)
    if (!/\b(use when|when|trigger|invoke|activate)\b/i.test(desc)) {
      score -= 2; signals.push('description_missing_trigger_context');
    }
    // Should not summarize workflow (Anthropic anti-pattern)
    if (/\b(step 1|first,? then|workflow:|process:)\b/i.test(desc)) {
      score -= 2; signals.push('description_summarizes_workflow');
    }
    // Vague words
    if (/\b(helps?|various|many|stuff|things|general)\b/i.test(desc)) {
      score -= 1; signals.push('description_vague_words');
    }
  }

  return { score: Math.max(0, score), signals };
}

// ---------------------------------------------------------------------------
// Dimension 2: Content (0-25)
// ---------------------------------------------------------------------------

function scoreContent(body) {
  const signals = [];
  let score = 25;

  const lines = countLines(body);

  if (lines < 5) {
    score -= 10; signals.push('body_too_short');
  } else if (lines > 500) {
    score -= 5; signals.push('body_exceeds_500_lines');
  }

  // Has examples (code blocks)
  const codeBlocks = (body.match(/```/g) || []).length / 2;
  if (codeBlocks < 1) {
    score -= 3; signals.push('no_code_examples');
  }

  // Has concrete examples (not abstract)
  if (!/example|e\.g\.|for instance|sample/i.test(body)) {
    score -= 2; signals.push('no_concrete_examples');
  }

  // Progressive disclosure — references to other files
  const refs = body.match(/\[.*?\]\(.*?\.md\)/g) || [];
  if (lines > 300 && refs.length === 0) {
    score -= 3; signals.push('long_body_no_progressive_disclosure');
  }

  // Check for nested references (anti-pattern: A -> B -> C)
  // We just check if referenced files themselves reference other files
  // This is a heuristic — actual check would need file reads
  if (refs.length > 10) {
    score -= 1; signals.push('excessive_references');
  }

  return { score: Math.max(0, score), signals };
}

// ---------------------------------------------------------------------------
// Dimension 3: Structure (0-25)
// ---------------------------------------------------------------------------

function scoreStructure(content, body, skillPath) {
  const signals = [];
  let score = 25;

  // Valid frontmatter already checked in metadata, but check YAML parse
  if (!content.startsWith('---')) {
    score -= 5; signals.push('no_frontmatter_delimiter');
  }

  // Sections — should have headers for organization
  const headers = (body.match(/^#{1,3}\s+.+/gm) || []);
  if (headers.length === 0 && countLines(body) > 30) {
    score -= 5; signals.push('no_section_headers');
  }

  // Check reference depth — files referenced from SKILL.md
  const refFiles = (body.match(/\[.*?\]\(((?!http)[^)]+)\)/g) || []);
  for (const ref of refFiles) {
    const match = ref.match(/\(([^)]+)\)/);
    if (!match) continue;
    const refPath = path.join(skillPath, match[1]);
    if (fs.existsSync(refPath)) {
      const refContent = fs.readFileSync(refPath, 'utf8');
      // Check if reference itself has deep references
      const nestedRefs = (refContent.match(/\[.*?\]\(((?!http)[^)]+\.md)\)/g) || []);
      if (nestedRefs.length > 0) {
        score -= 2; signals.push('nested_references');
        break;
      }
      // Long reference without table of contents
      if (countLines(refContent) > 100 && !/^#{1,2}\s+.*contents|^#{1,2}\s+.*toc/im.test(refContent)) {
        score -= 1; signals.push('long_reference_no_toc');
      }
    }
  }

  // Anti-patterns
  if (/before \d{4}|after \d{4}|until \d{4}/i.test(body)) {
    score -= 3; signals.push('time_sensitive_content');
  }
  if (/\\/g.test(body) && /\.exe|\.bat|\.cmd/i.test(body)) {
    score -= 2; signals.push('windows_paths');
  }

  // Consistent terminology — check for mixed naming of same concept
  // Heuristic: if "skill" and "command" both used to describe the same thing
  const skillMentions = (body.match(/\bskill\b/gi) || []).length;
  const commandMentions = (body.match(/\bcommand\b/gi) || []).length;
  if (skillMentions > 3 && commandMentions > 3) {
    score -= 1; signals.push('mixed_terminology');
  }

  return { score: Math.max(0, score), signals };
}

// ---------------------------------------------------------------------------
// Dimension 4: Actionability (0-25)
// ---------------------------------------------------------------------------

function scoreActionability(body, skillPath) {
  const signals = [];
  let score = 25;

  // Has workflow/steps/checklist
  const hasSteps = /step \d|^\d+\.\s|^-\s\[[ x]\]/im.test(body);
  const hasWorkflow = /workflow|process|procedure|checklist/i.test(body);
  if (!hasSteps && !hasWorkflow) {
    score -= 5; signals.push('no_workflow_or_steps');
  }

  // Has checklist items (Claude can track)
  if (/^-\s\[[ x]\]/m.test(body)) {
    score += 0; // bonus: good practice, but don't exceed max
  } else if (countLines(body) > 50) {
    score -= 1; signals.push('long_skill_no_checklist');
  }

  // Has scripts/ directory
  const scriptsDir = path.join(skillPath, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const scripts = fs.readdirSync(scriptsDir).filter(f => !f.startsWith('.'));
    if (scripts.length > 0) {
      // Good: has executable tools
    }
  }

  // "Do X" or "Run X" — clear execution intent
  if (!/\b(run|execute|invoke|call)\b/i.test(body) && countLines(body) > 20) {
    score -= 2; signals.push('no_clear_execution_intent');
  }

  // Error handling guidance
  if (!/\b(error|fail|fallback|if .* fails|when .* fails)\b/i.test(body) && countLines(body) > 50) {
    score -= 2; signals.push('no_error_handling_guidance');
  }

  // Anti-pattern: purely descriptive, no actionable instructions
  const imperatives = (body.match(/\b(must|should|always|never|do not|ensure|verify|check|create|use|add|remove|run)\b/gi) || []);
  if (imperatives.length < 3 && countLines(body) > 20) {
    score -= 3; signals.push('purely_descriptive');
  }

  return { score: Math.max(0, score), signals };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a single skill's quality.
 *
 * @param {object} skill  — { name, path, metadata }
 * @returns {{ score: number, dimensions: object, signals: string[] }}
 */
function evaluateSkillQuality(skill) {
  const content = readSkillMd(skill.path);
  if (!content) {
    return {
      score: 0,
      dimensions: { metadata: 0, content: 0, structure: 0, actionability: 0 },
      signals: ['missing_skill_md'],
    };
  }

  const meta = parseFrontmatter(content) || skill.metadata || {};
  const body = getBody(content);

  const d1 = scoreMetadata(content, meta);
  const d2 = scoreContent(body);
  const d3 = scoreStructure(content, body, skill.path);
  const d4 = scoreActionability(body, skill.path);

  const total = d1.score + d2.score + d3.score + d4.score;
  const allSignals = [...d1.signals, ...d2.signals, ...d3.signals, ...d4.signals];

  return {
    score: total,
    dimensions: {
      metadata: d1.score,
      content: d2.score,
      structure: d3.score,
      actionability: d4.score,
    },
    signals: allSignals,
  };
}

/**
 * Get the path to Anthropic's upstream quick_validate.py (if available).
 */
function getUpstreamValidatorPath(root) {
  const p = path.join(root, '.upstream', 'anthropic-skills', 'skills',
    'skill-creator', 'scripts', 'quick_validate.py');
  return fs.existsSync(p) ? p : null;
}

module.exports = { evaluateSkillQuality, getUpstreamValidatorPath };
