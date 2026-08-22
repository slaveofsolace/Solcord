export type SoulCordResourceKind = "listener" | "timer" | "interval" | "observer" | "style" | "element" | "patch" | "other";

interface DisposalRecord {
    kind: SoulCordResourceKind;
    dispose(): void;
}

export class SoulCordDisposalScope {
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

    own(dispose: () => void, kind: SoulCordResourceKind = "other"): () => void {
        if (this.#disposed) {
            dispose();
            return () => {};
        }
        const record = {kind, dispose};
        this.#records.push(record);
        return () => {
            const index = this.#records.indexOf(record);
            if (index < 0) return;
            this.#records.splice(index, 1);
            record.dispose();
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
        if (this.#disposed) return;
        this.#disposed = true;
        const records = this.#records.splice(0).reverse();
        const errors: unknown[] = [];
        for (const record of records) {
            try {record.dispose();}
            catch (error) {errors.push(error);}
        }
        if (errors.length) throw new AggregateError(errors, "SoulCord resource cleanup failed.");
    }
}
