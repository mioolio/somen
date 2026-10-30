// Boundary: inspect ONLY selected WeChat processes' existing disk-file handles.
// Paths supply unverified directory candidates, never a claimed current login.
// No directory enumeration or file content is read; all duplicated handles close.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

namespace Somen.Wechat
{
    public sealed class ProcessIdentity
    {
        public int pid;
        public long startTicks;
    }

    public sealed class HandleDiagnostic
    {
        public string code;
        public string message;
    }

    public sealed class HandleReadResult
    {
        public HandleEvidence[] paths;
        public HandleDiagnostic[] warnings;
    }

    public sealed class HandleEvidence
    {
        public int pid;
        public string directory;
        public string path;
    }

    public static class ActiveFileHandles
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct HandleEntry
        {
            public IntPtr Object;
            public UIntPtr ProcessId;
            public UIntPtr Value;
            public uint Access;
            public ushort TraceIndex;
            public ushort TypeIndex;
            public uint Attributes;
            public uint Reserved;
        }

        [DllImport("ntdll.dll")]
        private static extern int NtQuerySystemInformation(int type, IntPtr buffer, int size, out int needed);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);
        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool DuplicateHandle(IntPtr source, IntPtr handle, IntPtr destination,
            out IntPtr copy, uint access, bool inherit, uint options);
        [DllImport("kernel32.dll")]
        private static extern uint GetFileType(IntPtr file);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern uint GetFinalPathNameByHandle(IntPtr file, StringBuilder path, uint length, uint flags);
        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetProcessTimes(IntPtr process, out long creation,
            out long exit, out long kernel, out long user);

        public static HandleReadResult Read(ProcessIdentity[] identities)
        {
            List<HandleEvidence> results = new List<HandleEvidence>();
            List<HandleDiagnostic> warnings = new List<HandleDiagnostic>();
            if (identities == null || identities.Length == 0)
                return new HandleReadResult { paths = results.ToArray(), warnings = warnings.ToArray() };
            Dictionary<int, IntPtr> processes = new Dictionary<int, IntPtr>();
            IntPtr buffer = IntPtr.Zero;
            try
            {
                foreach (ProcessIdentity identity in identities)
                {
                    if (identity == null || identity.pid < 1 || identity.startTicks < 1)
                    {
                        warnings.Add(new HandleDiagnostic { code = "ACCOUNT_PATH_IDENTITY_MISSING",
                            message = "进程创建时间不可用，已跳过活跃目录线索。" });
                        continue;
                    }
                    if (processes.ContainsKey(identity.pid)) continue;
                    IntPtr handle = OpenProcess(0x1040, false, identity.pid); // DUP_HANDLE | QUERY_LIMITED_INFORMATION
                    if (handle == IntPtr.Zero)
                    {
                        warnings.Add(new HandleDiagnostic { code = "ACCOUNT_PATH_ACCESS_UNAVAILABLE",
                            message = "PID " + identity.pid + " 的活跃目录线索不可读取，进程可能已退出或访问受限。" });
                        continue;
                    }
                    long creation, exit, kernel, user;
                    if (!GetProcessTimes(handle, out creation, out exit, out kernel, out user)
                        || DateTime.FromFileTimeUtc(creation).Ticks != identity.startTicks || exit != 0)
                    {
                        CloseHandle(handle);
                        warnings.Add(new HandleDiagnostic { code = "ACCOUNT_PATH_PROCESS_CHANGED",
                            message = "PID " + identity.pid + " 的进程身份已变化，已跳过活跃目录线索。" });
                        continue;
                    }
                    // Retain the identity-checked process handle until the snapshot ends,
                    // preventing a recycled numeric PID from referring to another object.
                    processes[identity.pid] = handle;
                }
                if (processes.Count == 0)
                    return new HandleReadResult { paths = results.ToArray(), warnings = warnings.ToArray() };
                int size = 1024 * 1024, needed = 0, status = 0;
                for (int attempt = 0; attempt < 8; attempt++)
                {
                    buffer = Marshal.AllocHGlobal(size);
                    status = NtQuerySystemInformation(64, buffer, size, out needed);
                    if (status == 0) break;
                    Marshal.FreeHGlobal(buffer); buffer = IntPtr.Zero;
                    if (status != unchecked((int)0xc0000004))
                        throw new InvalidOperationException("System handle inspection unavailable.");
                    size = Math.Max(size * 2, checked(needed + 65536));
                    if (size > 128 * 1024 * 1024)
                        throw new InvalidOperationException("System handle snapshot exceeds its bound.");
                }
                if (buffer == IntPtr.Zero || status != 0)
                    throw new InvalidOperationException("System handle snapshot changed repeatedly.");
                long count = Marshal.ReadIntPtr(buffer).ToInt64();
                int stride = Marshal.SizeOf(typeof(HandleEntry)), header = IntPtr.Size * 2;
                if (count < 0 || count > (size - header) / stride)
                    throw new InvalidOperationException("System handle layout differs.");
                HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                Regex accountPath = new Regex(@"\\(?:xwechat_files|WeChat Files)\\([^\\]+)\\(?:db_storage|Msg|FileStorage)(?:\\|$)", RegexOptions.IgnoreCase);
                for (int i = 0; i < count; i++)
                {
                    HandleEntry entry = (HandleEntry)Marshal.PtrToStructure(
                        new IntPtr(buffer.ToInt64() + header + (long)i * stride), typeof(HandleEntry));
                    ulong rawPid = entry.ProcessId.ToUInt64();
                    IntPtr source;
                    if (rawPid > Int32.MaxValue || !processes.TryGetValue((int)rawPid, out source)) continue;
                    IntPtr copy;
                    if (!DuplicateHandle(source, new IntPtr(unchecked((long)entry.Value.ToUInt64())),
                        GetCurrentProcess(), out copy, 0, false, 2)) continue;
                    try
                    {
                        if (GetFileType(copy) != 1) continue; // FILE_TYPE_DISK only, never query pipes.
                        StringBuilder path = new StringBuilder(2048);
                        uint length = GetFinalPathNameByHandle(copy, path, (uint)path.Capacity, 0);
                        if (length == 0 || length >= path.Capacity) continue;
                        string value = path.ToString();
                        Match match = accountPath.Match(value);
                        if (!match.Success || !seen.Add(rawPid + ":" + match.Groups[1].Value)) continue;
                        results.Add(new HandleEvidence { pid = (int)rawPid,
                            directory = match.Groups[1].Value, path = value });
                    }
                    finally { CloseHandle(copy); }
                }
                return new HandleReadResult { paths = results.ToArray(), warnings = warnings.ToArray() };
            }
            finally
            {
                if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer);
                foreach (IntPtr handle in processes.Values) CloseHandle(handle);
            }
        }
    }
}
