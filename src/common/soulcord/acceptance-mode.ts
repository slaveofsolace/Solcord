// SPDX-License-Identifier: Apache-2.0

export const SOULCORD_ACCEPTANCE_MODE_ENV = "SOULCORD_ACCEPTANCE_MODE";
export const SOULCORD_ACCEPTANCE_ROOT_ENV = "SOULCORD_ACCEPTANCE_ROOT";

export function isSoulCordAcceptanceMode(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
    return environment[SOULCORD_ACCEPTANCE_MODE_ENV] === "1";
}
