// SPDX-License-Identifier: Apache-2.0

import React, {useRef, useState} from "react";
import {useSolcordAction} from "./use-action";

export interface SolcordSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    suffix?: string;
    disabled?: boolean;
    formatValue?(value: number): string;
    onCommit(value: number): unknown;
    onError?(error: unknown): void;
}

const ADJUSTMENT_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

export function normalizeSolcordSliderValue(value: number, min: number, max: number, step = 1): number {
    const upper = Math.max(min, max);
    const interval = Number.isFinite(step) && step > 0 ? step : 1;
    const bounded = Math.max(min, Math.min(upper, Number.isFinite(value) ? value : min));
    return Math.max(min, Math.min(upper, Number((min + Math.round((bounded - min) / interval) * interval).toFixed(8))));
}

export default function SolcordSlider({label, value, min, max, step = 1, suffix = "", disabled = false, formatValue, onCommit, onError}: SolcordSliderProps) {
    const normalize = (next: number) => normalizeSolcordSliderValue(next, min, max, step);
    const source = `${value}:${min}:${max}:${step}`;
    const [state, setState] = useState(() => ({source, draft: normalize(value)}));
    const committed = useRef(normalize(value));
    const currentValue = useRef(value);
    const input = useRef<HTMLInputElement>(null);
    currentValue.current = value;
    const {pending, run} = useSolcordAction(onCommit, onError);
    if (state.source !== source) {
        const next = normalize(value);
        committed.current = next;
        setState({source, draft: next});
    }
    const draft = state.source === source ? state.draft : normalize(value);
    const setDraft = (next: number) => setState({source, draft: next});

    const commit = async (raw: number) => {
        if (disabled || pending) return;
        const next = normalize(raw);
        setDraft(next);
        if (next === committed.current) return;
        committed.current = next;
        if (!await run(next) && input.current) {
            const restored = normalize(currentValue.current);
            committed.current = restored;
            setDraft(restored);
        }
    };
    const describe = (next: number) => formatValue?.(next) ?? `${next}${suffix}`;
    return <label className="solcord-range-field">
        <span>{label}<output>{describe(draft)}</output></span>
        <input ref={input} type="range" min={min} max={max} step={step} value={draft} disabled={disabled || pending}
            aria-label={label} aria-valuetext={describe(draft)} aria-busy={pending || undefined}
            onChange={event => {
                if (disabled || pending) return;
                const next = event.currentTarget.valueAsNumber;
                setDraft(normalize(next));
                if (event.nativeEvent.type === "change") void commit(next);
            }}
            onPointerUp={event => void commit(event.currentTarget.valueAsNumber)}
            onKeyUp={event => {if (ADJUSTMENT_KEYS.has(event.key)) void commit(event.currentTarget.valueAsNumber);}}
            onBlur={event => void commit(event.currentTarget.valueAsNumber)}
            onPointerCancel={() => setDraft(normalize(currentValue.current))} />
    </label>;
}
