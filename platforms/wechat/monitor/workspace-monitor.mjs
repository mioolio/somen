import { fileURLToPath } from 'node:url';
import { createEventLog } from './event-log.mjs';
import { createWorkspaceStore } from './workspace-store.mjs';
import { inspectWorkspaceIdentity, requireWorkspaceIdentity, sessionReference } from './identity.mjs';
import { observeHost } from './host-observer.mjs';
import { observeChild } from './child-observer.mjs';
import { readWindowsCrashEvents } from './crash-events.mjs';

/**
 * Boundary: exact selected-account tracking, local persistence and revocation only.
 * The injected scan must be a fresh normalized snapshot. This module never sends,
 * reads contacts, switches accounts, or silently reacquires a replacement PID.
 */
export function createWorkspaceMonitor({
  scan,
  directory = fileURLToPath(new URL('../../../.local/wechat/', import.meta.url)),
  intervalMs = 10000,
  now = Date.now,
  onState = () => {},
  logger = createEventLog({ directory, now }),
  store = createWorkspaceStore({ directory }),
  processRef = process,
  readCrashEvents = readWindowsCrashEvents,
} = {}) {
  if (typeof scan !== 'function') throw new TypeError('A fresh workspace scan function is required.');
  let state = { status: 'idle', selected: null, canSend: false, selectedAt: null, lastCheckedAt: null, reason: null };
  let reference = null, timer, inFlight, inFlightGeneration, selectionInFlight, disposed = false, generation = 0, lastHeartbeat = 0;
  let processName = 'Weixin.exe';
  const seenCrashEvents = new Set();
  const childDisposers = new Set();
  const getState = () => structuredClone({ ...state, logStatus: logger.getStatus() });
  const emit = () => { try { onState(getState()); } catch { /* UI observers never own monitoring. */ } };
  const stopTimer = () => { clearTimeout(timer); timer = undefined; };
  const event = async (type, details = {}) => {
    const eventGeneration = generation;
    const logged = await logger.record(type, { ...details, sessionRef: reference });
    if (!logged && generation === eventGeneration && state.status === 'active') interrupt({ code: 'WORKSPACE_LOG_UNAVAILABLE', message: '运行日志暂不可写，已暂停工作微信。' });
    return logged;
  };
  async function collectCrashEvents(selected, currentGeneration, sessionRef) {
    try {
      const records = await readCrashEvents({ pid: selected.pid, startedAt: selected.startedAt, processName, until: new Date(now()).toISOString() });
      if (disposed || currentGeneration !== generation) return;
      state.crashEvents = records;
      for (const record of records) {
        const signature = `${record.eventId}:${record.time}:${record.code}:${record.faultModule}`;
        if (seenCrashEvents.has(signature)) continue;
        seenCrashEvents.add(signature);
        await logger.record('workspace.crash.event', { ...record, sessionRef });
      }
    } catch (error) {
      if (!disposed && currentGeneration === generation) await logger.record('workspace.crash.query.failed', { error, sessionRef });
    }
  }
  function interrupt(reason) {
    if (disposed || !['active', 'interrupted'].includes(state.status)) return;
    if (state.status === 'interrupted' && state.reason?.code === reason.code) return;
    stopTimer();
    state = { ...state, status: 'interrupted', canSend: false, reason };
    void event('workspace.interrupted', { pid: state.selected?.pid, code: reason.code });
    emit();
    schedule();
  }
  function schedule() {
    stopTimer();
    if (disposed || !['active', 'interrupted'].includes(state.status)) return;
    timer = setTimeout(() => { void checkNow().finally(schedule); }, Math.max(1000, intervalMs));
    timer.unref?.();
  }
  async function checkNow() {
    if (disposed || !['active', 'interrupted'].includes(state.status) || !state.selected) return getState();
    if (inFlight && inFlightGeneration === generation) return inFlight;
    const currentGeneration = generation;
    inFlightGeneration = currentGeneration;
    const operation = (async () => {
      try {
        const snapshot = await scan();
        if (disposed || currentGeneration !== generation) return getState();
        state.lastCheckedAt = new Date(now()).toISOString();
        const reason = inspectWorkspaceIdentity(snapshot, state.selected);
        if (reason) {
          interrupt(reason);
          if (reason.code === 'WORKSPACE_PROCESS_MISSING' || reason.code === 'WORKSPACE_PROCESS_REPLACED') {
            await collectCrashEvents(state.selected, currentGeneration, reference);
          }
        }
        if (now() - lastHeartbeat >= 60000) {
          lastHeartbeat = now();
          const logged = await event('workspace.heartbeat', { pid: state.selected.pid, phase: state.status });
          if (!logged) interrupt({ code: 'WORKSPACE_LOG_UNAVAILABLE', message: '运行日志暂不可写，已暂停工作微信。' });
        }
      } catch (error) {
        if (!disposed && currentGeneration === generation) {
          state.lastCheckedAt = new Date(now()).toISOString();
          await event('workspace.scan.failed', { error });
          interrupt({ code: 'WORKSPACE_SCAN_FAILED', message: '工作微信状态查询失败，请重新选择。' });
        }
      }
      emit();
      return getState();
    })().finally(() => { if (inFlight === operation) inFlight = undefined; });
    inFlight = operation;
    return operation;
  }
  async function performSelection(value) {
    if (disposed) throw Object.assign(new Error('微信跟踪已停止。'), { code: 'MONITOR_DISPOSED' });
    const selected = requireWorkspaceIdentity(value);
    const currentGeneration = ++generation;
    stopTimer();
    state = { ...state, status: 'idle', selected, canSend: false, reason: null };
    reference = sessionReference(selected);
    seenCrashEvents.clear();
    let snapshot;
    try { snapshot = await scan(); }
    catch (error) {
      if (!disposed && currentGeneration === generation) {
        state = { ...state, status: 'interrupted', reason: { code: 'WORKSPACE_SCAN_FAILED', message: '工作微信状态查询失败，请重新选择。' } };
        await event('workspace.select.failed', { pid: selected.pid, error }); emit();
      }
      throw Object.assign(new Error('工作微信状态查询失败，请重新选择。'), { code: 'WORKSPACE_SCAN_FAILED', cause: error });
    }
    if (disposed || currentGeneration !== generation) return getState();
    const reason = inspectWorkspaceIdentity(snapshot, selected);
    if (reason) {
      state = { ...state, status: 'interrupted', lastCheckedAt: new Date(now()).toISOString(), reason };
      await event('workspace.select.rejected', { pid: selected.pid, code: reason.code });
      schedule();
      emit();
      throw Object.assign(new Error(reason.message), { code: reason.code });
    }
    processName = snapshot.instances.find(row => row.pid === selected.pid)?.processName || 'Weixin.exe';
    try {
      await store.write(selected, true);
      const logged = await event('workspace.selected', { pid: selected.pid });
      if (!logged) throw Object.assign(new Error('运行日志暂不可写。'), { code: 'WORKSPACE_LOG_UNAVAILABLE' });
      if (disposed || currentGeneration !== generation) return getState();
      state = { status: 'active', selected, canSend: true, selectedAt: new Date(now()).toISOString(),
        lastCheckedAt: new Date(now()).toISOString(), reason: null };
      lastHeartbeat = now();
      schedule(); emit();
      return getState();
    } catch (error) {
      if (currentGeneration === generation) state = { ...state, status: 'interrupted', canSend: false,
        reason: { code: error.code || 'WORKSPACE_STORE_FAILED', message: '工作微信保存或日志写入失败。' } };
      emit();
      throw error;
    }
  }
  async function select(value) {
    if (selectionInFlight) throw Object.assign(new Error('正在切换工作微信，请稍后。'), { code: 'WORKSPACE_SELECTION_BUSY' });
    const operation = performSelection(value);
    selectionInFlight = operation;
    try { return await operation; }
    finally { if (selectionInFlight === operation) selectionInFlight = undefined; }
  }
  async function restore() {
    try {
      const saved = await store.read();
      if (!saved || disposed) return getState();
      if (saved.enabled) return await select(saved.identity);
      state = { ...state, status: 'stopped', selected: saved.identity };
      reference = sessionReference(saved.identity);
    } catch (error) {
      if (state.status !== 'interrupted') state = { ...state, status: 'interrupted', canSend: false,
        reason: { code: error.code || 'WORKSPACE_RESTORE_FAILED', message: '工作微信未恢复，请重新选择。' } };
      await event('workspace.restore.failed', { error });
    }
    emit(); return getState();
  }
  const releaseHost = observeHost({ processRef, logger, reference: () => reference });
  return {
    select, restore, checkNow, getState,
    recordEvent: event,
    trackChild(child, operation = 'native') {
      if (disposed) throw Object.assign(new Error('微信跟踪已停止。'), { code: 'MONITOR_DISPOSED' });
      const childGeneration = generation, childReference = reference;
      const release = observeChild({ child, operation, logger, reference: () => childReference,
        interrupt: reason => { if (childGeneration === generation) interrupt(reason); } });
      childDisposers.add(release);
      return () => { release(); childDisposers.delete(release); };
    },
    async stop() {
      generation++; stopTimer();
      state = { ...state, status: 'stopped', canSend: false, reason: null };
      if (state.selected) await store.write(state.selected, false);
      await event('workspace.stopped', { pid: state.selected?.pid }); emit();
      return getState();
    },
    async dispose() {
      if (disposed) return;
      disposed = true; generation++; stopTimer();
      state = { ...state, status: 'stopped', canSend: false };
      for (const release of childDisposers) release();
      childDisposers.clear(); releaseHost();
      await event('workspace.disposed', { pid: state.selected?.pid });
      await logger.dispose();
    },
  };
}
