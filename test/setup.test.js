const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'omc-manage.js');

async function makeTempDir(prefix) {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd || repoRoot,
    env: {
      ...process.env,
      HOME: options.home,
    },
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `CLI failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

test('project scope installs non-skill artifacts under the project .claude directory', async () => {
  const home = await makeTempDir('omc-home-');
  const project = await makeTempDir('omc-project-');

  runCli(['setup', '--scope', 'project', '--type', 'agents'], { home, cwd: project });

  assert.equal(fs.existsSync(path.join(project, '.claude', 'agents', 'analyst.md')), true);
  assert.equal(fs.existsSync(path.join(home, '.claude', 'agents', 'analyst.md')), false);
});

test('setup manifest records physical installed paths for file artifacts', async () => {
  const home = await makeTempDir('omc-home-');
  const project = await makeTempDir('omc-project-');

  runCli(['setup', '--scope', 'project', '--type', 'agents'], { home, cwd: project });

  const manifestPath = path.join(project, '.claude', '.omc-install-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(
    fs.realpathSync(manifest.artifacts.agents.target),
    fs.realpathSync(path.join(project, '.claude', 'agents')),
  );
  assert.equal(manifest.artifacts.agents.paths.includes('analyst.md'), true);
  assert.equal(manifest.artifacts.agents.paths.includes('analyst'), false);
});

test('setup prunes stale file artifacts from legacy extensionless manifests', async () => {
  const home = await makeTempDir('omc-home-');
  const project = await makeTempDir('omc-project-');
  const projectClaude = path.join(project, '.claude');

  await fsp.mkdir(path.join(projectClaude, 'agents'), { recursive: true });
  await fsp.writeFile(path.join(projectClaude, 'agents', 'stale.md'), '# Stale\n', 'utf8');
  await fsp.writeFile(path.join(projectClaude, '.omc-install-manifest.json'), JSON.stringify({
    scope: 'project',
    artifacts: {
      agents: {
        target: path.join(projectClaude, 'agents'),
        paths: ['stale'],
      },
    },
  }, null, 2), 'utf8');

  runCli(['setup', '--scope', 'project', '--type', 'agents'], { home, cwd: project });

  assert.equal(fs.existsSync(path.join(projectClaude, 'agents', 'stale.md')), false);
});
