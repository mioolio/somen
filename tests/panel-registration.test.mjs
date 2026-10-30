import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePanelRegistration } from '../apps/panel/shell/registration-contract.js';

/** Boundary: reject foreign routes, names and aliases before they can replace another platform's page. */
test('a platform can own nested routes but cannot overwrite another platform', () => {
  const manifest = { id: 'sample', path: '/sample' };
  const platform = routes => ({ ...manifest, label: '示例', routes });
  assert.doesNotThrow(() => validatePanelRegistration(platform([
    { path: '/sample', name: 'sample.main', children: [{ path: 'instances', name: 'sample.instances' }] },
  ]), manifest));
  for (const route of [
    { path: '/' }, { path: '/foreign' }, { path: '/sample', name: 'foreign.main' },
    { path: '/sample', alias: '/foreign' }, { path: '/sample', children: [{ path: '/foreign' }] },
    { path: '/sample', redirect: '/foreign' },
  ]) assert.throws(() => validatePanelRegistration(platform([route]), manifest));
});
