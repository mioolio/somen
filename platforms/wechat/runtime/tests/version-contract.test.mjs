import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { agentSource, versionDefinition } from '../agent-sources.mjs';

/** Boundary: independent version scripts load without executing native code; unknown/path-traversal versions stay closed. */
for (const version of ['4.2.0.7', '4.2.0.11']) {
  test(`${version} agent definitions are separate, hash-pinned and inert on load`, async () => {
    const manifest = await versionDefinition(version);
    for (const kind of ['contacts', 'send']) {
      const source = await agentSource(kind, version);
      const context = vm.createContext({ rpc: {} });
      vm.runInContext(source, context);
      assert.equal(typeof context.rpc.exports.inspect, 'function');
      assert.match(source, new RegExp(manifest.dllSha256));
      assert.match(source, new RegExp(version.replaceAll('.', '\\.')));
    }
  });
}
test('unknown versions and path escapes cannot resolve native source files', async () => {
  await assert.rejects(versionDefinition('../4.2.0.7'));
  await assert.rejects(versionDefinition('0.0.0.0'), { code: 'NATIVE_VERSION_UNSUPPORTED' });
  await assert.rejects(agentSource('../contacts', '4.2.0.7'));
});
