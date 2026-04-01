const fs = require('fs');
const path = require('path');

/**
 * Evaluate Claude Code skill quality
 * Returns { score: number, signals: string[] }
 */
function evaluateSkillQuality(skill) {
  const skillDoc = path.join(skill.path, 'SKILL.md');
  if (!fs.existsSync(skillDoc)) {
    return { score: 0, signals: ['missing_skill_doc'] };
  }

  const content = fs.readFileSync(skillDoc, 'utf8');
  const signals = [];
  let score = 100;

  // Must have frontmatter
  if (!/^---\n[\s\S]*?\n---\n?/m.test(content)) {
    score -= 30;
    signals.push('missing_frontmatter');
  }

  // Must have name field
  if (!/name:\s*[^\n]+/.test(content)) {
    score -= 15;
    signals.push('missing_name');
  }

  // Must have description field
  if (!/description:\s*[^\n]+/.test(content)) {
    score -= 15;
    signals.push('missing_description');
  }

  // Should have usage/workflow/instructions section
  if (!/usage|when to use|instructions|workflow|steps/i.test(content)) {
    score -= 10;
    signals.push('missing_structure');
  }

  // Should have reasonable length (not just frontmatter)
  const bodyContent = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  if (bodyContent.length < 50) {
    score -= 10;
    signals.push('too_short');
  }

  score = Math.max(0, Math.min(100, score));
  return { score, signals };
}

module.exports = { evaluateSkillQuality };
