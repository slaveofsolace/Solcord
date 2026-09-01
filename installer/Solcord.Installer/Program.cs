// SPDX-License-Identifier: Apache-2.0

using System.Text.Json;
using System.Text.Json.Nodes;

namespace Solcord.Installer;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                using EmbeddedInstallerBundle bundle = EmbeddedInstallerBundle.ExtractVerified();
                return InstallerSelfTest.Run(bundle.Root);
            }
            catch (Exception error)
            {
                Console.Error.WriteLine($"embedded-bundle:{error.GetType().Name}");
                return 1;
            }
        }
        if (args.Contains("--update", StringComparer.OrdinalIgnoreCase)) return RunUpdate(args);
        ApplicationConfiguration.Initialize();
        try
        {
            using EmbeddedInstallerBundle bundle = EmbeddedInstallerBundle.ExtractVerified();
            Application.Run(new InstallerForm(bundle.Root));
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "Solcord Installer", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static int RunUpdate(string[] args)
    {
        try
        {
            int channelFlag = Array.FindIndex(args, value => value.Equals("--channel", StringComparison.OrdinalIgnoreCase));
            if (args.Length != 3 || channelFlag < 0 || channelFlag + 1 >= args.Length)
                throw new ArgumentException("Usage: SolcordInstaller.exe --update --channel Stable|PTB|Canary");
            string channel = args[channelFlag + 1];
            if (channel is not ("Stable" or "PTB" or "Canary"))
                throw new ArgumentException("The Discord channel must be Stable, PTB, or Canary.");

            using EmbeddedInstallerBundle bundle = EmbeddedInstallerBundle.ExtractVerified();
            var engine = new InstallerEngine(
                bundle.Root,
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData));
            DiscordTarget target = engine.DetectTargets().SingleOrDefault(candidate => candidate.Channel == channel)
                ?? throw new InvalidOperationException($"Discord {channel} is not installed.");
            engine.Update(target);
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"update:{error.GetType().Name}:{error.Message}");
            return 1;
        }
    }
}

internal static class InstallerSelfTest
{
    private static string SerializeLegacyWithoutCandidateLabel<T>(T value)
    {
        JsonObject document = JsonSerializer.SerializeToNode(value)?.AsObject() ?? throw new InvalidDataException("fixture legacy document");
        if (!document.Remove("CandidateLabel") || document.ContainsKey("CandidateLabel")) throw new InvalidDataException("fixture legacy candidate-label removal");
        return document.ToJsonString();
    }

    internal static int Run(string embeddedBundleRoot)
    {
        string root = Path.Combine(Path.GetTempPath(), $"solcord-installer-test-{Guid.NewGuid():N}");
        string stage = "prepare";
        try
        {
            string local = Path.Combine(root, "local");
            string roaming = Path.Combine(root, "roaming");
            string discord = Path.Combine(local, "Discord", "app-1.2.3");
            Directory.CreateDirectory(discord);
            File.WriteAllText(Path.Combine(discord, "Discord.exe"), "fixture");
            string resources = Path.Combine(discord, "resources");
            Directory.CreateDirectory(resources);
            File.WriteAllText(Path.Combine(resources, "app.asar"), "discord-fixture");
            string priorApp = Path.Combine(resources, "app");
            Directory.CreateDirectory(priorApp);
            const string priorIndex = "// BetterDiscord fixture\nrequire('betterdiscord.asar');\nmodule.exports = require('../app.asar');\n";
            const string priorPackage = "{\"main\":\"./index.js\",\"name\":\"discord\"}";
            File.WriteAllText(Path.Combine(priorApp, "index.js"), priorIndex);
            File.WriteAllText(Path.Combine(priorApp, "package.json"), priorPackage);
            string data = Path.Combine(roaming, "BetterDiscord", "data");
            Directory.CreateDirectory(data);
            File.WriteAllText(Path.Combine(data, "betterdiscord.asar"), "previous-core");
            var engine = new InstallerEngine(embeddedBundleRoot, local, roaming, _ => 0);
            ReleaseManifest manifest = engine.LoadManifest();
            string artifact = engine.VerifyBundle(manifest);
            DiscordTarget target = engine.DetectTargets().Single() with {ProcessName = "SolcordInstallerSelfTestNoProcess"};
            stage = "install";
            InstallReceipt receipt = engine.Install(target);
            if (!engine.VerifyInstalled()) return 2;
            if (!File.ReadAllText(Path.Combine(resources, "app", "index.js")).Contains("betterdiscord.asar", StringComparison.OrdinalIgnoreCase)) return 4;
            string currentReceipt = Path.Combine(roaming, "BetterDiscord", "solcord-installer", "current.json");
            string currentReceiptText = File.ReadAllText(currentReceipt);
            InstallReceipt installedReceipt = JsonSerializer.Deserialize<InstallReceipt>(currentReceiptText) ?? throw new InvalidDataException("fixture receipt");
            if (installedReceipt.CandidateLabel != manifest.CandidateLabel) return 18;
            string backupStateFile = Path.Combine(receipt.BackupDirectory ?? throw new InvalidDataException("fixture backup"), "backup-state.json");
            BackupState installedBackup = JsonSerializer.Deserialize<BackupState>(File.ReadAllText(backupStateFile)) ?? throw new InvalidDataException("fixture backup state");
            if (installedBackup.CandidateLabel != manifest.CandidateLabel) return 19;
            File.WriteAllText(currentReceipt, JsonSerializer.Serialize(installedReceipt with {Version = "1.0.0", CandidateLabel = null}));
            stage = "upgrade-repair";
            engine.Install(target, repair: true);
            if (!engine.VerifyInstalled()) return 14;
            if (!InstallerEngine.TryGetReleaseCandidateOrdinal(manifest.CandidateLabel, manifest.Version, out ulong candidateOrdinal) || candidateOrdinal == 0 || candidateOrdinal == ulong.MaxValue) return 21;
            string previousCandidate = $"v{manifest.Version}-rc.{candidateOrdinal - 1}";
            File.WriteAllText(currentReceipt, JsonSerializer.Serialize(installedReceipt with {ArtifactSha256 = new string('b', 64), SourceCommit = new string('b', 40), CandidateLabel = previousCandidate}));
            stage = "same-core-rc-upgrade";
            engine.Install(target, repair: true);
            if (!engine.VerifyInstalled()) return 24;
            stage = "same-version-repair";
            engine.Install(target, repair: true);
            if (!engine.VerifyInstalled()) return 15;
            File.WriteAllText(currentReceipt, JsonSerializer.Serialize(installedReceipt with {CandidateLabel = null}));
            stage = "legacy-same-core-exact-adoption";
            engine.Install(target, repair: true);
            InstallReceipt adoptedReceipt = JsonSerializer.Deserialize<InstallReceipt>(File.ReadAllText(currentReceipt)) ?? throw new InvalidDataException("fixture adopted receipt");
            if (adoptedReceipt.CandidateLabel != manifest.CandidateLabel || adoptedReceipt.ArtifactSha256 != manifest.ArtifactSha256 || adoptedReceipt.SourceCommit != manifest.SourceCommit) return 28;
            File.WriteAllText(currentReceipt, JsonSerializer.Serialize(installedReceipt with {ArtifactSha256 = new string('b', 64), CandidateLabel = null}));
            stage = "legacy-same-core-hold";
            try {engine.Install(target, repair: true); return 20;}
            catch (InvalidOperationException error) when (error.Message.Contains("predates candidate labels", StringComparison.Ordinal)) {/* expected */}
            File.WriteAllText(currentReceipt, JsonSerializer.Serialize(installedReceipt with {CandidateLabel = $"v{manifest.Version}-rc.-1"}));
            stage = "malformed-candidate-label-refusal";
            try {engine.Install(target, repair: true); return 25;}
            catch (InvalidDataException error) when (error.Message.Contains("version provenance is malformed", StringComparison.Ordinal)) {/* expected */}
            if (!InstallerEngine.TryGetReleaseCandidateOrdinal($"v{manifest.Version}-rc.{ulong.MaxValue}", manifest.Version, out ulong maximumOrdinal) || maximumOrdinal != ulong.MaxValue) return 26;
            if (InstallerEngine.TryGetReleaseCandidateOrdinal($"v{manifest.Version}-rc.18446744073709551616", manifest.Version, out _)) return 27;
            string newerCandidate = $"v{manifest.Version}-rc.{candidateOrdinal + 1}";
            File.WriteAllText(currentReceipt, JsonSerializer.Serialize(installedReceipt with {ArtifactSha256 = new string('b', 64), CandidateLabel = newerCandidate}));
            stage = "same-core-rc-downgrade-refusal";
            try {engine.Install(target, repair: true); return 22;}
            catch (InvalidOperationException error) when (error.Message.Contains("older than the recorded Solcord release candidate", StringComparison.Ordinal)) {/* expected */}
            File.WriteAllText(currentReceipt, JsonSerializer.Serialize(installedReceipt with {ArtifactSha256 = new string('a', 64)}));
            stage = "candidate-label-reuse-refusal";
            try {engine.Install(target, repair: true); return 23;}
            catch (InvalidOperationException error) when (error.Message.Contains("Candidate labels are immutable", StringComparison.Ordinal)) {/* expected */}
            File.WriteAllText(currentReceipt, JsonSerializer.Serialize(installedReceipt with {Version = "999.0.0", CandidateLabel = "v999.0.0-rc.1"}));
            stage = "downgrade-refusal";
            try {engine.Install(target, repair: true); return 16;}
            catch (InvalidOperationException error) when (error.Message.Contains("older than the recorded Solcord install", StringComparison.Ordinal)) {/* expected */}
            File.WriteAllText(currentReceipt, currentReceiptText);
            if (!engine.VerifyInstalled()) return 17;
            File.WriteAllText(currentReceipt, new string('x', 65 * 1024));
            stage = "oversized-receipt-refusal";
            try {engine.Install(target, repair: true); return 8;}
            catch (InvalidDataException) {/* existing unsafe receipts must fail closed */}
            File.WriteAllText(currentReceipt, currentReceiptText);
            string installedCore = Path.Combine(data, "betterdiscord.asar");
            var racedEngine = new InstallerEngine(embeddedBundleRoot, local, roaming, _ => 0, point =>
            {
                if (point == "install-after-core")
                {
                    File.WriteAllText(installedCore, "owner-changed-core");
                    throw new IOException("fixture owner change");
                }
            });
            stage = "automatic-recovery-owner-change";
            try {racedEngine.Install(target, repair: true); return 11;}
            catch (AggregateException) {/* automatic recovery must preserve an unexpected current core */}
            if (File.ReadAllText(installedCore) != "owner-changed-core") return 12;
            string pendingReceipt = Path.Combine(roaming, "BetterDiscord", "solcord-installer", "pending.json");
            if (!File.Exists(pendingReceipt)) return 13;
            File.Copy(artifact, installedCore, overwrite: true);
            File.Delete(pendingReceipt);
            string rogue = Path.Combine(roaming, "BetterDiscord", "solcord-installer", "backups", "zzzz-unbound-newest");
            Directory.CreateDirectory(rogue);
            File.WriteAllText(Path.Combine(rogue, "backup-state.json"), "{}");
            if (receipt.BackupDirectory is null) return 6;
            string backupStateText = File.ReadAllText(backupStateFile);
            File.WriteAllText(backupStateFile, JsonSerializer.Serialize(installedBackup with {CandidateLabel = previousCandidate}));
            stage = "rollback-candidate-label-mismatch-refusal";
            try {engine.RollBack(target); return 29;}
            catch (InvalidDataException error) when (error.Message.Contains("rollback state does not match", StringComparison.Ordinal)) {/* expected */}
            File.WriteAllText(backupStateFile, backupStateText);
            string injectorIndex = Path.Combine(receipt.BackupDirectory, "injector-app", "index.js");
            string originalInjector = File.ReadAllText(injectorIndex);
            File.AppendAllText(injectorIndex, "tampered");
            stage = "tamper-refusal";
            try {engine.RollBack(target); return 7;}
            catch (InvalidDataException) {/* expected hash-bound refusal */}
            File.WriteAllText(injectorIndex, originalInjector);
            File.WriteAllText(currentReceipt, SerializeLegacyWithoutCandidateLabel(installedReceipt));
            File.WriteAllText(backupStateFile, SerializeLegacyWithoutCandidateLabel(installedBackup));
            if (File.ReadAllText(currentReceipt).Contains("CandidateLabel", StringComparison.Ordinal) || File.ReadAllText(backupStateFile).Contains("CandidateLabel", StringComparison.Ordinal)) return 30;
            stage = "legacy-receipt-backup-rollback-compatibility";
            File.Copy(currentReceipt, pendingReceipt, overwrite: false);
            bool interrupted = false;
            var interruptingEngine = new InstallerEngine(embeddedBundleRoot, local, roaming, _ => 0, point =>
            {
                if (!interrupted && point == "rollback-after-injector") {interrupted = true; throw new IOException("fixture interruption");}
            });
            stage = "partial-rollback";
            try {interruptingEngine.RollBack(target); return 9;}
            catch (IOException) {/* retry must finish from the mixed restored state */}
            if (!interrupted) return 31;
            if (!InstallerEngine.HashFile(installedCore).Equals(manifest.ArtifactSha256, StringComparison.OrdinalIgnoreCase)
                || File.ReadAllText(Path.Combine(priorApp, "index.js")) != priorIndex
                || File.ReadAllText(Path.Combine(priorApp, "package.json")) != priorPackage) return 32;
            stage = "rollback";
            engine.RollBack(target);
            if (File.ReadAllText(Path.Combine(data, "betterdiscord.asar")) != "previous-core") return 3;
            if (File.ReadAllText(Path.Combine(priorApp, "index.js")) != priorIndex || File.ReadAllText(Path.Combine(priorApp, "package.json")) != priorPackage) return 5;
            if (File.Exists(currentReceipt)) return 10;

            stage = "separate-install-update-repair-actions";
            try {engine.Update(target); return 33;}
            catch (InvalidOperationException error) when (error.Message.Contains("Choose Install Solcord", StringComparison.Ordinal)) {/* expected */}
            engine.InstallNew(target);
            if (!engine.IsCurrentPackageRecorded() || !engine.VerifyInstalled()) return 34;
            try {engine.Update(target); return 35;}
            catch (InvalidOperationException error) when (error.Message.Contains("Choose Repair Solcord", StringComparison.Ordinal)) {/* expected */}
            engine.Repair(target);
            if (!engine.VerifyInstalled()) return 36;

            stage = "vanilla-uninstall-with-data-preservation";
            string plugins = Path.Combine(roaming, "BetterDiscord", "plugins");
            Directory.CreateDirectory(plugins);
            string ownerPlugin = Path.Combine(plugins, "owner.plugin.js");
            File.WriteAllText(ownerPlugin, "owner-data");
            string uninstallBackup = engine.Uninstall(target);
            if (File.Exists(installedCore) || Directory.Exists(priorApp) || File.Exists(currentReceipt)) return 37;
            if (File.ReadAllText(ownerPlugin) != "owner-data") return 38;
            foreach (string name in new[] {"betterdiscord.asar", "index.js", "package.json", "current.json", "uninstall-state.json"})
                if (!File.Exists(Path.Combine(uninstallBackup, name))) return 39;
            return 0;
        }
        catch (Exception error) {Console.Error.WriteLine($"{stage}:{error.GetType().Name}"); return 1;}
        finally {if (Directory.Exists(root)) Directory.Delete(root, recursive: true);}
    }
}
