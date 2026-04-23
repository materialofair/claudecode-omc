/* eslint-disable no-console */
const path = require('path');
const { optimizeGuidelines } = require('../guidelines/optimizer');
const { applyGuidelineResult } = require('../guidelines/apply');

async function guidelines(args, flags = {}) {
  const cmd = args[0] || 'help';

  switch (cmd) {
    case 'optimize': {
      const selectedSources = args.slice(1);
      const result = await optimizeGuidelines({
        sources: selectedSources,
        outputDir: flags.outputDir,
        dryRun: flags.dryRun,
      });

      const { summary } = result;
      console.log('Guidelines Optimization');
      console.log('=======================');
      console.log(`Sources: ${summary.sourceCount}`);
      console.log(`Sections: ${summary.sectionCount}`);
      console.log(`Target runtime file: ${summary.outputPath}`);

      if (flags.dryRun) {
        console.log('');
        console.log('[dry-run] Would write maintainer artifacts to:');
        console.log(`  latest: ${summary.latestDir}`);
        console.log(`  run:    ${summary.runDir}`);
      } else {
        console.log('');
        console.log('Wrote maintainer artifacts:');
        console.log(`  latest: ${summary.latestDir}`);
        console.log(`  run:    ${summary.runDir}`);
        console.log('');
        console.log('Next step for Claude Code CLI or Codex:');
        console.log(`  read ${path.join(summary.latestDir, 'next-steps.md')}`);
      }

      break;
    }

    case 'apply': {
      const result = await applyGuidelineResult({
        resultFile: flags.resultFile || args[1],
        outputDir: flags.outputDir,
        dryRun: flags.dryRun,
      });

      console.log('Guidelines Apply');
      console.log('================');
      console.log(`Result file: ${result.resultFile}`);
      console.log(`Runtime file: ${result.runtimePath}`);

      if (flags.dryRun) {
        console.log('');
        console.log('[dry-run] Would write:');
        console.log(`  ${path.join(result.latestDir, 'result.json')}`);
        console.log(`  ${path.join(result.latestDir, 'decision-log.md')}`);
        console.log(`  ${result.runtimePath}`);
      } else {
        console.log('');
        console.log('Wrote:');
        console.log(`  ${path.join(result.latestDir, 'result.json')}`);
        console.log(`  ${path.join(result.latestDir, 'decision-log.md')}`);
        console.log(`  ${result.runtimePath}`);
      }

      break;
    }

    case 'help':
    default:
      console.log('Usage:');
      console.log('  omc-manage guidelines optimize [source...] [--output-dir <dir>] [--dry-run]');
      console.log('  omc-manage guidelines apply --result-file <path> [--output-dir <dir>] [--dry-run]');
      console.log('');
      console.log('Build or apply maintainer-only guideline optimization artifacts.');
      console.log('The optimizer skill is repository-only and is not installed into user Claude Code configs.');
  }
}

module.exports = { guidelines };
