/**
 * Boundary: observation only for one manually authorized sticker/search experiment.
 * No NativeFunction calls, message submission, argument writes or listener detach.
 * String bytes are read only for equality with the bound account/recipient, never emitted.
 */
'use strict';
const HASH = '745cdf2955fa5128cdb00c056c97571156a5f107406a9bb15ac0754f3246b201';
let checks = [];
const defaultHooks = ['qt-select-emoticon', 'qt-search-select-emoticon', 'qt-select-slot-dispatcher'];
const installedHooks = new Set();
let binding, module, deadline = 0, emitted = 0;
let activeHooks = new Set(defaultHooks);
const listeners = [], counts = {}, scopedThreads = new Map();
function readable(p, size) {
  if (p.isNull() || size < 1 || size > 2048) return false;
  const range = Process.findRangeByAddress(p);
  return Boolean(range && range.protection.includes('r') && p.add(size).compare(range.base.add(range.size)) <= 0);
}
function equalString(p, expected) {
  if (!readable(p, 32)) return false;
  const length = p.add(16).readU64().toNumber(), capacity = p.add(24).readU64().toNumber();
  if (length !== expected.length || capacity < length || capacity > 65536 || (capacity < 16 && capacity !== 15)) return false;
  const data = capacity < 16 ? p : p.readPointer();
  return readable(data, length + 1) && data.add(length).readU8() === 0 && data.readUtf8String(length) === expected;
}
function accountMatches() {
  try {
    const manager = module.base.add(0xbd0ce30).readPointer();
    if (!readable(manager, 0x78)) return false;
    const owner = manager.add(0x68).readPointer();
    return readable(owner, 0x68) && owner.readPointer().equals(module.base.add(0x90d4f88)) && equalString(owner.add(0x48), binding.accountId);
  } catch { return false; }
}
function targetAt(p) {
  try { return equalString(p, binding.targetId); } catch { return false; }
}
function isScoped(name, args) {
  const kind = checks.find(([known]) => known === name)?.[3];
  if (kind === 'target-arg2') return targetAt(args[2]);
  if (kind === 'qt-slot') {
    try { return args[0].toInt32() === 1 && readable(args[3],24) && targetAt(args[3].add(16).readPointer()); } catch { return false; }
  }
  if (name === 'qt-content-metacall') {
    try { return args[1].toInt32() === 0 && args[2].toInt32() === 1 && readable(args[3], 24) && targetAt(args[3].add(16).readPointer()); } catch { return false; }
  }
  if (kind === 'inherited') return (scopedThreads.get(Process.getCurrentThreadId()) || 0) > 0;
  if (kind === 'count-only') return false;
  if (name.includes('closure')) return targetAt(args[0].add(0x48));
  // Probe only string headers in bounded argument objects; content is never emitted.
  for (const index of [1, 2]) for (const offset of [0, 0x20, 0x40, 0x48]) {
    if (targetAt(args[index].add(offset))) return true;
  }
  return false;
}
function pointerShape(p) {
  try {
    if (!readable(p, 0x80)) return { readable: false };
    const first = p.readPointer();
    const vtableRva = first.compare(module.base) >= 0 && first.compare(module.base.add(module.size)) < 0 ? first.sub(module.base).toString() : null;
    const strings = [];
    for (const offset of [0, 8, 0x18, 0x28, 0x48]) {
      const at = p.add(offset), length = at.add(16).readU64().toNumber(), capacity = at.add(24).readU64().toNumber();
      if (Number.isSafeInteger(length) && Number.isSafeInteger(capacity) && length >= 0 && length <= 4096 && capacity >= length && capacity <= 65536) strings.push({ offset, length, capacity });
    }
    return { readable: true, vtableRva, strings };
  } catch { return { readable: false }; }
}
function stack(context) {
  try {
    return Thread.backtrace(context, Backtracer.ACCURATE).slice(0, 12).map(address => {
      const owner = Process.findModuleByAddress(address);
      return owner ? { module: owner.name, rva: address.sub(owner.base).toString() } : { module: null };
    });
  } catch { return []; }
}
function publish(data) {
  if (emitted++ < 160) send({ ...data, at: new Date().toISOString() });
}
function kindOf(name) { return checks.find(([known]) => known === name)?.[3]; }
function callbackShape(args) {
  try {
    if (!readable(args[1],24)) return {};
    const controller=args[1].add(16).readPointer();
    if (!readable(controller,0x3e8)) return {};
    const callback=controller.add(0x3e0).readPointer();
    if (!readable(callback,8)) return {};
    const table=callback.readPointer();
    if (!readable(table,24)) return {};
    const invoke=table.add(16).readPointer();
    const inImage=p=>p.compare(module.base)>=0&&p.compare(module.base.add(module.size))<0;
    return {vtableRva:inImage(table)?table.sub(module.base).toString():null,invokeRva:inImage(invoke)?invoke.sub(module.base).toString():null};
  } catch { return {}; }
}
function importCatalog(catalog) {
  if(catalog?.schemaVersion!==1||catalog.version!=='4.2.0.11'||catalog.dllSha256!==HASH||!Array.isArray(catalog.entries)||catalog.entries.length>32)throw Error('OBSERVER_CATALOG');
  const kinds=new Set(['target-arg2','qt-slot','inherited','count-only']);
  for(const item of catalog.entries){
    if(!/^[a-z][a-z0-9-]{1,80}$/.test(item.name)||!/^0x[0-9a-f]{1,8}$/.test(item.rva)||!kinds.has(item.scopeKind)||!/^[0-9a-f]{2}(?: [0-9a-f]{2}){7,63}$/.test(item.prefix))throw Error('OBSERVER_CATALOG_ENTRY');
    const rva=parseInt(item.rva,16);if(rva<0x1000||rva+64>=module.size)throw Error('OBSERVER_CATALOG_RANGE');
    const existing=checks.find(([name])=>name===item.name);
    if(existing&&(existing[1]!==rva||existing[2]!==item.prefix||existing[3]!==item.scopeKind))throw Error('OBSERVER_CATALOG_CHANGED');
    if(!existing)checks.push([item.name,rva,item.prefix,item.scopeKind]);
  }
}
function installHooks(names) {
  if (!Array.isArray(names) || names.some(name => !checks.some(([known]) => name === known))) throw Error('OBSERVER_HOOK_SELECTION');
  const selected = checks.filter(([name]) => names.includes(name));
  // Validate only not-yet-installed selected entries. Old JSAPI hooks are absent
  // from this Qt-only whitelist and can never become an initialization dependency.
  for (const [name, rva, prefix] of selected) {
    if (installedHooks.has(name)) continue;
    const expected = prefix.split(' ').map(value => parseInt(value, 16));
    const actual = new Uint8Array(module.base.add(rva).readByteArray(expected.length));
    if (!expected.every((value, index) => actual[index] === value)) throw Error('OBSERVER_PREFIX:' + name);
  }
  for (const [name, rva] of selected) {
      if (installedHooks.has(name)) continue;
      counts[name] = 0;
      installedHooks.add(name);
      listeners.push(Interceptor.attach(module.base.add(rva), {
        onEnter(args) {
          try {
            this.scoped = false;
            if (!activeHooks.has(name) || Date.now() > deadline || !accountMatches() || emitted >= 160) return;
            counts[name]++;
            const scoped = isScoped(name, args);
            this.scoped = scoped; this.observed = true;
            if (scoped) scopedThreads.set(this.threadId, (scopedThreads.get(this.threadId) || 0) + 1);
            // Unmatched candidates emit counts only; no arbitrary message structures or strings.
            publish({ type: 'sticker-observer.enter', name, rva: `0x${rva.toString(16)}`, targetMatched: scoped,
              ...(scoped ? { shapes: [pointerShape(args[0]), pointerShape(args[1]), pointerShape(args[2])],
                ...(name.startsWith('qt-') && readable(args[1], 16) ? { wrap: pointerShape(args[1].readPointer()) } : {}),
                ...(kindOf(name) === 'qt-slot' ? { callback: callbackShape(args) } : {}), stack: stack(this.context) } : {}) });
          } catch { /* Observation must never throw into native client execution. */ }
        },
        onLeave(result) {
          try {
            if (this.scoped) {
              scopedThreads.set(this.threadId, Math.max(0, (scopedThreads.get(this.threadId) || 1) - 1));
              publish({ type: 'sticker-observer.leave', name, zeroReturn: result.isNull() });
            }
          } catch { /* Keep callbacks inert after a diagnostic failure. */ }
        },
      }));
    }
  activeHooks = new Set(names);
}
rpc.exports = {
  start(config) {
    if (binding || config?.pid !== Process.id || config.dllSha256 !== HASH || Process.arch !== 'x64'
      || typeof config.accountId !== 'string' || typeof config.targetId !== 'string') throw Error('OBSERVER_BINDING');
    module = Process.getModuleByName('Weixin.dll');
    if (!module.path.replaceAll('\\', '/').includes('/4.2.0.11/Weixin.dll')) throw Error('OBSERVER_VERSION');
    binding = config;
    importCatalog(config.catalog);
    if (!accountMatches()) throw Error('OBSERVER_ACCOUNT');
    deadline = Date.now() + Math.min(2 * 60 * 60 * 1000, Math.max(30_000, Number(config.durationMs) || 30 * 60 * 1000));
    installHooks(config.hooks || defaultHooks);
    return { ready: true, functions: checks.filter(([name]) => installedHooks.has(name)).map(([name, rva]) => ({ name, rva: `0x${rva.toString(16)}` })), expiresAt: new Date(deadline).toISOString() };
  },
  status() { return { ready: Boolean(binding) && accountMatches(), counts, records: emitted }; },
  arm(config) {
    if (!binding || !accountMatches() || !Number.isInteger(config?.durationMs) || config.durationMs < 0 || config.durationMs > 2 * 60 * 60 * 1000) throw Error('OBSERVER_ARM');
    if (config.catalog) importCatalog(config.catalog);
    if (config.hooks !== undefined) {
      if (!Array.isArray(config.hooks) || config.hooks.some(name => !checks.some(([known]) => name === known))) throw Error('OBSERVER_HOOK_SELECTION');
      installHooks(config.hooks);
    }
    deadline = Date.now() + config.durationMs;
    emitted = 0;
    return { expiresAt: new Date(deadline).toISOString(), hooks: [...activeHooks] };
  },
};
