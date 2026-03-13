#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const entryFile = path.join(__dirname, '..', 'src', 'workflow.ts');
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npxCommand, ['tsx', entryFile, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
