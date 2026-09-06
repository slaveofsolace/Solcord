// SPDX-License-Identifier: Apache-2.0

import React, {useRef} from "react";
import {useSolcordAction, useSolcordControlFocus} from "./use-action";

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
    const input = useRef<HTMLInputElement>(null);
    const preserveFocus = useSolcordControlFocus(input, pending, disabled);
    return <span className="solcord-switch">
        <input ref={input} type="checkbox" role="switch" aria-label={label} aria-checked={checked} aria-busy={pending || undefined} checked={checked} disabled={disabled || pending} onChange={event => {if (!disabled && !pending) {preserveFocus(); void run(event.currentTarget.checked);}}} />
        <span className="solcord-switch-track" aria-hidden="true"><span className="solcord-switch-thumb" /></span>
    </span>;
}
