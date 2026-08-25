// SPDX-License-Identifier: Apache-2.0

namespace SoulCord.Installer;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase)) return InstallerSelfTest.Run();
        ApplicationConfiguration.Initialize();
        Application.Run(new InstallerForm());
        return 0;
    }
}

internal sealed class InstallerForm : Form
{
    private readonly InstallerEngine _engine = new(AppContext.BaseDirectory, Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData));
    private readonly ComboBox _targets = new() {DropDownStyle = ComboBoxStyle.DropDownList, Dock = DockStyle.Top};
    private readonly Label _status = new() {AutoSize = false, Dock = DockStyle.Fill, Padding = new Padding(0, 14, 0, 0)};

    internal InstallerForm()
    {
        Text = "SoulCord Installer";
        Width = 620;
        Height = 340;
        MinimumSize = new Size(560, 300);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10);

        var title = new Label {Text = "SoulCord", Font = new Font("Segoe UI Semibold", 22), AutoSize = true, Dock = DockStyle.Top};
        var subtitle = new Label {Text = "Install, verify, repair, or roll back one hash-bound desktop core. Plugins, themes, settings, and custom CSS are never deleted.", AutoSize = true, MaximumSize = new Size(560, 0), Dock = DockStyle.Top, Padding = new Padding(0, 5, 0, 16)};
        var buttons = new FlowLayoutPanel {Dock = DockStyle.Top, AutoSize = true, WrapContents = true, Padding = new Padding(0, 14, 0, 0)};
        AddButton(buttons, "Install", () => Install(false));
        AddButton(buttons, "Verify", () => Report(_engine.VerifyInstalled() ? "Installed artifact matches the manifest." : "Installed artifact does not match this bundle."));
        AddButton(buttons, "Repair / Update", () => Install(true));
        AddButton(buttons, "Roll Back / Uninstall", () => Report($"Restored backup from {_engine.RollBack(Target())}."));
        AddButton(buttons, "Launch selected Discord", () => {_engine.Launch(Target()); Report("Discord launch requested. SoulCord does not authenticate or act on the account.");});
        AddButton(buttons, "Open recovery folder", () => System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "BetterDiscord", "soulcord-installer")) {UseShellExecute = true}));

        var layout = new Panel {Dock = DockStyle.Fill, Padding = new Padding(24)};
        layout.Controls.Add(_status);
        layout.Controls.Add(buttons);
        layout.Controls.Add(_targets);
        layout.Controls.Add(subtitle);
        layout.Controls.Add(title);
        Controls.Add(layout);
        Load += (_, _) => RefreshTargets();
    }

    private void RefreshTargets()
    {
        _targets.Items.Clear();
        foreach (DiscordTarget target in _engine.DetectTargets()) _targets.Items.Add(target);
        _targets.DisplayMember = nameof(DiscordTarget.Channel);
        if (_targets.Items.Count > 0) {_targets.SelectedIndex = 0; Report("Select the exact Discord channel. Close only that client before Install, Repair, or Roll Back.");}
        else Report("No supported Discord Stable, PTB, or Canary installation was detected.");
    }

    private DiscordTarget Target() => _targets.SelectedItem as DiscordTarget ?? throw new InvalidOperationException("Select an installed Discord channel first.");
    private void Install(bool repair)
    {
        InstallReceipt receipt = _engine.Install(Target(), repair);
        Report($"SoulCord {receipt.Version} installed and hash verified for Discord {receipt.Channel} {receipt.DiscordVersion}. Launch remains your choice.");
    }

    private void AddButton(Control parent, string label, Action action)
    {
        var button = new Button {Text = label, AutoSize = true, Margin = new Padding(0, 0, 8, 8)};
        button.Click += (_, _) => {try {action();} catch (Exception error) {Report(error.Message);}};
        parent.Controls.Add(button);
    }

    private void Report(string message) => _status.Text = message;
}

internal static class InstallerSelfTest
{
    internal static int Run()
    {
        string root = Path.Combine(Path.GetTempPath(), $"soulcord-installer-test-{Guid.NewGuid():N}");
        string stage = "prepare";
        try
        {
            string bundle = Path.Combine(root, "bundle");
            string local = Path.Combine(root, "local");
            string roaming = Path.Combine(root, "roaming");
            Directory.CreateDirectory(bundle);
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
            string artifact = Path.Combine(bundle, "soulcord.asar");
            File.WriteAllText(artifact, "soulcord-candidate");
            string hash = InstallerEngine.HashFile(artifact);
            string sourceCommit = new string('a', 40);
            string buildManifest = Path.Combine(bundle, "soulcord-build-manifest.json");
            File.WriteAllText(buildManifest, System.Text.Json.JsonSerializer.Serialize(new {
                schemaVersion = 1,
                kind = "soulcord-post-build-manifest",
                build = new {product = "SoulCord", version = "1.0.0", mode = "production", source = new {clean = true, commit = sourceCommit}},
                artifacts = new {asar = new {file = "soulcord.asar", sha256 = hash, bytes = new FileInfo(artifact).Length}}
            }));
            File.WriteAllText(Path.Combine(bundle, "soulcord-installer-manifest.json"), System.Text.Json.JsonSerializer.Serialize(new ReleaseManifest("1.0.0", sourceCommit, hash, "soulcord.asar", InstallerEngine.HashFile(buildManifest), 5, "Stable/PTB/Canary", "Self-test")));
            string data = Path.Combine(roaming, "BetterDiscord", "data");
            Directory.CreateDirectory(data);
            File.WriteAllText(Path.Combine(data, "betterdiscord.asar"), "previous-core");
            var engine = new InstallerEngine(bundle, local, roaming, _ => 0);
            DiscordTarget target = engine.DetectTargets().Single() with {ProcessName = "SoulCordInstallerSelfTestNoProcess"};
            stage = "install";
            InstallReceipt receipt = engine.Install(target);
            if (!engine.VerifyInstalled()) return 2;
            if (!File.ReadAllText(Path.Combine(resources, "app", "index.js")).Contains("betterdiscord.asar", StringComparison.OrdinalIgnoreCase)) return 4;
            string currentReceipt = Path.Combine(roaming, "BetterDiscord", "soulcord-installer", "current.json");
            string currentReceiptText = File.ReadAllText(currentReceipt);
            File.WriteAllText(currentReceipt, new string('x', 65 * 1024));
            stage = "oversized-receipt-refusal";
            try {engine.Install(target, repair: true); return 8;}
            catch (InvalidDataException) {/* existing unsafe receipts must fail closed */}
            File.WriteAllText(currentReceipt, currentReceiptText);
            string installedCore = Path.Combine(data, "betterdiscord.asar");
            var racedEngine = new InstallerEngine(bundle, local, roaming, _ => 0, point =>
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
            string pendingReceipt = Path.Combine(roaming, "BetterDiscord", "soulcord-installer", "pending.json");
            if (!File.Exists(pendingReceipt)) return 13;
            File.Copy(artifact, installedCore, overwrite: true);
            File.Delete(pendingReceipt);
            string rogue = Path.Combine(roaming, "BetterDiscord", "soulcord-installer", "backups", "zzzz-unbound-newest");
            Directory.CreateDirectory(rogue);
            File.WriteAllText(Path.Combine(rogue, "backup-state.json"), "{}");
            if (receipt.BackupDirectory is null) return 6;
            string injectorIndex = Path.Combine(receipt.BackupDirectory, "injector-app", "index.js");
            string originalInjector = File.ReadAllText(injectorIndex);
            File.AppendAllText(injectorIndex, "tampered");
            stage = "tamper-refusal";
            try {engine.RollBack(target); return 7;}
            catch (InvalidDataException) {/* expected hash-bound refusal */}
            File.WriteAllText(injectorIndex, originalInjector);
            File.Copy(currentReceipt, pendingReceipt, overwrite: false);
            bool interrupted = false;
            var interruptingEngine = new InstallerEngine(bundle, local, roaming, _ => 0, point =>
            {
                if (!interrupted && point == "rollback-after-injector") {interrupted = true; throw new IOException("fixture interruption");}
            });
            stage = "partial-rollback";
            try {interruptingEngine.RollBack(target); return 9;}
            catch (IOException) {/* retry must finish from the mixed restored state */}
            stage = "rollback";
            engine.RollBack(target);
            if (File.ReadAllText(Path.Combine(data, "betterdiscord.asar")) != "previous-core") return 3;
            if (File.ReadAllText(Path.Combine(priorApp, "index.js")) != priorIndex || File.ReadAllText(Path.Combine(priorApp, "package.json")) != priorPackage) return 5;
            if (File.Exists(currentReceipt)) return 10;
            return 0;
        }
        catch (Exception error) {Console.Error.WriteLine($"{stage}:{error.GetType().Name}"); return 1;}
        finally {if (Directory.Exists(root)) Directory.Delete(root, recursive: true);}
    }
}
