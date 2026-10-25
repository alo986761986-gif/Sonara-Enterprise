import test from 'node:test';
import assert from 'node:assert/strict';
import { relayQueueKey, relayQueueJobId } from './sonara-r2-https-relay.mjs';

test('relay queue index is timestamp ordered and reversible', () => {
  const id='sr2_12345678-1234-1234-1234-123456789abc';
  const earlier=relayQueueKey(10,id);
  const later=relayQueueKey(1000,id);
  assert.ok(earlier < later);
  assert.equal(relayQueueJobId(later),id);
  assert.match(later,/^relay-v1\/queue\/\d{13}\/sr2_/);
});
