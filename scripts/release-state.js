'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const STATE_PATH = path.join(REPOSITORY_ROOT, '.omc', 'release-ready.json');
const RELEASE_INPUTS = [
  'src',
  '.local',
  '.omc-curation',
  'bundled',
  'templates',
  'packages',
  'scripts',
  'test',
  'bin',
  '.github/workflows/ci.yml',
  '.gitattributes',
  '.gitignore',
  'README.md',
  'package.json',
  'package-lock.json',
];
const GENERATED_CORE_PREFIXES = [
  'packages/omc-core/src/',
  'packages/omc-core/.local/',
  'packages/omc-core/.omc-curation/',
  'packages/omc-core/bundled/',
  'packages/omc-core/templates/',
];

function listFiles(target, files = []) {
  const relative = path.relative(REPOSITORY_ROOT, target).split(path.sep).join('/');
  if (GENERATED_CORE_PREFIXES.some((prefix) => `${relative}/`.startsWith(prefix))) return files;

  const stat = fs.lstatSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target).sort()) {
      listFiles(path.join(target, entry), files);
    }
  } else if (stat.isFile() || stat.isSymbolicLink()) {
    files.push({ absolute: target, relative, stat });
  }
  return files;
}

function computeReleaseFingerprint() {
  const hash = crypto.createHash('sha256');
  for (const input of RELEASE_INPUTS) {
    const target = path.join(REPOSITORY_ROOT, input);
    if (!fs.existsSync(target)) throw new Error(`Release input is missing: ${input}`);
    for (const file of listFiles(target)) {
      hash.update(`${file.relative}\0${file.stat.mode}\0`);
      hash.update(file.stat.isSymbolicLink() ? fs.readlinkSync(file.absolute) : fs.readFileSync(file.absolute));
      hash.update('\0');
    }
  }
  return hash.digest('hex');
}

function packageVersions() {
  const manifests = [
    'packages/omc-core/package.json',
    'packages/claudecode-omc/package.json',
    'packages/opencode-omc/package.json',
  ];
  return Object.fromEntries(manifests.map((manifest) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, manifest), 'utf8'));
    return [pkg.name, pkg.version];
  }));
}

function writeReleaseState() {
  const state = {
    verifiedAt: new Date().toISOString(),
    fingerprint: computeReleaseFingerprint(),
    packages: packageVersions(),
  };
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}

function assertReleaseState() {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error('Release is not verified. Run `npm run release:verify` first.');
  }
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const fingerprint = computeReleaseFingerprint();
  if (state.fingerprint !== fingerprint) {
    throw new Error('Release inputs changed after verification. Run `npm run release:verify` again.');
  }
  if (JSON.stringify(state.packages) !== JSON.stringify(packageVersions())) {
    throw new Error('Package versions changed after verification. Run `npm run release:verify` again.');
  }
  return state;
}

module.exports = {
  REPOSITORY_ROOT,
  STATE_PATH,
  assertReleaseState,
  computeReleaseFingerprint,
  packageVersions,
  writeReleaseState,
};
