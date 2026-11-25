import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveDefaultThreadWorkspace } from '../../cats/services/agents/invocation/default-thread-workspace.js';

const MAX_SLUG_LENGTH = 40;

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug.length >= 2 ? slug : 'novel-project';
}

/**
 * Give a new editorial thread a durable working directory.
 *
 * Kimi, Codex and Claude members refuse to spawn without an explicit cwd, and
 * the platform refuses a cwd that sits inside the disposable runtime checkout.
 * A thread created as `projectPath: 'default'` therefore cannot wake those
 * members at all — every chapter dispatch fails with "Kimi MCP injection
 * requires an explicit working directory".
 *
 * Returns null when this host has no persistent workspace configured, so
 * project creation keeps working and the provider requirement still surfaces
 * as an invocation error instead of a create-time one.
 */
export async function resolveEditorialThreadWorkspace(title: string): Promise<string | null> {
  const workspace = await resolveDefaultThreadWorkspace();
  if (!workspace.ok) return null;
  const directory = join(workspace.path, 'novel-studio', slugify(title));
  await mkdir(directory, { recursive: true });
  return directory;
}
