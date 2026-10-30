// Boundary: data-only version profile contract for the current-manager reader.
// A profile describes a reviewed binary layout; validation never executes code.
// New compatible versions are independent JSON files, not reader modifications.
using System;
using System.Text.RegularExpressions;

namespace Somen.Wechat
{
    public sealed class AccountCodeCheck
    {
        public long rva;
        public byte[] bytes;
    }

    public sealed class AccountProfile
    {
        public int schemaVersion;
        public string reader;
        public string moduleName;
        public string version;
        public string architecture;
        public string dllSha256;
        public long managerPointerRva;
        public long managerVtableRva;
        public long ownerVtableRva;
        public long getterRva;
        public long getterSlotOffset;
        public long ownerOffset;
        public long controlOffset;
        public long selfOffset;
        public long strongCountOffset;
        public AccountCodeCheck[] codeChecks;

        public void Validate()
        {
            if (schemaVersion != 1 || reader != "current-manager-msvc-string-v1"
                || architecture != "x64"
                || !Regex.IsMatch(moduleName ?? "", @"^[A-Za-z0-9_.-]{1,80}\.dll$")
                || !Regex.IsMatch(version ?? "", @"^\d{1,4}\.\d{1,4}\.\d{1,4}\.\d{1,4}$")
                || !Regex.IsMatch(dllSha256 ?? "", "^[a-f0-9]{64}$"))
                throw new InvalidOperationException("Unsupported account profile contract.");
            foreach (long value in new long[] { managerPointerRva, managerVtableRva, ownerVtableRva, getterRva })
                if (value < 1 || value > Int32.MaxValue)
                    throw new InvalidOperationException("Profile RVA is outside its bound.");
            foreach (long value in new long[] { getterSlotOffset, ownerOffset, controlOffset, selfOffset, strongCountOffset })
                if (value < 1 || value > 65536)
                    throw new InvalidOperationException("Profile structure offset is outside its bound.");
            if ((managerPointerRva | managerVtableRva | ownerVtableRva | getterSlotOffset
                | ownerOffset | controlOffset | selfOffset) % 8 != 0
                || strongCountOffset % 4 != 0 || ownerOffset == controlOffset)
                throw new InvalidOperationException("Profile pointer alignment differs.");
            if (codeChecks == null || codeChecks.Length < 2 || codeChecks.Length > 16)
                throw new InvalidOperationException("Profile requires bounded code checks.");
            bool getterChecked = false, separateEntryChecked = false;
            foreach (AccountCodeCheck check in codeChecks)
            {
                if (check == null || check.rva < 1 || check.rva > Int32.MaxValue
                    || check.bytes == null || check.bytes.Length < 8 || check.bytes.Length > 256)
                    throw new InvalidOperationException("Profile code check is missing or unbounded.");
                if (check.rva == getterRva) getterChecked = true;
                else separateEntryChecked = true;
            }
            if (!getterChecked || !separateEntryChecked)
                throw new InvalidOperationException("Profile must verify the getter and its account entry.");
        }

        public void RequireImageSize(long imageSize)
        {
            Validate();
            foreach (long value in new long[] { managerPointerRva, managerVtableRva, ownerVtableRva, getterRva,
                checked(managerVtableRva + getterSlotOffset) })
                if (value + 8 > imageSize)
                    throw new InvalidOperationException("Profile RVA exceeds the loaded image.");
            foreach (AccountCodeCheck check in codeChecks)
                if (check.rva + check.bytes.Length > imageSize)
                    throw new InvalidOperationException("Profile code check exceeds the loaded image.");
        }
    }
}
