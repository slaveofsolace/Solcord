import {t} from "@common/i18n";

const MISSING_TRANSLATION = "String not found!";
const PANEL_FALLBACKS: Record<string, string> = {
    customcss: "Custom CSS",
    plugins: "Plugins",
    settings: "Settings",
    solcord: "Solcord Suite",
    themes: "Themes",
    updates: "Updates"
};

export function resolveTranslatedText(key: string, fallback?: string): string | undefined {
    const translated = t(key);
    // Discord has used both a sentinel and the untranslated lookup key for a
    // missing string. Neither is user-facing copy, so keep the product-owned
    // fallback in both cases.
    if (translated && translated !== MISSING_TRANSLATION && translated !== key) return translated;
    return fallback && fallback !== MISSING_TRANSLATION ? fallback : undefined;
}

export function resolvePanelLabel(id: string, fallback: string, translateLabel = true): string {
    const safeFallback = fallback && fallback !== MISSING_TRANSLATION ? fallback : PANEL_FALLBACKS[id] ?? id;
    if (!translateLabel) return safeFallback;
    return resolveTranslatedText(`Panels.${id}`, safeFallback) ?? safeFallback;
}
