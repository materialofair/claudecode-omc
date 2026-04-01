/* eslint-disable no-console */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const {
  getProjectRoot,
  getLocalSkillsDir,
  getUpstreamSkillsDir,
  getMergeConfigPath,
  getSkillsDir,
  getReportDir,
} = require('../config/paths');
const {
  loadSkillsFromSource,
  detectConflicts,
  resolveConflicts,
  applyResolutions,
  generateReport,
} = require('../merge/skill-merger');
const { evaluateSkillQuality } = require('../utils/quality');

async function copyDirectory(src, dest, options = {}) {
  if (!fs.existsSync(src)) return 0;
  if (!options.dryRun) {
    await fsp.mkdir(dest, { recursive: true });
  }
  const entries = await fsp.readdir(src, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      count += await copyDirectory(from, to, options);
      continue;
    }

    if (!entry.isFile()) continue;

    if (!options.force && fs.existsSync(to)) continue;
    if (!options.dryRun) {
      await fsp.mkdir(path.dirname(to), { recursive: true });
      await fsp.copyFile(from, to);
    }
    count += 1;
  }

  return count;
}

async function setup(args, flags = {}) {
  const root = getProjectRoot();
  const scope = flags.scope || 'user';
  const skillsDest = getSkillsDir(scope);

  console.log('claudecode-omc setup');
  console.log('====================');
  console.log(`Scope: ${scope}`);
  console.log(`Target: ${skillsDest}`);
  console.log('');

  // Load sources
  const sources = [];
  const localDir = getLocalSkillsDir(root);
  const upstreamDir = getUpstreamSkillsDir(root);

  let localSkills = [];
  let upstreamSkills = [];

  if (fs.existsSync(localDir)) {
    localSkills = loadSkillsFromSource(localDir, 'local');
    sources.push({ name: 'local', skills: localSkills });
    console.log(`[1/4] Loaded ${localSkills.length} local skills`);
  } else {
    console.log('[1/4] No local skills found (.local/skills/)');
  }

  if (fs.existsSync(upstreamDir)) {
    upstreamSkills = loadSkillsFromSource(upstreamDir, 'upstream');
    sources.push({ name: 'upstream', skills: upstreamSkills });
    console.log(`[2/4] Loaded ${upstreamSkills.length} upstream skills`);
  } else {
    console.log('[2/4] Upstream skills not synced (run: omc-manage source sync --upstream)');
  }

  if (sources.length === 0) {
    console.error('\nNo sources available. Run: omc-manage source sync --all');
    process.exit(1);
  }

  // Load merge config and build quality-based preferences
  const mergeConfigPath = getMergeConfigPath(root);
  let mergeConfig = { preferences: {} };
  if (fs.existsSync(mergeConfigPath)) {
    try {
      mergeConfig = JSON.parse(fs.readFileSync(mergeConfigPath, 'utf8'));
    } catch {}
  }

  // Auto quality preferences for overlapping skills
  const localByName = new Map(localSkills.map(s => [s.name, s]));
  const upstreamByName = new Map(upstreamSkills.map(s => [s.name, s]));
  const overlapNames = [...localByName.keys()].filter(n => upstreamByName.has(n));
  const autoPrefs = {};
  const qualityWinners = [];

  for (const name of overlapNames) {
    const lq = evaluateSkillQuality(localByName.get(name));
    const uq = evaluateSkillQuality(upstreamByName.get(name));
    const winner = lq.score >= uq.score ? 'local' : 'upstream';
    autoPrefs[name] = winner;
    qualityWinners.push({ skill: name, winner, localScore: lq.score, upstreamScore: uq.score });
  }

  const prefs = { ...autoPrefs, ...(mergeConfig.preferences || {}) };
  const configWithPrefs = { ...mergeConfig, preferences: prefs };

  // Detect and resolve conflicts
  console.log('[3/4] Merging skills...');
  const conflicts = detectConflicts(sources);
  const resolutions = resolveConflicts(conflicts, configWithPrefs);
  const merged = applyResolutions(sources, resolutions);
  const report = generateReport(conflicts, resolutions);

  if (conflicts.length > 0) {
    console.log(`  Resolved ${conflicts.length} conflicts`);
    if (overlapNames.length > 0) {
      const localWins = qualityWinners.filter(w => w.winner === 'local').length;
      const upstreamWins = qualityWinners.filter(w => w.winner === 'upstream').length;
      console.log(`  Quality winners: local=${localWins}, upstream=${upstreamWins}`);
    }
  }

  // Install merged skills
  console.log(`[4/4] Installing ${merged.length} skills to ${skillsDest}...`);

  if (flags.dryRun) {
    console.log('  (dry run - no files written)');
    for (const skill of merged.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  ${skill.name} (from ${skill.sourceName})`);
    }
  } else {
    await fsp.mkdir(skillsDest, { recursive: true });
    let fileCount = 0;
    for (const skill of merged) {
      const dest = path.join(skillsDest, skill.name);
      fileCount += await copyDirectory(skill.path, dest, flags);
    }
    console.log(`  Installed ${fileCount} files from ${merged.length} skills`);
  }

  // Save merge report
  if (!flags.dryRun && report.conflicts.length > 0) {
    const reportDir = getReportDir(root);
    await fsp.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, 'merge-report.json');
    await fsp.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`  Merge report: ${reportPath}`);
  }

  console.log('\nDone.');
}

module.exports = { setup };
