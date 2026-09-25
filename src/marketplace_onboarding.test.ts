import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onboard, type callInfrai } from './marketplace_onboarding.ts';

const input = {
  seller: { id: 'creator-8', email: 'editor@example.org', domain: 'example.org' },
  buyer: { id: 'publisher-2', email: 'desk@example.net' },
  order: { id: 'order-12', assetId: 'photo-9', title: 'Cover photo' },
  txt: { name: '_marketplace.example.org', content: 'proof-creator-8' }
};

test('holds the asset handoff until the TXT proof is confirmed', async () => {
  const calls: string[] = [];
  const pending = await onboard(input, (async (_method, path, params) => {
    calls.push(path);
    if (path === '/v1/dns/domain/add') return { zone_id: 'zone-1' };
    if (path === '/v1/dns/record/upsert') {
      assert.equal(params.zone_id, 'zone-1');
      assert.equal(params.record_type, 'TXT');
    }
    if (path === '/v1/dns/domain/verify') return { verified: false };
    return null;
  }) as typeof callInfrai);
  assert.equal(pending.state, 'awaiting_domain_proof');
  assert.equal(pending.handoff, null);
  assert.equal(calls.includes('/v1/auth/user/get_by_email'), false);

  const ready = await onboard(input, (async (_method, path) => {
    if (path === '/v1/dns/domain/add') return { zone_id: 'zone-1' };
    if (path === '/v1/dns/domain/verify') return { verified: true };
    if (path === '/v1/auth/user/get_by_email') return { id: 'user-4' };
    return null;
  }) as typeof callInfrai);
  assert.equal(ready.state, 'ready_for_handoff');
  assert.deepEqual(ready.handoff, { orderId: 'order-12', assetId: 'photo-9', from: 'creator-8', to: 'publisher-2' });
  assert.equal(ready.buyerUpdate?.recipient, 'desk@example.net');
});
