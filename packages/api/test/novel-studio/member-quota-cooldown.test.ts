import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  clearMemberQuotaBlock,
  describeMemberQuotaBlock,
  noteMemberQuotaExhausted,
  resetMemberQuotaBlocks,
} from '../../src/domains/cats/services/agents/invocation/member-quota-cooldown.js';

describe('Clowder-Novel: member quota cooldown', () => {
  afterEach(() => resetMemberQuotaBlocks());

  it('blocks the member that reported quota exhaustion and names the reset clock', () => {
    noteMemberQuotaExhausted('kimi');
    const block = describeMemberQuotaBlock('kimi');
    assert.ok(block, 'kimi must be blocked after a quota failure');
    assert.match(block.message, /@kimi/);
    assert.match(block.message, /额度已用尽/);
    assert.ok(block.blockedUntil > Date.now());
  });

  it('only blocks the member that failed, not its teammates', () => {
    noteMemberQuotaExhausted('kimi');
    assert.equal(describeMemberQuotaBlock('dsh-desktop'), null);
  });

  it('releases the member once the window has passed', () => {
    noteMemberQuotaExhausted('kimi', { windowMs: -1 });
    assert.equal(describeMemberQuotaBlock('kimi'), null);
  });

  it('can be cleared by the operator', () => {
    noteMemberQuotaExhausted('kimi');
    clearMemberQuotaBlock('kimi');
    assert.equal(describeMemberQuotaBlock('kimi'), null);
  });
});
