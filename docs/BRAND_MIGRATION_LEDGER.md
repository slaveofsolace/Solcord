# Brand migration ledger

Human-facing product branding is **SoulCord**. The GitHub repository slug remains `slaveofsolace/Solcord` because renaming it was not authorized. `Soltex` is not used.

## REPLACE

| Surface | V1 decision |
| --- | --- |
| README logo, title, description, badges, install story, safety posture | Replaced with SoulCord material and local original assets. |
| Settings section header, sidebar title, About panel, loading title, editor title | Replaced with SoulCord. |
| Changelog title/footer, updater core label, diagnostic heading, console greeting | Replaced with SoulCord. |
| Command descriptions and owner support links | Replaced with SoulCord wording and `slaveofsolace/Solcord`. |
| Console/debug logger prefix | Replaced with `[SoulCord]`; no external contract depends on the rendered prefix. |
| Package name, description, repository/homepage/bugs metadata | Replaced with owner-controlled SoulCord metadata. |
| Production bundle | Renamed to `soulcord.asar`; installed under a compatibility filename only at the injector boundary. |
| Renderer bundle | Renamed to `soulcord.js`. |
| Primary logo component | Replaced with the original SoulCord signal-S path. |
| Rejected crystal/orbit raster | Removed from the tracked product assets. It is not used as a fallback or installer image. |
| Settings navigation label | Registered as `Panels.soulcord` with literal `SoulCord Suite` fallback. The upstream translation sentinel is never accepted as a rendered product label. |
| Setup wizard and catalog browser | Authored as SoulCord operating surfaces with concrete staging, risk, provider, and rollback language. |
| Private Message Timeline | Named and presented as a private, owner-controlled SoulCord feature. It is not labeled as MessageLogger, and it does not claim offline or deleted-message recovery. |
| Theme family | Added four original `SoulCord — …` themes with one-active-theme transaction behavior and no remote assets. |
| CI display and artifact names | SoulCord-specific workflow added; upstream release mutations are owner-guarded. |
| Issue/feature templates, contribution/security/release docs | Point to SoulCord and preserve upstream attribution. |

## KEEP-COMPAT

These identifiers remain intentionally. Changing them would break existing installations or addons and would provide no user benefit.

| Identifier | Reason |
| --- | --- |
| Source directories and TypeScript aliases containing `betterdiscord` | Stable internal module graph and upstream merge surface. |
| `%APPDATA%\BetterDiscord` and its `data`, `plugins`, `themes`, and Custom CSS files | Existing owner data and ecosystem compatibility. No migration deletes or relocates them. |
| Installed filename `%APPDATA%\BetterDiscord\data\betterdiscord.asar` | The existing desktop injector requires this path. The staged artifact remains named `soulcord.asar`. |
| `betterdiscord.app.asar` and injector migration markers | Existing reversible injector contract with Discord’s desktop package. |
| `BdApi`, `BetterDiscord` TypeScript namespace, preload globals, and generated type package names | Public plugin API compatibility. |
| `betterdiscord://` protocol and Discord settings layout keys | Existing addon links, settings routes, and protocol handlers. |
| `bd-*` CSS classes and `--bd-*` variables | Theme/plugin ecosystem compatibility. Values may use SoulCord visual tokens. |
| `BETTERDISCORD_*` environment variables | Main/preload compatibility contract. |
| BetterDiscord catalog addon headers and filenames | Third-party identity, update compatibility, authorship, and license evidence. SoulCord does not rewrite these into SoulCord-branded plugins. |
| BetterDiscord addon-store hostname and catalog links | Explicitly attributed upstream compatibility service. SoulCord does not mirror or claim the catalog. |
| Internal class/module name `BetterDiscord` | Stable upstream merge boundary; not presented as product branding. |

## KEEP-ATTRIBUTION

- Git history and every upstream contributor.
- Apache-2.0 `LICENSE` and BetterDiscord copyright notices.
- Factual “based on BetterDiscord” copy and links to `BetterDiscord/BetterDiscord`.
- BetterDiscord and Discord names when explaining compatibility, controls, or provenance.
- Upstream workflow and type-publication conventions when retained for lineage; mutation steps are guarded from running in this fork.

## REVIEW / known nonclaims

- Community translations originated upstream. V1 changes English source copy and direct product labels; filesystem references to the BetterDiscord compatibility directory stay literal. Translated marketing/update strings are not claimed human-reviewed.
- Repository screenshots are added only after installed Human Eye acceptance. A generated or automated screenshot is not labeled accepted by itself.
- The GitHub repository name is intentionally `Solcord`; product typography is `SoulCord`.
- Existing user addon names, theme names, settings keys, and MessageLoggerV2 files are not rebranded. Preserving those names is ownership and compatibility, not an incomplete product migration.
- Catalog descriptions and author names remain upstream metadata. They are shown as attributed candidate information, not rewritten as SoulCord copy.
- The new mark and four themes are technically integrated but not called owner-accepted until the installed visual pass is complete.
