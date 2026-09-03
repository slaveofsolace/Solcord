// SPDX-License-Identifier: Apache-2.0

import React from "react";
import {useSolcordAction} from "./use-action";

export interface SolcordSwitchProps {
    checked: boolean;
    label: string;
    disabled?: boolean;
    onChange(checked: boolean): unknown;
    onError?(error: unknown): void;
}

/** One accessible binary control for every Solcord setting. */
export default function SolcordSwitch({checked, label, disabled = false, onChange, onError}: SolcordSwitchProps) {
    const {pending, run} = useSolcordAction(onChange, onError);
    return <span className="solcord-switch">
        <input type="checkbox" role="switch" aria-label={label} aria-checked={checked} aria-busy={pending || undefined} checked={checked} disabled={disabled || pending} onChange={event => {if (!disabled && !pending) void run(event.currentTarget.checked);}} />
        <span className="solcord-switch-track" aria-hidden="true"><span className="solcord-switch-thumb" /></span>
    </span>;
}
