// SPDX-License-Identifier: Apache-2.0

import React from "react";
import {useSolcordAction} from "./use-action";

export default function ActionButton({children, onClick, tone = "neutral", disabled = false}: {children: React.ReactNode; onClick(): unknown; tone?: "neutral" | "accent" | "danger"; disabled?: boolean;}) {
    const {pending, run} = useSolcordAction(onClick);
    return <button type="button" className={`solcord-action solcord-action-${tone}`} onClick={() => {if (!disabled) void run();}} disabled={disabled || pending} aria-busy={pending || undefined}>{children}</button>;
}
