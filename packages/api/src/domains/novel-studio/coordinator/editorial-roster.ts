import { catRegistry, type EditorialCatRosterBinding } from '@cat-cafe/shared';
import { getRoster } from '../../../config/cat-config-loader.js';

/** One registered member the editorial roster may bind to. */
export interface EditorialRosterCandidate {
  readonly id: string;
  readonly family: string;
  readonly lead: boolean;
  readonly roles: readonly string[];
}

/**
 * The roster this repository was developed against.
 *
 * Hosts that still carry all five members keep the exact binding they had, so
 * this resolution only changes behaviour where a member is actually missing.
 */
const REFERENCE_ROSTER: EditorialCatRosterBinding = {
  chiefEditorCatId: 'opus',
  architectCatId: 'opus',
  writerCatId: 'kimi',
  specialistCatId: 'gemini',
  criticCatId: 'codex',
};

/** Snapshot of the members this host can actually wake. */
export function collectRegisteredRosterCandidates(): EditorialRosterCandidate[] {
  const roster = getRoster();
  const candidates: EditorialRosterCandidate[] = [];
  for (const config of Object.values(catRegistry.getAllConfigs())) {
    const entry = roster[config.id];
    if (entry?.available === false) continue;
    candidates.push({
      id: config.id,
      family: entry?.family ?? config.id,
      lead: entry?.lead ?? false,
      roles: entry?.roles ?? ['assistant'],
    });
  }
  return candidates;
}

/**
 * Bind every editorial role to a cat this host has registered.
 *
 * A project created without an explicit roster used to be pinned to
 * opus/kimi/gemini/codex. On any host that does not run all five, the first
 * outline request enqueues to a cat that is not registered and Queue admission
 * rejects it with "Queue admission has no valid target" before a single chapter
 * is planned. Resolve the seats from the live catalog instead:
 *
 * - an explicit request wins when it names a registered cat, otherwise it is
 *   ignored rather than persisted into an un-runnable project;
 * - the editorial seat prefers a lead cat, the critic prefers a different
 *   family from the writer (the cross-family review rule).
 */
export function resolveEditorialCatRoster(input: {
  requested?: Partial<EditorialCatRosterBinding> | undefined;
  candidates: readonly EditorialRosterCandidate[];
}): EditorialCatRosterBinding {
  const [firstCandidate] = input.candidates;
  if (!firstCandidate) {
    throw new Error('No cat is registered on this host; add a member account before creating a novel project.');
  }

  const registered = new Set(input.candidates.map((candidate) => candidate.id));
  const requested = (catId?: string): string | undefined => (catId && registered.has(catId) ? catId : undefined);
  const firstWith = (predicate: (candidate: EditorialRosterCandidate) => boolean): string | undefined =>
    input.candidates.find(predicate)?.id;
  const familyOf = (catId: string): string | undefined =>
    input.candidates.find((candidate) => candidate.id === catId)?.family;

  const hasRequest = Object.values(input.requested ?? {}).some((catId) => requested(catId));
  const referenceComplete = Object.values(REFERENCE_ROSTER).every((catId) => registered.has(catId));
  if (!hasRequest && referenceComplete) return { ...REFERENCE_ROSTER };

  const chiefEditorCatId =
    requested(input.requested?.chiefEditorCatId) ?? firstWith((c) => c.lead) ?? firstCandidate.id;
  const architectCatId =
    requested(input.requested?.architectCatId) ?? firstWith((c) => c.roles.includes('architect')) ?? chiefEditorCatId;
  const writerCatId =
    requested(input.requested?.writerCatId) ?? firstWith((c) => c.id !== chiefEditorCatId) ?? chiefEditorCatId;
  const specialistCatId =
    requested(input.requested?.specialistCatId) ?? firstWith((c) => c.id !== writerCatId) ?? writerCatId;
  const writerFamily = familyOf(writerCatId);
  const criticCatId =
    requested(input.requested?.criticCatId) ?? firstWith((c) => c.family !== writerFamily) ?? writerCatId;

  return { chiefEditorCatId, architectCatId, writerCatId, specialistCatId, criticCatId };
}
