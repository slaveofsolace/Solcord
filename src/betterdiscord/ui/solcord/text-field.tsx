// SPDX-License-Identifier: Apache-2.0

import React, {useCallback, useEffect, useId, useRef, useState} from "react";
import {useSolcordAction} from "./use-action";

interface SolcordTextFieldProps {
    label: string;
    value: string;
    placeholder?: string;
    maxLength?: number;
    disabled?: boolean;
    normalize(value: string): string;
    onCommit(value: string): unknown;
    onDraftChange?(dirty: boolean): void;
}

/** Validate complete edits, never the intermediate characters of a URL or code. */
export default function SolcordTextField({label, value, placeholder, maxLength, disabled = false, normalize, onCommit, onDraftChange}: SolcordTextFieldProps) {
    const [state, setState] = useState(() => ({source: value, draft: value}));
    const [error, setError] = useState("");
    const errorId = useId();
    const current = useRef(value);
    const input = useRef<HTMLInputElement>(null);
    const saving = useRef(false);
    const dirtyState = useRef(false);
    const notifyDraft = useRef(onDraftChange);
    current.current = value;
    notifyDraft.current = onDraftChange;
    const reportDraft = useCallback((dirty: boolean) => {
        if (dirtyState.current === dirty) return;
        dirtyState.current = dirty;
        notifyDraft.current?.(dirty);
    }, []);
    const {pending, run} = useSolcordAction(onCommit, () => setError("Could not save. Your edit is kept; try again."));
    if (state.source !== value && !saving.current) {setState({source: value, draft: value}); setError("");}
    const draft = state.source === value || saving.current ? state.draft : value;
    useEffect(() => {if (!saving.current) reportDraft(false);}, [value, reportDraft]);
    useEffect(() => () => reportDraft(false), [reportDraft]);
    const reset = () => {
        setState({source: current.current, draft: current.current});
        setError("");
        reportDraft(false);
    };
    const commit = async (raw: string) => {
        if (disabled || saving.current) return;
        let next: string;
        try {next = normalize(raw.trim());}
        catch (failure) {setError(failure instanceof Error ? failure.message : "Check this value before saving."); return;}
        if (next === current.current) {reset(); return;}
        saving.current = true;
        setError("");
        try {
            if (await run(next)) {
                if (input.current) {
                    setState({source: current.current, draft: current.current});
                    reportDraft(false);
                }
            }
            else if (input.current) {
                setState({source: current.current, draft: raw});
                setError("Could not save. Your edit is kept; try again.");
                reportDraft(raw !== current.current);
            }
        }
        finally {saving.current = false;}
    };
    return <label className="solcord-text-field">
        <span>{label}</span>
        <input ref={input} value={draft} placeholder={placeholder} maxLength={maxLength} disabled={disabled || pending}
            aria-label={label} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errorId : undefined} aria-busy={pending || undefined}
            onChange={event => {
                if (disabled || saving.current) return;
                const next = event.currentTarget.value;
                setState({source: value, draft: next});
                setError("");
                reportDraft(next !== current.current);
            }}
            onBlur={event => void commit(event.currentTarget.value)}
            onKeyDown={event => {
                if (event.key === "Enter") {event.preventDefault(); void commit(event.currentTarget.value);}
                else if (event.key === "Escape" && !saving.current) {event.preventDefault(); event.stopPropagation(); reset();}
            }} />
        {error && <small id={errorId} className="solcord-error" role="alert">{error}</small>}
    </label>;
}
