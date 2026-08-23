export type SoulCordRisk = "standard" | "experimental" | "account-risk" | "external-service";
export type SoulCordMaturity = "ready" | "preview" | "unavailable";
export type SoulCordThemeId = "obsidian-thread" | "carbon-ember" | "midnight-glass" | "paper-signal";
export type SoulCordAddonMode = "default" | "guarded" | "native";
export type SoulCordOnboardingStatus = "pending" | "complete" | "skipped";
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
    | "accessibility-toolkit"
    | "message-timeline";

export interface SoulCordCuratedAddonState {
    selected: boolean;
    enabled: boolean;
    mode: SoulCordAddonMode;
    reviewedSha256?: string;
    quarantineReason?: string;
}

export interface SoulCordTimelinePolicy {
    enabled: boolean;
    scope: "dm-only" | "selected-channels";
    serverChannelIds: string[];
    retention: "session" | "24-hours" | "7-days" | "30-days" | "90-days" | "manual";
    content: "text-only" | "text-and-metadata" | "encrypted-media";
    textBudgetBytes: 262_144_000;
    mediaBudgetBytes: 268_435_456 | 1_073_741_824 | 5_368_709_120;
}

export interface SoulCordPowerConsent {
    enabled: boolean;
    acknowledgementVersion: number;
    acknowledgedAt?: number;
}

export type SoulCordPowerExperimentId = "voice-anchor" | "expression-relay" | "decor" | "fake-deafen" | "fake-mute" | "stream-rtc";

export interface SoulCordOnboardingState {
    version: 1;
    status: SoulCordOnboardingStatus;
    completedAt?: number;
}

export interface SoulCordMigrationRecord {
    at: number;
    fromSchema: number;
    toSchema: number;
    detail: string;
}

export interface SoulCordSetupTransactionRecord {
    id: string;
    at: number;
    snapshotId: string;
    priorAddonStates: Record<string, boolean>;
    priorThemeStates: Record<string, boolean>;
}

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
    selectedTheme: SoulCordThemeId;
    curatedAddons: Record<string, SoulCordCuratedAddonState>;
    timelinePolicy: SoulCordTimelinePolicy;
    activePlugins?: string[];
    activeThemes?: string[];
}

export interface SoulCordUpdateEntry {
    at: number;
    kind: "schema" | "profile" | "setting" | "rollback" | "runtime";
    detail: string;
    version: string;
}

export interface SoulCordSettingsDocument {
    schemaVersion: 3;
    consentVersion: 2;
    onboarding: SoulCordOnboardingState;
    selectedTheme: SoulCordThemeId;
    curatedAddons: Record<string, SoulCordCuratedAddonState>;
    timelinePolicy: SoulCordTimelinePolicy;
    powerLab: Record<SoulCordPowerExperimentId, SoulCordPowerConsent>;
    migrationProvenance: SoulCordMigrationRecord[];
    setupTransactions: SoulCordSetupTransactionRecord[];
    modules: Record<SoulCordModuleId, SoulCordModuleSettings>;
    profiles: SoulCordProfile[];
    snapshots: SoulCordSnapshot[];
    updateLedger: SoulCordUpdateEntry[];
}

export interface SoulCordSetupDraft {
    selectedTheme: SoulCordThemeId;
    selectedAddons: string[];
    addonModes: Record<string, SoulCordAddonMode>;
    timelinePolicy: SoulCordTimelinePolicy;
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
