#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

async function countFiles(dir) {
  let count = 0;
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) count += await countFiles(entryPath);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

async function bundleUpstream(options = {}) {
  const root = options.root || path.resolve(__dirname, '..');
  const upstreamDir = options.upstreamDir || path.join(root, '.upstream');
  const bundledRoot = options.bundledRoot || path.join(root, 'bundled');
  const bundledDir = path.join(bundledRoot, 'upstream');

  if (!fs.existsSync(upstreamDir)) {
    throw new Error(".upstream/ not found. Run 'omc-manage source sync' first.");
  }

  const sources = (await fsp.readdir(upstreamDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  console.log('Bundling upstream artifacts for npm distribution...');
  await fsp.rm(bundledDir, { recursive: true, force: true });
  await fsp.mkdir(bundledDir, { recursive: true });

  const manifestSources = {};
  for (const sourceName of sources) {
    console.log(`  Bundling ${sourceName}...`);
    const sourceDir = path.join(upstreamDir, sourceName);
    await fsp.cp(sourceDir, path.join(bundledDir, sourceName), { recursive: true });
    manifestSources[sourceName] = { artifacts: await countFiles(sourceDir) };
  }

  const manifest = {
    bundledAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    sources: manifestSources,
  };
  const manifestPath = path.join(bundledRoot, 'manifest.json');
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`Bundled to: ${bundledRoot}`);
  console.log(`Manifest: ${manifestPath}`);
  return manifest;
}

if (require.main === module) {
  bundleUpstream().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { bundleUpstream, countFiles };
