/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { evaluateSkillQuality } = require('./quality');

// ---------------------------------------------------------------------------
// Text similarity
// ---------------------------------------------------------------------------

/**
 * Tokenise text into meaningful words (lowercase, >2 chars, no stop-words).
 */
function tokenise(text) {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'are', 'was',
    'will', 'can', 'has', 'have', 'been', 'not', 'but', 'all', 'its',
    'use', 'used', 'using', 'when', 'how', 'what', 'who', 'which',
    'you', 'your', 'they', 'their', 'more', 'also', 'into', 'than',
    'each', 'other', 'about', 'should', 'would', 'could',
  ]);
  return text.toLowerCase()
    .replace(/[^a-z0-9-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stop.has(w));
}

/**
 * Jaccard similarity between two token arrays.
 */
function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Weighted cosine similarity using term frequency.
 */
function cosineTF(a, b) {
  const freqA = {};
  const freqB = {};
  for (const w of a) freqA[w] = (freqA[w] || 0) + 1;
  for (const w of b) freqB[w] = (freqB[w] || 0) + 1;

  const allWords = new Set([...Object.keys(freqA), ...Object.keys(freqB)]);
  let dot = 0, magA = 0, magB = 0;
  for (const w of allWords) {
    const va = freqA[w] || 0;
    const vb = freqB[w] || 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ---------------------------------------------------------------------------
// Domain classification
// ---------------------------------------------------------------------------

const DOMAIN_KEYWORDS = {
  debugging:    ['debug', 'trace', 'root-cause', 'investigation', 'diagnose', 'stack-trace', 'breakpoint', 'bisect'],
  testing:      ['tdd', 'bdd', 'coverage', 'red-green', 'test-driven', 'playwright', 'vitest', 'jest', 'assertion'],
  planning:     ['plan', 'architect', 'requirement', 'roadmap', 'strategy', 'specification', 'decompose', 'scope'],
  execution:    ['autopilot', 'parallel', 'worker', 'dispatch', 'pipeline', 'orchestrat', 'ultrawork', 'ralph'],
  review:       ['code-review', 'critique', 'slop', 'cleanup', 'refactor', 'lint', 'approve'],
  verification: ['verify', 'validate', 'evidence', 'completion', 'passing', 'ultraqa'],
  research:     ['research', 'multi-model', 'codex', 'gemini', 'deepsearch', 'documentation'],
  git:          ['worktree', 'rebase', 'cherry-pick', 'pull-request', 'release-branch'],
  skilldev:     ['skill-creator', 'skill-tester', 'skill-quality', 'skill-debug', 'writing-skills', 'trigger-rate', 'skill-md', 'frontmatter'],
  brainstorm:   ['brainstorm', 'interview', 'ideate', 'crystalliz', 'deep-interview', 'ambiguity'],
  setup:        ['install', 'setup', 'configure', 'mcp-setup', 'omc-setup', 'doctor', 'notification'],
};

/**
 * Classify a skill into domains based on its description + body keywords.
 * Returns array of { domain, strength } sorted by strength descending.
 */
function classifyDomains(tokens) {
  const scores = {};
  const tokenSet = new Set(tokens);
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let hits = 0;
    for (const kw of keywords) {
      // Exact match or compound keyword match (e.g. "skill-creator" in tokens)
      if (tokenSet.has(kw)) {
        hits += 2;
      } else {
        // Partial: check if any token starts with the keyword
        for (const tok of tokens) {
          if (tok.startsWith(kw) && kw.length >= 4) { hits++; break; }
        }
      }
    }
    if (hits > 0) scores[domain] = hits;
  }
  return Object.entries(scores)
    .map(([domain, strength]) => ({ domain, strength }))
    .sort((a, b) => b.strength - a.strength);
}

// ---------------------------------------------------------------------------
// Overlap detection
// ---------------------------------------------------------------------------

/**
 * Load skill content tokens for overlap analysis.
 */
function loadSkillTokens(skillPath) {
  const file = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf8');
  return tokenise(content);
}

/**
 * Detect functional overlaps across multiple skill sources.
 *
 * @param {Array} sources — [{ name, items: [{ name, path, metadata }] }]
 * @param {object} options — { threshold: 0.3 }
 * @returns {Array} overlap groups
 */
function detectOverlaps(sources, options = {}) {
  const threshold = options.threshold || 0.3;

  // Flatten all skills with source info and pre-compute tokens/domains
  const allSkills = [];
  for (const source of sources) {
    for (const item of (source.items || source.skills || [])) {
      const tokens = loadSkillTokens(item.path);
      const domains = classifyDomains(tokens);
      allSkills.push({
        ...item,
        sourceName: source.name,
        tokens,
        domains,
        descTokens: tokenise(item.metadata?.description || ''),
      });
    }
  }

  // Find pairs with high similarity (cross-source only)
  const pairs = [];
  for (let i = 0; i < allSkills.length; i++) {
    for (let j = i + 1; j < allSkills.length; j++) {
      const a = allSkills[i];
      const b = allSkills[j];

      // Skip same-source pairs
      if (a.sourceName === b.sourceName) continue;

      // Description similarity
      const descSim = jaccard(a.descTokens, b.descTokens);

      // Body content similarity
      const bodySim = cosineTF(a.tokens, b.tokens);

      // Domain overlap
      const aDomains = new Set(a.domains.slice(0, 3).map(d => d.domain));
      const bDomains = new Set(b.domains.slice(0, 3).map(d => d.domain));
      const domainIntersect = [...aDomains].filter(d => bDomains.has(d)).length;
      const domainUnion = new Set([...aDomains, ...bDomains]).size;
      const domainSim = domainUnion > 0 ? domainIntersect / domainUnion : 0;

      // Combined similarity (weighted — description is the skill's identity)
      const combined = descSim * 0.4 + bodySim * 0.3 + domainSim * 0.3;

      if (combined >= threshold) {
        pairs.push({ a, b, descSim, bodySim, domainSim, combined });
      }
    }
  }

  // Cluster pairs into groups using union-find
  const parent = {};
  function find(x) {
    if (!parent[x]) parent[x] = x;
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(x, y) {
    parent[find(x)] = find(y);
  }

  for (const pair of pairs) {
    const keyA = `${pair.a.sourceName}:${pair.a.name}`;
    const keyB = `${pair.b.sourceName}:${pair.b.name}`;
    union(keyA, keyB);
  }

  // Build groups
  const groups = {};
  const skillMap = {};
  for (const skill of allSkills) {
    const key = `${skill.sourceName}:${skill.name}`;
    skillMap[key] = skill;
  }
  for (const pair of pairs) {
    const keyA = `${pair.a.sourceName}:${pair.a.name}`;
    const keyB = `${pair.b.sourceName}:${pair.b.name}`;
    const root = find(keyA);
    if (!groups[root]) groups[root] = new Set();
    groups[root].add(keyA);
    groups[root].add(keyB);
  }

  // Convert groups to output format with quality scores
  const result = [];
  for (const members of Object.values(groups)) {
    const skills = [...members].map(key => {
      const skill = skillMap[key];
      const quality = evaluateSkillQuality(skill);
      return {
        name: skill.name,
        source: skill.sourceName,
        description: skill.metadata?.description || '',
        domains: skill.domains.slice(0, 3).map(d => d.domain),
        quality,
      };
    });

    // Sort by quality score descending
    skills.sort((a, b) => b.quality.score - a.quality.score);

    // Find the best similarity pair for the group label
    const groupPairs = pairs.filter(p => {
      const keyA = `${p.a.sourceName}:${p.a.name}`;
      const keyB = `${p.b.sourceName}:${p.b.name}`;
      return members.has(keyA) && members.has(keyB);
    });
    const maxSim = groupPairs.length > 0
      ? Math.max(...groupPairs.map(p => p.combined))
      : 0;

    // Primary domain for the group
    const domainCounts = {};
    for (const s of skills) {
      for (const d of s.domains) {
        domainCounts[d] = (domainCounts[d] || 0) + 1;
      }
    }
    const primaryDomain = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

    result.push({
      domain: primaryDomain,
      similarity: Math.round(maxSim * 100),
      skills,
      winner: skills[0],
    });
  }

  // Sort groups by similarity descending
  result.sort((a, b) => b.similarity - a.similarity);
  return result;
}

/**
 * Generate merge-config preference recommendations from overlap analysis.
 *
 * Only produces recommendations for exact-name conflicts where quality
 * scores differ meaningfully (>10 points).
 *
 * @param {Array} overlapGroups — output of detectOverlaps
 * @returns {object} preferences map { skillName: sourceName }
 */
function generateRecommendations(overlapGroups) {
  const preferences = {};

  for (const group of overlapGroups) {
    if (group.skills.length < 2) continue;

    // Check for exact name matches within the group
    const byName = {};
    for (const s of group.skills) {
      if (!byName[s.name]) byName[s.name] = [];
      byName[s.name].push(s);
    }

    for (const [name, variants] of Object.entries(byName)) {
      if (variants.length < 2) continue;
      // Sort by quality
      variants.sort((a, b) => b.quality.score - a.quality.score);
      const best = variants[0];
      const second = variants[1];
      if (best.quality.score - second.quality.score >= 10) {
        preferences[name] = best.source;
      }
    }
  }

  return preferences;
}

module.exports = { detectOverlaps, generateRecommendations, tokenise, jaccard, cosineTF, classifyDomains };
