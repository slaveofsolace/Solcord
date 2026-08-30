// SPDX-License-Identifier: Apache-2.0

import {describe, expect, test} from "bun:test";
import {readFileSync} from "node:fs";

import {planSolcordNativeSuiteLookups} from "../../src/common/solcord/builtin-addons";

const runtime = readFileSync(new URL("../../src/betterdiscord/modules/solcord/runtime.ts", import.meta.url), "utf8");

describe("Solcord volatile voice runtime wiring", () => {
    test("performs no volatile voice lookup when every voice feature is disabled", () => {
        expect(planSolcordNativeSuiteLookups({}, false)).toMatchObject({
            callContext: false,
            audioConsole: false,
            voiceNoteStudio: false,
            voiceHealth: false
        });
    });

    test("loads current-call membership for Audio Console without enabling unrelated speaking or stream readers", () => {
        expect(planSolcordNativeSuiteLookups({BetterVolume: true}, false)).toMatchObject({
            callContext: false,
            audioConsole: true
        });
        expect(runtime).toContain("const voiceParticipantsNeeded = lookups.callContext || lookups.audioConsole;");
        expect(runtime).toContain("const selectedChannelStore = voiceParticipantsNeeded || lookups.voiceNoteStudio");
        expect(runtime).toContain("const voiceStateStore = voiceParticipantsNeeded");
        expect(runtime).toContain("const speakingStore = lookups.callContext");
        expect(runtime).toContain("const streamingStore = lookups.callContext");
        expect(runtime).toContain("currentCall: voiceParticipantContextAvailable ? currentCall : undefined");
    });
});
