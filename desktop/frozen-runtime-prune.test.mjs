import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pruneFrozenPackageTree, pruneFrozenRuntimeRedundancy } from './scripts/frozen-runtime-prune.mjs';

function makeDependencyFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frozen-prune-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (relative, bytes = 8) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x'.repeat(bytes));
    return file;
  };
  // Build-only compiler for the target, plus real package names from each family.
  put('@next/swc-win32-x64-msvc/swc.node', 64);
  put('node-pty/prebuilds/darwin-x64/pty.node', 32);
  put('node-pty/prebuilds/win32-arm64/pty.node', 32);
  put('node-pty/prebuilds/win32-x64/pty.node', 32);
  put('node-pty/prebuilds/win32-x64/conpty.pdb', 48);
  put('node-pty/src/win/conpty.cc', 24);
  put('better-sqlite3/deps/sqlite3/sqlite3.c', 96);
  put('better-sqlite3/build/Release/better_sqlite3.node', 32);
  put('@img/sharp-linux-x64/lib.js', 32);
  put('@img/sharp-darwin-arm64/lib.js', 32);
  put('@img/sharp-libvips-linux-x64/lib.js', 32);
  put('@img/sharp-win32-arm64/lib/sharp-win32-arm64.node', 32);
  put('@img/sharp-win32-ia32/lib/sharp-win32-ia32.node', 32);
  put('@img/sharp-win32-x64/lib.js', 32);
  put('@img/sharp-wasm32/lib/sharp-wasm32.node.wasm', 32);
  put('@esbuild/darwin-x64/pkg/package.json', 32);
  put('@esbuild/openbsd-x64/pkg/package.json', 32);
  put('@esbuild/win32-arm64/esbuild.exe', 32);
  put('@esbuild/win32-ia32/esbuild.exe', 32);
  put('@esbuild/win32-x64/pkg/package.json', 32);
  put('@cat-cafe/shared/src/index.ts', 20);
  put('@cat-cafe/shared/test/helper.test.js', 20);
  put('@cat-cafe/shared/dist/__tests__/unit.js', 20);
  put('@cat-cafe/shared/dist/index.d.ts', 16);
  put('@cat-cafe/shared/dist/index.js', 16);
  put('third-party/index.js.map', 16);
  put('third-party/types.d.mts', 16);
  put('keep/index.js', 8);
  put('keep/index.js.map', 16);
  return root;
}

const removed = (root, relative) => assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
const kept = (root, relative) => assert.equal(fs.existsSync(path.join(root, relative)), true, relative);

test('removes only enabled dependency categories and reports bytes', (t) => {
  const root = makeDependencyFixture(t);
  const result = pruneFrozenRuntimeRedundancy(root, {
    swc: true,
    platform: true,
    maps: true,
    devArtifacts: true,
  });
  assert.equal(result.byCategory.swc.files, 1);
  assert.equal(result.byCategory.swc.bytes, 64);
  assert.equal(result.byCategory.platform.files, 11);
  assert.equal(result.byCategory.maps.files, 2);
  assert.equal(result.byCategory.devArtifacts.files, 8);
  removed(root, '@next/swc-win32-x64-msvc/swc.node');
  removed(root, 'node-pty/prebuilds/darwin-x64/pty.node');
  removed(root, 'node-pty/prebuilds/win32-arm64/pty.node');
  removed(root, 'node-pty/prebuilds/win32-x64/conpty.pdb');
  removed(root, 'node-pty/src/win/conpty.cc');
  removed(root, 'better-sqlite3/deps/sqlite3/sqlite3.c');
  removed(root, '@img/sharp-linux-x64/lib.js');
  removed(root, '@img/sharp-darwin-arm64/lib.js');
  removed(root, '@img/sharp-libvips-linux-x64/lib.js');
  removed(root, '@img/sharp-win32-arm64/lib/sharp-win32-arm64.node');
  removed(root, '@img/sharp-win32-ia32/lib/sharp-win32-ia32.node');
  removed(root, '@esbuild/darwin-x64/pkg/package.json');
  removed(root, '@esbuild/openbsd-x64/pkg/package.json');
  removed(root, '@esbuild/win32-arm64/esbuild.exe');
  removed(root, '@esbuild/win32-ia32/esbuild.exe');
  removed(root, '@cat-cafe/shared/src/index.ts');
  removed(root, '@cat-cafe/shared/test/helper.test.js');
  removed(root, '@cat-cafe/shared/dist/__tests__/unit.js');
  removed(root, '@cat-cafe/shared/dist/index.d.ts');
  removed(root, 'third-party/index.js.map');
  removed(root, 'third-party/types.d.mts');
  removed(root, 'keep/index.js.map');
  // Target runtime binaries and JS stay intact.
  kept(root, 'node-pty/prebuilds/win32-x64/pty.node');
  kept(root, 'better-sqlite3/build/Release/better_sqlite3.node');
  kept(root, '@img/sharp-win32-x64/lib.js');
  kept(root, '@img/sharp-wasm32/lib/sharp-wasm32.node.wasm');
  kept(root, '@esbuild/win32-x64/pkg/package.json');
  kept(root, '@cat-cafe/shared/dist/index.js');
  kept(root, 'keep/index.js');
});

test('explicitly keeping SWC leaves the other optimizations active', (t) => {
  const root = makeDependencyFixture(t);
  const result = pruneFrozenRuntimeRedundancy(root, { swc: false, platform: true, maps: true });
  kept(root, '@next/swc-win32-x64-msvc/swc.node');
  assert.equal(result.byCategory.platform.files, 11);
  assert.equal(result.byCategory.maps.files, 2);
});

test('rejects platform pruning for an unsupported target', (t) => {
  assert.throws(
    () => pruneFrozenRuntimeRedundancy(makeDependencyFixture(t), { platform: true, target: 'darwin-arm64' }),
    /Unsupported prune target/,
  );
});

test('disabled categories stay untouched and dry run does not delete', (t) => {
  const root = makeDependencyFixture(t);
  assert.equal(
    pruneFrozenRuntimeRedundancy(root, { swc: false, platform: false, maps: false, devArtifacts: false }).removedFiles,
    0,
  );
  const dry = pruneFrozenRuntimeRedundancy(root, { maps: true, devArtifacts: true, dryRun: true });
  assert.equal(dry.removedFiles, 10);
  kept(root, 'third-party/index.js.map');
  kept(root, 'node-pty/prebuilds/win32-x64/conpty.pdb');
});

test('pruneFrozenPackageTree removes duplicate bundled plugin archives, TS sources, and web dev clutter while preserving first-party sourcemaps and runtime assets', (t) => {
  const deployRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frozen-pkg-prune-'));
  t.after(() => fs.rmSync(deployRoot, { recursive: true, force: true }));
  const put = (relative, bytes = 16) => {
    const file = path.join(deployRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x'.repeat(bytes));
  };
  put('api/dist/index.desktop.js', 100);
  put('api/dist/index.desktop.js.map', 200);
  put('api/dist/domains/plugin/bundled-packages/index.json', 32);
  put('api/dist/domains/plugin/bundled-packages/chatgpt-dot/0.2.0/package.tgz', 500);
  put('api/src/domains/plugin/bundled-packages/chatgpt-dot/0.2.0/package.tgz', 500);
  put('api/src/index.ts', 64);
  put('api/src/plugins/runtime/native.swift', 32);
  put('api/src/marketplace/catalog-data/claude.json', 32);
  put('api/vendor/clowder-ai-plugin-contract.tgz', 128);
  put('mcp-server/dist/index.js', 40);
  put('mcp-server/dist/index.js.map', 40);
  put('mcp-server/dist/index.d.ts', 24);
  put('mcp-server/src/index.ts', 40);
  put('web/.next/BUILD_ID', 12);
  put('web/color-audit-report.json', 80);
  put('web/eslint-plugins/index.js', 32);
  put('web/vitest.config.ts', 24);

  const result = pruneFrozenPackageTree(deployRoot, { devArtifacts: true });
  assert.equal(result.byCategory.devArtifacts.files, 8);
  removed(deployRoot, 'api/src/domains/plugin/bundled-packages/chatgpt-dot/0.2.0/package.tgz');
  removed(deployRoot, 'api/src/index.ts');
  removed(deployRoot, 'api/vendor/clowder-ai-plugin-contract.tgz');
  removed(deployRoot, 'mcp-server/dist/index.d.ts');
  removed(deployRoot, 'mcp-server/src/index.ts');
  removed(deployRoot, 'web/color-audit-report.json');
  removed(deployRoot, 'web/eslint-plugins/index.js');
  removed(deployRoot, 'web/vitest.config.ts');
  // First-party sourcemaps and runtime assets remain intact.
  kept(deployRoot, 'api/dist/index.desktop.js');
  kept(deployRoot, 'api/dist/index.desktop.js.map');
  kept(deployRoot, 'api/dist/domains/plugin/bundled-packages/index.json');
  kept(deployRoot, 'api/dist/domains/plugin/bundled-packages/chatgpt-dot/0.2.0/package.tgz');
  kept(deployRoot, 'api/src/plugins/runtime/native.swift');
  kept(deployRoot, 'api/src/marketplace/catalog-data/claude.json');
  kept(deployRoot, 'mcp-server/dist/index.js');
  kept(deployRoot, 'mcp-server/dist/index.js.map');
  kept(deployRoot, 'web/.next/BUILD_ID');
});

test('pruneFrozenPackageTree keeps api/src bundled-packages when dist index is absent', (t) => {
  const deployRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'frozen-pkg-guard-'));
  t.after(() => fs.rmSync(deployRoot, { recursive: true, force: true }));
  const tgz = path.join(deployRoot, 'api/src/domains/plugin/bundled-packages/chatgpt-dot/0.2.0/package.tgz');
  fs.mkdirSync(path.dirname(tgz), { recursive: true });
  fs.writeFileSync(tgz, 'archive');
  pruneFrozenPackageTree(deployRoot, { devArtifacts: true });
  kept(deployRoot, 'api/src/domains/plugin/bundled-packages/chatgpt-dot/0.2.0/package.tgz');
});
