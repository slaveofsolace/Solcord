export type SolcordResourceKind = "listener" | "timer" | "interval" | "observer" | "style" | "element" | "patch" | "cache" | "media" | "audio-context" | "track" | "object-url" | "other";

interface DisposalRecord {
    kind: SolcordResourceKind;
    dispose(): void;
}

export class SolcordDisposalScope {
    #records: DisposalRecord[] = [];
    #disposed = false;

    get disposed(): boolean {
        return this.#disposed;
    }

    counts(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const record of this.#records) counts[record.kind] = (counts[record.kind] ?? 0) + 1;
        return counts;
    }

    own(dispose: () => void, kind: SolcordResourceKind = "other"): () => void {
        if (this.#disposed) {
            dispose();
            return () => {};
        }
        const record = {kind, dispose};
        this.#records.push(record);
        return () => {
            const index = this.#records.indexOf(record);
            if (index < 0) return;
            record.dispose();
            const completedIndex = this.#records.indexOf(record);
            if (completedIndex >= 0) this.#records.splice(completedIndex, 1);
        };
    }

    listen<T extends EventTarget>(target: T, type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): () => void {
        target.addEventListener(type, listener, options);
        return this.own(() => target.removeEventListener(type, listener, options), "listener");
    }

    timeout(callback: () => void, delay: number): number {
        let handle = 0;
        const release = this.own(() => globalThis.clearTimeout(handle), "timer");
        handle = globalThis.setTimeout(() => {
            release();
            callback();
        }, delay) as unknown as number;
        return handle;
    }

    idle(callback: () => void, timeout = 1_500): void {
        const host = globalThis as typeof globalThis & {
            requestIdleCallback?: (callback: () => void, options?: {timeout: number;}) => number;
            cancelIdleCallback?: (handle: number) => void;
        };
        if (typeof host.requestIdleCallback !== "function" || typeof host.cancelIdleCallback !== "function") {
            this.timeout(callback, Math.min(Math.max(timeout, 0), 250));
            return;
        }
        let handle = 0;
        let fired = false;
        const release = this.own(() => host.cancelIdleCallback?.(handle), "timer");
        handle = host.requestIdleCallback(() => {
            if (fired) return;
            fired = true;
            release();
            if (!this.#disposed) callback();
        }, {timeout: Math.max(0, timeout)});
    }

    interval(callback: () => void, delay: number): number {
        const handle = globalThis.setInterval(callback, delay) as unknown as number;
        this.own(() => globalThis.clearInterval(handle), "interval");
        return handle;
    }

    observe(observer: MutationObserver, target: Node, options: MutationObserverInit): void {
        observer.observe(target, options);
        this.own(() => observer.disconnect(), "observer");
    }

    style(id: string, css: string): HTMLStyleElement {
        const existing = document.getElementById(id);
        if (existing) existing.remove();
        const style = document.createElement("style");
        style.id = id;
        style.textContent = css;
        document.head.append(style);
        this.own(() => style.remove(), "style");
        return style;
    }

    element<T extends HTMLElement>(element: T, parent: ParentNode = document.body): T {
        parent.append(element);
        this.own(() => element.remove(), "element");
        return element;
    }

    dispose(): void {
        if (this.#disposed && !this.#records.length) return;
        this.#disposed = true;
        const records = this.#records.splice(0).reverse();
        const failed: DisposalRecord[] = [];
        const errors: unknown[] = [];
        for (const record of records) {
            try {record.dispose();}
            catch (error) {
                failed.push(record);
                errors.push(error);
            }
        }
        if (failed.length) {
            // A throwing disposer may have failed before releasing its external
            // resource. Retain ownership so a later stop/retry can attempt the
            // exact cleanup again and resource counts remain truthful.
            this.#records.push(...failed.reverse());
        }
        if (errors.length) throw new AggregateError(errors, "Solcord resource cleanup failed.");
    }
}
