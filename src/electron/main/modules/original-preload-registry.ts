// SPDX-License-Identifier: Apache-2.0

export interface OriginalPreloadWebContents {
    id: number;
    once(event: "destroyed", listener: () => void): unknown;
}

/**
 * Keeps Discord's original preload associated with the WebContents that owns it.
 * This replaces the process-global environment variable, which could be
 * overwritten when two BrowserWindows were constructed close together.
 */
export class OriginalPreloadRegistry {
    #byWebContents = new Map<number, string>();

    register(webContents: OriginalPreloadWebContents, originalPreload: unknown): boolean {
        if (!Number.isSafeInteger(webContents.id) || webContents.id < 1
            || typeof originalPreload !== "string" || !originalPreload) return false;
        this.#byWebContents.set(webContents.id, originalPreload);
        webContents.once("destroyed", () => this.release(webContents.id));
        return true;
    }

    resolve(webContentsId: unknown): string | undefined {
        if (!Number.isSafeInteger(webContentsId)) return undefined;
        return this.#byWebContents.get(webContentsId as number);
    }

    release(webContentsId: number): void {
        this.#byWebContents.delete(webContentsId);
    }

    sizeForTests(): number {
        return this.#byWebContents.size;
    }
}
