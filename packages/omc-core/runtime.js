'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packedEntry = path.join(__dirname, 'src', 'cli', 'index.js');
const workspaceEntry = path.resolve(__dirname, '..', '..', 'src', 'cli', 'index.js');

module.exports = require(fs.existsSync(packedEntry) ? packedEntry : workspaceEntry);
