/* eslint-disable no-console */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { getProjectRoot, getLocalSkillsDir, getUpstreamSkillsDir, getMergeConfigPath, getReportDir } = require('../config/paths');
const {
  loadSkillsFromSource,
  detectConflicts,
  resolveConflicts,
  applyResolutions,
  generateReport,
} = require('../merge/skill-merger');
const { evaluateSkillQuality } = require('../utils/quality');

function loadSources(root) {
  const sources = [];
  const localDir = getLocalSkillsDir(root);
  const upstreamDir = getUpstreamSkillsDir(root);

  if (fs.existsSync(localDir)) {
    sources.push({ name: 'local', skills: loadSkillsFromSource(localDir, 'local') });
  }
  if (fs.existsSync(upstreamDir)) {
    sources.push({ name: 'upstream', skills: loadSkillsFromSource(upstreamDir, 'upstream') });
  }
  return sources;
}

function loadMergeConfig(root) {
  const configPath = getMergeConfigPath(root);
  if (!fs.existsSync(configPath)) return { preferences: {} };
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { preferences: {} };
  }
}

async function skill(args, flags = {}) {
  const cmd = args[0] || 'list';
  const root = getProjectRoot();

  switch (cmd) {
    case 'list': {
      const sources = loadSources(root);
      if (sources.length === 0) {
        console.log('No sources synced. Run: omc-manage source sync --all');
        return;
      }

      const mergeConfig = loadMergeConfig(root);

      // Build auto quality preferences for overlaps
      const forkSkills = sources.find(s => s.name === 'local')?.skills || [];
      const upstreamSkills = sources.find(s => s.name === 'upstream')?.skills || [];
      const forkByName = new Map(forkSkills.map(s => [s.name, s]));
      const upstreamByName = new Map(upstreamSkills.map(s => [s.name, s]));
      const overlapNames = [...forkByName.keys()].filter(n => upstreamByName.has(n));

      const autoPrefs = {};
      for (const name of overlapNames) {
        const fq = evaluateSkillQuality(forkByName.get(name));
        const uq = evaluateSkillQuality(upstreamByName.get(name));
        autoPrefs[name] = fq.score >= uq.score ? 'local' : 'upstream';
      }

      const prefs = { ...autoPrefs, ...(mergeConfig.preferences || {}) };
      const configWithPrefs = { ...mergeConfig, preferences: prefs };

      const conflicts = detectConflicts(sources);
      const resolutions = resolveConflicts(conflicts, configWithPrefs);
      const merged = applyResolutions(sources, resolutions);

      console.log(`Skills (${merged.length} total, from ${sources.length} sources):`);
      console.log('');

      // Group by source
      const bySource = {};
      for (const skill of merged) {
        const src = skill.sourceName || skill.source;
        if (!bySource[src]) bySource[src] = [];
        bySource[src].push(skill);
      }

      for (const [source, skills] of Object.entries(bySource)) {
        console.log(`[${source}] (${skills.length} skills)`);
        for (const s of skills.sort((a, b) => a.name.localeCompare(b.name))) {
          const desc = s.metadata.description || '';
          const shortDesc = desc.length > 60 ? desc.slice(0, 57) + '...' : desc;
          if (flags.verbose) {
            console.log(`  ${s.name}`);
            console.log(`    ${shortDesc}`);
          } else {
            console.log(`  ${s.name} — ${shortDesc}`);
          }
        }
        console.log('');
      }

      if (overlapNames.length > 0) {
        console.log(`Overlapping skills: ${overlapNames.length}`);
      }
      break;
    }

    case 'prefer': {
      const skillName = args[1];
      const sourceName = args[2];
      if (!skillName || !sourceName) {
        throw new Error('Usage: omc-manage skill prefer <skill-name> <source>');
      }

      const configPath = getMergeConfigPath(root);
      const config = loadMergeConfig(root);
      config.preferences = config.preferences || {};
      config.preferences[skillName] = sourceName;
      await fsp.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
      console.log(`Preference set: ${skillName} -> ${sourceName}`);
      console.log('Run "omc-manage setup --force" to apply.');
      break;
    }

    case 'conflicts': {
      const sources = loadSources(root);
      if (sources.length < 2) {
        console.log('Need at least 2 sources to detect conflicts.');
        console.log('Run: omc-manage source sync --all');
        return;
      }

      const mergeConfig = loadMergeConfig(root);
      const conflicts = detectConflicts(sources);
      const resolutions = resolveConflicts(conflicts, mergeConfig);
      const report = generateReport(conflicts, resolutions);

      console.log('Conflict Report');
      console.log('===============');
      console.log(`Total conflicts: ${report.summary.total_conflicts}`);
      console.log(`  Exact name: ${report.summary.exact_name_conflicts}`);
      console.log(`  Similar description: ${report.summary.similar_description_warnings}`);
      console.log('');

      if (report.conflicts.length === 0) {
        console.log('No conflicts detected.');
        return;
      }

      console.log('Resolutions:');
      for (const [method, count] of Object.entries(report.summary.resolutions)) {
        if (count > 0) {
          console.log(`  ${method}: ${count}`);
        }
      }
      console.log('');

      for (const conflict of report.conflicts) {
        if (conflict.type === 'exact_name') {
          const winner = conflict.winner ? `${conflict.winner.source}` : 'namespaced';
          console.log(`  ${conflict.skill}: ${conflict.resolution} -> ${winner}`);
        } else {
          console.log(`  ⚠ ${conflict.skill}: ${conflict.message}`);
        }
      }

      // Save report
      const reportDir = getReportDir(root);
      await fsp.mkdir(reportDir, { recursive: true });
      const reportPath = path.join(reportDir, 'conflict-report.json');
      await fsp.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
      console.log(`\nReport saved to: ${reportPath}`);
      break;
    }

    default:
      throw new Error(`Unknown subcommand: ${cmd}. Use: list, prefer, or conflicts`);
  }
}

module.exports = { skill };
