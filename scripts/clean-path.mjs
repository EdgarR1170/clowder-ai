#!/usr/bin/env node
import { rmSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node scripts/clean-path.mjs <relative-path>...');
  process.exit(2);
}

const root = process.cwd();
let failed = false;
for (const target of targets) {
  if (isAbsolute(target)) {
    console.error(`[clean-path] refusing absolute path: ${target}`);
    failed = true;
    continue;
  }
  const resolved = resolve(root, target);
  const inside = relative(root, resolved);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    console.error(`[clean-path] refusing path outside the current directory: ${target}`);
    failed = true;
    continue;
  }
  try {
    rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.error(`[clean-path] failed to remove ${target}: ${error.message}`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
