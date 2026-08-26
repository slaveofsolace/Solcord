// SPDX-License-Identifier: Apache-2.0

export const SOLCORD_ACCEPTANCE_MODE_ENV = "SOLCORD_ACCEPTANCE_MODE";
export const SOLCORD_ACCEPTANCE_ROOT_ENV = "SOLCORD_ACCEPTANCE_ROOT";

export function isSolcordAcceptanceMode(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
    return environment[SOLCORD_ACCEPTANCE_MODE_ENV] === "1";
}
