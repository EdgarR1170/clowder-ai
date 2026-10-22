import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'cleanup-stale-dev-processes.mjs');

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 30_000 });
}

test('importing the process doctor stays inert', () => {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(script).href)});`],
    { encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test(
  'Windows direct execution fails closed instead of silently succeeding',
  { skip: process.platform !== 'win32' },
  () => {
    for (const args of [[], ['--run']]) {
      const result = run(args);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Windows process enumeration\/cleanup is not supported yet/);
      assert.doesNotMatch(result.stderr, /no cleanup-safe stale/);
      assert.equal(result.stdout, '');
    }
  },
);
