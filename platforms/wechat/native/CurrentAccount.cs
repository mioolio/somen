// Boundary: an exact binary profile resolves ONLY the current account ID. The
// manager's current shared_ptr is checked before and after reading its string.
// Unknown binaries return a diagnostic; no heuristic memory scan is attempted.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Somen.Wechat
{
    public sealed class AccountEvidence
    {
        public string id;
        public string source;
        public string evidence;
        public bool verified;
    }

    public sealed class AccountReadResult
    {
        public AccountEvidence account;
        public string code;
        public string message;
    }

    public static class CurrentAccount
    {
        // Version-specific bytes and offsets belong exclusively to versions/<version>/identity.json.
        private static readonly Dictionary<string, string> Hashes = new Dictionary<string, string>();

        private static string Hash(string path)
        {
            string result;
            FileInfo info = new FileInfo(path);
            string identity = path + ":" + info.Length + ":" + info.LastWriteTimeUtc.Ticks;
            if (Hashes.TryGetValue(identity, out result)) return result;
            using (SHA256 sha = SHA256.Create())
            using (FileStream file = File.OpenRead(path))
                result = BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
            Hashes[identity] = result;
            return result;
        }

        private static string ReadString(ProcessMemory memory, long address)
        {
            byte[] header = memory.Read(address, 32);
            long length = BitConverter.ToInt64(header, 16), capacity = BitConverter.ToInt64(header, 24);
            if (length < 1 || length > 256 || capacity < length || capacity > 1048576
                || (capacity < 16 && capacity != 15))
                throw new InvalidOperationException("Current-account string layout is unavailable.");
            long data = capacity < 16 ? address : BitConverter.ToInt64(header, 0);
            byte[] bytes = memory.Read(data, checked((int)length + 1));
            if (bytes[length] != 0) throw new InvalidOperationException("Account string terminator differs.");
            string value = new UTF8Encoding(false, true).GetString(bytes, 0, (int)length);
            if (!Regex.IsMatch(value, "^[A-Za-z][A-Za-z0-9_.:-]{0,255}$") || value.StartsWith("gh_"))
                throw new InvalidOperationException("Account ID format differs.");
            return value;
        }

        public static AccountReadResult Read(int processId, long expectedStartTicks, AccountProfile[] profiles)
        {
            try
            {
                if (IntPtr.Size != 8)
                    return Failure("ACCOUNT_ARCH_UNSUPPORTED", "账号识别需要 64 位 Windows PowerShell。");
                if (profiles == null || profiles.Length == 0)
                    return Failure("ACCOUNT_PROFILE_UNAVAILABLE", "当前未加载账号版本适配，进程识别仍可使用。");
                using (Process process = Process.GetProcessById(processId))
                {
                    if (process.StartTime.ToUniversalTime().Ticks != expectedStartTicks)
                        return Failure("ACCOUNT_PROCESS_CHANGED", "扫描期间微信进程发生变化，请刷新。");
                    ProcessModule target = null;
                    AccountProfile profile = null;
                    bool modulePresent = false;
                    foreach (ProcessModule module in process.Modules)
                        foreach (AccountProfile candidate in profiles)
                        {
                            candidate.Validate();
                            if (!String.Equals(module.ModuleName, candidate.moduleName, StringComparison.OrdinalIgnoreCase)) continue;
                            modulePresent = true;
                            if (module.FileVersionInfo.FileVersion != candidate.version || Hash(module.FileName) != candidate.dllSha256) continue;
                            if (profile != null)
                                return Failure("ACCOUNT_PROFILE_AMBIGUOUS", "账号版本配置重复，请检查版本适配目录。");
                            target = module; profile = candidate;
                        }
                    if (!modulePresent)
                        return Failure("ACCOUNT_MODULE_UNAVAILABLE", "尚未读取到微信主模块，账号待识别。");
                    if (target == null || profile == null)
                        return Failure("ACCOUNT_VERSION_UNSUPPORTED", "当前微信版本暂未提供已验证的账号读取适配。");
                    profile.RequireImageSize(target.ModuleMemorySize);
                    long baseAddress = target.BaseAddress.ToInt64();
                    using (ProcessMemory memory = new ProcessMemory(processId, expectedStartTicks))
                    {
                        foreach (AccountCodeCheck check in profile.codeChecks)
                            memory.RequireBytes(baseAddress + check.rva, check.bytes);
                        long manager = memory.Pointer(baseAddress + profile.managerPointerRva);
                        if (manager == 0) return Failure("ACCOUNT_NOT_READY", "微信账号尚未就绪。");
                        if (memory.Pointer(manager) != baseAddress + profile.managerVtableRva
                            || memory.Pointer(baseAddress + profile.managerVtableRva + profile.getterSlotOffset) != baseAddress + profile.getterRva)
                            throw new InvalidOperationException("Current-account manager type differs.");
                        long owner = memory.Pointer(manager + profile.ownerOffset), control = memory.Pointer(manager + profile.controlOffset);
                        if (owner == 0 || control == 0) return Failure("ACCOUNT_NOT_READY", "微信账号尚未就绪。");
                        if (memory.Pointer(owner) != baseAddress + profile.ownerVtableRva || memory.Integer(control + profile.strongCountOffset) <= 0)
                            throw new InvalidOperationException("Current-account ownership differs.");
                        string account = ReadString(memory, owner + profile.selfOffset);
                        if (memory.Pointer(baseAddress + profile.managerPointerRva) != manager
                            || memory.Pointer(manager + profile.ownerOffset) != owner || memory.Pointer(manager + profile.controlOffset) != control
                            || memory.Pointer(owner) != baseAddress + profile.ownerVtableRva || memory.Integer(control + profile.strongCountOffset) <= 0
                            || ReadString(memory, owner + profile.selfOffset) != account)
                            return Failure("ACCOUNT_CHANGED", "扫描期间微信账号发生变化，请刷新。");
                        return new AccountReadResult { account = new AccountEvidence { id = account,
                            source = "verified-current-account", verified = true,
                            evidence = profile.moduleName + " " + profile.version + " · SHA-256 校验通过 · 当前账号指针与账号值双重读取一致" } };
                    }
                }
            }
            catch (System.ComponentModel.Win32Exception)
            { return Failure("ACCOUNT_ACCESS_DENIED", "当前进程访问受限或已经退出，账号待识别。"); }
            catch (Exception)
            { return Failure("ACCOUNT_READ_UNAVAILABLE", "当前账号读取校验未通过，请稍后刷新。"); }
        }

        private static AccountReadResult Failure(string code, string message)
        { return new AccountReadResult { code = code, message = message }; }
    }
}
