import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { agentSource } from '../agent-sources.mjs';
import { nativeWorkPending, waitForNativeIdle } from '../native-idle.mjs';

/** Boundary: synthetic ownership/work counters only; no Frida, native calls or process access. */
for (const version of ['4.2.0.7', '4.2.0.11']) {
  test(`${version} completed retained owners allow work, active and unknown owners block`, async () => {
    const context = vm.createContext({ rpc: {} });
    vm.runInContext(await agentSource('send', version), context);
    const run = source => vm.runInContext(source, context);
    run("binding={chatId:'fixture_target'};sendValidated=true;tasks.set('completed',{completed:true});requests.set('old',{status:'accepted'});callbacks.set('old',{destroyed:true});");
    assert.equal(run('pendingSendWork().pendingTasks'), 0);
    assert.equal(run('pendingSendWork().pendingCallbacks'), 0);
    assert.equal(run('pendingSendWork().retainedTasks'), 1);
    assert.equal(run('pendingSendWork().retainedCallbacks'), 1);
    assert.doesNotThrow(() => run("validateRequest({to:'fixture_target',requestId:'fixture-next',text:'fixture'})"));
    // An accepted receipt does not establish native callback destruction.
    run("callbacks.get('old').destroyed=false;");
    assert.throws(() => run('requireSendIdle()'), /E_NATIVE_SEND_BUSY/);
    await assert.rejects(run("prepareImage({to:'fixture_target'})"), /E_NATIVE_SEND_BUSY/);
    run("callbacks.get('old').destroyed=true;requests.get('old').status='executing';");
    assert.throws(() => run('requireSendIdle()'), /E_NATIVE_SEND_BUSY/);
    run("requests.get('old').status='unknown';");
    assert.throws(() => run('requireSendIdle()'), /E_NATIVE_SEND_BUSY/);
    run("requests.get('old').status='failed';tasks.set('unknown',{error:'fixture',cancelled:true});");
    assert.throws(() => run('requireSendIdle()'), /E_NATIVE_SEND_BUSY/);
    run("tasks.get('unknown').completed=true;");
    assert.doesNotThrow(() => run('requireSendIdle()'));
    // Business counters never free the memory referenced by native destructors.
    assert.equal(run('tasks.size'), 2);
    assert.equal(run('callbacks.size'), 1);
  });
}

test('retained memory does not trigger idle polling, active work still does', async () => {
  assert.equal(nativeWorkPending({ retainedTasks: 5, retainedCallbacks: 3 }), false);
  for (const field of ['pendingTasks', 'pendingCallbacks', 'activeReads']) assert.equal(nativeWorkPending({ [field]: 1 }), true);
  const pauses = [], calls = [];
  let first = true;
  const scripts = new Map([
    ['contacts', { exports: { inspect: async () => { calls.push('contacts'); return { retainedTasks: 4 }; } } }],
    ['send', { exports: { inspect: async () => { calls.push('send'); const pendingCallbacks = first ? 1 : 0; first = false; return { pendingCallbacks, retainedCallbacks: 1 }; } } }],
  ]);
  assert.equal(await waitForNativeIdle(scripts, { pause: async ms => pauses.push(ms) }), true);
  assert.deepEqual(pauses, [200]);
  assert.deepEqual(calls, ['contacts', 'send', 'contacts', 'send']);
});

test('busy timeout and inspect errors never become an idle success', async () => {
  let pauses = 0;
  const scripts = new Map([['busy', { exports: { inspect: async () => ({ pendingTasks: 1 }) } }]]);
  assert.equal(await waitForNativeIdle(scripts, { attempts: 3, pause: async () => { pauses++; } }), false);
  assert.equal(pauses, 3);
  const failure = new Error('fixture inspect failure');
  await assert.rejects(waitForNativeIdle(new Map([['error', { exports: { inspect: async () => { throw failure; } } }]])), failure);
});
