// SPDX-License-Identifier: Apache-2.0

using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SoulCord.Installer;

internal sealed record ReleaseManifest(string Version, string SourceCommit, string ArtifactSha256, string ArtifactFile, string BuildManifestSha256, int SchemaVersion, string SupportedDiscord, string ReleaseNotes);
internal sealed record DiscordTarget(string Channel, string Version, string ExecutablePath, string ProcessName);
internal sealed record InstallReceipt(string Version, string SourceCommit, string ArtifactSha256, string Channel, string DiscordVersion, string InstalledAtUtc, string? BackupDirectory);
internal sealed record InjectorBackupState(bool HadAppDirectory, string OriginalModule, string Channel, string DiscordVersion, string? IndexSha256, string? PackageSha256);
internal sealed record BackupState(bool HadCore, string? ExistingCoreSha256, string InstalledArtifactSha256, string CandidateVersion, string CandidateSourceCommit, InjectorBackupState Injector);

internal sealed class InstallerEngine
{
    private static readonly Regex Sha256Pattern = new("^[0-9a-f]{64}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private readonly string _bundleRoot;
    private readonly string _localAppData;
    private readonly string _roamingAppData;
    private readonly Func<string, int> _runningProcessCount;

    internal InstallerEngine(string bundleRoot, string localAppData, string roamingAppData, Func<string, int>? runningProcessCount = null)
    {
        _bundleRoot = Path.GetFullPath(bundleRoot);
        _localAppData = Path.GetFullPath(localAppData);
        _roamingAppData = Path.GetFullPath(roamingAppData);
        _runningProcessCount = runningProcessCount ?? (name => Process.GetProcessesByName(name).Length);
    }

    internal ReleaseManifest LoadManifest()
    {
        string file = Path.Combine(_bundleRoot, "soulcord-installer-manifest.json");
        if (!File.Exists(file) || new FileInfo(file).Length is <= 0 or > 64 * 1024) throw new InvalidDataException("The installer manifest is missing or oversized.");
        ReleaseManifest? manifest = JsonSerializer.Deserialize<ReleaseManifest>(File.ReadAllText(file), new JsonSerializerOptions {PropertyNameCaseInsensitive = true});
        if (manifest is null || !Sha256Pattern.IsMatch(manifest.ArtifactSha256) || !Sha256Pattern.IsMatch(manifest.BuildManifestSha256) || manifest.SchemaVersion < 1 || !Regex.IsMatch(manifest.Version, "^\\d+\\.\\d+\\.\\d+(?:\\.\\d+)?$") || !Version.TryParse(manifest.Version, out _) || !Regex.IsMatch(manifest.SourceCommit, "^[0-9a-f]{40}$")) throw new InvalidDataException("The installer manifest failed validation.");
        if (Path.GetFileName(manifest.ArtifactFile) != manifest.ArtifactFile || !manifest.ArtifactFile.EndsWith(".asar", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("The manifest artifact name is unsafe.");
        return manifest;
    }

    internal IReadOnlyList<DiscordTarget> DetectTargets()
    {
        var definitions = new[] {("Stable", "Discord", "Discord"), ("PTB", "DiscordPTB", "DiscordPTB"), ("Canary", "DiscordCanary", "DiscordCanary")};
        var targets = new List<DiscordTarget>();
        foreach ((string channel, string directoryName, string processName) in definitions)
        {
            string root = Path.Combine(_localAppData, directoryName);
            if (!Directory.Exists(root)) continue;
            foreach (string directory in Directory.EnumerateDirectories(root, "app-*", SearchOption.TopDirectoryOnly).OrderByDescending(Path.GetFileName))
            {
                string version = Path.GetFileName(directory)[4..];
                string executable = Path.Combine(directory, $"{processName}.exe");
                if (File.Exists(executable)) {targets.Add(new DiscordTarget(channel, version, executable, processName)); break;}
            }
        }
        return targets;
    }

    internal string VerifyBundle(ReleaseManifest manifest)
    {
        string artifact = Path.Combine(_bundleRoot, manifest.ArtifactFile);
        if (!File.Exists(artifact)) throw new FileNotFoundException("The manifest-bound SoulCord ASAR is missing.");
        string actual = HashFile(artifact);
        if (!CryptographicOperations.FixedTimeEquals(Convert.FromHexString(actual), Convert.FromHexString(manifest.ArtifactSha256))) throw new InvalidDataException("The SoulCord ASAR hash does not match the manifest.");
        string buildManifest = Path.Combine(_bundleRoot, "soulcord-build-manifest.json");
        if (!File.Exists(buildManifest) || new FileInfo(buildManifest).Length is <= 0 or > 256 * 1024 || !HashFile(buildManifest).Equals(manifest.BuildManifestSha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("The authoritative build manifest is missing or does not match the installer manifest.");
        try
        {
            using JsonDocument document = JsonDocument.Parse(File.ReadAllText(buildManifest));
            JsonElement root = document.RootElement;
            JsonElement build = root.GetProperty("build");
            JsonElement source = build.GetProperty("source");
            JsonElement asar = root.GetProperty("artifacts").GetProperty("asar");
            string mode = build.GetProperty("mode").GetString() ?? "";
            bool valid = root.GetProperty("schemaVersion").GetInt32() == 1
                && root.GetProperty("kind").GetString() == "soulcord-post-build-manifest"
                && build.GetProperty("product").GetString() == "SoulCord"
                && build.GetProperty("version").GetString() == manifest.Version
                && (mode == "production" || mode == "release")
                && source.GetProperty("clean").GetBoolean()
                && source.GetProperty("commit").GetString() == manifest.SourceCommit
                && asar.GetProperty("file").GetString() == manifest.ArtifactFile
                && asar.GetProperty("sha256").GetString() == manifest.ArtifactSha256
                && asar.GetProperty("bytes").GetInt64() == new FileInfo(artifact).Length;
            if (!valid) throw new InvalidDataException("The build manifest does not bind this clean SoulCord artifact and source commit.");
        }
        catch (InvalidDataException) {throw;}
        catch (Exception) {throw new InvalidDataException("The authoritative build manifest failed validation.");}
        return artifact;
    }

    internal InstallReceipt Install(DiscordTarget target, bool repair = false)
    {
        ReleaseManifest manifest = LoadManifest();
        string artifact = VerifyBundle(manifest);
        RequireAllDiscordStopped();
        if (!File.Exists(target.ExecutablePath)) throw new FileNotFoundException("The selected Discord target changed after preflight.");
        RejectLinkedPath(_localAppData, target.ExecutablePath);
        RejectDowngrade(manifest);

        string dataDirectory = Path.Combine(_roamingAppData, "BetterDiscord", "data");
        RejectLinkedPath(_roamingAppData, dataDirectory);
        Directory.CreateDirectory(dataDirectory);
        RejectReparsePoint(dataDirectory);
        string installed = Path.Combine(dataDirectory, "betterdiscord.asar");
        bool hadCore = File.Exists(installed);
        string? existingHash = hadCore ? HashFile(installed) : null;
        if (!repair && existingHash?.Equals(manifest.ArtifactSha256, StringComparison.OrdinalIgnoreCase) == true) throw new InvalidOperationException("This exact SoulCord artifact is already installed. Use Verify or Repair.");
        string backupName = $"{DateTime.UtcNow:yyyyMMddTHHmmssZ}-{existingHash?[..12] ?? "clean"}-{Guid.NewGuid():N}";
        backupName = backupName[..Math.Min(64, backupName.Length)];
        string backupDirectory = Path.Combine(_roamingAppData, "BetterDiscord", "soulcord-installer", "backups", backupName);
        RejectLinkedPath(_roamingAppData, backupDirectory);
        Directory.CreateDirectory(backupDirectory);
        RejectReparsePoint(backupDirectory);
        if (hadCore) File.Copy(installed, Path.Combine(backupDirectory, "betterdiscord.asar"), overwrite: false);
        InjectorBackupState injector = BackupInjector(target, backupDirectory, installed);
        var backupState = new BackupState(hadCore, existingHash, manifest.ArtifactSha256, manifest.Version, manifest.SourceCommit, injector);
        WriteAtomic(Path.Combine(backupDirectory, "backup-state.json"), JsonSerializer.Serialize(backupState, new JsonSerializerOptions {WriteIndented = true}));

        string temporary = Path.Combine(dataDirectory, $".soulcord-{Guid.NewGuid():N}.tmp");
        File.Copy(artifact, temporary, overwrite: false);
        bool coreReplaced = false;
        bool injectorReplaced = false;
        try
        {
            if (!HashFile(temporary).Equals(manifest.ArtifactSha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("The staged ASAR failed verification.");
            File.Move(temporary, installed, overwrite: true);
            coreReplaced = true;
            if (!HashFile(installed).Equals(manifest.ArtifactSha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("The installed ASAR failed verification.");
            injectorReplaced = true;
            InstallInjector(target, injector.OriginalModule, installed);
            var receipt = new InstallReceipt(manifest.Version, manifest.SourceCommit, manifest.ArtifactSha256, target.Channel, target.Version, DateTime.UtcNow.ToString("O"), backupDirectory);
            string receiptRoot = Path.Combine(_roamingAppData, "BetterDiscord", "soulcord-installer");
            Directory.CreateDirectory(receiptRoot);
            WriteAtomic(Path.Combine(receiptRoot, "current.json"), JsonSerializer.Serialize(receipt, new JsonSerializerOptions {WriteIndented = true}));
            return receipt;
        }
        catch
        {
            RestoreBackup(target, backupDirectory, backupState, coreReplaced, injectorReplaced, false);
            throw;
        }
        finally {if (File.Exists(temporary)) File.Delete(temporary);}
    }

    internal bool VerifyInstalled()
    {
        ReleaseManifest manifest = LoadManifest();
        string installed = Path.Combine(_roamingAppData, "BetterDiscord", "data", "betterdiscord.asar");
        return File.Exists(installed) && HashFile(installed).Equals(manifest.ArtifactSha256, StringComparison.OrdinalIgnoreCase);
    }

    internal string RollBack(DiscordTarget target)
    {
        RequireAllDiscordStopped();
        RejectLinkedPath(_localAppData, target.ExecutablePath);
        string backupRoot = Path.Combine(_roamingAppData, "BetterDiscord", "soulcord-installer", "backups");
        if (!Directory.Exists(backupRoot)) throw new InvalidOperationException("No SoulCord installer backup is available.");
        RejectLinkedPath(_roamingAppData, backupRoot);
        RejectReparsePoint(backupRoot);
        InstallReceipt receipt = LoadCurrentReceipt();
        if (receipt.Channel != target.Channel || receipt.DiscordVersion != target.Version || receipt.BackupDirectory is null) throw new InvalidDataException("The current install receipt does not match the selected Discord target.");
        string backupDirectory = Path.GetFullPath(receipt.BackupDirectory);
        RejectLinkedPath(backupRoot, backupDirectory);
        if (!string.Equals(Path.GetDirectoryName(backupDirectory), Path.GetFullPath(backupRoot).TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("The receipt backup path is not a direct installer backup.");
        if (!Directory.Exists(backupDirectory) || !File.Exists(Path.Combine(backupDirectory, "backup-state.json"))) throw new InvalidOperationException("The receipt-bound SoulCord backup is unavailable.");
        RejectReparsePoint(backupDirectory);
        BackupState? state = JsonSerializer.Deserialize<BackupState>(File.ReadAllText(Path.Combine(backupDirectory, "backup-state.json")));
        if (state is null || state.Injector.Channel != target.Channel || state.Injector.DiscordVersion != target.Version || !Sha256Pattern.IsMatch(state.InstalledArtifactSha256) || state.InstalledArtifactSha256 != receipt.ArtifactSha256 || state.CandidateVersion != receipt.Version || state.CandidateSourceCommit != receipt.SourceCommit) throw new InvalidDataException("The rollback state does not match the receipt-bound Discord target.");
        if (state.HadCore != (state.ExistingCoreSha256 is not null) || state.ExistingCoreSha256 is not null && !Sha256Pattern.IsMatch(state.ExistingCoreSha256)) throw new InvalidDataException("The rollback core metadata is invalid.");
        if (state.Injector.HadAppDirectory != (state.Injector.IndexSha256 is not null && state.Injector.PackageSha256 is not null) || state.Injector.IndexSha256 is not null && !Sha256Pattern.IsMatch(state.Injector.IndexSha256) || state.Injector.PackageSha256 is not null && !Sha256Pattern.IsMatch(state.Injector.PackageSha256)) throw new InvalidDataException("The rollback injector metadata is invalid.");
        RestoreBackup(target, backupDirectory, state, true, true, true);
        return backupDirectory;
    }

    internal void Launch(DiscordTarget target)
    {
        DiscordTarget? current = DetectTargets().SingleOrDefault(candidate => candidate.Channel == target.Channel && candidate.Version == target.Version && string.Equals(Path.GetFullPath(candidate.ExecutablePath), Path.GetFullPath(target.ExecutablePath), StringComparison.OrdinalIgnoreCase));
        if (current is null || !File.Exists(current.ExecutablePath)) throw new FileNotFoundException("The selected Discord executable changed after detection.");
        RejectLinkedPath(_localAppData, current.ExecutablePath);
        Process.Start(new ProcessStartInfo(current.ExecutablePath) {UseShellExecute = true});
    }

    internal static string HashFile(string file)
    {
        using FileStream stream = new(file, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    private void RejectDowngrade(ReleaseManifest manifest)
    {
        string receipt = Path.Combine(_roamingAppData, "BetterDiscord", "soulcord-installer", "current.json");
        if (!File.Exists(receipt) || new FileInfo(receipt).Length > 64 * 1024) return;
        InstallReceipt? current;
        try {current = JsonSerializer.Deserialize<InstallReceipt>(File.ReadAllText(receipt));}
        catch {throw new InvalidDataException("The current SoulCord installer receipt is malformed; repair is held for review.");}
        if (current is null || !Version.TryParse(current.Version, out Version? installed) || !Version.TryParse(manifest.Version, out Version? candidate)) throw new InvalidDataException("SoulCord version provenance is malformed; update is held for review.");
        if (candidate < installed) throw new InvalidOperationException("The candidate is older than the recorded SoulCord install. Use an explicit reviewed rollback instead of downgrading through Update.");
    }

    private static InjectorBackupState BackupInjector(DiscordTarget target, string backupDirectory, string installedCore)
    {
        string resources = Path.Combine(Path.GetDirectoryName(target.ExecutablePath)!, "resources");
        if (!Directory.Exists(resources)) throw new InvalidDataException("The selected Discord resources directory is missing.");
        RejectReparsePoint(resources);
        string originalModule = File.Exists(Path.Combine(resources, "betterdiscord.app.asar")) ? "../betterdiscord.app.asar" : File.Exists(Path.Combine(resources, "app.asar")) ? "../app.asar" : throw new InvalidDataException("No supported Discord application ASAR was found.");
        string appDirectory = Path.Combine(resources, "app");
        bool hadAppDirectory = Directory.Exists(appDirectory);
        if (hadAppDirectory)
        {
            RejectReparsePoint(appDirectory);
            string[] entries = Directory.GetFileSystemEntries(appDirectory).Select(Path.GetFileName).Order().ToArray()!;
            if (!entries.SequenceEqual(new[] {"index.js", "package.json"})) throw new InvalidDataException("The existing Discord injector directory contains unrecognized files; nothing was overwritten.");
            string index = File.ReadAllText(Path.Combine(appDirectory, "index.js"));
            string package = File.ReadAllText(Path.Combine(appDirectory, "package.json"));
            if (!RecognizedInjector(index, package, installedCore)) throw new InvalidDataException("The existing Discord injector is not a recognized BetterDiscord or SoulCord entry; nothing was overwritten.");
            string injectorBackup = Path.Combine(backupDirectory, "injector-app");
            Directory.CreateDirectory(injectorBackup);
            File.Copy(Path.Combine(appDirectory, "index.js"), Path.Combine(injectorBackup, "index.js"), overwrite: false);
            File.Copy(Path.Combine(appDirectory, "package.json"), Path.Combine(injectorBackup, "package.json"), overwrite: false);
        }
        string? indexSha256 = null;
        string? packageSha256 = null;
        if (hadAppDirectory)
        {
            string injectorBackup = Path.Combine(backupDirectory, "injector-app");
            indexSha256 = HashFile(Path.Combine(injectorBackup, "index.js"));
            packageSha256 = HashFile(Path.Combine(injectorBackup, "package.json"));
        }
        return new InjectorBackupState(hadAppDirectory, originalModule, target.Channel, target.Version, indexSha256, packageSha256);
    }

    private static void InstallInjector(DiscordTarget target, string originalModule, string installedCore)
    {
        string resources = Path.Combine(Path.GetDirectoryName(target.ExecutablePath)!, "resources");
        string appDirectory = Path.Combine(resources, "app");
        Directory.CreateDirectory(appDirectory);
        RejectReparsePoint(appDirectory);
        WriteAtomic(Path.Combine(appDirectory, "package.json"), "{\"main\":\"./index.js\",\"name\":\"discord\"}");
        string encodedCore = JsonSerializer.Serialize(Path.GetFullPath(installedCore));
        WriteAtomic(Path.Combine(appDirectory, "index.js"), $"require({encodedCore});{Environment.NewLine}module.exports = require({JsonSerializer.Serialize(originalModule)});{Environment.NewLine}");
    }

    private void RestoreBackup(DiscordTarget target, string backupDirectory, BackupState state, bool restoreCore, bool restoreInjector, bool requireUnchangedInjector)
    {
        string installed = Path.Combine(_roamingAppData, "BetterDiscord", "data", "betterdiscord.asar");
        string? appDirectory = null;
        string[] currentEntries = [];
        string? coreBackup = null;
        string? injectorIndexContent = null;
        string? injectorPackageContent = null;
        if (restoreInjector)
        {
            string resources = Path.Combine(Path.GetDirectoryName(target.ExecutablePath)!, "resources");
            appDirectory = Path.Combine(resources, "app");
            if (!Directory.Exists(appDirectory)) throw new InvalidDataException("The installed injector directory is missing; nothing was rolled back.");
            RejectReparsePoint(appDirectory);
            currentEntries = Directory.GetFileSystemEntries(appDirectory).Select(Path.GetFileName).Order().ToArray()!;
            if (currentEntries.Except(new[] {"index.js", "package.json"}).Any()) throw new InvalidDataException("The injector directory gained owner files; nothing was rolled back.");
            if (requireUnchangedInjector)
            {
                if (!currentEntries.SequenceEqual(new[] {"index.js", "package.json"})) throw new InvalidDataException("The installed injector is incomplete; nothing was rolled back.");
                string currentIndex = File.ReadAllText(Path.Combine(appDirectory, "index.js"));
                string currentPackage = File.ReadAllText(Path.Combine(appDirectory, "package.json"));
                if (!RecognizedInjector(currentIndex, currentPackage, installed)) throw new InvalidDataException("The injector changed after installation; nothing was rolled back.");
            }
        }
        if (restoreCore && (!File.Exists(installed) || !HashFile(installed).Equals(state.InstalledArtifactSha256, StringComparison.OrdinalIgnoreCase))) throw new InvalidDataException("The installed core changed after the backup. Rollback preserved it for manual review.");
        if (restoreCore && state.HadCore)
        {
            coreBackup = Path.Combine(backupDirectory, "betterdiscord.asar");
            RejectLinkedPath(backupDirectory, coreBackup);
            if (!File.Exists(coreBackup) || state.ExistingCoreSha256 is null || !HashFile(coreBackup).Equals(state.ExistingCoreSha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("The core backup failed validation.");
        }
        if (restoreInjector && state.Injector.HadAppDirectory)
        {
            string injectorBackup = Path.Combine(backupDirectory, "injector-app");
            RejectLinkedPath(backupDirectory, injectorBackup);
            if (!Directory.Exists(injectorBackup)) throw new InvalidDataException("The injector backup is missing.");
            RejectReparsePoint(injectorBackup);
            string backupIndex = Path.Combine(injectorBackup, "index.js");
            string backupPackage = Path.Combine(injectorBackup, "package.json");
            RejectLinkedPath(injectorBackup, backupIndex);
            RejectLinkedPath(injectorBackup, backupPackage);
            if (state.Injector.IndexSha256 is null || state.Injector.PackageSha256 is null || !File.Exists(backupIndex) || !File.Exists(backupPackage) || !HashFile(backupIndex).Equals(state.Injector.IndexSha256, StringComparison.OrdinalIgnoreCase) || !HashFile(backupPackage).Equals(state.Injector.PackageSha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("The injector backup failed hash validation.");
            injectorIndexContent = File.ReadAllText(backupIndex);
            injectorPackageContent = File.ReadAllText(backupPackage);
        }

        if (restoreCore && state.HadCore)
        {
            string temporary = $"{installed}.rollback-{Guid.NewGuid():N}.tmp";
            File.Copy(coreBackup!, temporary, overwrite: false);
            File.Move(temporary, installed, overwrite: true);
            if (!HashFile(installed).Equals(state.ExistingCoreSha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Rollback verification failed.");
        }
        else if (restoreCore) File.Delete(installed);

        if (!restoreInjector) return;
        if (state.Injector.HadAppDirectory)
        {
            WriteAtomic(Path.Combine(appDirectory!, "index.js"), injectorIndexContent!);
            WriteAtomic(Path.Combine(appDirectory!, "package.json"), injectorPackageContent!);
        }
        else
        {
            foreach (string name in currentEntries) File.Delete(Path.Combine(appDirectory!, name));
            Directory.Delete(appDirectory!);
        }
    }

    private static bool RecognizedInjector(string index, string package, string installedCore)
    {
        if (!package.Contains("\"main\"", StringComparison.Ordinal) || !package.Contains("index.js", StringComparison.Ordinal) || !package.Contains("\"discord\"", StringComparison.OrdinalIgnoreCase)) return false;
        bool soulCord = index.Contains(JsonSerializer.Serialize(Path.GetFullPath(installedCore)), StringComparison.OrdinalIgnoreCase) && index.Contains("module.exports = require", StringComparison.Ordinal);
        bool betterDiscord = index.Contains("BetterDiscord", StringComparison.OrdinalIgnoreCase) && index.Contains("betterdiscord.asar", StringComparison.OrdinalIgnoreCase) && index.Contains("module.exports = require", StringComparison.Ordinal);
        return soulCord || betterDiscord;
    }

    private InstallReceipt LoadCurrentReceipt()
    {
        string file = Path.Combine(_roamingAppData, "BetterDiscord", "soulcord-installer", "current.json");
        if (!File.Exists(file) || new FileInfo(file).Length is <= 0 or > 64 * 1024) throw new InvalidDataException("The current SoulCord install receipt is unavailable.");
        InstallReceipt? receipt;
        try {receipt = JsonSerializer.Deserialize<InstallReceipt>(File.ReadAllText(file));}
        catch {throw new InvalidDataException("The current SoulCord install receipt is malformed.");}
        if (receipt is null || !Sha256Pattern.IsMatch(receipt.ArtifactSha256) || !Regex.IsMatch(receipt.SourceCommit, "^[0-9a-f]{40}$") || !Version.TryParse(receipt.Version, out _)) throw new InvalidDataException("The current SoulCord install receipt failed validation.");
        return receipt;
    }

    private void RequireAllDiscordStopped()
    {
        string[] running = new[] {"Discord", "DiscordPTB", "DiscordCanary"}.Where(name => _runningProcessCount(name) > 0).ToArray();
        if (running.Length > 0) throw new InvalidOperationException($"Close every running Discord desktop channel before changing the shared SoulCord core ({string.Join(", ", running)}). The installer will not terminate them silently.");
    }

    private static void RejectReparsePoint(string directory)
    {
        if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("The installer refused a linked directory.");
    }

    private static void RejectLinkedPath(string trustedRoot, string target)
    {
        string root = Path.GetFullPath(trustedRoot).TrimEnd(Path.DirectorySeparatorChar);
        string full = Path.GetFullPath(target);
        if (!full.Equals(root, StringComparison.OrdinalIgnoreCase) && !full.StartsWith($"{root}{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("The installer target escapes its trusted root.");
        string current = root;
        foreach (string component in Path.GetRelativePath(root, full).Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries))
        {
            current = Path.Combine(current, component);
            if ((Directory.Exists(current) || File.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("The installer refused a linked target path.");
        }
    }

    private static void WriteAtomic(string target, string content)
    {
        string temporary = $"{target}.{Guid.NewGuid():N}.tmp";
        File.WriteAllText(temporary, content);
        File.Move(temporary, target, overwrite: true);
    }
}
