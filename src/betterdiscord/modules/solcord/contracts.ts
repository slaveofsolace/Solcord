export type SolcordRisk = "standard" | "experimental" | "account-risk" | "external-service";
export type SolcordMaturity = "ready" | "preview" | "unavailable";
export type SolcordThemeId =
    | "solcord-default"
    | "obsidian-thread"
    | "carbon-ember"
    | "midnight-glass"
    | "paper-signal"
    | "threadline"
    | "signal-block"
    | "relay-classic"
    | "workshop"
    | "quiet-read"
    | "night-transit";
export type SolcordAddonMode = "default" | "guarded" | "native";
export type SolcordAddonProvider = "prefer-community" | "prefer-solcord";
export type SolcordOnboardingStatus = "pending" | "complete" | "skipped";
export type {OutboundDataClass, PrivacyCapabilityRecord, PrivacyCapabilityState, PrivacyDecisionReceipt, PrivacyProfile, SolcordPrivacyPreferences} from "@common/solcord/privacy";
export type {
    SolcordAccent,
    SolcordAppearancePreferences,
    SolcordDensity,
    SolcordFriendWatchPolicy,
    SolcordMessageShape,
    SolcordMotion,
    SolcordPerformanceProfile,
    SolcordBaselinePreferences,
    SolcordProductPreferences,
    SolcordSafetyPreferences,
    SolcordSetupPreset,
    SolcordVisualMode,
    SolcordWorkspaceId
} from "@common/solcord/product";
export type SolcordModuleId =
    | "activity-bridge"
    | "plugin-doctor"
    | "drift-radar"
    | "performance-hud"
    | "workspace-profiles"
    | "command-deck"
    | "link-lens"
    | "stream-shield"
    | "stream-audience-guard"
    | "settings-time-machine"
    | "accessibility-toolkit"
    | "friend-watch"
    | "message-timeline";

export interface SolcordCuratedAddonState {
    selected: boolean;
    enabled: boolean;
    mode: SolcordAddonMode;
    provider: SolcordAddonProvider;
    reviewedSha256?: string;
    quarantineReason?: string;
}

export interface SolcordTimelinePolicy {
    enabled: boolean;
    scope: "dm-only" | "selected-channels";
    serverChannelIds: string[];
    retention: "session" | "24-hours" | "7-days" | "30-days" | "90-days" | "manual";
    content: "text-only" | "text-and-metadata" | "encrypted-media";
    textBudgetBytes: 262_144_000;
    mediaBudgetBytes: 268_435_456 | 1_073_741_824 | 5_368_709_120;
}

export interface SolcordPowerConsent {
    enabled: boolean;
    acknowledgementVersion: number;
    acknowledgedAt?: number;
}

export type SolcordPowerExperimentId = "voice-anchor" | "expression-relay" | "decor" | "fake-deafen" | "fake-mute" | "stream-rtc";

export interface SolcordOnboardingState {
    version: 5;
    status: SolcordOnboardingStatus;
    lastStep: number;
    draft?: SolcordSetupDraft;
    completedAt?: number;
}

export interface SolcordMigrationRecord {
    at: number;
    fromSchema: number;
    toSchema: number;
    detail: string;
}

export interface SolcordSetupTransactionRecord {
    id: string;
    at: number;
    snapshotId: string;
    priorAddonStates: Record<string, boolean>;
    priorThemeStates: Record<string, boolean>;
    providerArchiveTransactionId?: string;
}

export interface SolcordModuleSettings {
    enabled: boolean;
    values: Record<string, unknown>;
}

export interface SolcordProfile {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    modules: Record<SolcordModuleId, SolcordModuleSettings>;
    selectedPlugins: string[];
    selectedThemes: string[];
    includesThirdPartyAddons: boolean;
}

export interface SolcordSnapshot {
    id: string;
    reason: string;
    createdAt: number;
    modules: Record<SolcordModuleId, SolcordModuleSettings>;
    profiles: SolcordProfile[];
    selectedTheme: SolcordThemeId;
    curatedAddons: Record<string, SolcordCuratedAddonState>;
    timelinePolicy: SolcordTimelinePolicy;
    productPreferences: import("@common/solcord/product").SolcordProductPreferences;
    activePlugins?: string[];
    activeThemes?: string[];
}

export interface SolcordUpdateEntry {
    at: number;
    kind: "schema" | "profile" | "setting" | "rollback" | "runtime";
    detail: string;
    version: string;
}

export interface SolcordSettingsDocument {
    schemaVersion: 7;
    consentVersion: 3;
    onboarding: SolcordOnboardingState;
    selectedTheme: SolcordThemeId;
    curatedAddons: Record<string, SolcordCuratedAddonState>;
    timelinePolicy: SolcordTimelinePolicy;
    productPreferences: import("@common/solcord/product").SolcordProductPreferences;
    powerLab: Record<SolcordPowerExperimentId, SolcordPowerConsent>;
    migrationProvenance: SolcordMigrationRecord[];
    setupTransactions: SolcordSetupTransactionRecord[];
    modules: Record<SolcordModuleId, SolcordModuleSettings>;
    profiles: SolcordProfile[];
    snapshots: SolcordSnapshot[];
    updateLedger: SolcordUpdateEntry[];
}

export interface SolcordSetupDraft {
    preset: import("@common/solcord/product").SolcordSetupPreset;
    selectedTheme: SolcordThemeId;
    selectedAddons: string[];
    addonModes: Record<string, SolcordAddonMode>;
    addonProviders: Record<string, SolcordAddonProvider>;
    timelinePolicy: SolcordTimelinePolicy;
    productPreferences: import("@common/solcord/product").SolcordProductPreferences;
}

export interface SolcordModuleHealth {
    id: SolcordModuleId;
    name: string;
    risk: SolcordRisk;
    maturity: SolcordMaturity;
    status: "stopped" | "starting" | "active" | "failed" | "quarantined" | "unavailable";
    startupDurationMs?: number;
    failures: Array<{at: number; phase: string; errorName: string;}>;
    quarantineReason?: string;
    lastSuccessfulValidation?: number;
    resources: Record<string, number>;
    detail: string;
}

export interface SolcordFeatureContext {
    settings: SolcordModuleSettings;
    scope: import("./disposal").SolcordDisposalScope;
    validate(): boolean;
    updateDetail(detail: string, maturity?: SolcordMaturity): void;
    recordFailure(error: unknown, phase: string): void;
}

export interface SolcordFeatureDefinition {
    id: SolcordModuleId;
    name: string;
    description: string;
    risk: SolcordRisk;
    defaultMaturity: SolcordMaturity;
    defaultEnabled: boolean;
    start(context: SolcordFeatureContext): void | Promise<void>;
}
