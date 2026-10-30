import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retainNativeOwner } from '../resident-owner.mjs';

/** Boundary: a failed factory must keep strong callback owners until target termination, without native access. */
test('factory failure retains session/script ownership; unrelated detach does not release it', () => {
  const registry = new Set();
  let detach;
  const session = { detached: { connect(callback) { detach = callback; } } };
  const script = { loaded: false };
  assert.throws(() => {
    const owner = retainNativeOwner(registry, session);
    owner.scripts.add(script);
    throw new Error('synthetic script.load failure');
  });
  assert.equal(registry.size, 1);
  assert.equal([...registry][0].session, session);
  assert.equal([...registry][0].scripts.has(script), true);
  detach('connection-terminated');
  assert.equal(registry.size, 1);
  detach('process-terminated');
  assert.equal(registry.size, 0);
});
