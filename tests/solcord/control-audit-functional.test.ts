// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {inspectSolcordLocalAttachment} from "../../src/common/solcord/attachment-guard";
import {deferOnboardingState, normalizeSetupDraft, reopenOnboardingState} from "../../src/betterdiscord/modules/solcord/store";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const PANEL_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/ui/solcord/panel.tsx"), "utf8");
const WIZARD_SOURCE = readFileSync(resolve(REPOSITORY_ROOT, "src/betterdiscord/ui/solcord/setup-wizard.tsx"), "utf8");

describe("Solcord control-audit functional closures", () => {
    test("defers and resumes the durable setup draft at the saved step", () => {
        const draft = normalizeSetupDraft({selectedTheme: "paper-signal", selectedAddons: ["DoNotTrack"]});
        const deferred = deferOnboardingState({version: 5, status: "pending", lastStep: 3, draft}, 1_234);

        expect(deferred).toEqual({version: 5, status: "skipped", lastStep: 3, draft, completedAt: 1_234});
        expect(deferred.draft).not.toBe(draft);
        expect(reopenOnboardingState(deferred)).toEqual({version: 5, status: "pending", lastStep: 3, draft});
        expect(WIZARD_SOURCE.indexOf("SolcordSettings.setSetupDraft(draft)")).toBeLessThan(WIZARD_SOURCE.indexOf("SolcordSettings.skipOnboarding()"));
        expect(WIZARD_SOURCE.indexOf("SolcordSettings.setOnboardingStep(step)")).toBeLessThan(WIZARD_SOURCE.indexOf("SolcordSettings.skipOnboarding()"));
        expect(WIZARD_SOURCE).toContain("Setup remains open and no feature state was changed.");
    });

    test("inspects local file metadata without requiring a URL or file contents", () => {
        const executable = inspectSolcordLocalAttachment("invoice.pdf.exe", "application/octet-stream");
        expect(executable).toMatchObject({valid: true, risk: "block", filename: "invoice.pdf.exe", extension: "exe"});
        expect(executable.host).toBeUndefined();
        const image = inspectSolcordLocalAttachment("photo.png", "image/png");
        expect(image).toMatchObject({valid: true, risk: "ordinary", filename: "photo.png", extension: "png"});
        expect(image.host).toBeUndefined();
        expect(PANEL_SOURCE).toContain("<input type=\"file\" aria-label=\"Local file to inspect\"");
        expect(PANEL_SOURCE).toContain("SolcordRuntime.inspectLocalAttachment(file)");
        expect(PANEL_SOURCE).toContain("never reads file contents, downloads, opens, scans, or uploads the file");
    });

    test("cancels voice capture on workspace unmount and exposes controller-owned phase", () => {
        expect(PANEL_SOURCE).toContain("controller.subscribeVoiceNotePhase(setVoicePhase)");
        expect(PANEL_SOURCE).toContain("Voice Note Studio state: {voicePhaseLabel[voicePhase]}");
        expect(PANEL_SOURCE).toMatch(/return \(\) => \{\s*unsubscribe\(\);\s*controller\.cancelVoiceNote\(\);\s*\};/);
    });

    test("renders explicit undo paths for every account-local space rule", () => {
        for (const [method, label] of [["unpinDm", "Unpin"], ["showGuild", "Show server"], ["clearGuildAlias", "Clear alias"]]) {
            expect(PANEL_SOURCE).toContain(`activeController.${method}(id)`);
            expect(PANEL_SOURCE).toContain(`>${label}</button>`);
        }
        expect(PANEL_SOURCE).toContain("Account-local People and Spaces rules");
    });
});
