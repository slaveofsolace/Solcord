# Privacy and security

Solcord runs inside the Discord desktop client. It cannot make Discord anonymous, add end-to-end encryption to ordinary messages, or control what Discord's servers retain.

## Defaults

Strict Privacy is the default for fresh installs. Optional private history, external providers, and account-risk experiments remain off until separately enabled.

Privacy controls target specific optional surfaces such as analytics, optional reporting, and activity discovery. Core sign-in, chat, voice, media, moderation, safety, and client security updates must continue to work. Solcord does not use a blanket network block.

## Read the status

- **Protected:** the adapter verified and applied its supported policy.
- **Needs review:** a choice or outbound-access decision is required.
- **Degraded:** part of the intended protection could not be verified.
- **Unsupported:** the current client exposes no supported path.

Protected refers to the category shown, not all Discord traffic. Discord's account-side privacy preferences remain separate settings.

## Local data

Friend Watch, Message Timeline, Audience Guard, and private notes are opt-in and account-scoped. Retention is bounded. Use each feature's clear or export controls deliberately.

Where durable private storage is promised, Solcord uses Electron's secure storage. If encryption is unavailable, the interface reports **session-only** or holds the affected feature. It does not silently persist private data as plaintext.

Portable settings exports exclude private history, denied-user identifiers, provider credentials, and consent acknowledgements. A private feature's own export may still contain sensitive or pseudonymous data; review it before sharing.

## Network access

Solcord update and catalog checks are manual by default. Optional providers and community addons have separate outbound-access choices. Quarantined or unapproved code must not run merely because its source file is present.

DeepL and LibreTranslate require an explicit provider choice and disclosure of the text being sent. On-device translation is available only when the installed client exposes a compatible engine. [Translation details](TRANSLATION_DESK.md).

Diagnostics retain bounded operational information. Privacy-policy receipts are content-free: category, decision, coarse time, and result. Do not publish raw Discord logs, private databases, or screenshots of conversations.

## Streaming, voice, and history

Audience Guard can prevent or stop a stream after a denied user is detected. It cannot guarantee per-person blocking or zero-frame exposure. [Audience Guard limits](STREAM_AUDIENCE_GUARD.md).

Voice Note Studio requires explicit recording, preview, and send or save actions. It does not record or upload automatically.

Message Timeline observes only events already available to the running client after opt-in. It does not fetch unseen or deleted history, import another logger's private database, or reveal hidden channels. Friend Watch does not claim to know who blocked whom.

## Installation and recovery

The installer verifies the selected Discord installation, package, and rollback backup. It preserves plugins, themes, settings, and private stores. Uninstall removes the core and injector; it is not a private-data wipe.

A self-contained unsigned installer is not a signed or stable release. Use this repository's downloads, compare hashes, and never disable Windows security as an installation step.

A disposable profile separates files and Discord state, but it still shares the Windows account's security boundary. Use a separate standard Windows account when a stronger isolation boundary is needed.

## Reports and technical detail

Report sensitive vulnerabilities through the process in [SECURITY.md](../SECURITY.md). Use [Support](../SUPPORT.md) for ordinary bugs.

The [security architecture](development/SECURITY_ARCHITECTURE.md) documents IPC, storage, addon, updater, and installer safeguards together with historical source-review records. Those records are not evidence that every newer build passed live acceptance.
