import { scanWindowsProcesses } from '../server/probe.mjs';
import { versionDefinition } from './agent-sources.mjs';

/** Boundary: revalidate PID lifetime, binary-backed account proof and requested work account before native access. */
export async function requireBinding(binding, { allowValidation = false } = {}) {
  if (!binding || !Number.isSafeInteger(binding.pid) || binding.pid < 1 || typeof binding.startedAt !== 'string'
    || typeof binding.accountId !== 'string' || typeof binding.version !== 'string') throw Object.assign(new Error('工作微信绑定无效。'), { code: 'WORK_BINDING_INVALID' });
  const definition = await versionDefinition(binding.version);
  if (definition.nativeValidation?.contacts !== true && !(allowValidation === true && definition.staticAbiVerified?.contacts === true)) {
    throw Object.assign(new Error('当前版本联系人适配尚未验证。'), { code: 'NATIVE_CONTACTS_UNVERIFIED' });
  }
  const snapshot = await scanWindowsProcesses();
  const current = snapshot.processes.find(row => row.pid === binding.pid && row.startedAt === binding.startedAt);
  if (!current || current.version !== binding.version || !current.accounts.some(account => account.verified === true
    && account.source === 'verified-current-account' && account.id === binding.accountId)) {
    throw Object.assign(new Error('工作微信已退出或账号发生变化。'), { code: 'WORK_ACCOUNT_CHANGED' });
  }
  return { ...binding, executablePath: current.executablePath, dllSha256: definition.dllSha256 };
}
