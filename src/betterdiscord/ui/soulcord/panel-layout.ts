// SPDX-License-Identifier: Apache-2.0

export const SOULCORD_PANEL_MAX_WIDTH = 1080;
export const SOULCORD_PANEL_RIGHT_GUTTER = 24;

export function calculateSoulCordPanelWidth(left: number, viewportWidth: number): number | undefined {
    if (!Number.isFinite(left) || !Number.isFinite(viewportWidth) || left < 0 || viewportWidth <= 0) return;

    const availableWidth = Math.floor(viewportWidth - left - SOULCORD_PANEL_RIGHT_GUTTER);
    if (availableWidth <= 0) return;
    return Math.min(SOULCORD_PANEL_MAX_WIDTH, availableWidth);
}
