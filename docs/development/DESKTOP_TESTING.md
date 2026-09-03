# Desktop regression testing

Use this checklist after a change that affects Discord, setup, controls, themes, persistence, or installation. Keep source tests, disposable-client results, and signed-in results separate.

## Before testing

1. Record the source commit, ASAR and installer hashes, Discord version, and profile type.
2. Verify the rollback package and backup. Preserve plugins, themes, settings, and private stores.
3. Use a disposable profile for setup failure, migration, interrupted recovery, uninstall, and other destructive cases.
4. Save drafts and leave calls before any restart or core replacement.
5. Do not run competing Discord instances against shared data.

## Ordinary navigation

Open two existing DMs, Friends, an existing server, settings, a modal, and a member popout. Check responsiveness, console errors, duplicate UI, and route position. Opening a route must not mark unrelated content read or send anything.

Visit every Control Center workspace from both the top and mid-page. Check search, keyboard focus, menu dismissal, and upward-only route positioning.

## Controls and appearance

- Test switches on, off, disabled, keyboard-focused, and after reopening the view.
- Move sliders with pointer and keyboard; verify limits, visible values, and actual effect.
- Open, select, and dismiss every changed dropdown.
- Test pending, success, failure, and repeated-action states.
- Verify every theme and background option affected by the change.
- Check narrow windows, long labels, 100/125/150/200% scaling, reduced motion, and high contrast.
- Inspect text spacing, section hierarchy, clipping, overlap, and horizontal overflow.

Do not call a control working because it changes color. Trace its saved state and the behavior it controls.

## Setup and persistence

Test Welcome, Back, Continue, Finish later, resume, Review and Apply, restart, and rollback. Confirm completed profiles do not reopen setup after an update.

Use controlled fixtures for malformed state and account switches. Prove private forms and queued work cannot carry one account's values into another. Record encrypted versus session-only behavior.

## Lifecycle and recovery

Enable and disable each affected module repeatedly. Check reload and two clean starts. Task-owned patches, listeners, timers, observers, elements, and child resources must return to baseline.

Test install, update, repair, verify, rollback, interrupted recovery, downgrade refusal, and uninstall in isolated targets. Use exact package hashes, not a neighboring build's result.

## Account actions

Tests must not send messages, mutate relationships, upload, record audio, mark notifications read, join calls, start streams, or authorize an external service. Use fixtures for those boundaries.

When an Activity Bridge or preload change needs signed-in acceptance, the owner launches Codenames and a second Activity. Keep the same-package preload restriction and unrestricted override off.

## Record the result

Record each attempted interaction, its outcome, exact build identity, errors, resource counts, rollback identity, and anything not tested. Stop on a route freeze, addon dialog, JavaScript error, translation sentinel, unexplained storage change, or rollback mismatch.

Follow the [release checklist](../RELEASE_CHECKLIST.md) before publishing. Historical receipts must remain unchanged.
