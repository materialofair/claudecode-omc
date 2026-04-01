/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readConfig } = require('../config/sources');
const { getUserSkillsDir, getProjectRoot, getLocalSkillsDir, getUpstreamSkillsDir } = require('../config/paths');

function check(label, fn) {
  try {
    const result = fn();
    if (result === true || result === 'ok') {
      console.log(`  ✓ ${label}`);
      return true;
    }
    console.log(`  ✗ ${label}: ${result}`);
    return false;
  } catch (err) {
    console.log(`  ✗ ${label}: ${err.message}`);
    return false;
  }
}

async function doctor() {
  console.log('claudecode-omc doctor');
  console.log('=====================');
  console.log('');

  let allOk = true;

  console.log('Environment:');
  allOk = check('Node.js >= 20', () => {
    const major = parseInt(process.version.slice(1), 10);
    return major >= 20 ? true : `found ${process.version}`;
  }) && allOk;

  allOk = check('git available', () => {
    const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
    return result.status === 0 ? true : 'git not found';
  }) && allOk;

  allOk = check('claude CLI available', () => {
    const result = spawnSync('which', ['claude'], { encoding: 'utf8' });
    return result.status === 0 ? true : 'claude not found in PATH';
  }) && allOk;

  console.log('');

  console.log('Sources:');
  const config = readConfig();
  allOk = check('Sources configured', () => {
    return config.sources && Object.keys(config.sources).length > 0
      ? true : 'no sources in config';
  }) && allOk;

  const root = getProjectRoot();
  const localDir = getLocalSkillsDir(root);
  const upstreamDir = getUpstreamSkillsDir(root);

  allOk = check('Local skills present', () => {
    if (!fs.existsSync(localDir)) return 'none found (.local/skills/)';
    const count = fs.readdirSync(localDir).filter(e =>
      fs.statSync(path.join(localDir, e)).isDirectory()
    ).length;
    return count > 0 ? true : 'empty directory';
  }) && allOk;

  check('Upstream skills synced', () => {
    if (!fs.existsSync(upstreamDir)) return 'not synced (run: omc-manage source sync --upstream)';
    const count = fs.readdirSync(upstreamDir).filter(e =>
      fs.statSync(path.join(upstreamDir, e)).isDirectory()
    ).length;
    return count > 0 ? true : 'empty directory';
  });

  console.log('');

  console.log('Installation:');
  const skillsDir = getUserSkillsDir();
  allOk = check('User skills directory', () => {
    return fs.existsSync(skillsDir) ? true : `not found: ${skillsDir}`;
  }) && allOk;

  if (fs.existsSync(skillsDir)) {
    const count = fs.readdirSync(skillsDir).filter(e =>
      fs.statSync(path.join(skillsDir, e)).isDirectory()
    ).length;
    console.log(`    ${count} skills installed`);
  }

  console.log('');

  if (config.lastSync) {
    const age = Date.now() - new Date(config.lastSync).getTime();
    const days = Math.floor(age / (1000 * 60 * 60 * 24));
    if (days > 7) {
      console.log(`⚠ Last sync was ${days} days ago. Consider running: omc-manage source sync --all`);
    } else {
      console.log(`Last sync: ${config.lastSync}`);
    }
  } else {
    console.log('⚠ Never synced. Run: omc-manage source sync --all');
  }

  console.log('');
  console.log(allOk ? 'All checks passed.' : 'Some checks failed.');
}

module.exports = { doctor };
