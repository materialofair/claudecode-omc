#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { REPOSITORY_ROOT, assertReleaseState } = require('./release-state');

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function assertCoreOnRegistry() {
  const core = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, 'packages', 'omc-core', 'package.json')));
  const result = spawnSync(NPM, [
    'view', `${core.name}@${core.version}`, 'name', 'version', 'dist.integrity', '--json',
    '--registry', core.publishConfig.registry,
  ], { cwd: REPOSITORY_ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    throw new Error(`Core dependency ${core.name}@${core.version} is not available on npm.`);
  }
  const metadata = JSON.parse(result.stdout);
  const integrity = metadata['dist.integrity'] || metadata.dist?.integrity;
  if (metadata.name !== core.name || metadata.version !== core.version || !integrity) {
    throw new Error(`Core registry metadata is incomplete for ${core.name}@${core.version}.`);
  }
  return metadata;
}

function main() {
  const state = assertReleaseState();
  if (process.argv.includes('--require-core')) assertCoreOnRegistry();
  console.log(`Release verification accepted (${state.fingerprint.slice(0, 12)}).`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Release blocked: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { assertCoreOnRegistry, main };
