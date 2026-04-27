/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readConfig } = require('../config/sources');
const { getProjectRoot, getSourceArtifactDir, getInstallTarget } = require('../config/paths');
const { ARTIFACT_TYPES, getArtifactTypeNames } = require('../config/artifact-types');

function check(label, fn) {
  try {
    const result = fn();
    if (result === true) {
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
  const root = getProjectRoot();

  for (const [name, src] of Object.entries(config.sources)) {
    const artifacts = src.artifacts || [];
    const available = artifacts.filter(type => {
      const dir = getSourceArtifactDir(name, type, root);
      return fs.existsSync(dir);
    });

    const isPlanned = src.installMode && src.installMode !== 'auto';
    const isReference = src.role === 'reference';
    const tagBits = [`priority ${src.priority}`, `kind ${src.kind || 'content-repo'}`];
    if (isPlanned) tagBits.push(`installMode ${src.installMode}`);
    if (isReference) tagBits.push('role reference');
    if (src.appliedProfile) tagBits.push(`profile ${src.appliedProfile}`);

    if (isPlanned && !isReference) {
      // Distribution-repo waiting for plan apply: surface it without claiming
      // failure — sync may have already populated catalog manifests.
      console.log(`  ○ ${name} (${tagBits.join(', ')}) — staged, run "omc-manage plan apply ${name}" to activate`);
      if (available.length > 0) {
        console.log(`    synced types: ${available.join(', ')}`);
      }
      continue;
    }

    check(`${name} (${tagBits.join(', ')})`, () => {
      return available.length > 0 ? true : 'not synced';
    });
    if (available.length > 0 && available.length < artifacts.length) {
      const missing = artifacts.filter(t => !available.includes(t));
      console.log(`    missing: ${missing.join(', ')}`);
    }
    if (src.allowlist && Object.keys(src.allowlist).length > 0) {
      const allowlist = Object.entries(src.allowlist)
        .map(([type, names]) => `${type}(${names.length})`)
        .join(', ');
      console.log(`    allowlist: ${allowlist}`);
    }
  }

  console.log('');

  console.log('Installation:');
  const typeNames = getArtifactTypeNames().filter(typeName => {
    if (typeName !== 'claude-md') return true;
    return !fs.existsSync(ARTIFACT_TYPES.guidelines.installTarget);
  });

  for (const typeName of typeNames) {
    const type = ARTIFACT_TYPES[typeName];
    const target = type.installTarget;
    if (fs.existsSync(target)) {
      if (fs.statSync(target).isDirectory()) {
        const count = fs.readdirSync(target).length;
        console.log(`  ✓ ${type.label}: ${count} items (${target})`);
      } else {
        console.log(`  ✓ ${type.label}: present (${target})`);
      }
    } else {
      console.log(`  - ${type.label}: not installed`);
    }
  }

  console.log('');

  if (config.lastSync) {
    const age = Date.now() - new Date(config.lastSync).getTime();
    const days = Math.floor(age / (1000 * 60 * 60 * 24));
    if (days > 7) {
      console.log(`⚠ Last sync was ${days} days ago. Consider: omc-manage source sync`);
    } else {
      console.log(`Last sync: ${config.lastSync}`);
    }
  } else {
    console.log('⚠ Never synced. Run: omc-manage source sync');
  }

  console.log('');
}

module.exports = { doctor };
