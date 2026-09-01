// SPDX-License-Identifier: Apache-2.0

using System.Reflection;

namespace Solcord.Installer;

internal sealed class InstallerForm : Form
{
    private static readonly Color Canvas = Color.FromArgb(247, 245, 240);
    private static readonly Color Surface = Color.FromArgb(255, 255, 253);
    private static readonly Color Ink = Color.FromArgb(23, 29, 31);
    private static readonly Color Body = Color.FromArgb(55, 66, 69);
    private static readonly Color Muted = Color.FromArgb(91, 105, 108);
    private static readonly Color Line = Color.FromArgb(198, 205, 201);
    private static readonly Color Teal = Color.FromArgb(13, 107, 99);
    private static readonly Color TealHover = Color.FromArgb(9, 84, 78);
    private static readonly Color TealWash = Color.FromArgb(227, 242, 238);
    private static readonly Color Warning = Color.FromArgb(128, 75, 8);
    private static readonly Color WarningWash = Color.FromArgb(255, 241, 214);
    private static readonly Color Danger = Color.FromArgb(145, 42, 42);
    private static readonly Color Disabled = Color.FromArgb(229, 232, 228);
    private static readonly Color DisabledInk = Color.FromArgb(92, 102, 100);

    private readonly InstallerEngine _engine;
    private readonly ReleaseManifest _manifest;
    private readonly ComboBox _targets = new();
    private readonly Label _stateKind = new();
    private readonly Label _stateTitle = new();
    private readonly Label _stateBody = new();
    private readonly Panel _statePanel = new();
    private readonly Button _primaryAction;
    private readonly Button _verifyAction;
    private readonly Button _recoveryAction;
    private readonly Label _maintenanceHeading = new();
    private readonly TableLayoutPanel _maintenanceList = new();
    private readonly TableLayoutPanel _workspace = new();
    private readonly Dictionary<string, ActionVisual> _actions = new(StringComparer.Ordinal);
    private string? _recommendedKey;
    private Color _stateBorder = Color.FromArgb(118, 171, 163);

    internal InstallerForm(string bundleRoot)
    {
        _engine = new InstallerEngine(bundleRoot, Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData));
        _manifest = _engine.LoadManifest();
        _primaryAction = NewButton("Continue", ButtonTone.Primary);
        _verifyAction = NewButton("Verify files", ButtonTone.Outline);
        _recoveryAction = NewButton("Open recovery folder", ButtonTone.Outline);

        Text = $"Solcord Setup · {_manifest.CandidateLabel}";
        ClientSize = new Size(900, 620);
        MinimumSize = new Size(760, 600);
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        AutoScaleDimensions = new SizeF(96F, 96F);
        BackColor = Canvas;
        ForeColor = Ink;
        Font = new Font("Segoe UI Variable Text", 9.5f);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        DoubleBuffered = true;

        Controls.Add(BuildShell());
        AcceptButton = _primaryAction;
        Load += (_, _) => RefreshTargets();
        Shown += (_, _) => _primaryAction.Focus();
        _targets.SelectedIndexChanged += (_, _) => RefreshInstallationState();
    }

    private Control BuildShell()
    {
        var shell = new TableLayoutPanel {Dock = DockStyle.Fill, BackColor = Canvas, ColumnCount = 1, RowCount = 3, Margin = Padding.Empty, Padding = Padding.Empty};
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 84));
        shell.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        shell.Controls.Add(BuildHeader(), 0, 0);
        shell.Controls.Add(BuildWorkspace(), 0, 1);
        shell.Controls.Add(BuildFooter(), 0, 2);
        return shell;
    }

    private Control BuildHeader()
    {
        var header = new Panel {Dock = DockStyle.Fill, BackColor = Surface, Padding = new Padding(38, 18, 38, 16)};
        header.Paint += (_, args) => {using var rule = new Pen(Line, 1); args.Graphics.DrawLine(rule, 0, header.ClientSize.Height - 1, header.ClientSize.Width, header.ClientSize.Height - 1);};
        var layout = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, BackColor = Color.Transparent, Margin = Padding.Empty, Padding = Padding.Empty};
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 58));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        var markHost = new Panel {Dock = DockStyle.Fill, BackColor = Color.Transparent, Margin = Padding.Empty};
        var mark = new PictureBox {Location = new Point(0, 3), Size = new Size(44, 44), SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.Transparent, Image = LoadBrandMark(), AccessibleName = "Solcord cord-cut S mark", TabStop = false};
        markHost.Controls.Add(mark);
        var copy = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, BackColor = Color.Transparent, Margin = Padding.Empty, Padding = Padding.Empty};
        copy.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        copy.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var title = NewLabel("Solcord Setup", 20f, FontStyle.Bold, Ink);
        title.Dock = DockStyle.Fill;
        title.TextAlign = ContentAlignment.BottomLeft;
        var subtitle = NewLabel("Install, repair, or restore your local Discord client.", 9.5f, FontStyle.Regular, Body);
        subtitle.Dock = DockStyle.Fill;
        subtitle.TextAlign = ContentAlignment.TopLeft;
        copy.Controls.Add(title, 0, 0);
        copy.Controls.Add(subtitle, 0, 1);
        layout.Controls.Add(markHost, 0, 0);
        layout.Controls.Add(copy, 1, 0);
        header.Controls.Add(layout);
        return header;
    }

    private Control BuildWorkspace()
    {
        var scroll = new Panel {Dock = DockStyle.Fill, BackColor = Canvas, AutoScroll = true};
        _workspace.AutoSize = true;
        _workspace.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        _workspace.Dock = DockStyle.Top;
        _workspace.BackColor = Canvas;
        _workspace.ColumnCount = 1;
        _workspace.RowCount = 6;
        _workspace.Padding = new Padding(42, 10, 42, 10);
        _workspace.Margin = Padding.Empty;
        _workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        _workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 100));
        _workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        _workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        _workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 156));
        _workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        _workspace.Controls.Add(BuildTargetField(), 0, 0);
        _workspace.Controls.Add(BuildStatePanel(), 0, 1);
        _workspace.Controls.Add(BuildPrimaryAction(), 0, 2);
        _workspace.Controls.Add(BuildMaintenanceHeader(), 0, 3);
        _workspace.Controls.Add(BuildMaintenanceList(), 0, 4);
        _workspace.Controls.Add(BuildUtilities(), 0, 5);
        scroll.Controls.Add(_workspace);
        return scroll;
    }

    private Control BuildTargetField()
    {
        var field = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 2, BackColor = Canvas, Margin = Padding.Empty, Padding = Padding.Empty};
        field.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 166));
        field.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        field.RowStyles.Add(new RowStyle(SizeType.Absolute, 25));
        field.RowStyles.Add(new RowStyle(SizeType.Absolute, 39));
        var copy = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, BackColor = Color.Transparent, Margin = Padding.Empty, Padding = Padding.Empty};
        copy.RowStyles.Add(new RowStyle(SizeType.Absolute, 31));
        copy.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var label = NewLabel("Discord installation", 9.5f, FontStyle.Bold, Ink);
        label.Dock = DockStyle.Fill;
        label.TextAlign = ContentAlignment.BottomLeft;
        var help = NewLabel("Stable, PTB, or Canary", 8.5f, FontStyle.Regular, Muted);
        help.Dock = DockStyle.Fill;
        help.TextAlign = ContentAlignment.TopLeft;
        copy.Controls.Add(label, 0, 0);
        copy.Controls.Add(help, 0, 1);
        _targets.DropDownStyle = ComboBoxStyle.DropDownList;
        _targets.Dock = DockStyle.Fill;
        _targets.Margin = new Padding(0, 2, 0, 4);
        _targets.BackColor = Surface;
        _targets.ForeColor = Ink;
        _targets.FlatStyle = FlatStyle.Flat;
        _targets.TabIndex = 0;
        _targets.AccessibleName = "Discord installation channel";
        _targets.AccessibleDescription = "Choose Stable, PTB, or Canary when installed.";
        field.Controls.Add(copy, 0, 0);
        field.SetRowSpan(copy, 2);
        field.Controls.Add(_targets, 1, 0);
        field.SetRowSpan(_targets, 2);
        return field;
    }

    private Control BuildStatePanel()
    {
        _statePanel.Dock = DockStyle.Fill;
        _statePanel.Margin = new Padding(0, 4, 0, 8);
        _statePanel.Padding = new Padding(22, 10, 22, 10);
        _statePanel.BackColor = TealWash;
        _statePanel.Paint += (_, args) => {using var border = new Pen(_stateBorder, 1); args.Graphics.DrawRectangle(border, 0, 0, _statePanel.ClientSize.Width - 1, _statePanel.ClientSize.Height - 1);};
        var copy = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, BackColor = Color.Transparent, Margin = Padding.Empty, Padding = Padding.Empty};
        copy.RowStyles.Add(new RowStyle(SizeType.Absolute, 18));
        copy.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        copy.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        _stateKind.Dock = DockStyle.Fill;
        _stateKind.Font = new Font("Segoe UI Variable Text", 9f, FontStyle.Bold);
        _stateKind.ForeColor = Teal;
        _stateTitle.Dock = DockStyle.Fill;
        _stateTitle.Font = new Font("Segoe UI Variable Text", 15f, FontStyle.Bold);
        _stateTitle.ForeColor = Ink;
        _stateBody.Dock = DockStyle.Fill;
        _stateBody.Font = new Font("Segoe UI Variable Text", 9.25f, FontStyle.Regular);
        _stateBody.ForeColor = Body;
        _stateBody.AutoEllipsis = true;
        _stateBody.AccessibleName = "Installation state details";
        copy.Controls.Add(_stateKind, 0, 0);
        copy.Controls.Add(_stateTitle, 0, 1);
        copy.Controls.Add(_stateBody, 0, 2);
        _statePanel.Controls.Add(copy);
        return _statePanel;
    }

    private Control BuildPrimaryAction()
    {
        var row = new Panel {Dock = DockStyle.Fill, BackColor = Canvas, Padding = new Padding(0, 4, 0, 6)};
        _primaryAction.Dock = DockStyle.Left;
        _primaryAction.Width = 252;
        _primaryAction.TabIndex = 1;
        _primaryAction.AccessibleName = "Recommended action";
        _primaryAction.Click += (_, _) => {if (_recommendedKey is not null) RunOperation(_recommendedKey);};
        row.Controls.Add(_primaryAction);
        return row;
    }

    private Control BuildMaintenanceHeader()
    {
        var header = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 1, BackColor = Canvas, Margin = Padding.Empty, Padding = Padding.Empty};
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        _maintenanceHeading.Text = "Manage this installation";
        _maintenanceHeading.Font = new Font("Segoe UI Variable Text", 11f, FontStyle.Bold);
        _maintenanceHeading.ForeColor = Ink;
        _maintenanceHeading.Dock = DockStyle.Fill;
        _maintenanceHeading.TextAlign = ContentAlignment.MiddleLeft;
        header.Controls.Add(_maintenanceHeading, 0, 0);
        return header;
    }

    private Control BuildMaintenanceList()
    {
        _maintenanceList.Dock = DockStyle.Top;
        _maintenanceList.ColumnCount = 1;
        _maintenanceList.RowCount = 3;
        _maintenanceList.BackColor = Surface;
        _maintenanceList.Margin = Padding.Empty;
        _maintenanceList.Padding = Padding.Empty;
        for (int i = 0; i < 3; i++) _maintenanceList.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        _maintenanceList.Controls.Add(ActionRow("repair", "Repair Solcord", "Reinstall this exact package if files are missing or damaged.", 2, 0), 0, 0);
        _maintenanceList.Controls.Add(ActionRow("rollback", "Roll back", "Restore the verified backup made before the last change.", 3, 1), 0, 1);
        _maintenanceList.Controls.Add(ActionRow("uninstall", "Uninstall Solcord", "Remove Solcord and keep plugins, themes, settings, and recovery files.", 4, 2, ButtonTone.Danger), 0, 2);
        return _maintenanceList;
    }

    private Control ActionRow(string key, string title, string description, int tabIndex, int rowIndex, ButtonTone tone = ButtonTone.Outline)
    {
        var row = new Panel {Dock = DockStyle.Fill, BackColor = Surface, Margin = Padding.Empty, Padding = new Padding(18, 4, 14, 4)};
        row.Paint += (_, args) => {if (rowIndex < 2) {using var rule = new Pen(Line, 1); args.Graphics.DrawLine(rule, 18, row.ClientSize.Height - 1, row.ClientSize.Width - 14, row.ClientSize.Height - 1);}};
        var copy = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, BackColor = Color.Transparent, Margin = Padding.Empty, Padding = new Padding(0, 0, 14, 0)};
        copy.RowStyles.Add(new RowStyle(SizeType.Absolute, 21));
        copy.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var name = NewLabel(title, 9.5f, FontStyle.Bold, Ink);
        name.Dock = DockStyle.Fill;
        var details = NewLabel(description, 8.5f, FontStyle.Regular, Body);
        details.Dock = DockStyle.Fill;
        details.AutoEllipsis = true;
        copy.Controls.Add(name, 0, 0);
        copy.Controls.Add(details, 0, 1);
        var button = NewButton(title.Replace("Solcord", "").Trim(), tone);
        button.Dock = DockStyle.Right;
        button.Width = 136;
        button.Margin = Padding.Empty;
        button.TextAlign = ContentAlignment.MiddleCenter;
        button.TabIndex = tabIndex;
        button.AccessibleName = title;
        button.AccessibleDescription = description;
        button.Click += (_, _) => RunOperation(key);
        row.Controls.Add(copy);
        row.Controls.Add(button);
        button.BringToFront();
        _actions[key] = new ActionVisual(title, description, row, button, tone, rowIndex);
        return row;
    }

    private Control BuildUtilities()
    {
        var utilities = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, BackColor = Canvas, Margin = Padding.Empty, Padding = new Padding(0, 5, 0, 0)};
        utilities.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 144));
        utilities.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 196));
        utilities.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        _verifyAction.Dock = DockStyle.Fill;
        _verifyAction.Margin = new Padding(0, 0, 8, 0);
        _verifyAction.TabIndex = 5;
        _verifyAction.AccessibleName = "Verify installed Solcord files";
        _verifyAction.Click += (_, _) => RunAction("Verification", () => _engine.VerifyInstalled() ? $"Installed files match {_manifest.CandidateLabel}." : $"Installed files do not match {_manifest.CandidateLabel}.");
        _recoveryAction.Dock = DockStyle.Fill;
        _recoveryAction.Margin = new Padding(0, 0, 8, 0);
        _recoveryAction.TabIndex = 6;
        _recoveryAction.AccessibleName = "Open recovery folder";
        _recoveryAction.Click += (_, _) => RunAction("Recovery files", () => {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "BetterDiscord", "solcord-installer")) {UseShellExecute = true});
            return "Opened the Solcord recovery folder.";
        });
        utilities.Controls.Add(_verifyAction, 0, 0);
        utilities.Controls.Add(_recoveryAction, 1, 0);
        return utilities;
    }

    private Control BuildFooter()
    {
        var footer = new Panel {Dock = DockStyle.Fill, BackColor = Surface, Padding = new Padding(38, 7, 30, 7)};
        footer.Paint += (_, args) => {using var rule = new Pen(Line, 1); args.Graphics.DrawLine(rule, 0, 0, footer.ClientSize.Width, 0);};
        var layout = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, BackColor = Color.Transparent, Margin = Padding.Empty, Padding = Padding.Empty};
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 102));
        var note = NewLabel("Local and reversible. Built on BetterDiscord.", 8.75f, FontStyle.Regular, Muted);
        note.Dock = DockStyle.Fill;
        note.TextAlign = ContentAlignment.MiddleLeft;
        var close = NewButton("Close", ButtonTone.Outline);
        close.Dock = DockStyle.Fill;
        close.Margin = Padding.Empty;
        close.TabIndex = 7;
        close.AccessibleName = "Close installer";
        close.Click += (_, _) => Close();
        layout.Controls.Add(note, 0, 0);
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
        else {SetState("Discord not found", "Install Discord first", "Stable, PTB, or Canary was not detected on this PC.", StateTone.Warning, null); SetActionAvailability(false, false, false, false, false);}
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
            if (pending) SetState("Recovery required", "Restore the last known state", "A prior operation stopped early. Roll back before making another change.", StateTone.Warning, "rollback");
            else if (exact) SetState("Installed and verified", $"{_manifest.CandidateLabel} is ready", "The installed core matches this package byte for byte.", StateTone.Protected, "launch");
            else if (packageRecorded) SetState("Repair available", "Restore this exact build", "The receipt matches this package, but the installed files differ.", StateTone.Warning, "repair");
            else if (managed) SetState("Update available", $"Update to {_manifest.CandidateLabel}", "Your current Solcord core is saved as a rollback point first.", StateTone.Warning, "update");
            else SetState("Ready to install", $"Install {_manifest.CandidateLabel}", "Your plugins, themes, settings, and custom CSS stay in place.", StateTone.Protected, "install");
        }
        catch (Exception error)
        {
            SetActionAvailability(false, false, false, false, _engine.HasPendingRecovery());
            SetState("Needs attention", "Review before continuing", error.Message, StateTone.Danger, _engine.HasPendingRecovery() ? "rollback" : null);
        }
    }

    private void SetActionAvailability(bool targetReady, bool managed, bool exact, bool packageRecorded, bool pending)
    {
        SetManagedAction("repair", targetReady && packageRecorded && !pending);
        SetManagedAction("rollback", targetReady && (managed || pending));
        SetManagedAction("uninstall", targetReady && managed && !pending);
        int visibleMaintenanceRows = _actions.Values.Count(action => action.Row.Visible);
        _maintenanceList.Height = visibleMaintenanceRows * 52;
        _workspace.RowStyles[4].Height = visibleMaintenanceRows * 52;
        bool anyMaintenance = _actions.Values.Any(action => action.Row.Visible);
        _maintenanceHeading.Text = anyMaintenance ? "Manage this installation" : "No maintenance needed";
        _verifyAction.Enabled = targetReady && managed && !pending;
        ApplyButtonTone(_verifyAction, ButtonTone.Outline);
        _recoveryAction.Enabled = Directory.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "BetterDiscord", "solcord-installer"));
        ApplyButtonTone(_recoveryAction, ButtonTone.Outline);
    }

    private void SetManagedAction(string key, bool visible)
    {
        ActionVisual visual = _actions[key];
        visual.Row.Visible = visible;
        visual.Button.Enabled = visible;
        _maintenanceList.RowStyles[visual.RowIndex].Height = visible ? 52 : 0;
        ApplyButtonTone(visual.Button, visual.Tone);
    }

    private void SetState(string kind, string title, string body, StateTone tone, string? recommendedKey)
    {
        bool warning = tone == StateTone.Warning;
        bool danger = tone == StateTone.Danger;
        _stateKind.Text = kind;
        _stateKind.ForeColor = danger ? Danger : warning ? Warning : Teal;
        _stateTitle.Text = title;
        _stateBody.Text = body;
        _statePanel.BackColor = danger || warning ? WarningWash : TealWash;
        _stateBorder = danger ? Danger : warning ? Warning : Color.FromArgb(118, 171, 163);
        _statePanel.Invalidate();
        _recommendedKey = recommendedKey;
        _primaryAction.Enabled = recommendedKey is not null;
        _primaryAction.Text = recommendedKey switch {"install" => "Install Solcord", "update" => "Update Solcord", "repair" => "Repair Solcord", "rollback" => "Roll back", "launch" => "Open Solcord", _ => "No action available"};
        _primaryAction.AccessibleDescription = body;
        ApplyButtonTone(_primaryAction, danger ? ButtonTone.Danger : ButtonTone.Primary);
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
        string title = visual?.Title ?? (key == "launch" ? "Open Solcord" : key == "install" ? "Install Solcord" : key == "update" ? "Update Solcord" : "Solcord operation");
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
        return $"Opened Discord. Solcord {_manifest.CandidateLabel} confirms its version after the client is ready.";
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
        _verifyAction.Enabled = false;
        _recoveryAction.Enabled = false;
        SetState("Working", actionName, "Solcord is changing local installer files. Discord account data is not touched.", StateTone.Protected, null);
        try {string result = action(); RefreshInstallationState(); _stateBody.Text = result;}
        catch (Exception error) {RefreshInstallationState(); SetState("Could not finish", actionName, error.Message, StateTone.Danger, _engine.HasPendingRecovery() ? "rollback" : null);}
        finally {UseWaitCursor = false;}
    }

    private static Button NewButton(string text, ButtonTone tone)
    {
        var button = new Button {Text = text, Height = 44, Padding = new Padding(14, 0, 14, 0), FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, UseVisualStyleBackColor = false, Font = new Font("Segoe UI Variable Text", 9.25f, FontStyle.Bold), TextAlign = ContentAlignment.MiddleCenter};
        ApplyButtonTone(button, tone);
        return button;
    }

    private static void ApplyButtonTone(Button button, ButtonTone tone)
    {
        button.FlatAppearance.BorderSize = 1;
        if (!button.Enabled) {
            button.BackColor = Disabled;
            button.ForeColor = DisabledInk;
            button.FlatAppearance.BorderColor = Color.FromArgb(176, 183, 179);
            button.FlatAppearance.MouseOverBackColor = Disabled;
            button.FlatAppearance.MouseDownBackColor = Disabled;
            return;
        }
        button.BackColor = tone switch {ButtonTone.Primary => Teal, ButtonTone.Danger => Surface, _ => Surface};
        button.ForeColor = tone switch {ButtonTone.Primary => Color.White, ButtonTone.Danger => Danger, _ => Ink};
        button.FlatAppearance.BorderColor = tone switch {ButtonTone.Primary => Teal, ButtonTone.Danger => Danger, _ => Color.FromArgb(140, 151, 148)};
        button.FlatAppearance.MouseOverBackColor = tone switch {ButtonTone.Primary => TealHover, ButtonTone.Danger => Color.FromArgb(255, 238, 235), _ => Color.FromArgb(237, 241, 238)};
        button.FlatAppearance.MouseDownBackColor = tone switch {ButtonTone.Primary => Color.FromArgb(7, 70, 65), ButtonTone.Danger => Color.FromArgb(249, 222, 218), _ => Color.FromArgb(221, 228, 224)};
    }

    private static Label NewLabel(string text, float size, FontStyle style, Color color) => new() {Text = text, Font = new Font("Segoe UI Variable Text", size, style), ForeColor = color, BackColor = Color.Transparent, UseMnemonic = false};

    private static Image? LoadBrandMark()
    {
        using Stream? stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Solcord.Installer.Resources.solcord-mark.png");
        if (stream is null) return null;
        using var source = Image.FromStream(stream);
        return new Bitmap(source);
    }

    private enum ButtonTone {Primary, Outline, Danger}
    private enum StateTone {Protected, Warning, Danger}
    private sealed record ActionVisual(string Title, string Description, Panel Row, Button Button, ButtonTone Tone, int RowIndex);
}
