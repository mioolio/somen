import { openNativeSession } from './native-session.mjs';
import { runWorkerHost } from './worker-host.mjs';

/** Boundary: private IPC worker owns one persistent Frida session; no HTTP or terminal interface. */
runWorkerHost({ sessionFactory: openNativeSession });
