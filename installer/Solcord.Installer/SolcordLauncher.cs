// SPDX-License-Identifier: Apache-2.0

using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Solcord.Installer;

internal sealed record SolcordLauncherReceipt(int SchemaVersion, string ShortcutPath, string IconPath, string TargetPath, string Arguments);

internal static class SolcordLauncher
{
    private const string IconResource = "Solcord.Installer.Resources.solcord.ico";

    internal static void Ensure(DiscordTarget target, string roamingAppData)
    {
        string roaming = Path.GetFullPath(roamingAppData).TrimEnd(Path.DirectorySeparatorChar);
        string installerRoot = Path.Combine(roaming, "BetterDiscord", "solcord-installer");
        string programsRoot = Path.Combine(roaming, "Microsoft", "Windows", "Start Menu", "Programs");
        string shortcutDirectory = Path.Combine(programsRoot, "Solcord");
        string shortcutPath = Path.Combine(shortcutDirectory, "Solcord.lnk");
        string iconPath = Path.Combine(installerRoot, "Solcord.ico");
        string receiptPath = Path.Combine(installerRoot, "launcher.json");
        EnsureSafePath(roaming, installerRoot);
        EnsureSafePath(roaming, programsRoot);
        EnsureSafePath(programsRoot, shortcutDirectory);
        EnsureSafePath(shortcutDirectory, shortcutPath);
        EnsureSafePath(installerRoot, iconPath);
        EnsureSafePath(installerRoot, receiptPath);

        bool hasReceipt = File.Exists(receiptPath);
        if (!hasReceipt && (File.Exists(shortcutPath) || File.Exists(iconPath))) throw new InvalidDataException("An unrecognized Solcord launcher entry already exists.");
        if (hasReceipt) ValidateReceipt(receiptPath, shortcutPath, iconPath);

        Directory.CreateDirectory(installerRoot);
        Directory.CreateDirectory(shortcutDirectory);
        RejectReparsePoint(installerRoot);
        RejectReparsePoint(shortcutDirectory);
        WriteEmbeddedIcon(iconPath);

        string channelRoot = Directory.GetParent(Path.GetDirectoryName(target.ExecutablePath)!)?.FullName ?? throw new InvalidDataException("The Discord installation path is malformed.");
        string updateExecutable = Path.Combine(channelRoot, "Update.exe");
        string launchTarget = File.Exists(updateExecutable) ? updateExecutable : target.ExecutablePath;
        EnsureSafePath(channelRoot, launchTarget);
        string arguments = File.Exists(updateExecutable) ? $"--processStart {target.ProcessName}.exe" : "";
        CreateShortcut(shortcutPath, launchTarget, arguments, channelRoot, iconPath);
        var receipt = new SolcordLauncherReceipt(1, shortcutPath, iconPath, launchTarget, arguments);
        WriteAtomic(receiptPath, JsonSerializer.Serialize(receipt, new JsonSerializerOptions {WriteIndented = true}));
    }

    internal static void Remove(string roamingAppData)
    {
        string roaming = Path.GetFullPath(roamingAppData).TrimEnd(Path.DirectorySeparatorChar);
        string installerRoot = Path.Combine(roaming, "BetterDiscord", "solcord-installer");
        string programsRoot = Path.Combine(roaming, "Microsoft", "Windows", "Start Menu", "Programs");
        string shortcutDirectory = Path.Combine(programsRoot, "Solcord");
        string shortcutPath = Path.Combine(shortcutDirectory, "Solcord.lnk");
        string iconPath = Path.Combine(installerRoot, "Solcord.ico");
        string receiptPath = Path.Combine(installerRoot, "launcher.json");
        if (!File.Exists(receiptPath)) return;
        EnsureSafePath(roaming, installerRoot);
        EnsureSafePath(programsRoot, shortcutDirectory);
        ValidateReceipt(receiptPath, shortcutPath, iconPath);
        if (File.Exists(shortcutPath)) File.Delete(shortcutPath);
        if (Directory.Exists(shortcutDirectory) && !Directory.EnumerateFileSystemEntries(shortcutDirectory).Any()) Directory.Delete(shortcutDirectory, recursive: false);
        if (File.Exists(iconPath)) File.Delete(iconPath);
        File.Delete(receiptPath);
    }

    private static void ValidateReceipt(string receiptPath, string shortcutPath, string iconPath)
    {
        FileInfo info = new(receiptPath);
        if (!info.Exists || info.Length is <= 0 or > 32 * 1024 || (info.Attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("The Solcord launcher receipt is unsafe.");
        SolcordLauncherReceipt? receipt;
        try {receipt = JsonSerializer.Deserialize<SolcordLauncherReceipt>(File.ReadAllText(receiptPath));}
        catch {throw new InvalidDataException("The Solcord launcher receipt is malformed.");}
        if (receipt is null || receipt.SchemaVersion != 1 || !Path.GetFullPath(receipt.ShortcutPath).Equals(Path.GetFullPath(shortcutPath), StringComparison.OrdinalIgnoreCase) || !Path.GetFullPath(receipt.IconPath).Equals(Path.GetFullPath(iconPath), StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("The Solcord launcher receipt does not own the expected files.");
    }

    private static void WriteEmbeddedIcon(string iconPath)
    {
        using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(IconResource) ?? throw new InvalidDataException("The embedded Solcord launcher icon is missing.");
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        byte[] bytes = memory.ToArray();
        if (bytes.Length is <= 0 or > 2 * 1024 * 1024) throw new InvalidDataException("The embedded Solcord launcher icon is invalid.");
        string temporary = $"{iconPath}.{Guid.NewGuid():N}.tmp";
        try {File.WriteAllBytes(temporary, bytes); File.Move(temporary, iconPath, overwrite: true);}
        finally {if (File.Exists(temporary)) File.Delete(temporary);}
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string arguments, string workingDirectory, string iconPath)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell") ?? throw new PlatformNotSupportedException("Windows shortcut services are unavailable.");
        object shell = Activator.CreateInstance(shellType) ?? throw new PlatformNotSupportedException("Windows shortcut services are unavailable.");
        string temporary = $"{shortcutPath}.{Guid.NewGuid():N}.tmp.lnk";
        object? shortcut = null;
        try
        {
            shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] {temporary});
            if (shortcut is null) throw new InvalidOperationException("Windows did not create the Solcord shortcut.");
            Type shortcutType = shortcut.GetType();
            shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] {targetPath});
            shortcutType.InvokeMember("Arguments", BindingFlags.SetProperty, null, shortcut, new object[] {arguments});
            shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] {workingDirectory});
            shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] {$"{iconPath},0"});
            shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] {"Launch Discord with Solcord"});
            shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            File.Move(temporary, shortcutPath, overwrite: true);
        }
        finally
        {
            if (shortcut is not null && Marshal.IsComObject(shortcut)) Marshal.FinalReleaseComObject(shortcut);
            if (Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell);
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    private static void WriteAtomic(string target, string content)
    {
        string temporary = $"{target}.{Guid.NewGuid():N}.tmp";
        try {File.WriteAllText(temporary, content); File.Move(temporary, target, overwrite: true);}
        finally {if (File.Exists(temporary)) File.Delete(temporary);}
    }

    private static void EnsureSafePath(string root, string target)
    {
        string trusted = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar);
        string full = Path.GetFullPath(target);
        if (!full.Equals(trusted, StringComparison.OrdinalIgnoreCase) && !full.StartsWith($"{trusted}{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("The Solcord launcher path escapes its trusted root.");
        string current = trusted;
        foreach (string component in Path.GetRelativePath(trusted, full).Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries)) {
            current = Path.Combine(current, component);
            if ((Directory.Exists(current) || File.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("The Solcord launcher refused a linked path.");
        }
    }

    private static void RejectReparsePoint(string directory)
    {
        if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("The Solcord launcher refused a linked directory.");
    }
}
