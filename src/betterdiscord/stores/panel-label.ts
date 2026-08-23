import {t} from "@common/i18n";

export function resolvePanelLabel(id: string, fallback: string, translateLabel = true): string {
    if (!translateLabel) return fallback;
    const translated = t(`Panels.${id}`);
    return !translated || translated === "String not found!" ? fallback : translated;
}
