import fs from 'node:fs';
import path from 'node:path';

/**
 * Packaging redundancy removal for the frozen deployment tree.
 *
 * This runs in the export layer (desktop/scripts/frozen-runtime-deploy.mjs)
 * before startup profiling, so the installer archive, the portable zip and
 * startup profiling all share one verified file set. The archive layer only
 * packages and records integrity; it must not delete files.
 */
const DEPENDENCY_CATEGORIES = {
  swc: [/(?:^|\/)@next\/swc-[^/]+(?:\/|$)/],
  // Only the win32-x64 target is supported; every other platform build is dead weight there.
  // `@img/sharp-wasm32` is intentionally kept: sharp 0.34.5 treats it as a cross-platform fallback.
  platform: [
    /(?:^|\/)@esbuild\/(?:darwin|linux|freebsd|openbsd|netbsd|sunos|aix|android|win32-arm64|win32-ia32)(?:-[^/]+)?(?:\/|$)/,
    /(?:^|\/)@img\/sharp(?:-libvips)?-(?:darwin|linux|linuxmusl|win32-arm64|win32-ia32)(?:-[^/]+)?(?:\/|$)/,
    /(?:^|\/)node-pty\/prebuilds\/(?:darwin|linux|win32-arm64|win32-ia32)(?:-[^/]+)?(?:\/|$)/,
    /(?:^|\/)@anthropic-ai\/claude-agent-sdk-(?:darwin|linux)(?:-[^/]+)?(?:\/|$)/,
  ],
  maps: [/\.map$/],
  // Debug symbols, compile-time type declarations, C/C++ addon build sources, and
  // hoisted workspace source/test trees are never loaded by the Node.js runtime.
  devArtifacts: [
    /\.pdb$/i,
    /\.d\.[cm]?ts$/,
    /(?:^|\/)better-sqlite3\/(?:deps|src)\//,
    /(?:^|\/)node-pty\/(?:deps|src)\//,
    /^@cat-cafe\/[^/]+\/(?:src|test|dist\/__tests__)\//,
  ],
};

function toPosix(relative) {
  return relative.replaceAll('\\', '/');
}

function walkFiles(root, directory = root, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(root, absolute, output);
    else if (entry.isFile())
      output.push({ absolute, relative: toPosix(path.relative(root, absolute)), bytes: fs.statSync(absolute).size });
  }
  return output;
}

function removeEmptyDirs(directory, stopAt) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirs(path.join(directory, entry.name), stopAt);
  }
  if (directory !== stopAt && fs.readdirSync(directory).length === 0) {
    fs.rmdirSync(directory);
  }
}

/**
 * @param {string} root frozen dependency tree (the materialized `node_modules`)
 * @param {{swc?: boolean, platform?: boolean, maps?: boolean, devArtifacts?: boolean, dryRun?: boolean, target?: 'win32-x64'}} options
 * @returns {{removedFiles: number, removedBytes: number, byCategory: Record<string, {files: number, bytes: number}>}}
 */
export function pruneFrozenRuntimeRedundancy(
  root,
  { swc = false, platform = false, maps = false, devArtifacts = false, dryRun = false, target = 'win32-x64' } = {},
) {
  if (platform && target !== 'win32-x64') throw new Error(`Unsupported prune target: ${target}`);
  const enabled = Object.entries({ swc, platform, maps, devArtifacts })
    .filter(([, value]) => value)
    .map(([name]) => name);
  const byCategory = Object.fromEntries(enabled.map((name) => [name, { files: 0, bytes: 0 }]));
  if (enabled.length === 0) return { removedFiles: 0, removedBytes: 0, byCategory };

  let removedFiles = 0;
  let removedBytes = 0;
  for (const file of walkFiles(root)) {
    const category = enabled.find((name) => DEPENDENCY_CATEGORIES[name].some((pattern) => pattern.test(file.relative)));
    if (!category) continue;
    byCategory[category].files++;
    byCategory[category].bytes += file.bytes;
    removedFiles++;
    removedBytes += file.bytes;
    if (!dryRun) fs.rmSync(file.absolute, { force: true });
  }
  if (!dryRun && removedFiles > 0) removeEmptyDirs(root, root);
  return { removedFiles, removedBytes, byCategory };
}

/**
 * Prunes packaging-only redundancy inside exported workspace package trees
 * (`api/`, `mcp-server/`, `web/`) while preserving first-party sourcemaps
 * (such as API linked sourcemaps) and every runtime asset.
 *
 * @param {string} deployRoot frozen export root containing `api/`, `mcp-server/`, `web/`
 * @param {{devArtifacts?: boolean, dryRun?: boolean}} options
 * @returns {{removedFiles: number, removedBytes: number, byCategory: Record<string, {files: number, bytes: number}>}}
 */
export function pruneFrozenPackageTree(deployRoot, { devArtifacts = false, dryRun = false } = {}) {
  const enabled = Object.entries({ devArtifacts })
    .filter(([, value]) => value)
    .map(([name]) => name);
  const byCategory = Object.fromEntries(enabled.map((name) => [name, { files: 0, bytes: 0 }]));
  if (enabled.length === 0) return { removedFiles: 0, removedBytes: 0, byCategory };

  const hasDistBundledPlugins = fs.existsSync(
    path.join(deployRoot, 'api/dist/domains/plugin/bundled-packages/index.json'),
  );
  const patterns = {
    devArtifacts: [
      // Duplicate prebuilt plugin archives under src/ once dist/ holds the built copy.
      ...(hasDistBundledPlugins ? [/^api\/src\/domains\/plugin\/bundled-packages\//] : []),
      // Raw TypeScript sources; non-TS runtime assets (JSON, SVG, .mjs, native files) are preserved.
      /^(?:api|mcp-server)\/src\/.*\.tsx?$/,
      /^mcp-server\/dist\/.*\.d\.[cm]?ts$/,
      // Build-only pnpm install tarballs.
      /^api\/vendor\/.*\.tgz$/,
      // Development/lint artifacts not used by Next.js production server.
      /^web\/(?:color-audit-report\.json|eslint-plugins\/.+|vitest(?:\.[^/]+)?\.config\.ts|\.eslintrc\.json)$/,
    ],
  };

  let removedFiles = 0;
  let removedBytes = 0;
  for (const pkg of ['api', 'mcp-server', 'web']) {
    const pkgDir = path.join(deployRoot, pkg);
    if (!fs.existsSync(pkgDir)) continue;
    let pkgRemoved = 0;
    for (const file of walkFiles(deployRoot, pkgDir)) {
      const category = enabled.find((name) => patterns[name].some((pattern) => pattern.test(file.relative)));
      if (!category) continue;
      byCategory[category].files++;
      byCategory[category].bytes += file.bytes;
      removedFiles++;
      removedBytes += file.bytes;
      pkgRemoved++;
      if (!dryRun) fs.rmSync(file.absolute, { force: true });
    }
    if (!dryRun && pkgRemoved > 0) removeEmptyDirs(pkgDir, pkgDir);
  }
  return { removedFiles, removedBytes, byCategory };
}
