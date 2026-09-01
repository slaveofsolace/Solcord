// SPDX-License-Identifier: Apache-2.0

using System.Reflection;

namespace Solcord.Installer;

internal sealed class InstallerForm : Form
{
    private static readonly Color Canvas = Color.FromArgb(11, 15, 18);
    private static readonly Color CanvasRaised = Color.FromArgb(16, 22, 26);
    private static readonly Color Surface = Color.FromArgb(20, 27, 32);
    private static readonly Color SurfaceRaised = Color.FromArgb(27, 36, 42);
    private static readonly Color Line = Color.FromArgb(48, 62, 70);
    private static readonly Color LineQuiet = Color.FromArgb(32, 43, 49);
    private static readonly Color Bone = Color.FromArgb(242, 235, 220);
    private static readonly Color Body = Color.FromArgb(190, 201, 207);
    private static readonly Color Muted = Color.FromArgb(128, 145, 154);
    private static readonly Color Teal = Color.FromArgb(82, 184, 173);
    private static readonly Color TealPressed = Color.FromArgb(54, 140, 133);
    private static readonly Color Ember = Color.FromArgb(239, 111, 79);
    private static readonly Color Warning = Color.FromArgb(236, 181, 83);

    private readonly InstallerEngine _engine;
    private readonly ReleaseManifest _manifest;
    private readonly ComboBox _targets = new();
    private readonly Label _statusTitle = new();
    private readonly Label _statusBody = new();
    private readonly Panel _statusRail = new();
    private readonly Label _summary = new();
    private readonly Dictionary<string, ActionVisual> _actions = new(StringComparer.Ordinal);

    internal InstallerForm(string bundleRoot)
    {
        _engine = new InstallerEngine(bundleRoot, Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData));
        _manifest = _engine.LoadManifest();

        Text = "Solcord Installer";
        ClientSize = new Size(1020, 700);
        MinimumSize = new Size(860, 650);
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
            ColumnCount = 1,
            RowCount = 3,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 112));
        shell.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        shell.Controls.Add(BuildHeader(), 0, 0);
        shell.Controls.Add(BuildWorkspace(), 0, 1);
        shell.Controls.Add(BuildFooter(), 0, 2);
        Controls.Add(shell);

        Load += (_, _) => RefreshTargets();
        _targets.SelectedIndexChanged += (_, _) => RefreshInstallationState();
    }

    private Control BuildHeader()
    {
        var header = new Panel {Dock = DockStyle.Fill, BackColor = CanvasRaised, Padding = new Padding(30, 20, 30, 20)};
        header.Paint += (_, args) => {
            args.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var cord = new Pen(Color.FromArgb(34, Teal), 1.2f);
            args.Graphics.DrawBezier(cord, 170, 18, 350, 78, 610, 8, header.ClientSize.Width - 34, 60);
            args.Graphics.DrawBezier(cord, 240, 4, 440, 70, 680, 22, header.ClientSize.Width - 110, 92);
            using var baseline = new Pen(Line, 1);
            args.Graphics.DrawLine(baseline, 0, header.ClientSize.Height - 1, header.ClientSize.Width, header.ClientSize.Height - 1);
            using var notch = new SolidBrush(Ember);
            args.Graphics.FillRectangle(notch, 30, header.ClientSize.Height - 3, 34, 3);
        };

        var layout = new TableLayoutPanel {
            Dock = DockStyle.Fill,
            BackColor = Color.Transparent,
            ColumnCount = 3,
            RowCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 66));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 215));

        var markFrame = new Panel {Dock = DockStyle.Fill, Margin = new Padding(0, 0, 14, 0), Padding = new Padding(7), BackColor = Color.Transparent};
        markFrame.Paint += (_, args) => {
            using var border = new Pen(Color.FromArgb(94, Teal), 1);
            args.Graphics.DrawRectangle(border, 0, 0, markFrame.ClientSize.Width - 1, markFrame.ClientSize.Height - 1);
        };
        var mark = new PictureBox {
            Dock = DockStyle.Fill,
            Margin = Padding.Empty,
            SizeMode = PictureBoxSizeMode.Zoom,
            Image = LoadBrandMark(),
            AccessibleName = "Solcord cord-cut S mark",
            TabStop = false
        };
        markFrame.Controls.Add(mark);

        var nameStack = new Panel {Dock = DockStyle.Fill, Margin = Padding.Empty, BackColor = Color.Transparent};
        var name = NewLabel("SOLCORD", 19, FontStyle.Bold, Bone);
        name.AutoSize = true;
        name.Location = new Point(8, 7);
        var product = NewLabel("WINDOWS INSTALLER  /  BETTERDISCORD FORK", 8.5f, FontStyle.Bold, Teal);
        product.AutoSize = true;
        product.Location = new Point(10, 43);
        nameStack.Controls.Add(name);
        nameStack.Controls.Add(product);

        var buildStack = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Margin = Padding.Empty, Padding = new Padding(0, 7, 0, 7), BackColor = Color.Transparent};
        buildStack.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        buildStack.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        buildStack.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var build = NewLabel(_manifest.CandidateLabel, 10, FontStyle.Bold, Bone);
        build.Dock = DockStyle.Fill;
        build.TextAlign = ContentAlignment.BottomRight;
        var unsigned = NewLabel("UNSIGNED RELEASE CANDIDATE", 8, FontStyle.Regular, Muted);
        unsigned.Dock = DockStyle.Fill;
        unsigned.TextAlign = ContentAlignment.TopRight;
        buildStack.Controls.Add(build, 0, 0);
        buildStack.Controls.Add(unsigned, 0, 1);

        layout.Controls.Add(markFrame, 0, 0);
        layout.Controls.Add(nameStack, 1, 0);
        layout.Controls.Add(buildStack, 2, 0);
        header.Controls.Add(layout);
        return header;
    }

    private Control BuildWorkspace()
    {
        var workspace = new TableLayoutPanel {
            Dock = DockStyle.Fill,
            BackColor = Canvas,
            ColumnCount = 2,
            RowCount = 1,
            Padding = new Padding(30, 24, 30, 20),
            Margin = Padding.Empty
        };
        workspace.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        workspace.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 310));
        Control actionWorkspace = BuildActionWorkspace();
        actionWorkspace.TabIndex = 0;
        Control installOverview = BuildInstallOverview();
        installOverview.TabIndex = 1;
        workspace.Controls.Add(actionWorkspace, 0, 0);
        workspace.Controls.Add(installOverview, 1, 0);
        return workspace;
    }

    private Control BuildActionWorkspace()
    {
        var region = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Margin = new Padding(0, 0, 22, 0), Padding = Padding.Empty, BackColor = Canvas};
        region.RowStyles.Add(new RowStyle(SizeType.Absolute, 82));
        region.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var intro = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Margin = Padding.Empty, Padding = Padding.Empty, BackColor = Canvas};
        intro.RowStyles.Add(new RowStyle(SizeType.Absolute, 18));
        intro.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        intro.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var eyebrow = NewLabel("CHOOSE AN ACTION", 8.5f, FontStyle.Bold, Teal);
        eyebrow.Dock = DockStyle.Fill;
        var heading = NewLabel("Install, update, or recover.", 23, FontStyle.Bold, Bone, display: true);
        heading.Dock = DockStyle.Fill;
        heading.TextAlign = ContentAlignment.MiddleLeft;
        _summary.Text = "Pick what you need. Solcord changes only its core and Discord hook.";
        _summary.Font = new Font("Segoe UI Variable Text", 9.5f, FontStyle.Regular);
        _summary.ForeColor = Body;
        _summary.Dock = DockStyle.Fill;
        _summary.UseMnemonic = false;
        intro.Controls.Add(eyebrow, 0, 0);
        intro.Controls.Add(heading, 0, 1);
        intro.Controls.Add(_summary, 0, 2);

        var actions = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Margin = Padding.Empty, Padding = Padding.Empty, BackColor = Canvas};
        for (int i = 0; i < 5; i++) actions.RowStyles.Add(new RowStyle(SizeType.Percent, 20));
        actions.Controls.Add(ActionRow("install", "01", "Install Solcord", "Add Solcord to this Discord installation.", () => CompleteInstall(_engine.InstallNew(Target()))), 0, 0);
        actions.Controls.Add(ActionRow("update", "02", "Update Solcord", $"Move to {_manifest.CandidateLabel}. A rollback is saved first.", () => CompleteInstall(_engine.Update(Target()))), 0, 1);
        actions.Controls.Add(ActionRow("repair", "03", "Repair Solcord", "Reinstall this build without touching your data.", () => CompleteInstall(_engine.Repair(Target()))), 0, 2);
        actions.Controls.Add(ActionRow("rollback", "04", "Roll Back", "Restore the backup made before the last change.", () => $"Restored the previous installation from {_engine.RollBack(Target())}."), 0, 3);
        actions.Controls.Add(ActionRow("uninstall", "05", "Uninstall Solcord", "Remove Solcord. Keep plugins, themes, and settings.", Uninstall), 0, 4);

        region.Controls.Add(intro, 0, 0);
        region.Controls.Add(actions, 0, 1);
        return region;
    }

    private Control ActionRow(string key, string index, string title, string description, Func<string> action)
    {
        var row = new Panel {Dock = DockStyle.Fill, Margin = Padding.Empty, Padding = new Padding(0, 8, 0, 8), BackColor = Canvas, TabIndex = int.Parse(index)};
        row.Paint += (_, args) => {
            using var line = new Pen(LineQuiet, 1);
            args.Graphics.DrawLine(line, 0, row.ClientSize.Height - 1, row.ClientSize.Width, row.ClientSize.Height - 1);
        };
        var layout = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, Margin = Padding.Empty, Padding = Padding.Empty, BackColor = Color.Transparent};
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 42));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 138));

        var indexLabel = NewLabel(index, 9, FontStyle.Bold, Muted);
        indexLabel.Dock = DockStyle.Fill;
        indexLabel.TextAlign = ContentAlignment.MiddleLeft;

        var copy = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Margin = Padding.Empty, Padding = new Padding(0, 1, 12, 1), BackColor = Color.Transparent};
        copy.RowStyles.Add(new RowStyle(SizeType.Percent, 48));
        copy.RowStyles.Add(new RowStyle(SizeType.Percent, 52));
        var titleLabel = NewLabel(title, 10, FontStyle.Bold, Bone);
        titleLabel.Dock = DockStyle.Fill;
        titleLabel.TextAlign = ContentAlignment.BottomLeft;
        var descriptionLabel = NewLabel(description, 8.75f, FontStyle.Regular, Muted);
        descriptionLabel.Dock = DockStyle.Fill;
        descriptionLabel.TextAlign = ContentAlignment.TopLeft;
        descriptionLabel.AutoEllipsis = true;
        copy.Controls.Add(titleLabel, 0, 0);
        copy.Controls.Add(descriptionLabel, 0, 1);

        var button = NewButton(title, ButtonTone.Quiet);
        button.Size = new Size(126, 38);
        button.Anchor = AnchorStyles.Right;
        button.Margin = new Padding(12, 0, 0, 0);
        button.TabIndex = 0;
        button.AccessibleName = title;
        button.AccessibleDescription = description;
        button.Click += (_, _) => RunAction(title, action);

        layout.Controls.Add(indexLabel, 0, 0);
        layout.Controls.Add(copy, 1, 0);
        layout.Controls.Add(button, 2, 0);
        row.Controls.Add(layout);
        _actions[key] = new ActionVisual(row, indexLabel, titleLabel, descriptionLabel, button);
        return row;
    }

    private Control BuildInstallOverview()
    {
        var frame = new Panel {Dock = DockStyle.Fill, Margin = Padding.Empty, Padding = new Padding(20), BackColor = Surface};
        frame.Paint += (_, args) => {
            using var border = new Pen(Line, 1);
            args.Graphics.DrawRectangle(border, 0, 0, frame.ClientSize.Width - 1, frame.ClientSize.Height - 1);
            using var accent = new Pen(Teal, 2);
            args.Graphics.DrawLine(accent, 0, 0, frame.ClientSize.Width, 0);
        };

        var layout = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 10, Margin = Padding.Empty, Padding = Padding.Empty, BackColor = Surface};
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 22));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 14));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 104));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var heading = NewLabel("THIS PC", 8.5f, FontStyle.Bold, Teal);
        heading.Dock = DockStyle.Fill;
        var channelLabel = NewLabel("Discord channel", 8.5f, FontStyle.Bold, Body);
        channelLabel.Dock = DockStyle.Fill;
        channelLabel.TextAlign = ContentAlignment.BottomLeft;
        _targets.DropDownStyle = ComboBoxStyle.DropDownList;
        _targets.Dock = DockStyle.Fill;
        _targets.Margin = new Padding(0, 4, 0, 4);
        _targets.BackColor = CanvasRaised;
        _targets.ForeColor = Bone;
        _targets.FlatStyle = FlatStyle.Flat;
        _targets.TabIndex = 0;
        _targets.AccessibleName = "Discord installation channel";
        _targets.AccessibleDescription = "Choose Stable, PTB, or Canary when installed.";

        var status = new Panel {Dock = DockStyle.Fill, Margin = Padding.Empty, Padding = new Padding(16, 13, 12, 11), BackColor = CanvasRaised};
        status.Paint += (_, args) => {
            using var border = new Pen(LineQuiet, 1);
            args.Graphics.DrawRectangle(border, 0, 0, status.ClientSize.Width - 1, status.ClientSize.Height - 1);
        };
        _statusRail.Dock = DockStyle.Left;
        _statusRail.Width = 3;
        _statusRail.BackColor = Teal;
        _statusTitle.Dock = DockStyle.Top;
        _statusTitle.Height = 25;
        _statusTitle.Font = new Font("Segoe UI Variable Text", 10, FontStyle.Bold);
        _statusTitle.ForeColor = Bone;
        _statusTitle.AccessibleName = "Installation status";
        _statusBody.Dock = DockStyle.Fill;
        _statusBody.Font = new Font("Segoe UI Variable Text", 8.75f);
        _statusBody.ForeColor = Body;
        _statusBody.AutoEllipsis = true;
        _statusBody.AccessibleName = "Installation status details";
        status.Controls.Add(_statusBody);
        status.Controls.Add(_statusTitle);
        status.Controls.Add(_statusRail);

        var keeps = NewLabel("Your plugins, themes, settings, and custom CSS stay in place.", 8.75f, FontStyle.Regular, Body);
        keeps.Dock = DockStyle.Fill;
        keeps.TextAlign = ContentAlignment.MiddleLeft;
        var tools = NewLabel("QUICK TOOLS", 8.5f, FontStyle.Bold, Teal);
        tools.Dock = DockStyle.Fill;
        tools.TextAlign = ContentAlignment.BottomLeft;
        var verify = NewButton("Verify installation", ButtonTone.Quiet);
        verify.Dock = DockStyle.Fill;
        verify.Margin = new Padding(0, 4, 0, 2);
        verify.TabIndex = 1;
        verify.AccessibleName = "Verify installation";
        verify.Click += (_, _) => RunAction("Verify installation", () => _engine.VerifyInstalled() ? $"Installed files match {_manifest.CandidateLabel}." : $"Installed files do not match {_manifest.CandidateLabel}.");
        var launch = NewButton("Launch Discord", ButtonTone.Quiet);
        launch.Dock = DockStyle.Fill;
        launch.Margin = new Padding(0, 2, 0, 4);
        launch.TabIndex = 2;
        launch.AccessibleName = "Launch Discord";
        launch.Click += (_, _) => RunAction("Launch Discord", () => {_engine.Launch(Target()); return "Discord launch requested. Solcord never signs in or acts on your account.";});

        var recovery = NewButton("Open recovery folder", ButtonTone.Text);
        recovery.AutoSize = false;
        recovery.Height = 34;
        recovery.Dock = DockStyle.Bottom;
        recovery.Margin = Padding.Empty;
        recovery.TabIndex = 3;
        recovery.AccessibleName = "Open recovery folder";
        recovery.TextAlign = ContentAlignment.MiddleLeft;
        recovery.Click += (_, _) => RunAction("Open recovery folder", () => {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "BetterDiscord", "solcord-installer")) {UseShellExecute = true});
            return "Opened the Solcord recovery folder.";
        });

        layout.Controls.Add(heading, 0, 0);
        layout.Controls.Add(channelLabel, 0, 1);
        layout.Controls.Add(_targets, 0, 2);
        layout.Controls.Add(status, 0, 4);
        layout.Controls.Add(keeps, 0, 5);
        layout.Controls.Add(tools, 0, 6);
        layout.Controls.Add(verify, 0, 7);
        layout.Controls.Add(launch, 0, 8);
        layout.Controls.Add(recovery, 0, 9);
        frame.Controls.Add(layout);
        return frame;
    }

    private Control BuildFooter()
    {
        var footer = new Panel {Dock = DockStyle.Fill, BackColor = CanvasRaised, Padding = new Padding(30, 8, 30, 8)};
        footer.Paint += (_, args) => {
            using var line = new Pen(Line, 1);
            args.Graphics.DrawLine(line, 0, 0, footer.ClientSize.Width, 0);
        };
        var layout = new TableLayoutPanel {Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = Padding.Empty, Padding = Padding.Empty, BackColor = Color.Transparent};
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 108));
        var lineage = NewLabel("Built on BetterDiscord  ·  Local files only  ·  Rollback saved before changes", 8.5f, FontStyle.Regular, Muted);
        lineage.Dock = DockStyle.Fill;
        lineage.TextAlign = ContentAlignment.MiddleLeft;
        var close = NewButton("Close", ButtonTone.Text);
        close.Dock = DockStyle.Fill;
        close.Margin = Padding.Empty;
        close.TabIndex = 0;
        close.AccessibleName = "Close installer";
        close.Click += (_, _) => Close();
        layout.Controls.Add(lineage, 0, 0);
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
            SetStatus("Discord not found", "Install Discord Stable, PTB, or Canary, then reopen this installer.", Warning);
            SetActionAvailability(false, false, false, false, false);
        }
    }

    private void RefreshInstallationState()
    {
        bool targetReady = _targets.SelectedItem is DiscordTarget;
        if (!targetReady) {
            SetActionAvailability(false, false, false, false, false);
            return;
        }
        try
        {
            bool pending = _engine.HasPendingRecovery();
            bool managed = _engine.HasManagedInstall();
            bool packageRecorded = managed && _engine.IsCurrentPackageRecorded();
            bool exact = !pending && packageRecorded && _engine.VerifyInstalled();
            if (pending) SetStatus("Recovery required", "Roll back before trying another change.", Warning);
            else if (exact) SetStatus("Up to date", $"{_manifest.CandidateLabel} is installed and verified.", Teal);
            else if (packageRecorded) SetStatus("Repair available", "This build is recorded, but one or more installed files differ.", Warning);
            else if (managed) SetStatus("Update available", $"A different Solcord build is installed. Move to {_manifest.CandidateLabel}.", Warning);
            else SetStatus("Ready to install", $"{_manifest.CandidateLabel} is verified and ready.", Teal);
            SetActionAvailability(targetReady, managed, exact, packageRecorded, pending);
        }
        catch (Exception error)
        {
            SetStatus("Needs attention", error.Message, Ember);
            SetActionAvailability(false, false, false, false, _engine.HasPendingRecovery());
        }
    }

    private void SetActionAvailability(bool targetReady, bool managed, bool exact, bool packageRecorded, bool pending)
    {
        _actions["install"].Button.Enabled = targetReady && !managed && !pending;
        _actions["update"].Button.Enabled = targetReady && managed && !packageRecorded && !pending;
        _actions["repair"].Button.Enabled = targetReady && packageRecorded && !pending;
        _actions["rollback"].Button.Enabled = targetReady && (managed || pending);
        _actions["uninstall"].Button.Enabled = targetReady && managed && !pending;
        string? recommended = pending ? "rollback" : !managed ? "install" : !packageRecorded ? "update" : !exact ? "repair" : null;
        foreach ((string key, ActionVisual visual) in _actions) StyleAction(visual, key == recommended);
    }

    private static void StyleAction(ActionVisual visual, bool recommended)
    {
        visual.Row.BackColor = recommended ? CanvasRaised : Canvas;
        visual.Index.ForeColor = recommended ? Ember : Muted;
        visual.Title.ForeColor = visual.Button.Enabled ? Bone : Muted;
        visual.Description.ForeColor = visual.Button.Enabled ? Body : Muted;
        ApplyButtonTone(visual.Button, recommended && visual.Button.Enabled ? ButtonTone.Primary : ButtonTone.Quiet);
    }

    private DiscordTarget Target() => _targets.SelectedItem as DiscordTarget ?? throw new InvalidOperationException("Select an installed Discord channel first.");

    private string CompleteInstall(InstallReceipt receipt) => $"Installed and verified {receipt.CandidateLabel ?? "the selected candidate"} for Discord {receipt.Channel} {receipt.DiscordVersion}.";

    private string Uninstall()
    {
        DialogResult result = MessageBox.Show(
            "Remove Solcord from this Discord installation?\n\nDiscord returns to normal. Plugins, themes, settings, and recovery files stay on disk.",
            "Uninstall Solcord",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2);
        if (result != DialogResult.Yes) return "Uninstall cancelled. Nothing changed.";
        return $"Solcord was removed. A recovery copy was saved at {_engine.Uninstall(Target())}.";
    }

    private void RunAction(string actionName, Func<string> action)
    {
        UseWaitCursor = true;
        foreach (ActionVisual visual in _actions.Values) visual.Button.Enabled = false;
        SetStatus($"{actionName}…", "The verified operation is running.", Teal);
        try
        {
            string result = action();
            RefreshInstallationState();
            SetStatus($"{actionName} complete", result, Teal);
        }
        catch (Exception error)
        {
            RefreshInstallationState();
            SetStatus($"{actionName} could not finish", error.Message, Ember);
        }
        finally
        {
            UseWaitCursor = false;
        }
    }

    private void SetStatus(string title, string body, Color color)
    {
        _statusTitle.Text = title;
        _statusBody.Text = body;
        _statusRail.BackColor = color;
    }

    private static Button NewButton(string text, ButtonTone tone)
    {
        var button = new Button {
            Text = text,
            Height = 38,
            Padding = new Padding(12, 0, 12, 0),
            FlatStyle = FlatStyle.Flat,
            Cursor = Cursors.Hand,
            UseVisualStyleBackColor = false,
            Font = new Font("Segoe UI Variable Text", 9, FontStyle.Bold)
        };
        ApplyButtonTone(button, tone);
        return button;
    }

    private static void ApplyButtonTone(Button button, ButtonTone tone)
    {
        if (!button.Enabled) {
            button.BackColor = CanvasRaised;
            button.ForeColor = Color.FromArgb(112, 126, 134);
            button.FlatAppearance.BorderColor = LineQuiet;
            button.FlatAppearance.MouseOverBackColor = CanvasRaised;
            button.FlatAppearance.MouseDownBackColor = CanvasRaised;
            button.FlatAppearance.BorderSize = 1;
            return;
        }
        button.BackColor = tone == ButtonTone.Primary ? Teal : tone == ButtonTone.Text ? CanvasRaised : SurfaceRaised;
        button.ForeColor = tone == ButtonTone.Primary ? Color.FromArgb(7, 21, 21) : Bone;
        button.FlatAppearance.BorderColor = tone == ButtonTone.Primary ? Teal : tone == ButtonTone.Text ? CanvasRaised : Line;
        button.FlatAppearance.BorderSize = tone == ButtonTone.Text ? 0 : 1;
        button.FlatAppearance.MouseOverBackColor = tone == ButtonTone.Primary ? Color.FromArgb(104, 204, 193) : Color.FromArgb(37, 48, 55);
        button.FlatAppearance.MouseDownBackColor = tone == ButtonTone.Primary ? TealPressed : Canvas;
    }

    private static Label NewLabel(string text, float size, FontStyle style, Color color, bool display = false) => new() {
        Text = text,
        Font = new Font(display ? "Segoe UI Variable Display" : "Segoe UI Variable Text", size, style),
        ForeColor = color,
        BackColor = Color.Transparent,
        UseMnemonic = false
    };

    private static Image? LoadBrandMark()
    {
        using Stream? stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Solcord.Installer.Resources.solcord-mark.png");
        if (stream is null) return null;
        using var source = Image.FromStream(stream);
        return new Bitmap(source);
    }

    private enum ButtonTone {Primary, Quiet, Text}
    private sealed record ActionVisual(Panel Row, Label Index, Label Title, Label Description, Button Button);
}
