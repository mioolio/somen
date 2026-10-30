/** 边界：验证通用导航的模块选择与注册隔离；使用虚构平台，不连接本机业务。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, createMemoryHistory } from 'vue-router';
import { validatePanelRegistration } from '../shell/registration-contract.js';
import { findActivePlatform, findActiveModule, platformModules } from '../shell/navigation.js';

const manifest = { id: 'alpha', path: '/alpha' };
function platform(overrides = {}) {
  return {
    id: 'alpha', path: '/alpha', label: '甲平台',
    routes: [
      { path: '/alpha', name: 'alpha.selector' },
      { path: '/alpha/workspace', name: 'alpha.workspace' },
    ],
    navigation: [
      { id: 'selector', label: '选择器', path: '/alpha' },
      { id: 'workspace', label: '工作', path: '/alpha/workspace' },
    ],
    ...overrides,
  };
}

test('independent modules select one most-specific navigation entry', () => {
  const registration = platform();
  assert.equal(findActiveModule(registration, '/alpha')?.id, 'selector');
  assert.equal(findActiveModule(registration, '/alpha/workspace')?.id, 'workspace');
  assert.equal(findActiveModule(registration, '/alpha/workspace/contacts')?.id, 'workspace');
  assert.equal(findActiveModule(registration, '/alpha/workspace/')?.id, 'workspace');
  assert.equal(findActiveModule(registration, '/alpha-other'), undefined);
});

test('platform boundaries do not confuse similar platform prefixes', () => {
  const platforms = [platform(), { id: 'alpha-tools', path: '/alpha-tools' }];
  assert.equal(findActivePlatform(platforms, '/alpha-tools')?.id, 'alpha-tools');
  assert.equal(findActivePlatform(platforms, '/alpha/workspace')?.id, 'alpha');
  assert.equal(findActivePlatform(platforms, '/absent'), undefined);
});

test('legacy registrations keep their single entry without navigation', () => {
  const registration = platform({ navigation: undefined });
  assert.doesNotThrow(() => validatePanelRegistration(registration, manifest));
  assert.deepEqual(platformModules(registration), [{ label: '甲平台', path: '/alpha' }]);
  assert.equal(findActiveModule(registration, '/alpha/child')?.path, '/alpha');
});

test('navigation ids are optional and nested routes resolve under their parent', () => {
  const registration = platform({
    routes: [{ path: '/alpha', name: 'alpha.root', children: [{ path: 'workspace', name: 'alpha.workspace' }] }],
    navigation: [{ label: '工作', path: '/alpha/workspace' }],
  });
  assert.doesNotThrow(() => validatePanelRegistration(registration, manifest));
});

test('navigation must stay within the plugin and reference an actual route', () => {
  for (const path of ['/other', '/alpha-other', '/alpha/../other', '/alpha/missing']) {
    assert.throws(() => validatePanelRegistration(platform({ navigation: [{ label: '入口', path }] }), manifest));
  }
});

test('duplicate navigation paths, labels and ids are rejected', () => {
  for (const items of [
    [{ label: '甲', path: '/alpha' }, { label: '乙', path: '/alpha/' }],
    [{ label: '工作', path: '/alpha' }, { label: '工作', path: '/alpha/workspace' }],
    [{ id: 'same', label: '甲', path: '/alpha' }, { id: 'same', label: '乙', path: '/alpha/workspace' }],
    [{ id: '', label: '甲', path: '/alpha' }],
  ]) assert.throws(() => validatePanelRegistration(platform({ navigation: items }), manifest));
});

test('registered aliases can provide module navigation', () => {
  const registration = platform({
    routes: [{ path: '/alpha', name: 'alpha.root', alias: '/alpha/selector' }],
    navigation: [{ label: '选择器', path: '/alpha/selector' }],
  });
  assert.doesNotThrow(() => validatePanelRegistration(registration, manifest));
});

test('relative child modules inherit registered parent aliases', () => {
  const registration = platform({
    routes: [{
      path: '/alpha', alias: '/alpha/alias', name: 'alpha.root',
      children: [{ path: 'workspace', name: 'alpha.workspace' }],
    }],
    navigation: [{ label: '工作', path: '/alpha/alias/workspace' }],
  });
  const router = createRouter({ history: createMemoryHistory(), routes: registration.routes });
  assert.equal(router.resolve('/alpha/alias/workspace').name, 'alpha.workspace');
  assert.doesNotThrow(() => validatePanelRegistration(registration, manifest));
});
