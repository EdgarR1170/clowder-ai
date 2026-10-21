import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PUBLIC_TEST_DENY_REDIS_URL } from '../scripts/public-test-isolation-preflight.mjs';
import { run } from '../scripts/run-public-tests.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(__dirname, '../package.json');
const runPublicTestsPath = resolve(__dirname, '../scripts/run-public-tests.mjs');
const resolverPath = resolve(__dirname, '../scripts/resolve-public-test-files.mjs');

test('test:public delegates to the Node public runner and keeps shard wiring', () => {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const script = pkg.scripts?.['test:public'] ?? '';
  const prepared = pkg.scripts?.['test:public:prepared'] ?? '';
  const shard = pkg.scripts?.['test:public:shard'] ?? '';
  const summary = pkg.scripts?.['test:public:summary'] ?? '';

  // The prepared entry must hand off to a file-based runner so resolver
  // failures fail-propagate; inlining the resolver in node --test argv would
  // discard its exit code and let Node walk the whole tree.
  assert.match(script, /test:public:prepared/, script);
  assert.match(prepared, /with-test-home\.mjs/, prepared);
  assert.match(prepared, /node \.\/scripts\/run-public-tests\.mjs/, prepared);
  assert.match(shard, /with-test-home\.mjs.*run-public-test-shard\.mjs/, shard);
  assert.match(summary, /summarize-public-test-shards\.mjs/, summary);
  assert.doesNotMatch(script, /\$\(node \.\/scripts\/resolve-public-test-files\.mjs\)/, script);
  assert.doesNotMatch(script, /grep -v/, script);
});

test('run-public-tests.mjs fails closed and preserves the serial Redis deny boundary', () => {
  const source = readFileSync(runPublicTestsPath, 'utf8');
  assert.match(source, /resolve-public-test-files\.mjs/, 'must call the resolver');
  assert.match(source, /empty file set/i, 'must guard against an empty resolver result');
  assert.match(source, /PUBLIC_TEST_REDIS_URL/, 'must own the Redis deny endpoint');
  assert.match(source, /REDIS_URL:\s*PUBLIC_TEST_REDIS_URL/, 'must inject the deny endpoint');
});

test('resolve-public-test-files.mjs still exists as the registry source', () => {
  assert.ok(readFileSync(resolverPath, 'utf8').length > 0, 'resolver script must exist');
});

test('serial public lane overrides a legal isolated runner URL before executing tests', async () => {
  const root = mkdtempSync(join(tmpdir(), 'public-serial-redis-boundary-'));
  const fixture = join(root, 'redis-boundary.test.mjs');
  const output = join(root, 'observed-redis.txt');
  writeFileSync(
    fixture,
    `import { test } from 'node:test';
     import { writeFileSync } from 'node:fs';
     test('record REDIS_URL', () => {
       writeFileSync(process.env.PUBLIC_REDIS_PROBE_OUT, process.env.REDIS_URL ?? '');
     });`,
  );

  const previousProbe = process.env.PUBLIC_REDIS_PROBE_OUT;
  const previousRedis = process.env.REDIS_URL;
  process.env.PUBLIC_REDIS_PROBE_OUT = output;
  process.env.REDIS_URL = 'redis://127.0.0.1:6921/2867';
  try {
    const outcome = await run([fixture]);
    assert.equal(outcome.code, 0, `public runner exited ${outcome.code}`);
    assert.equal(readFileSync(output, 'utf8'), PUBLIC_TEST_DENY_REDIS_URL);
  } finally {
    if (previousProbe === undefined) delete process.env.PUBLIC_REDIS_PROBE_OUT;
    else process.env.PUBLIC_REDIS_PROBE_OUT = previousProbe;
    if (previousRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedis;
    rmSync(root, { recursive: true, force: true });
  }
});
