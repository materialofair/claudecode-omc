/* eslint-disable no-console */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { artifact } = require('./artifact');
const { loadSourcesForType } = require('./artifact');
const { getProjectRoot, getMergeConfigPath } = require('../config/paths');
const { evaluateSkillQuality, getUpstreamValidatorPath } = require('../utils/quality');
const { detectOverlaps, generateRecommendations } = require('../utils/overlap');

// Grade thresholds
const GRADE_THRESHOLDS = [
  [90, 'A'],
  [80, 'B'],
  [65, 'C'],
  [50, 'D'],
  [0,  'F'],
];

function grade(score) {
  for (const [min, letter] of GRADE_THRESHOLDS) {
    if (score >= min) return letter;
  }
  return 'F';
}

function dimBar(score, max = 25) {
  const filled = Math.round((score / max) * 10);
  return '#'.repeat(filled) + '-'.repeat(10 - filled);
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

/**
 * omc-manage skill evaluate [name] [--verbose]
 *
 * Evaluate quality of all skills (or a named skill) across all sources.
 */
async function evaluate(args, flags) {
  const root = getProjectRoot();
  const filter = args[1]; // optional skill name
  const sources = loadSourcesForType('skills', root);

  if (sources.length === 0) {
    console.log('No skill sources found. Run: omc-manage source sync');
    return;
  }

  const results = [];
  for (const source of sources) {
    for (const item of source.items) {
      if (filter && item.name !== filter) continue;
      const quality = evaluateSkillQuality(item);
      results.push({ name: item.name, source: source.name, quality });
    }
  }

  if (results.length === 0) {
    console.log(filter ? `Skill "${filter}" not found.` : 'No skills found.');
    return;
  }

  // Sort by score descending
  results.sort((a, b) => b.quality.score - a.quality.score);

  if (filter || results.length === 1) {
    // Detailed view for single skill
    const r = results[0];
    const d = r.quality.dimensions;
    console.log(`Skill: ${r.name} (${r.source})`);
    console.log(`Score: ${r.quality.score}/100 [${grade(r.quality.score)}]`);
    console.log('');
    console.log(`  Metadata:      ${d.metadata}/25  [${dimBar(d.metadata)}]`);
    console.log(`  Content:       ${d.content}/25  [${dimBar(d.content)}]`);
    console.log(`  Structure:     ${d.structure}/25  [${dimBar(d.structure)}]`);
    console.log(`  Actionability: ${d.actionability}/25  [${dimBar(d.actionability)}]`);
    if (r.quality.signals.length > 0) {
      console.log('');
      console.log('Issues:');
      for (const s of r.quality.signals) {
        console.log(`  - ${s}`);
      }
    }
  } else {
    // Table view
    console.log(`Skill Quality Report (${results.length} skills)`);
    console.log('='.repeat(72));
    console.log(`${'Name'.padEnd(28)} ${'Source'.padEnd(18)} ${'Score'.padStart(5)} Grade`);
    console.log('-'.repeat(72));
    for (const r of results) {
      console.log(`${r.name.padEnd(28)} ${r.source.padEnd(18)} ${String(r.quality.score).padStart(5)} ${grade(r.quality.score).padStart(5)}`);
    }
    console.log('-'.repeat(72));

    // Summary
    const avg = Math.round(results.reduce((s, r) => s + r.quality.score, 0) / results.length);
    const aCount = results.filter(r => r.quality.score >= 90).length;
    const bCount = results.filter(r => r.quality.score >= 80 && r.quality.score < 90).length;
    const fCount = results.filter(r => r.quality.score < 50).length;
    console.log(`Average: ${avg}/100  A:${aCount} B:${bCount} F:${fCount}`);

    if (flags.verbose) {
      console.log('');
      console.log('Common issues:');
      const issueCounts = {};
      for (const r of results) {
        for (const s of r.quality.signals) {
          issueCounts[s] = (issueCounts[s] || 0) + 1;
        }
      }
      const sorted = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]);
      for (const [issue, count] of sorted.slice(0, 10)) {
        console.log(`  ${String(count).padStart(3)}x  ${issue}`);
      }
    }
  }

  // Hint about upstream validator
  const validatorPath = getUpstreamValidatorPath(root);
  if (validatorPath && filter) {
    console.log('');
    console.log(`Tip: Run Anthropic's official validator:`);
    console.log(`  python3 ${path.relative(process.cwd(), validatorPath)} <skill-dir>`);
  }
}

/**
 * omc-manage skill compare [--threshold N]
 *
 * Detect functional overlaps across sources and compare quality.
 */
async function compare(args, flags) {
  const root = getProjectRoot();
  const threshold = flags.threshold ? parseFloat(flags.threshold) : 0.3;
  const sources = loadSourcesForType('skills', root);

  if (sources.length < 2) {
    console.log('Need at least 2 skill sources for comparison.');
    return;
  }

  console.log(`Cross-Source Skill Comparison (threshold: ${Math.round(threshold * 100)}%)`);
  console.log('='.repeat(72));

  const groups = detectOverlaps(sources, { threshold });

  if (groups.length === 0) {
    console.log('No functional overlaps detected above threshold.');
    return;
  }

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    console.log('');
    console.log(`Group ${i + 1}: ${g.domain} (${g.similarity}% similarity)`);
    console.log('-'.repeat(50));

    for (const s of g.skills) {
      const marker = s === g.winner ? ' *BEST*' : '';
      const domains = s.domains.length > 0 ? ` [${s.domains.join(',')}]` : '';
      console.log(`  ${s.quality.score}/100 ${grade(s.quality.score)}  ${s.source}:${s.name}${domains}${marker}`);
      if (flags.verbose && s.description) {
        const desc = s.description.length > 60 ? s.description.slice(0, 57) + '...' : s.description;
        console.log(`         ${desc}`);
      }
    }
  }

  console.log('');
  console.log(`Found ${groups.length} overlap groups across ${sources.length} sources.`);
  console.log('Run "omc-manage skill recommend" to generate preference config.');
}

/**
 * omc-manage skill recommend [--apply] [--dry-run]
 *
 * Generate merge-config preferences based on quality comparison.
 */
async function recommend(args, flags) {
  const root = getProjectRoot();
  const sources = loadSourcesForType('skills', root);

  if (sources.length < 2) {
    console.log('Need at least 2 skill sources for recommendations.');
    return;
  }

  const groups = detectOverlaps(sources, { threshold: 0.3 });
  const newPrefs = generateRecommendations(groups);

  // Load existing config
  const configPath = getMergeConfigPath(root);
  let config = { merge_strategy: 'version-priority', auto_merge: true, allow_namespacing: false, sources: [], preferences: {} };
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
  }

  // Merge: new recommendations + existing preferences (existing wins on conflict)
  const merged = { ...newPrefs, ...config.preferences };
  const added = Object.keys(newPrefs).filter(k => !config.preferences[k]);
  const kept = Object.keys(config.preferences);

  console.log('Skill Preference Recommendations');
  console.log('='.repeat(50));

  if (Object.keys(newPrefs).length === 0 && groups.length > 0) {
    console.log('');
    console.log('No exact-name conflicts with >10 point quality gap found.');
    console.log(`(${groups.length} functional overlap groups exist but have`);
    console.log(' different names — use "omc-manage skill compare" to review.)');
  }

  if (added.length > 0) {
    console.log('');
    console.log('New recommendations:');
    for (const name of added) {
      console.log(`  ${name} -> ${newPrefs[name]}`);
    }
  }

  if (kept.length > 0) {
    console.log('');
    console.log('Existing preferences (unchanged):');
    for (const name of kept) {
      console.log(`  ${name} -> ${config.preferences[name]}`);
    }
  }

  // Show all overlap groups as advisory
  if (groups.length > 0) {
    console.log('');
    console.log('Functional overlap advisory (different names, similar purpose):');
    for (const g of groups) {
      const members = g.skills.map(s => `${s.source}:${s.name}(${s.quality.score})`).join(' vs ');
      console.log(`  [${g.domain}] ${members}`);
      console.log(`    Winner: ${g.winner.source}:${g.winner.name} (${g.winner.quality.score}/100)`);
    }
  }

  if (flags.apply && added.length > 0) {
    config.preferences = merged;
    if (!flags.dryRun) {
      await fsp.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
      console.log('');
      console.log(`Updated ${configPath}`);
    } else {
      console.log('');
      console.log('[dry-run] Would update merge-config.json');
    }
  } else if (added.length > 0) {
    console.log('');
    console.log('Run with --apply to save recommendations to merge-config.json');
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function skill(args, flags = {}) {
  const cmd = args[0];

  if (cmd === 'evaluate' || cmd === 'eval') {
    return evaluate(args, flags);
  }
  if (cmd === 'compare') {
    return compare(args, flags);
  }
  if (cmd === 'recommend') {
    return recommend(args, flags);
  }

  // Fall through to artifact subcommands (list, prefer, conflicts)
  flags.type = 'skills';
  await artifact(args, flags);
}

module.exports = { skill };
