const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const HAS_BUNDLED_SNAPSHOT = fs.existsSync(path.join(ROOT, 'bundled', 'manifest.json'));
const REQUIRE_DISTRIBUTION_TEST = process.env.OMC_REQUIRE_DISTRIBUTION_TEST === '1';

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: { ...process.env, ...options.env },
      encoding: 'utf8',
      shell: options.shell ?? process.platform === 'win32',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

async function pack(workspace, destination) {
  const result = await run(NPM, [
    'pack', '--silent', '--json', '--pack-destination', destination, '--workspace', workspace,
  ]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const jsonStart = result.stdout.lastIndexOf('\n[') + 1;
  const metadata = JSON.parse(result.stdout.slice(jsonStart))[0];
  return { ...metadata, tarball: path.join(destination, metadata.filename) };
}

function registryForCore(corePackage, tarballPath) {
  const tarball = fs.readFileSync(tarballPath);
  const shasum = crypto.createHash('sha1').update(tarball).digest('hex');
  const integrity = `sha512-${crypto.createHash('sha512').update(tarball).digest('base64')}`;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (decodeURIComponent(pathname) === `/${corePackage.name}`) {
      const address = server.address();
      const manifest = {
        name: corePackage.name,
        'dist-tags': { latest: corePackage.version },
        versions: {
          [corePackage.version]: {
            ...corePackage,
            dist: {
              shasum,
              integrity,
              tarball: `http://127.0.0.1:${address.port}/tarballs/${path.basename(tarballPath)}`,
            },
          },
        },
      };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(manifest));
      return;
    }
    if (pathname === `/tarballs/${path.basename(tarballPath)}`) {
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      response.end(tarball);
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found', path: pathname }));
  });
  return server;
}

function globalBin(prefix, name) {
  return process.platform === 'win32'
    ? path.join(prefix, `${name}.cmd`)
    : path.join(prefix, 'bin', name);
}

test('workspace tarballs install through a registry dependency and expose coexisting bins', {
  timeout: 120000,
  skip: !HAS_BUNDLED_SNAPSHOT && !REQUIRE_DISTRIBUTION_TEST
    ? 'run source sync --frozen and bundle before distribution tests'
    : false,
}, async () => {
  assert.equal(HAS_BUNDLED_SNAPSHOT, true, 'bundled snapshot is required for release validation');
  const packDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-packs-'));
  const prefix = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-prefix-'));
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-home-'));
  const claudeProject = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-packed-claude-'));
  const opencodeProject = await fsp.mkdtemp(path.join(os.tmpdir(), 'omc-packed-opencode-'));

  const core = await pack('@ah-wq/omc-core', packDir);
  const claude = await pack('claudecode-omc', packDir);
  const opencode = await pack('opencode-omc', packDir);
  const corePaths = core.files.map((file) => file.path);
  const claudePaths = claude.files.map((file) => file.path);
  const opencodePaths = opencode.files.map((file) => file.path);

  assert.ok(corePaths.includes('src/cli/index.js'));
  assert.ok(corePaths.includes('.local/settings/opencode.json'));
  assert.ok(corePaths.includes('.local/skills/eli5/SKILL.md'));
  assert.ok(corePaths.includes(
    '.local/skills/THIRD_PARTY_LICENSES/Anthropic-claude-plugins-community.LICENSE',
  ));
  assert.ok(corePaths.includes('bundled/manifest.json'));
  assert.equal(corePaths.some((file) => file.includes('merge-review')), false);
  assert.deepEqual(claudePaths.sort(), [
    'README.md', 'bin/omc-manage.js', 'package.json', 'scripts/post-install-message.js',
  ]);
  assert.deepEqual(opencodePaths.sort(), [
    'README.md', 'bin/opencode-omc.js', 'package.json', 'scripts/post-install-message.js',
  ]);
  assert.equal(claude.files.find((file) => file.path === 'bin/omc-manage.js').mode, 0o755);
  assert.equal(opencode.files.find((file) => file.path === 'bin/opencode-omc.js').mode, 0o755);

  const corePackage = JSON.parse(await fsp.readFile(path.join(ROOT, 'packages', 'omc-core', 'package.json')));
  const registry = registryForCore(corePackage, core.tarball);
  await new Promise((resolve) => registry.listen(0, '127.0.0.1', resolve));

  try {
    const registryUrl = `http://127.0.0.1:${registry.address().port}`;
    const install = await run(NPM, [
      'install', '--global', '--prefix', prefix, '--registry', registryUrl,
      '--no-audit', '--no-fund', claude.tarball, opencode.tarball,
    ]);
    assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);

    const claudeBin = globalBin(prefix, 'omc-manage');
    const opencodeBin = globalBin(prefix, 'opencode-omc');
    assert.equal(fs.existsSync(claudeBin), true);
    assert.equal(fs.existsSync(opencodeBin), true);

    const commandOptions = { env: { HOME: home }, shell: process.platform === 'win32' };
    const claudeSetup = await run(claudeBin, ['setup', '--scope', 'project', '--type', 'settings,agents'], {
      ...commandOptions,
      cwd: claudeProject,
    });
    assert.equal(claudeSetup.status, 0, `${claudeSetup.stdout}\n${claudeSetup.stderr}`);
    assert.match(claudeSetup.stdout, /Harness: claude/);
    assert.equal(fs.existsSync(path.join(claudeProject, '.claude', 'settings.json')), true);
    assert.equal(fs.existsSync(path.join(claudeProject, '.claude', 'agents', 'code-reviewer.md')), true);

    const opencodeSetup = await run(opencodeBin, ['setup', '--scope', 'project', '--type', 'settings,agents'], {
      ...commandOptions,
      cwd: opencodeProject,
    });
    assert.equal(opencodeSetup.status, 0, `${opencodeSetup.stdout}\n${opencodeSetup.stderr}`);
    assert.match(opencodeSetup.stdout, /Harness: opencode/);
    assert.equal(fs.existsSync(path.join(opencodeProject, 'opencode.json')), true);
    assert.equal(fs.existsSync(path.join(opencodeProject, '.opencode', 'agents', 'code-reviewer.md')), true);
  } finally {
    await new Promise((resolve) => registry.close(resolve));
  }
});
