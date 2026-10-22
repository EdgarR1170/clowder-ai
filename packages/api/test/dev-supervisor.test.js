import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  devEnvironment,
  nodeOptionsWithSigusr1Guard,
  resolveTsxCli,
  runDevSupervisor,
  shouldStopDev,
} from '../scripts/dev-supervisor.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

test('dev supervisor stops only on 0, 130, or SIGINT', () => {
  assert.equal(shouldStopDev(0, null), true);
  assert.equal(shouldStopDev(130, null), true);
  assert.equal(shouldStopDev(null, 'SIGINT'), true);
  assert.equal(shouldStopDev(1, null), false);
  assert.equal(shouldStopDev(130, 'SIGTERM'), true);
  assert.equal(shouldStopDev(2, null), false);
  assert.equal(shouldStopDev(null, 'SIGTERM'), false);
});

test('dev supervisor prepends the guard and preserves inherited NODE_OPTIONS', () => {
  const guard = pathToFileURL('/tmp/a folder/sigusr1-guard.mjs').href;
  const options = nodeOptionsWithSigusr1Guard('/tmp/a folder/sigusr1-guard.mjs', '--max-old-space-size=4096');
  assert.equal(options, `--import ${guard} --max-old-space-size=4096`);
  assert.equal(options.split('--import ').length - 1, 1);
});

test('dev supervisor does not add an empty NODE_OPTIONS suffix', () => {
  const guard = pathToFileURL('/tmp/sigusr1-guard.mjs').href;
  const options = nodeOptionsWithSigusr1Guard('/tmp/sigusr1-guard.mjs', '');
  assert.equal(options, `--import ${guard}`);
});

test('dev supervisor resolves the local tsx CLI and guard', () => {
  assert.equal(existsSync(resolveTsxCli(packageRoot)), true);
  const env = devEnvironment({ root: packageRoot, inherited: undefined });
  assert.match(env.NODE_OPTIONS, /sigusr1-guard\.mjs/);
  assert.equal(env.PATH ?? env.Path, process.env.PATH ?? process.env.Path);
  assert.equal(env.CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT, process.env.CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT);
});

test('dev supervisor restarts a failed child and stops on clean exit', async () => {
  const children = [1, 0].map((code) => {
    const child = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => child.emit('exit', code, null));
    return child;
  });
  const exits = [];
  const messages = [];
  await runDevSupervisor({
    root: packageRoot,
    tsxCli: join(packageRoot, 'fake-tsx.mjs'),
    spawnChild: () => children.shift(),
    exit: (code) => exits.push(code),
    sleepFn: async () => {},
    log: { error: (message) => messages.push(message), warn: () => {} },
  });

  assert.deepEqual(exits, [0]);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /\[api\] dev exited \(1\)/);
  assert.match(messages[0], /auto-restarting in 1s/);
});

test('dev supervisor package entry points at the Node supervisor', async () => {
  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.dev, 'node scripts/dev-supervisor.mjs');
});
