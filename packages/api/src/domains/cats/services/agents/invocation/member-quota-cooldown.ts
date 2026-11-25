import { catRegistry } from '@cat-cafe/shared';
import { readKimiQuotaView } from '../../../../../config/kimi-quota-store.js';

/**
 * Member quota cooldown.
 *
 * A provider quota failure (Kimi's rolling 5-hour window, for example) is only
 * visible to the dispatching call once the CLI has already failed, so every
 * retry spawns the CLI again and surfaces the same opaque
 * `CLI 异常退出 (code: 1, signal: none) [quota_exceeded]`. Remember the
 * failure for the rest of the window so the next dispatch can refuse with the
 * member, the window and the reset time instead.
 */
export interface MemberQuotaBlock {
  readonly catId: string;
  readonly reason: 'cli_quota_exceeded' | 'observed_quota_exhausted';
  readonly blockedUntil: number;
  readonly windowMs: number;
  readonly detail?: string;
}

/** Kimi Code meters a rolling 5-hour window; every other provider refreshes sooner. */
const KIMI_WINDOW_MS = 5 * 60 * 60 * 1000;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

const blocks = new Map<string, MemberQuotaBlock>();

function windowFor(catId: string): number {
  return catRegistry.tryGet(catId)?.config.clientId === 'kimi' ? KIMI_WINDOW_MS : DEFAULT_WINDOW_MS;
}

function memberLabel(catId: string): string {
  const config = catRegistry.tryGet(catId)?.config;
  return config?.displayName || config?.name || catId;
}

function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleString('zh-CN', { hour12: false });
}

/** Record that a member's provider reported quota exhaustion. */
export function noteMemberQuotaExhausted(
  catId: string,
  options?: { windowMs?: number; detail?: string },
): MemberQuotaBlock {
  const windowMs = options?.windowMs ?? windowFor(catId);
  const block: MemberQuotaBlock = {
    catId,
    reason: 'cli_quota_exceeded',
    blockedUntil: Date.now() + windowMs,
    windowMs,
    ...(options?.detail ? { detail: options.detail } : {}),
  };
  blocks.set(catId, block);
  return block;
}

/** Clear a cooldown, e.g. after the operator confirms the window reopened. */
export function clearMemberQuotaBlock(catId: string): void {
  blocks.delete(catId);
}

/** Test seam: drop every recorded cooldown. */
export function resetMemberQuotaBlocks(): void {
  blocks.clear();
}

/** Remaining percent of the smallest observed Kimi window, when one was sampled. */
function observedQuotaRemaining(catId: string): { remainingPercent: number; resetsAt?: string } | undefined {
  const config = catRegistry.tryGet(catId)?.config;
  if (!config || config.clientId !== 'kimi') return undefined;
  const accountRef = config.accountRef;
  if (!accountRef) return undefined;
  const view = readKimiQuotaView(process.cwd(), accountRef);
  const items = view.kimiQuota?.items;
  if (!items?.length) return undefined;
  let remainingPercent = 100;
  let resetsAt: string | undefined;
  for (const item of items) {
    const remaining = item.percentKind === 'remaining' ? item.usedPercent : 100 - item.usedPercent;
    if (remaining < remainingPercent) {
      remainingPercent = remaining;
      resetsAt = item.resetsAt;
    }
  }
  return { remainingPercent, ...(resetsAt ? { resetsAt } : {}) };
}

/**
 * Whether a dispatch to this member should be refused before it reaches the CLI.
 *
 * Returns null when the member may be dispatched.
 */
export function describeMemberQuotaBlock(catId: string): { message: string; blockedUntil: number } | null {
  const status = describeMemberQuotaStatus(catId);
  if (status.available) return null;
  return { blockedUntil: status.blockedUntil ?? Date.now(), message: status.message ?? '' };
}

/** Operator-facing snapshot of one member's quota state. */
export interface MemberQuotaStatus {
  readonly catId: string;
  readonly available: boolean;
  readonly blockedUntil?: number;
  readonly message?: string;
  readonly observed?: { remainingPercent: number; resetsAt?: string };
}

/** Describe a member's quota state without mutating it beyond recording an observed exhaustion. */
export function describeMemberQuotaStatus(catId: string): MemberQuotaStatus {
  const now = Date.now();
  const block = blocks.get(catId);
  if (block) {
    if (block.blockedUntil <= now) {
      blocks.delete(catId);
    } else {
      return {
        catId,
        available: false,
        blockedUntil: block.blockedUntil,
        message: `@${catId}（${memberLabel(catId)}）额度已用尽，预计 ${formatClock(block.blockedUntil)} 后恢复；请换一只猫或稍后重试。`,
      };
    }
  }
  const observed = observedQuotaRemaining(catId);
  if (observed && observed.remainingPercent <= 0) {
    const parsed = observed.resetsAt ? Date.parse(observed.resetsAt) : Number.NaN;
    const blockedUntil = Number.isFinite(parsed) ? parsed : now + windowFor(catId);
    blocks.set(catId, {
      catId,
      reason: 'observed_quota_exhausted',
      blockedUntil,
      windowMs: windowFor(catId),
      detail: observed.resetsAt,
    });
    return {
      catId,
      available: false,
      blockedUntil,
      message: `@${catId}（${memberLabel(catId)}）额度已用尽，预计 ${formatClock(blockedUntil)} 后恢复；请换一只猫或稍后重试。`,
      observed,
    };
  }
  return { catId, available: true, ...(observed ? { observed } : {}) };
}
