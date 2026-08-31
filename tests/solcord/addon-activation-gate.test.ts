import {describe, expect, test} from "bun:test";

import {AddonActivationGate} from "../../src/betterdiscord/modules/addon-activation-gate";

describe("addon activation gate", () => {
    test("holds execution without consulting or mutating the policy", () => {
        let calls = 0;
        const gate = new AddonActivationGate<{id: string;}>();
        gate.setGuard(() => {
            calls++;
            return true;
        });
        gate.hold();
        expect(gate.evaluate({id: "example"})).toBe("held");
        expect(calls).toBe(0);
        gate.release();
        expect(gate.evaluate({id: "example"})).toBe("allowed");
        expect(calls).toBe(1);
    });

    test("fails closed when a policy denies or throws", () => {
        const gate = new AddonActivationGate<{id: string;}>();
        gate.setGuard(() => false);
        expect(gate.evaluate({id: "denied"})).toBe("denied");
        gate.setGuard(() => {throw new Error("drift");});
        expect(gate.evaluate({id: "drift"})).toBe("denied");
        gate.setGuard(undefined);
        expect(gate.evaluate({id: "ordinary"})).toBe("allowed");
    });
});
