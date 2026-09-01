// SPDX-License-Identifier: Apache-2.0

using System.Reflection;

namespace Solcord.Installer;

internal sealed class InstallerForm : Form
{
    private static readonly Color Canvas = Color.FromArgb(14, 18, 22);
    private static readonly Color Rail = Color.FromArgb(8, 12, 15);
    private static readonly Color Surface = Color.FromArgb(23, 29, 34);
    private static readonly Color SurfaceRaised = Color.FromArgb(29, 36, 42);
    private static readonly Color Line = Color.FromArgb(55, 67, 75);
    private static readonly Color TextStrong = Color.FromArgb(241, 234, 218);
    private static readonly Color TextBody = Color.FromArgb(189, 199, 205);
    private static readonly Color TextMuted = Color.FromArgb(139, 154, 162);
    private static readonly Color Teal = Color.FromArgb(81, 174, 167);
    private static readonly Color Ember = Color.FromArgb(238, 111, 79);
    private static readonly Color Warning = Color.FromArgb(226, 176, 82);

    private readonly InstallerEngine _engine;
    private readonly ReleaseManifest _manifest;
    private readonly ComboBox _targets = new();
    private readonly Label _statusTitle = new();
    private readonly Label _statusBody = new();
    private readonly Panel _statusRail = new();
    private readonly Dictionary<string, Button> _actions = new(StringComparer.Ordinal);

    internal InstallerForm(string bundleRoot)
    {
        _engine = new InstallerEngine(bundleRoot, Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData));
        _manifest = _engine.LoadManifest();

        Text = "Solcord Installer";
        Width = 920;
        Height = 690;
        MinimumSize = new Size(760, 610);
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = Canvas;
        ForeColor = TextStrong;
        Font = new Font("Segoe UI Variable Text", 10);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);

        var shell = new TableLayoutPanel {
            Dock = DockStyle.Fill,
            BackColor = Canvas,
            ColumnCount = 2,
            RowCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        shell.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 236));
        shell.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        shell.Controls.Add(BuildBrandRail(), 0, 0);
        shell.Controls.Add(BuildWorkspace(), 1, 0);
        Controls.Add(shell);

        Load += (_, _) => RefreshTargets();
        _targets.SelectedIndexChanged += (_, _) => RefreshInstallationState();
    }

    private Control BuildBrandRail()
    {
        var rail = new Panel {Dock = DockStyle.Fill, BackColor = Rail, Padding = new Padding(28, 38, 28, 28)};
        rail.Paint += (_, args) => {
            using var pen = new Pen(Color.FromArgb(22, Teal), 1);
            for (int offset = -rail.Height; offset < rail.Width; offset += 34) args.Graphics.DrawLine(pen, offset, rail.Height, offset + rail.Height, 0);
            using var edge = new Pen(Color.FromArgb(92, Teal), 1);
            args.Graphics.DrawLine(edge, rail.ClientSize.Width - 1, 0, rail.ClientSize.Width - 1, rail.ClientSize.Height);
        };

        var mark = new PictureBox {
            Width = 112,
            Height = 112,
            SizeMode = PictureBoxSizeMode.Zoom,
            Image = LoadBrandMark(),
            Location = new Point(26, 28),
            AccessibleName = "Solcord cord-cut S mark",
            TabStop = false
        };
        var name = NewLabel("SOLCORD", 24, FontStyle.Bold, TextStrong);
        name.Location = new Point(25, 158);
        name.AutoSize = true;
        var product = NewLabel("DESKTOP INSTALLER", 9, FontStyle.Bold, Teal);
        product.Location = new Point(28, 201);
        product.AutoSize = true;
        var lineage = NewLabel("A BetterDiscord fork\nfor privacy, reliability,\nand focused customization.", 10, FontStyle.Regular, TextBody);
        lineage.Location = new Point(28, 242);
        lineage.Size = new Size(176, 74);
        var version = NewLabel($"{_manifest.CandidateLabel}\nUnsigned Windows build", 9, FontStyle.Regular, TextMuted);
        version.Dock = DockStyle.Bottom;
        version.Height = 58;
        version.TextAlign = ContentAlignment.BottomLeft;

        rail.Controls.Add(mark);
        rail.Controls.Add(name);
        rail.Controls.Add(product);
        rail.Controls.Add(lineage);
        rail.Controls.Add(version);
        return rail;
    }

    private Control BuildWorkspace()
    {
        var scroll = new Panel {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            BackColor = Canvas,
            Padding = new Padding(42, 32, 42, 28)
        };
        var content = new TableLayoutPanel {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Top,
            ColumnCount = 1,
            RowCount = 0,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };

        content.Controls.Add(NewSectionLabel("SOLCORD SETUP"));
        content.Controls.Add(NewHeading("Choose one clear action"));
        content.Controls.Add(NewCopy("Your plugins, themes, settings, and custom CSS stay in place. The installer changes only the reviewed desktop core and Discord injector."));
        content.Controls.Add(BuildTargetPicker());
        content.Controls.Add(BuildStatus());
        content.Controls.Add(NewSectionLabel("INSTALLATION ACTIONS", new Padding(0, 24, 0, 8)));
        content.Controls.Add(BuildActionList());
        content.Controls.Add(BuildUtilities());
        scroll.Controls.Add(content);
        return scroll;
    }

    private Control BuildTargetPicker()
    {
        var group = new TableLayoutPanel {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 1,
            Margin = new Padding(0, 22, 0, 0),
            Padding = Padding.Empty
        };
        var label = NewLabel("Discord channel", 9, FontStyle.Bold, TextBody);
        label.AutoSize = true;
        label.Margin = new Padding(0, 0, 0, 7);
        _targets.DropDownStyle = ComboBoxStyle.DropDownList;
        _targets.Dock = DockStyle.Top;
        _targets.Height = 38;
        _targets.BackColor = SurfaceRaised;
        _targets.ForeColor = TextStrong;
        _targets.FlatStyle = FlatStyle.Flat;
        _targets.AccessibleName = "Discord installation channel";
        _targets.AccessibleDescription = "Choose Stable, PTB, or Canary when it is installed.";
        group.Controls.Add(label);
        group.Controls.Add(_targets);
        return group;
    }

    private Control BuildStatus()
    {
        var panel = new Panel {
            Dock = DockStyle.Top,
            Height = 82,
            Margin = new Padding(0, 18, 0, 0),
            BackColor = Surface,
            Padding = new Padding(20, 14, 18, 12)
        };
        panel.Paint += (_, args) => {
            using var border = new Pen(Line);
            args.Graphics.DrawRectangle(border, 0, 0, panel.ClientSize.Width - 1, panel.ClientSize.Height - 1);
        };
        _statusRail.Dock = DockStyle.Left;
        _statusRail.Width = 4;
        _statusRail.BackColor = Teal;
        _statusTitle.Dock = DockStyle.Top;
        _statusTitle.Height = 23;
        _statusTitle.Font = new Font(Font.FontFamily, 10, FontStyle.Bold);
        _statusTitle.ForeColor = TextStrong;
        _statusTitle.AccessibleName = "Installation status";
        _statusBody.Dock = DockStyle.Fill;
        _statusBody.Font = new Font(Font.FontFamily, 9);
        _statusBody.ForeColor = TextBody;
        _statusBody.AutoEllipsis = true;
        _statusBody.AccessibleName = "Installation status details";
        panel.Controls.Add(_statusBody);
        panel.Controls.Add(_statusTitle);
        panel.Controls.Add(_statusRail);
        return panel;
    }

    private Control BuildActionList()
    {
        var list = new TableLayoutPanel {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        list.Controls.Add(ActionRow("install", "Install Solcord", "First-time setup for the selected Discord channel.", () => CompleteInstall(_engine.InstallNew(Target()))));
        list.Controls.Add(ActionRow("update", "Update Solcord", $"Replace an older Solcord core with {_manifest.CandidateLabel} and keep a rollback point.", () => CompleteInstall(_engine.Update(Target()))));
        list.Controls.Add(ActionRow("repair", "Repair Solcord", "Reinstall this exact package when files are missing or damaged.", () => CompleteInstall(_engine.Repair(Target()))));
        list.Controls.Add(ActionRow("rollback", "Roll Back", "Restore the backup captured immediately before the current installation.", () => $"Restored the previous installation from {_engine.RollBack(Target())}."));
        list.Controls.Add(ActionRow("uninstall", "Uninstall Solcord", "Return this Discord channel to vanilla while keeping your BetterDiscord data folder.", Uninstall));
        return list;
    }

    private Control ActionRow(string key, string title, string description, Func<string> action)
    {
        var row = new TableLayoutPanel {
            Dock = DockStyle.Top,
            Height = 70,
            ColumnCount = 2,
            Margin = Padding.Empty,
            Padding = new Padding(0, 8, 0, 8),
            BackColor = Canvas
        };
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 164));
        row.Paint += (_, args) => {
            using var line = new Pen(Line);
            args.Graphics.DrawLine(line, 0, row.Height - 1, row.Width, row.Height - 1);
        };
        var copy = new Panel {Dock = DockStyle.Fill, Padding = new Padding(0, 3, 14, 0)};
        var titleLabel = NewLabel(title, 10, FontStyle.Bold, TextStrong);
        titleLabel.Dock = DockStyle.Top;
        titleLabel.Height = 23;
        var descriptionLabel = NewLabel(description, 9, FontStyle.Regular, TextMuted);
        descriptionLabel.Dock = DockStyle.Fill;
        descriptionLabel.AutoEllipsis = true;
        copy.Controls.Add(descriptionLabel);
        copy.Controls.Add(titleLabel);

        var button = NewButton(title, primary: key is "install" or "update");
        button.Dock = DockStyle.Fill;
        button.Margin = new Padding(10, 1, 0, 1);
        button.AccessibleName = title;
        button.AccessibleDescription = description;
        button.Click += (_, _) => RunAction(title, action);
        _actions[key] = button;
        row.Controls.Add(copy, 0, 0);
        row.Controls.Add(button, 1, 0);
        return row;
    }

    private Control BuildUtilities()
    {
        var utilities = new FlowLayoutPanel {
            Dock = DockStyle.Top,
            AutoSize = true,
            WrapContents = true,
            Margin = new Padding(0, 20, 0, 0),
            Padding = Padding.Empty
        };
        AddUtility(utilities, "Verify installation", () => _engine.VerifyInstalled() ? $"Installed files match {_manifest.CandidateLabel}." : $"Installed files do not match {_manifest.CandidateLabel}.");
        AddUtility(utilities, "Launch Discord", () => {_engine.Launch(Target()); return "Discord launch requested. Solcord never signs in or acts on your account.";});
        AddUtility(utilities, "Open recovery folder", () => {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "BetterDiscord", "solcord-installer")) {UseShellExecute = true});
            return "Opened the Solcord recovery folder.";
        });
        return utilities;
    }

    private void AddUtility(Control parent, string label, Func<string> action)
    {
        var button = NewButton(label, primary: false);
        button.AutoSize = true;
        button.Margin = new Padding(0, 0, 10, 8);
        button.AccessibleName = label;
        button.Click += (_, _) => RunAction(label, action);
        parent.Controls.Add(button);
    }

    private void RefreshTargets()
    {
        _targets.Items.Clear();
        foreach (DiscordTarget target in _engine.DetectTargets()) _targets.Items.Add(target);
        _targets.DisplayMember = nameof(DiscordTarget.Channel);
        if (_targets.Items.Count > 0) _targets.SelectedIndex = 0;
        else {
            SetStatus("No Discord installation found", "Install Discord Stable, PTB, or Canary, then reopen this installer.", Warning);
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
            if (pending) SetStatus("Recovery required", "Use Roll Back before attempting another install or update.", Warning);
            else if (exact) SetStatus("Up to date", $"{_manifest.CandidateLabel} is installed and hash verified. Restart Discord to load a newly installed core.", Teal);
            else if (packageRecorded) SetStatus("Repair recommended", $"{_manifest.CandidateLabel} is recorded, but its installed files do not match. Repair will replace only the reviewed core and injector.", Warning);
            else if (managed) SetStatus("Update available", $"A different Solcord core is installed. Update to {_manifest.CandidateLabel}, or roll back the current installation.", Warning);
            else SetStatus("Ready to install", $"{_manifest.CandidateLabel} is verified and ready for the selected Discord channel.", Teal);
            SetActionAvailability(targetReady, managed, exact, packageRecorded, pending);
        }
        catch (Exception error)
        {
            SetStatus("Installation needs attention", error.Message, Ember);
            SetActionAvailability(false, false, false, false, _engine.HasPendingRecovery());
        }
    }

    private void SetActionAvailability(bool targetReady, bool managed, bool exact, bool packageRecorded, bool pending)
    {
        _actions["install"].Enabled = targetReady && !managed && !pending;
        _actions["update"].Enabled = targetReady && managed && !packageRecorded && !pending;
        _actions["repair"].Enabled = targetReady && packageRecorded && !pending;
        _actions["rollback"].Enabled = targetReady && (managed || pending);
        _actions["uninstall"].Enabled = targetReady && managed && !pending;
    }

    private DiscordTarget Target() => _targets.SelectedItem as DiscordTarget ?? throw new InvalidOperationException("Select an installed Discord channel first.");

    private string CompleteInstall(InstallReceipt receipt) => $"Installed and verified {receipt.CandidateLabel ?? "the selected candidate"} for Discord {receipt.Channel} {receipt.DiscordVersion}. Restart Discord when you are ready to load it.";

    private string Uninstall()
    {
        DialogResult result = MessageBox.Show(
            "Uninstall Solcord from the selected Discord channel?\n\nDiscord will return to vanilla. Your BetterDiscord plugins, themes, settings, and Solcord recovery files will remain on disk.",
            "Uninstall Solcord",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2);
        if (result != DialogResult.Yes) return "Uninstall cancelled. No files changed.";
        return $"Solcord was removed. A recovery copy was saved at {_engine.Uninstall(Target())}.";
    }

    private void RunAction(string actionName, Func<string> action)
    {
        UseWaitCursor = true;
        foreach (Button button in _actions.Values) button.Enabled = false;
        SetStatus($"{actionName} in progress", "Waiting for the verified operation to finish…", Teal);
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

    private static Button NewButton(string text, bool primary)
    {
        var button = new Button {
            Text = text,
            Height = 42,
            Padding = new Padding(12, 0, 12, 0),
            FlatStyle = FlatStyle.Flat,
            BackColor = primary ? Teal : SurfaceRaised,
            ForeColor = primary ? Color.FromArgb(7, 18, 19) : TextStrong,
            Cursor = Cursors.Hand,
            UseVisualStyleBackColor = false
        };
        button.FlatAppearance.BorderColor = primary ? Teal : Line;
        button.FlatAppearance.BorderSize = 1;
        button.FlatAppearance.MouseOverBackColor = primary ? Color.FromArgb(102, 195, 187) : Color.FromArgb(39, 48, 55);
        button.FlatAppearance.MouseDownBackColor = primary ? Color.FromArgb(65, 149, 143) : Color.FromArgb(18, 24, 28);
        return button;
    }

    private static Label NewSectionLabel(string text, Padding? margin = null)
    {
        var label = NewLabel(text, 9, FontStyle.Bold, Teal);
        label.AutoSize = true;
        label.Margin = margin ?? Padding.Empty;
        return label;
    }

    private static Label NewHeading(string text)
    {
        var label = NewLabel(text, 25, FontStyle.Bold, TextStrong);
        label.AutoSize = true;
        label.Margin = new Padding(0, 4, 0, 4);
        return label;
    }

    private static Label NewCopy(string text)
    {
        var label = NewLabel(text, 10, FontStyle.Regular, TextBody);
        label.AutoSize = true;
        label.MaximumSize = new Size(580, 0);
        label.Margin = Padding.Empty;
        return label;
    }

    private static Label NewLabel(string text, float size, FontStyle style, Color color) => new() {
        Text = text,
        Font = new Font("Segoe UI Variable Text", size, style),
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
}
