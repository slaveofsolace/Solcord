# Translation Desk

Translation Desk is local-first. Its default engine is Chromium/Electron's built-in `Translator` API, with the companion local `LanguageDetector` used when the source language is `auto`.

## Local behavior

- Input and translated text stay in renderer memory and are never written to normal settings, diagnostics, logs, filenames, or crash receipts.
- Chromium may download an on-device language pack for a language pair. The Control Center shows availability, download progress, failure, and cancellation states.
- The queue is limited to four jobs. Disabling Solcord, changing accounts, closing the panel, or canceling Translation Desk aborts owned work and destroys local model instances.
- A missing or changed platform API fails closed as `Unsupported` or `Degraded`. Solcord does not guess at an internal Discord module and does not silently fall back to a network service.

## Optional external providers

DeepL and LibreTranslate remain optional. Selecting one does not send anything by itself. Each request shows its destination and requires confirmation; Strict Privacy can block external providers entirely. Provider credentials stay outside portable settings and use the existing account-bound private storage path.

`Ready — provider off` means the feature implementation is present while all external providers are disabled. It is not a missing-library warning.

## Current nonclaims

- Language-pair and on-device model availability are controlled by the installed Chromium/Electron build.
- Solcord does not bundle a translation model or promise that every language pair is locally available.
- Automatic language detection requires the local `LanguageDetector` API. If it is unavailable, the user can choose a source language without enabling a cloud provider.
