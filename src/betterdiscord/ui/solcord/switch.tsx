// SPDX-License-Identifier: Apache-2.0

import React from "react";

export interface SolcordSwitchProps {
    checked: boolean;
    label: string;
    disabled?: boolean;
    onChange(checked: boolean): void;
}

/** One accessible binary control for every Solcord setting. */
export default function SolcordSwitch({checked, label, disabled = false, onChange}: SolcordSwitchProps) {
    return <span className="solcord-switch">
        <input type="checkbox" role="switch" aria-label={label} aria-checked={checked} checked={checked} disabled={disabled} onChange={event => onChange(event.currentTarget.checked)} />
        <span className="solcord-switch-track" aria-hidden="true"><span className="solcord-switch-thumb" /></span>
    </span>;
}
