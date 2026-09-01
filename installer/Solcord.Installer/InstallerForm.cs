// SPDX-License-Identifier: Apache-2.0

using System.Reflection;

namespace Solcord.Installer;

internal sealed class InstallerForm : Form
{
    private static readonly Color Canvas = Color.FromArgb(9, 13, 16);
    private static readonly Color CanvasRaised = Color.FromArgb(14, 20, 24);
    private static readonly Color Surface = Color.FromArgb(19, 27, 32);
    private static readonly Color SurfaceRaised = Color.FromArgb(27, 38, 44);
    private static readonly Color Line = Color.FromArgb(51, 67, 75);
    private static readonly Color LineQuiet = Color.FromArgb(31, 43, 49);
    private static readonly Color Bone = Color.FromArgb(244, 237, 222);
    private static readonly Color Body = Color.FromArgb(191, 202, 207);
    private static readonly Color Muted = Color.FromArgb(126, 143, 151);
    private static readonly Color Teal = Color.FromArgb(82, 184, 173);
    private static readonly Color TealPressed = Color.FromArgb(49, 132, 126);
    private static readonly Color Ember = Color.FromArgb(239, 111, 79);
    private static readonly Color Warning = Color.FromArgb(236, 181, 83);

    private readonly InstallerEngine _engine;
    private readonly ReleaseManifest _manifest;
    private readonly ComboBox _targets = new();
    private readonly Label _stateKicker = new();
    private readonly Label _stateTitle = new();
    private readonly Label _stateBody = new();
    private readonly Panel _stateRail = new();
    private readonly Label _signalTarget = new();
    private readonly Label _signalCore = new();
    private readonly Label _signalProduct = new();
    private readonly Button _primaryAction;
    private readonly Dictionary<string, ActionVisual> _actions = new(StringComparer.Ordinal);
    private readonly ToolTip _tips = new();
    private string? _recommendedKey;

    internal InstallerForm(string bundleRoot)
    {
        _engine = new InstallerEngine(bundleRoot, Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData));
        _manifest = _engine.LoadManifest();
        _primaryAction = NewButton("Continue", ButtonTone.Primary);

        Text = $"Solcord Setup · {_manifest.CandidateLabel}";
        ClientSize = new Size(1080, 700);
        MinimumSize = new Size(900, 650);
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = Canvas;
        ForeColor = Bone;
        Font = new Font("Segoe UI Variable Text", 9.5f);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        DoubleBuffered = true;

        var shell = new TableLayoutPanel {
            Dock = DockStyle.Fill,
            BackColor = Canvas,
            ColumnCount = 2,
            RowCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        shell.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 226));
        shell.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        shell.Controls.Add(BuildBrandRail(), 0, 0);
        shell.Controls.Add(BuildMain(), 1, 0);
        Controls.Add(shell);

        Load += (_, _) => RefreshTargets();
        _targets.SelectedIndexChanged += (_, _) => RefreshInstallationState();
    }

    private Control BuildBrandRail()
    {
        var rail = new Panel {Dock = DockStyle.Fill, BackColor = CanvasRaised, Padding = new Padding(28)};
        rail.Paint += (_, args) => {
            args.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var divider = new Pen(Line, 1);
            args.Graphics.DrawLine(divider, rail.ClientSize.Width - 1, 0, rail.ClientSize.Width - 1, rail.ClientSize.Height);
            using var thread = new Pen(Color.FromArgb(54, Teal), 1);
            for (int offset = -120; offset < rail.ClientSize.Height; offset += 58) args.Graphics.DrawLine(thread, 0, offset, rail.ClientSize.Width, offset + 226);
            using var teal = new Pen(Teal, 3);
            using var ember = new Pen(Ember, 3);
            args.Graphics.DrawLine(teal, 28, 0, 28, 44);
            args.Graphics.DrawLine(ember, 36, 0, 36, 28);
        };

        var mark = new PictureBox {
            Location = new Point(28, 52),
            Size = new Size(108, 108),
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.Transparent,
            Image = LoadBrandMark(),
            AccessibleName = "Solcord cord-cut S mark",
            TabStop = false
        };
        var name = NewLabel("SOLCORD", 23f, FontStyle.Bold, Bone, display: true);
        name.AutoSize = true;
        name.Location = new Point(28, 180);
        var signature = NewLabel("DISCORD, REWIRED.", 8.5f, FontStyle.Bold, Teal);
        signature.AutoSize = true;
        signature.Location = new Point(30, 220);
        var lineage = NewLabel("A private desktop fork\nbuilt on BetterDiscord.", 10f, FontStyle.Regular, Body);
        lineage.AutoSize = true;
        lineage.Location = new Point(29, 270);

        var buildMeta = new Panel {Dock = DockStyle.Bottom, Height = 82, BackColor = Color.Transparent};
        var build = NewLabel(_manifest.CandidateLabel, 10f, FontStyle.Bold, Bone);
        build.AutoSize = true;
        build.Location = new Point(1, 4);
        var source = NewLabel($"source {_manifest.SourceCommit[..8]}\nunsigned Windows build", 8.5f, FontStyle.Regular, Muted);
        source.AutoSize = true;
        source.Location = new Point(1, 34);
        buildMeta.Controls.Add(build);
        buildMeta.Controls.Add(source);

        rail.Controls.Add(mark);
        rail.Controls.Add(name);
        rail.Controls.Add(signature);
        rail.Controls.Add(lineage);
        rail.Controls.Add(buildMeta);
        return rail;
    }

    private Control BuildMain()
    {
        var main = new TableLayoutPanel {Dock = DockStyle.Fill, BackColor = Canvas, ColumnCount = 1, RowCount = 3, Margin = Padding.Empty, Padding = Padding.Empty};
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 106));
        main.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        main.Controls.Add(BuildHeader(), 0, 0);
        main.Controls.Add(BuildWorkspace(), 0, 1);
        main.Controls.Add(BuildFooter(), 0, 2);
        return main;
    }

    private Control BuildHeader()
    {
        var header = new Panel {Dock = DockStyle.Fill, BackColor = Canvas, Padding = new Padding(34, 22, 34, 16)};
        header.Paint += (_, args) => {
            using var baseline = new Pen(LineQuiet, 1);
            args.Graphics.DrawLine(baseline, 34, header.ClientSize.Height - 1, header.ClientSize.Width - 34, header.ClientSize.Height - 1);
        };
        var stack = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Margin = Padding.Empty, Padding = Padding.Empty, BackColor = Color.Transparent};
        stack.RowStyles.Add(new RowStyle(SizeType.Absolute, 18));
        stack.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        stack.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var eyebrow = NewLabel("SETUP / RECOVERY", 8.5f, FontStyle.Bold, Teal);
        eyebrow.Dock = DockStyle.Fill;
        var title = NewLabel("Connect Solcord to Discord", 23f, FontStyle.Bold, Bone, display: true);
        title.Dock = DockStyle.Fill;
        var body = NewLabel("One exact local install. Your plugins, themes, settings, and custom CSS remain yours.", 9.5f, FontStyle.Regular, Body);
        body.Dock = DockStyle.Fill;
        stack.Controls.Add(eyebrow, 0, 0);
        stack.Controls.Add(title, 0, 1);
        stack.Controls.Add(body, 0, 2);
        header.Controls.Add(stack);
        return header;
    }

    private Control BuildWorkspace()
    {
        var workspace = new TableLayoutPanel {Dock = DockStyle.Fill, BackColor = Canvas, ColumnCount = 1, RowCount = 5, Padding = new Padding(34, 18, 34, 16), Margin = Padding.Empty};
        workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 62));
        workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 168));
        workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 68));
        workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 120));
        workspace.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        workspace.Controls.Add(BuildTargetBar(), 0, 0);
        workspace.Controls.Add(BuildStatePanel(), 0, 1);
        workspace.Controls.Add(BuildSignalPath(), 0, 2);
        workspace.Controls.Add(BuildOperationDock(), 0, 3);
        workspace.Controls.Add(BuildUtilities(), 0, 4);
        return workspace;
    }

    private Control BuildTargetBar()
    {
        var bar = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, Margin = Padding.Empty, Padding = Padding.Empty, BackColor = Canvas};
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 116));
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 196));
        var label = NewLabel("Discord target", 9f, FontStyle.Bold, Body);
        label.Dock = DockStyle.Fill;
        label.TextAlign = ContentAlignment.MiddleLeft;
        _targets.DropDownStyle = ComboBoxStyle.DropDownList;
        _targets.Dock = DockStyle.Fill;
        _targets.Margin = new Padding(0, 10, 14, 10);
        _targets.BackColor = Surface;
        _targets.ForeColor = Bone;
        _targets.FlatStyle = FlatStyle.Flat;
        _targets.TabIndex = 0;
        _targets.AccessibleName = "Discord installation channel";
        _targets.AccessibleDescription = "Choose Stable, PTB, or Canary when installed.";
        var exact = NewLabel($"PACKAGE  {_manifest.CandidateLabel}", 8.5f, FontStyle.Bold, Muted);
        exact.Dock = DockStyle.Fill;
        exact.TextAlign = ContentAlignment.MiddleRight;
        bar.Controls.Add(label, 0, 0);
        bar.Controls.Add(_targets, 1, 0);
        bar.Controls.Add(exact, 2, 0);
        return bar;
    }

    private Control BuildStatePanel()
    {
        var state = new Panel {Dock = DockStyle.Fill, Margin = new Padding(0, 0, 0, 10), Padding = new Padding(24, 18, 22, 18), BackColor = Surface};
        state.Paint += (_, args) => {
            using var border = new Pen(Line, 1);
            args.Graphics.DrawRectangle(border, 0, 0, state.ClientSize.Width - 1, state.ClientSize.Height - 1);
        };
        _stateRail.Dock = DockStyle.Left;
        _stateRail.Width = 4;
        _stateRail.BackColor = Teal;

        var layout = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = Padding.Empty, Padding = new Padding(10, 0, 0, 0), BackColor = Color.Transparent};
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 172));
        var copy = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Margin = Padding.Empty, Padding = Padding.Empty, BackColor = Color.Transparent};
        copy.RowStyles.Add(new RowStyle(SizeType.Absolute, 22));
        copy.RowStyles.Add(new RowStyle(SizeType.Absolute, 45));
        copy.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        _stateKicker.Dock = DockStyle.Fill;
        _stateKicker.Font = new Font("Segoe UI Variable Text", 8.5f, FontStyle.Bold);
        _stateKicker.ForeColor = Teal;
        _stateTitle.Dock = DockStyle.Fill;
        _stateTitle.Font = new Font("Bahnschrift", 18f, FontStyle.Bold);
        _stateTitle.ForeColor = Bone;
        _stateTitle.TextAlign = ContentAlignment.MiddleLeft;
        _stateBody.Dock = DockStyle.Fill;
        _stateBody.Font = new Font("Segoe UI Variable Text", 9.25f, FontStyle.Regular);
        _stateBody.ForeColor = Body;
        _stateBody.AutoEllipsis = true;
        _stateBody.AccessibleName = "Installation state details";
        copy.Controls.Add(_stateKicker, 0, 0);
        copy.Controls.Add(_stateTitle, 0, 1);
        copy.Controls.Add(_stateBody, 0, 2);

        _primaryAction.Dock = DockStyle.Fill;
        _primaryAction.Margin = new Padding(18, 31, 0, 31);
        _primaryAction.TabIndex = 1;
        _primaryAction.AccessibleName = "Recommended action";
        _primaryAction.Click += (_, _) => {if (_recommendedKey is not null) RunOperation(_recommendedKey);};
        layout.Controls.Add(copy, 0, 0);
        layout.Controls.Add(_primaryAction, 1, 0);
        state.Controls.Add(layout);
        state.Controls.Add(_stateRail);
        return state;
    }

    private Control BuildSignalPath()
    {
        var path = new Panel {Dock = DockStyle.Fill, Margin = Padding.Empty, Padding = new Padding(4, 0, 4, 0), BackColor = Canvas};
        path.Paint += (_, args) => {
            args.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            int y = path.ClientSize.Height / 2;
            int left = 16;
            int right = path.ClientSize.Width - 16;
            using var line = new Pen(Line, 2);
            args.Graphics.DrawLine(line, left, y, right, y);
            using var start = new SolidBrush(Muted);
            using var middle = new SolidBrush(Teal);
            using var end = new SolidBrush(Ember);
            args.Graphics.FillEllipse(start, left - 4, y - 4, 8, 8);
            args.Graphics.FillEllipse(middle, path.ClientSize.Width / 2 - 4, y - 4, 8, 8);
            args.Graphics.FillEllipse(end, right - 4, y - 4, 8, 8);
        };
        var labels = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, Margin = Padding.Empty, Padding = new Padding(14, 0, 14, 0), BackColor = Color.Transparent};
        for (int i = 0; i < 3; i++) labels.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.333f));
        foreach (Label label in new[] {_signalTarget, _signalCore, _signalProduct}) {
            label.Dock = DockStyle.Fill;
            label.Font = new Font("Segoe UI Variable Text", 8.25f, FontStyle.Bold);
            label.ForeColor = Muted;
            label.BackColor = Canvas;
            label.TextAlign = ContentAlignment.TopCenter;
            label.Padding = new Padding(6, 0, 6, 0);
        }
        _signalTarget.Text = "DISCORD";
        _signalCore.Text = "CORE CHECK";
        _signalProduct.Text = "SOLCORD";
        labels.Controls.Add(_signalTarget, 0, 0);
        labels.Controls.Add(_signalCore, 1, 0);
        labels.Controls.Add(_signalProduct, 2, 0);
        path.Controls.Add(labels);
        return path;
    }

    private Control BuildOperationDock()
    {
        var dock = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Margin = Padding.Empty, Padding = Padding.Empty, BackColor = Canvas};
        dock.RowStyles.Add(new RowStyle(SizeType.Absolute, 26));
        dock.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var heading = NewLabel("All operations", 9f, FontStyle.Bold, Body);
        heading.Dock = DockStyle.Fill;
        var operations = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 5, RowCount = 1, Margin = Padding.Empty, Padding = Padding.Empty, BackColor = Canvas};
        for (int i = 0; i < 5; i++) operations.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 20));
        operations.Controls.Add(OperationButton("install", "Install", "Add Solcord to the selected Discord channel.", 2), 0, 0);
        operations.Controls.Add(OperationButton("update", "Update", $"Move to {_manifest.CandidateLabel} after saving a rollback point.", 3), 1, 0);
        operations.Controls.Add(OperationButton("repair", "Repair", "Replace missing or damaged files with this exact build.", 4), 2, 0);
        operations.Controls.Add(OperationButton("rollback", "Roll back", "Restore the verified backup made before the last change.", 5), 3, 0);
        operations.Controls.Add(OperationButton("uninstall", "Uninstall", "Remove Solcord while keeping user plugins, themes, and settings.", 6, ButtonTone.Danger), 4, 0);
        dock.Controls.Add(heading, 0, 0);
        dock.Controls.Add(operations, 0, 1);
        return dock;
    }

    private Control OperationButton(string key, string title, string description, int tabIndex, ButtonTone tone = ButtonTone.Quiet)
    {
        var button = NewButton(title, tone);
        button.Dock = DockStyle.Fill;
        button.Margin = new Padding(key == "install" ? 0 : 5, 4, key == "uninstall" ? 0 : 5, 12);
        button.TabIndex = tabIndex;
        button.AccessibleName = title;
        button.AccessibleDescription = description;
        button.Click += (_, _) => RunOperation(key);
        _tips.SetToolTip(button, description);
        _actions[key] = new ActionVisual(title, description, button, tone);
        return button;
    }

    private Control BuildUtilities()
    {
        var utilities = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, Margin = Padding.Empty, Padding = new Padding(0, 4, 0, 0), BackColor = Canvas};
        utilities.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.333f));
        utilities.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.333f));
        utilities.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.333f));
        var verify = NewButton("Verify files", ButtonTone.Text);
        verify.Dock = DockStyle.Fill;
        verify.Margin = new Padding(0, 0, 6, 0);
        verify.TabIndex = 7;
        verify.AccessibleName = "Verify installed Solcord files";
        verify.Click += (_, _) => RunAction("Verification", () => _engine.VerifyInstalled() ? $"Installed files match {_manifest.CandidateLabel}." : $"Installed files do not match {_manifest.CandidateLabel}.");
        var launch = NewButton("Open Solcord", ButtonTone.Text);
        launch.Dock = DockStyle.Fill;
        launch.Margin = new Padding(6, 0, 6, 0);
        launch.TabIndex = 8;
        launch.AccessibleName = "Open Solcord";
        launch.Click += (_, _) => RunOperation("launch");
        var recovery = NewButton("Recovery files", ButtonTone.Text);
        recovery.Dock = DockStyle.Fill;
        recovery.Margin = new Padding(6, 0, 0, 0);
        recovery.TabIndex = 9;
        recovery.AccessibleName = "Open recovery folder";
        recovery.Click += (_, _) => RunAction("Recovery files", () => {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "BetterDiscord", "solcord-installer")) {UseShellExecute = true});
            return "Opened the Solcord recovery folder.";
        });
        utilities.Controls.Add(verify, 0, 0);
        utilities.Controls.Add(launch, 1, 0);
        utilities.Controls.Add(recovery, 2, 0);
        return utilities;
    }

    private Control BuildFooter()
    {
        var footer = new Panel {Dock = DockStyle.Fill, BackColor = CanvasRaised, Padding = new Padding(34, 8, 28, 8)};
        footer.Paint += (_, args) => {using var line = new Pen(LineQuiet, 1); args.Graphics.DrawLine(line, 0, 0, footer.ClientSize.Width, 0);};
        var layout = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = Padding.Empty, Padding = Padding.Empty, BackColor = Color.Transparent};
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88));
        var copy = NewLabel("Built on BetterDiscord  ·  local, reversible, hash-verified", 8.5f, FontStyle.Regular, Muted);
        copy.Dock = DockStyle.Fill;
        copy.TextAlign = ContentAlignment.MiddleLeft;
        var close = NewButton("Close", ButtonTone.Text);
        close.Dock = DockStyle.Fill;
        close.Margin = Padding.Empty;
        close.TabIndex = 10;
        close.AccessibleName = "Close installer";
        close.Click += (_, _) => Close();
        layout.Controls.Add(copy, 0, 0);
        layout.Controls.Add(close, 1, 0);
        footer.Controls.Add(layout);
        return footer;
    }

    private void RefreshTargets()
    {
        _targets.Items.Clear();
        foreach (DiscordTarget target in _engine.DetectTargets()) _targets.Items.Add(target);
        _targets.DisplayMember = nameof(DiscordTarget.Channel);
        if (_targets.Items.Count > 0) _targets.SelectedIndex = 0;
        else {
            SetState("DISCORD NOT FOUND", "Install Discord first", "Stable, PTB, or Canary was not detected on this PC.", Warning, null);
            SetActionAvailability(false, false, false, false, false);
        }
    }

    private void RefreshInstallationState()
    {
        bool targetReady = _targets.SelectedItem is DiscordTarget;
        if (!targetReady) {SetActionAvailability(false, false, false, false, false); return;}
        try
        {
            bool pending = _engine.HasPendingRecovery();
            bool managed = _engine.HasManagedInstall();
            bool packageRecorded = managed && _engine.IsCurrentPackageRecorded();
            bool exact = !pending && packageRecorded && _engine.VerifyInstalled();
            SetActionAvailability(targetReady, managed, exact, packageRecorded, pending);
            if (pending) SetState("RECOVERY REQUIRED", "Restore the last known state", "A prior operation stopped before completion. Roll back before making another change.", Warning, "rollback");
            else if (exact) SetState("INSTALLED · VERIFIED", $"{_manifest.CandidateLabel} is active here", "The installed core and this package match byte for byte. Open Solcord from its branded Windows entry.", Teal, "launch");
            else if (packageRecorded) SetState("REPAIR AVAILABLE", "Restore this exact build", "The receipt matches this package, but one or more installed bytes differ.", Warning, "repair");
            else if (managed) SetState("UPDATE AVAILABLE", $"Move this Discord to {_manifest.CandidateLabel}", "The current Solcord build is preserved as a rollback point before replacement.", Warning, "update");
            else SetState("READY", $"Install {_manifest.CandidateLabel}", "Solcord will connect to the selected Discord channel without replacing your data.", Teal, "install");
        }
        catch (Exception error)
        {
            SetActionAvailability(false, false, false, false, _engine.HasPendingRecovery());
            SetState("NEEDS ATTENTION", "Review before continuing", error.Message, Ember, _engine.HasPendingRecovery() ? "rollback" : null);
        }
    }

    private void SetActionAvailability(bool targetReady, bool managed, bool exact, bool packageRecorded, bool pending)
    {
        _actions["install"].Button.Enabled = targetReady && !managed && !pending;
        _actions["update"].Button.Enabled = targetReady && managed && !packageRecorded && !pending;
        _actions["repair"].Button.Enabled = targetReady && packageRecorded && !pending;
        _actions["rollback"].Button.Enabled = targetReady && (managed || pending);
        _actions["uninstall"].Button.Enabled = targetReady && managed && !pending;
        foreach (ActionVisual visual in _actions.Values) ApplyButtonTone(visual.Button, visual.Tone);
        _signalTarget.Text = targetReady ? $"DISCORD {Target().Channel.ToUpperInvariant()}" : "DISCORD";
        _signalCore.Text = pending ? "RECOVERY HOLD" : managed ? exact ? "CORE VERIFIED" : "CORE DETECTED" : "CORE READY";
        _signalProduct.Text = exact ? $"{_manifest.CandidateLabel.ToUpperInvariant()} ACTIVE" : _manifest.CandidateLabel.ToUpperInvariant();
        _signalCore.ForeColor = pending ? Warning : exact ? Teal : Muted;
        _signalProduct.ForeColor = exact ? Teal : Ember;
    }

    private void SetState(string kicker, string title, string body, Color color, string? recommendedKey)
    {
        _stateKicker.Text = kicker;
        _stateKicker.ForeColor = color;
        _stateTitle.Text = title;
        _stateBody.Text = body;
        _stateRail.BackColor = color;
        _recommendedKey = recommendedKey;
        _primaryAction.Enabled = recommendedKey is not null;
        _primaryAction.Text = recommendedKey switch {"install" => "Install Solcord", "update" => "Update Solcord", "repair" => "Repair now", "rollback" => "Roll back", "launch" => "Open Solcord", _ => "No action needed"};
        _primaryAction.AccessibleDescription = body;
        ApplyButtonTone(_primaryAction, ButtonTone.Primary);
    }

    private DiscordTarget Target() => _targets.SelectedItem as DiscordTarget ?? throw new InvalidOperationException("Select an installed Discord channel first.");

    private string CompleteInstall(InstallReceipt receipt)
    {
        string result = $"Installed and verified {receipt.CandidateLabel ?? "the selected candidate"} for Discord {receipt.Channel} {receipt.DiscordVersion}.";
        return _engine.LastLauncherWarning is null ? $"{result} Windows Search now includes Solcord." : $"{result} {_engine.LastLauncherWarning}";
    }

    private void RunOperation(string key)
    {
        ActionVisual? visual = _actions.GetValueOrDefault(key);
        string title = visual?.Title ?? (key == "launch" ? "Open Solcord" : "Solcord operation");
        RunAction(title, () => key switch {
            "install" => CompleteInstall(_engine.InstallNew(Target())),
            "update" => CompleteInstall(_engine.Update(Target())),
            "repair" => CompleteInstall(_engine.Repair(Target())),
            "rollback" => CompleteRollback(_engine.RollBack(Target())),
            "uninstall" => Uninstall(),
            "launch" => Launch(),
            _ => throw new InvalidOperationException("The selected Solcord operation is unavailable.")
        });
    }

    private string Launch()
    {
        _engine.Launch(Target());
        return $"Opened Discord. A Solcord {_manifest.CandidateLabel} confirmation appears after the client is ready.";
    }

    private string CompleteRollback(string backupDirectory)
    {
        string result = $"Restored the previous installation from {backupDirectory}. The Solcord Windows Search entry was removed so it cannot misrepresent the restored runtime.";
        return _engine.LastLauncherWarning is null ? result : $"{result} {_engine.LastLauncherWarning}";
    }

    private string Uninstall()
    {
        DialogResult result = MessageBox.Show("Remove Solcord from this Discord installation?\n\nDiscord returns to normal. Plugins, themes, settings, and recovery files stay on disk.", "Uninstall Solcord", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
        if (result != DialogResult.Yes) return "Uninstall cancelled. Nothing changed.";
        string backup = _engine.Uninstall(Target());
        string message = $"Solcord was removed. A recovery copy was saved at {backup}.";
        return _engine.LastLauncherWarning is null ? message : $"{message} {_engine.LastLauncherWarning}";
    }

    private void RunAction(string actionName, Func<string> action)
    {
        UseWaitCursor = true;
        foreach (ActionVisual visual in _actions.Values) visual.Button.Enabled = false;
        _primaryAction.Enabled = false;
        SetState("WORKING", actionName, "The verified local operation is running. Discord account data is not being touched.", Teal, null);
        try {string result = action(); RefreshInstallationState(); _stateBody.Text = result;}
        catch (Exception error) {RefreshInstallationState(); _stateKicker.Text = "COULD NOT FINISH"; _stateKicker.ForeColor = Ember; _stateTitle.Text = actionName; _stateBody.Text = error.Message; _stateRail.BackColor = Ember;}
        finally {UseWaitCursor = false;}
    }

    private static Button NewButton(string text, ButtonTone tone)
    {
        var button = new Button {Text = text, Height = 40, Padding = new Padding(12, 0, 12, 0), FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, UseVisualStyleBackColor = false, Font = new Font("Segoe UI Variable Text", 9f, FontStyle.Bold)};
        ApplyButtonTone(button, tone);
        return button;
    }

    private static void ApplyButtonTone(Button button, ButtonTone tone)
    {
        if (!button.Enabled) {
            button.BackColor = CanvasRaised;
            button.ForeColor = Color.FromArgb(96, 110, 118);
            button.FlatAppearance.BorderColor = LineQuiet;
            button.FlatAppearance.MouseOverBackColor = CanvasRaised;
            button.FlatAppearance.MouseDownBackColor = CanvasRaised;
            button.FlatAppearance.BorderSize = 1;
            return;
        }
        button.BackColor = tone switch {ButtonTone.Primary => Teal, ButtonTone.Text => Canvas, ButtonTone.Danger => CanvasRaised, _ => SurfaceRaised};
        button.ForeColor = tone switch {ButtonTone.Primary => Color.FromArgb(6, 21, 21), ButtonTone.Danger => Color.FromArgb(242, 159, 139), _ => Bone};
        button.FlatAppearance.BorderColor = tone switch {ButtonTone.Primary => Teal, ButtonTone.Danger => Color.FromArgb(113, 57, 48), ButtonTone.Text => Canvas, _ => Line};
        button.FlatAppearance.BorderSize = tone == ButtonTone.Text ? 0 : 1;
        button.FlatAppearance.MouseOverBackColor = tone switch {ButtonTone.Primary => Color.FromArgb(104, 204, 193), ButtonTone.Danger => Color.FromArgb(57, 30, 27), _ => Color.FromArgb(37, 49, 55)};
        button.FlatAppearance.MouseDownBackColor = tone == ButtonTone.Primary ? TealPressed : Canvas;
    }

    private static Label NewLabel(string text, float size, FontStyle style, Color color, bool display = false) => new() {Text = text, Font = new Font(display ? "Bahnschrift" : "Segoe UI Variable Text", size, style), ForeColor = color, BackColor = Color.Transparent, UseMnemonic = false};

    private static Image? LoadBrandMark()
    {
        using Stream? stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Solcord.Installer.Resources.solcord-mark.png");
        if (stream is null) return null;
        using var source = Image.FromStream(stream);
        return new Bitmap(source);
    }

    private enum ButtonTone {Primary, Quiet, Text, Danger}
    private sealed record ActionVisual(string Title, string Description, Button Button, ButtonTone Tone);
}
