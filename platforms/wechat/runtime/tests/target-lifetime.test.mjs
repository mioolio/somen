import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTargetLifetime } from '../target-lifetime.mjs';

/** Boundary: every non-termination detach keeps the native owner process resident. No Frida or WeChat. */
for (const reason of ['connection-terminated', 'device-lost', 'application-requested', 'process-replaced', 'unknown']) {
  test(`dispose after ${reason} retains owners because the target may still be alive`, () => {
    const lifetime = createTargetLifetime();
    lifetime.observeDetached(reason);
    assert.deepEqual(lifetime.state(), { detached: true, targetTerminated: false });
    assert.deepEqual(lifetime.disposalProof(), { disposed: false, retained: true });
  });
}
test('only explicit target process termination permits owner release', () => {
  const lifetime = createTargetLifetime();
  assert.deepEqual(lifetime.disposalProof(), { disposed: false, retained: true });
  lifetime.observeDetached('process-terminated');
  assert.deepEqual(lifetime.state(), { detached: true, targetTerminated: true });
  assert.deepEqual(lifetime.disposalProof(), { disposed: true });
});
