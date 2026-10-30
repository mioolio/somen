import { open, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { win32 } from 'node:path';

/**
 * Boundary: a trusted verified binding locates its sibling version DLL, never an arbitrary resource path.
 * Stream SHA-256 verification precedes bounded RVA reads; no native code is loaded or invoked.
 */
export async function locateInstalledDll({ version, executablePath }) {
  if (!/^[A-Za-z]:[\\/]/.test(executablePath || '') || !win32.isAbsolute(executablePath || '')
    || win32.basename(executablePath).toLowerCase() !== 'weixin.exe'
    || !/^\d{1,4}(?:\.\d{1,4}){3}$/.test(version || '')) throw invalid();
  try {
    const executable = await realpath(executablePath);
    const path = await realpath(win32.join(win32.dirname(executable), version, 'Weixin.dll'));
    const info = await stat(path);
    if (!info.isFile() || info.size < 4096 || info.size > 1024 * 1024 * 1024) throw invalid();
    return { path, info, key: `${path}:${info.size}:${info.mtimeMs}:${info.ctimeMs}` };
  } catch { throw invalid(); }
}
function invalid() { return Object.assign(new Error('微信安装资源不可读取。'), { code: 'BUILTIN_EMOJI_INSTALLATION_INVALID' }); }
export async function openVerifiedImage({ path, info }, expectedHash) {
  const file = await open(path, 'r');
  try {
    const hash = createHash('sha256');
    for await (const chunk of file.createReadStream({ start: 0, autoClose: false })) hash.update(chunk);
    if (hash.digest('hex') !== expectedHash) throw Object.assign(new Error('微信资源版本校验未通过。'), { code: 'BUILTIN_EMOJI_HASH_MISMATCH' });
    const readAt = async (offset, length) => {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1
        || length > 4 * 1024 * 1024 || offset + length > info.size) throw invalid();
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await file.read(buffer, 0, length, offset);
      if (bytesRead !== length) throw invalid();
      return buffer;
    };
    const dos = await readAt(0, 64);
    if (dos.toString('ascii', 0, 2) !== 'MZ') throw invalid();
    const peOffset = dos.readUInt32LE(0x3c);
    if (peOffset > 1024 * 1024) throw invalid();
    const header = await readAt(peOffset, 24);
    const sectionsCount = header.readUInt16LE(6), optionalBytes = header.readUInt16LE(20);
    if (header.readUInt32LE(0) !== 0x4550 || sectionsCount < 1 || sectionsCount > 96 || optionalBytes > 512) throw invalid();
    const optional = await readAt(peOffset + 24, optionalBytes);
    if (optional.readUInt16LE(0) !== 0x20b) throw invalid();
    const imageBase = optional.readBigUInt64LE(24);
    const tables = await readAt(peOffset + 24 + optionalBytes, sectionsCount * 40);
    const sections = Array.from({ length: sectionsCount }, (_, index) => ({
      rva: tables.readUInt32LE(index * 40 + 12),
      bytes: tables.readUInt32LE(index * 40 + 16), offset: tables.readUInt32LE(index * 40 + 20),
    }));
    return {
      imageBase,
      async readRva(rva, length) {
        const section = sections.find(item => rva >= item.rva && rva + length <= item.rva + item.bytes);
        if (!section) throw invalid();
        return readAt(section.offset + rva - section.rva, length);
      },
      async assertUnchanged() {
        const after = await file.stat();
        if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) throw invalid();
      },
      close: () => file.close(),
    };
  } catch (error) { await file.close(); throw error; }
}
