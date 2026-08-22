export type SoulCordRisk = "standard" | "experimental" | "account-risk" | "external-service";
export type SoulCordMaturity = "ready" | "preview" | "unavailable";
export type SoulCordModuleId =
    | "activity-bridge"
    | "plugin-doctor"
    | "drift-radar"
    | "performance-hud"
    | "workspace-profiles"
    | "command-deck"
    | "link-lens"
    | "stream-shield"
    | "settings-time-machine"
    | "accessibility-toolkit";

export interface SoulCordModuleSettings {
    enabled: boolean;
    values: Record<string, unknown>;
}

export interface SoulCordProfile {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    modules: Record<SoulCordModuleId, SoulCordModuleSettings>;
    selectedPlugins: string[];
    selectedThemes: string[];
    includesThirdPartyAddons: boolean;
}

export interface SoulCordSnapshot {
    id: string;
    reason: string;
    createdAt: number;
    modules: Record<SoulCordModuleId, SoulCordModuleSettings>;
    profiles: SoulCordProfile[];
}

export interface SoulCordUpdateEntry {
    at: number;
    kind: "schema" | "profile" | "setting" | "rollback" | "runtime";
    detail: string;
    version: string;
}

export interface SoulCordSettingsDocument {
    schemaVersion: 2;
    consentVersion: 1;
    modules: Record<SoulCordModuleId, SoulCordModuleSettings>;
    profiles: SoulCordProfile[];
    snapshots: SoulCordSnapshot[];
    updateLedger: SoulCordUpdateEntry[];
}

export interface SoulCordModuleHealth {
    id: SoulCordModuleId;
    name: string;
    risk: SoulCordRisk;
    maturity: SoulCordMaturity;
    status: "stopped" | "starting" | "active" | "failed" | "quarantined" | "unavailable";
    startupDurationMs?: number;
    failures: Array<{at: number; phase: string; errorName: string;}>;
    quarantineReason?: string;
    lastSuccessfulValidation?: number;
    resources: Record<string, number>;
    detail: string;
}

export interface SoulCordFeatureContext {
    settings: SoulCordModuleSettings;
    scope: import("./disposal").SoulCordDisposalScope;
    validate(): boolean;
    updateDetail(detail: string, maturity?: SoulCordMaturity): void;
    recordFailure(error: unknown, phase: string): void;
}

export interface SoulCordFeatureDefinition {
    id: SoulCordModuleId;
    name: string;
    description: string;
    risk: SoulCordRisk;
    defaultMaturity: SoulCordMaturity;
    defaultEnabled: boolean;
    start(context: SoulCordFeatureContext): void | Promise<void>;
}
