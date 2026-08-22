#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const CORE_ROOT = path.join(REPOSITORY_ROOT, 'packages', 'omc-core');
const RUNTIME_DIRECTORIES = ['src', '.local', '.omc-curation', 'bundled', 'templates'];

async function cleanCorePackage() {
  for (const directory of RUNTIME_DIRECTORIES) {
    await fsp.rm(path.join(CORE_ROOT, directory), { recursive: true, force: true });
  }
}

async function prepareCorePackage() {
  await cleanCorePackage();

  for (const directory of RUNTIME_DIRECTORIES) {
    const source = path.join(REPOSITORY_ROOT, directory);
    if (!fs.existsSync(source)) {
      throw new Error(`Required runtime directory is missing: ${directory}`);
    }
    await fsp.cp(source, path.join(CORE_ROOT, directory), { recursive: true });
  }

  console.log(`Prepared ${RUNTIME_DIRECTORIES.length} runtime directories in packages/omc-core`);
}

if (require.main === module) {
  const action = process.argv.includes('--clean') ? cleanCorePackage : prepareCorePackage;
  action().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { CORE_ROOT, RUNTIME_DIRECTORIES, cleanCorePackage, prepareCorePackage };
