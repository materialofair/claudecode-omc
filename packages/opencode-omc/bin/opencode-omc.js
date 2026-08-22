#!/usr/bin/env node
'use strict';

/* eslint-disable no-console */
const { main } = require('@ah-wq/omc-core/cli');
const pkg = require('../package.json');

main(process.argv.slice(2), {
  defaultHarness: 'opencode',
  productName: pkg.name,
  programName: 'opencode-omc',
  packageVersion: pkg.version,
  updateRepository: 'materialofair/claudecode-omc',
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
