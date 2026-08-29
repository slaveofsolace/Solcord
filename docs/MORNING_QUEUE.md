# Optional owner validation

Safe close-out work is autonomous. This page lists optional signed-in checks that automation deliberately does not perform. They are not blockers for source, packaging, installer, or passive launch validation. See [Owner-ready close-out](OWNER_READY_CLOSEOUT.md) for the current product table.

## Signed-in checks

1. Open **User Settings -> Solcord Suite** and confirm the installed version and source identity match the release manifest.
2. Review First Setup's final file/state diff. Apply it only if the selected theme, built-ins, privacy choices, and provider changes are correct.
3. Recheck **Codenames** and a second Activity only after Activity Bridge or preload-policy code changes. RC5 does not change those accepted mechanisms.
4. Confirm Activity Bridge accepted only the verified same-package preload and that the unrestricted override remains off.
5. Review Friend Watch's passive no-change state. Export or clear only if desired; do not change a real relationship for testing.
6. Check ordinary chat, Settings, plugins, themes, Custom CSS, one modal, one popout, and Recovery.

Stop and use the manifest-recorded rollback if Discord loops, an addon or JavaScript error appears, an Activity stalls, a sentinel translation is visible, or the installed hash changes. Do not enable the unrestricted Activity override as a workaround.

## Preserved boundaries

- Link Lens, Message Timeline, Audience Guard, Friend Watch, Stream Shield, Accessibility Toolkit, and Power Lab remain off until their individual consent or configuration step.
- The curated catalog is a reviewed choice set; it does not claim that all 36 candidates are installable or enabled.
- Existing plugins, themes, Custom CSS, and private databases remain owner-managed and are not deleted by setup or core rollback.
- No agent sends messages, uploads files, joins voice, starts streams, authorizes OAuth, or changes a relationship during automated acceptance.
