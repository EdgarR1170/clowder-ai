import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function nodeOptionsWithSigusr1Guard(guardPath, inherited = process.env.NODE_OPTIONS) {
  const guard = `--import ${pathToFileURL(guardPath).href}`;
  const existing = inherited?.trim();
  return existing ? `${guard} ${existing}` : guard;
}

/** Match the POSIX shell loop: 0 and 130 are clean stops; every other exit restarts. */
export function shouldStopDev(exitCode, signal) {
  return exitCode === 0 || exitCode === 130 || signal === 'SIGINT';
}

export function resolveTsxCli(root = packageRoot) {
  const require = createRequire(join(root, 'package.json'));
  return join(dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs');
}

export function devEnvironment({ root = packageRoot, inherited = process.env.NODE_OPTIONS } = {}) {
  return {
    ...process.env,
    NODE_OPTIONS: nodeOptionsWithSigusr1Guard(join(root, 'scripts', 'sigusr1-guard.mjs'), inherited),
  };
}

function waitForExit(child) {
  return new Promise((resolveExit) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveExit(result);
    };
    child.once('error', (error) => finish({ code: 1, signal: null, error }));
    child.once('exit', (code, signal) => finish({ code, signal, error: null }));
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export async function runDevSupervisor({
  root = packageRoot,
  tsxCli = resolveTsxCli(root),
  spawnChild = spawn,
  exit = (code) => process.exit(code),
  sleepFn = sleep,
  log = console,
} = {}) {
  let stopping = false;
  let activeChild = null;
  const requestStop = (signal) => {
    if (stopping) return;
    stopping = true;
    activeChild?.kill(signal);
  };
  const onSigint = () => requestStop('SIGINT');
  const onSigterm = () => requestStop('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  try {
    while (!stopping) {
      const child = spawnChild(
        process.execPath,
        [tsxCli, 'watch', '--exclude', 'dist/**', '--exclude', '../shared/dist/**', 'src/index.ts'],
        {
          cwd: root,
          env: devEnvironment({ root }),
          stdio: 'inherit',
        },
      );
      activeChild = child;
      const result = await waitForExit(child);
      activeChild = null;

      if (stopping || shouldStopDev(result.code, result.signal)) {
        exit(result.code ?? (result.signal === 'SIGINT' ? 130 : 143));
        return;
      }
      const reason = result.code ?? `signal ${result.signal}`;
      log.error(`[api] dev exited (${reason}) — auto-restarting in 1s`);
      await sleepFn(1000);
    }
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

function isDirectExecution() {
  const entry = process.argv[1];
  if (!entry) return false;
  const script = fileURLToPath(import.meta.url);
  return process.platform === 'win32'
    ? resolve(entry).toLowerCase() === resolve(script).toLowerCase()
    : resolve(entry) === resolve(script);
}

if (isDirectExecution()) await runDevSupervisor();
