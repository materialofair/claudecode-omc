#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPOSITORY_ROOT, writeReleaseState } = require('./release-state');

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NODE = process.execPath;
const PACKAGES = [
  { workspace: '@ah-wq/omc-core', manifest: 'packages/omc-core/package.json' },
  { workspace: 'opencode-omc', manifest: 'packages/opencode-omc/package.json', bin: 'opencode-omc' },
  { workspace: 'claudecode-omc', manifest: 'packages/claudecode-omc/package.json', bin: 'omc-manage' },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPOSITORY_ROOT,
    env: { ...process.env, ...options.env },
    encoding: options.capture ? 'utf8' : undefined,
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    if (options.capture && result.stderr) console.error(result.stderr.trim());
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
  return options.capture ? result.stdout.trim() : '';
}

function verifyRelease() {
  run(NODE, ['bin/omc-manage.js', 'source', 'sync', '--frozen']);
  run(NPM, ['run', 'bundle']);
  run(NPM, ['test'], { env: { OMC_REQUIRE_DISTRIBUTION_TEST: '1' } });
  const state = writeReleaseState();
  console.log(`Release verified: ${state.fingerprint}`);
  return state;
}

function readPackage(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), 'utf8'));
}

function waitForRegistry(pkg, attempts = 30) {
  const registry = pkg.publishConfig?.registry || 'https://registry.npmjs.org/';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = spawnSync(NPM, [
      'view', `${pkg.name}@${pkg.version}`, 'name', 'version', 'dist.integrity', '--json',
      '--registry', registry,
    ], { cwd: REPOSITORY_ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
    if (result.status === 0) {
      const metadata = JSON.parse(result.stdout);
      const integrity = metadata['dist.integrity'] || metadata.dist?.integrity;
      if (metadata.name === pkg.name && metadata.version === pkg.version && integrity) {
        console.log(`Registry verified: ${pkg.name}@${pkg.version}`);
        return metadata;
      }
    }
    if (attempt < attempts) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  throw new Error(`Timed out waiting for ${pkg.name}@${pkg.version} on npm.`);
}

function smokeInstalledPackage(pkg, binName) {
  const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'omc-registry-smoke-'));
  try {
    run(NPM, [
      'install', '--global', '--prefix', prefix, '--no-audit', '--no-fund',
      '--registry', pkg.publishConfig.registry, `${pkg.name}@${pkg.version}`,
    ]);
    const bin = process.platform === 'win32'
      ? path.join(prefix, `${binName}.cmd`)
      : path.join(prefix, 'bin', binName);
    run(bin, ['--help']);
  } finally {
    fs.rmSync(prefix, { recursive: true, force: true });
  }
}

function assertPublishAuthority() {
  const whoami = run(NPM, ['whoami', '--registry', 'https://registry.npmjs.org/'], { capture: true });
  if (whoami !== 'ah-wq') {
    throw new Error(`Expected npm user ah-wq, received ${whoami || 'no authenticated user'}.`);
  }
  const status = run('git', ['status', '--porcelain'], { capture: true });
  if (status) throw new Error('Refusing to publish from a dirty worktree. Commit the verified release first.');
}

function publishRelease() {
  if (!process.argv.includes('--confirm-publish')) {
    throw new Error('Publishing requires the explicit `--confirm-publish` flag.');
  }
  assertPublishAuthority();
  verifyRelease();

  for (const entry of PACKAGES) {
    const pkg = readPackage(entry.manifest);
    run(NPM, ['publish', '--workspace', entry.workspace, '--access', 'public']);
    waitForRegistry(pkg);
    if (entry.bin) smokeInstalledPackage(pkg, entry.bin);
  }
}

function main() {
  const command = process.argv[2];
  if (command === 'verify') return verifyRelease();
  if (command === 'publish') return publishRelease();
  throw new Error('Usage: release-workspaces.js verify|publish [--confirm-publish]');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Release failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { PACKAGES, main, publishRelease, verifyRelease, waitForRegistry };
