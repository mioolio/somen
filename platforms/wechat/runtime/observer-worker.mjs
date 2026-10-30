import { runWorkerHost } from './worker-host.mjs';
import { openObserverSession } from './observer-session.mjs';

/** Boundary: resident observation worker using the same parent-disconnect lifetime contract. */
runWorkerHost({ sessionFactory: ({ binding, onEvent }) => openObserverSession({
  binding: binding.identity, targetId: binding.targetId, output: binding.output, durationMs: binding.durationMs, onEvent,
}) });
