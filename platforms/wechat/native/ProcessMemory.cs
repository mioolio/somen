// Boundary: minimal read-only Windows process access. No writes, hooks, injection,
// remote execution, privilege changes, or unrelated process enumeration exist here.
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Somen.Wechat
{
    internal sealed class ProcessMemory : IDisposable
    {
        private IntPtr handle;

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool ReadProcessMemory(IntPtr process, IntPtr address,
            byte[] buffer, IntPtr size, out IntPtr bytesRead);
        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetProcessTimes(IntPtr process, out long creation,
            out long exit, out long kernel, out long user);

        public ProcessMemory(int processId, long expectedStartTicks)
        {
            // QUERY_INFORMATION | VM_READ, deliberately excluding VM_WRITE/OPERATION.
            handle = OpenProcess(0x410, false, processId);
            if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            long creation, exit, kernel, user;
            if (!GetProcessTimes(handle, out creation, out exit, out kernel, out user)
                || DateTime.FromFileTimeUtc(creation).Ticks != expectedStartTicks)
            {
                Dispose();
                throw new InvalidOperationException("The process changed during inspection.");
            }
        }

        public byte[] Read(long address, int size)
        {
            if (address < 0x10000 || size < 1 || size > 4096)
                throw new InvalidOperationException("Invalid bounded process read.");
            byte[] result = new byte[size];
            IntPtr count;
            if (!ReadProcessMemory(handle, new IntPtr(address), result, new IntPtr(size), out count)
                || count.ToInt64() != size)
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return result;
        }

        public long Pointer(long address) { return BitConverter.ToInt64(Read(address, 8), 0); }
        public int Integer(long address) { return BitConverter.ToInt32(Read(address, 4), 0); }

        public void RequireBytes(long address, byte[] expected)
        {
            byte[] actual = Read(address, expected.Length);
            for (int i = 0; i < expected.Length; i++)
                if (actual[i] != expected[i])
                    throw new InvalidOperationException("Loaded account code differs from the verified profile.");
        }

        public void Dispose()
        {
            if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; }
        }
    }
}
