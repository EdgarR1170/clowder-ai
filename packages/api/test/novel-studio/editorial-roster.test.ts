import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type EditorialRosterCandidate,
  resolveEditorialCatRoster,
} from '../../src/domains/novel-studio/coordinator/editorial-roster.js';

function candidate(input: {
  id: string;
  family?: string;
  lead?: boolean;
  roles?: readonly string[];
}): EditorialRosterCandidate {
  return {
    id: input.id,
    family: input.family ?? input.id,
    lead: input.lead ?? false,
    roles: input.roles ?? ['assistant'],
  };
}

const referenceHost = [
  candidate({ id: 'opus', family: 'ragdoll', lead: true, roles: ['architect'] }),
  candidate({ id: 'kimi', family: 'kimi' }),
  candidate({ id: 'gemini', family: 'gemini' }),
  candidate({ id: 'codex', family: 'maine-coon' }),
];

describe('Clowder-Novel: editorial roster binds only to registered cats', () => {
  it('keeps the reference binding on a host that carries all five members', () => {
    const roster = resolveEditorialCatRoster({ candidates: referenceHost });
    assert.deepEqual(roster, {
      chiefEditorCatId: 'opus',
      architectCatId: 'opus',
      writerCatId: 'kimi',
      specialistCatId: 'gemini',
      criticCatId: 'codex',
    });
  });

  it('never binds a role to an unregistered cat', () => {
    const host = [candidate({ id: 'dsh-desktop', family: 'dsh-desktop', lead: true }), candidate({ id: 'kimi' })];
    const roster = resolveEditorialCatRoster({ candidates: host });
    const registered = new Set(host.map((entry) => entry.id));
    for (const catId of Object.values(roster)) assert.ok(registered.has(catId), `${catId} must be registered`);
  });

  it('drops a stale explicit choice instead of persisting an un-runnable project', () => {
    const host = [candidate({ id: 'dsh-desktop', family: 'dsh-desktop', lead: true }), candidate({ id: 'kimi' })];
    const roster = resolveEditorialCatRoster({
      requested: { chiefEditorCatId: 'opus', architectCatId: 'opus' },
      candidates: host,
    });
    assert.equal(roster.chiefEditorCatId, 'dsh-desktop');
    assert.equal(roster.architectCatId, 'dsh-desktop');
  });

  it('honours an explicit choice that names a registered cat', () => {
    const host = [candidate({ id: 'dsh-desktop', family: 'dsh-desktop', lead: true }), candidate({ id: 'kimi' })];
    const roster = resolveEditorialCatRoster({ requested: { writerCatId: 'dsh-desktop' }, candidates: host });
    assert.equal(roster.writerCatId, 'dsh-desktop');
  });

  it('keeps the critic in a different family from the writer when one exists', () => {
    const host = [candidate({ id: 'dsh-desktop', family: 'dsh-desktop', lead: true }), candidate({ id: 'kimi' })];
    const roster = resolveEditorialCatRoster({ candidates: host });
    const familyOf = (catId: string) => host.find((entry) => entry.id === catId)?.family;
    assert.notEqual(familyOf(roster.criticCatId), familyOf(roster.writerCatId));
  });

  it('refuses to invent a roster when no cat is registered', () => {
    assert.throws(() => resolveEditorialCatRoster({ candidates: [] }), /No cat is registered/);
  });
});
