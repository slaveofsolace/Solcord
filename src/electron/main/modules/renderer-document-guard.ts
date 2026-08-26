// SPDX-License-Identifier: Apache-2.0

export type RendererDocumentToken = symbol;
export type RendererDocumentClaim =
    | {status: "claimed"; token: RendererDocumentToken;}
    | {status: "duplicate" | "unbound";};

interface RendererDocumentState {
    token: RendererDocumentToken;
    status: "ready" | "in-flight" | "finished";
}

/**
 * Tracks renderer injection against a document boundary minted only by the
 * Electron main process. The renderer cannot invent another generation: a
 * successful top-level `did-navigate` event begins one new document, and that
 * document receives at most one fixed-bundle execution attempt.
 */
export class RendererDocumentInjectionGuard<TOwner extends object> {
    #documents = new WeakMap<TOwner, RendererDocumentState>();

    beginDocument(owner: TOwner): void {
        this.#documents.set(owner, {token: Symbol("solcord-renderer-document"), status: "ready"});
    }

    claim(owner: TOwner): RendererDocumentClaim {
        const document = this.#documents.get(owner);
        if (!document) return {status: "unbound"};
        if (document.status !== "ready") return {status: "duplicate"};
        document.status = "in-flight";
        return {status: "claimed", token: document.token};
    }

    complete(owner: TOwner, token: RendererDocumentToken): boolean {
        const document = this.#documents.get(owner);
        if (!document || document.token !== token || document.status !== "in-flight") return false;
        document.status = "finished";
        return true;
    }

    fail(owner: TOwner, token: RendererDocumentToken): void {
        const document = this.#documents.get(owner);
        if (document?.token === token && document.status === "in-flight") document.status = "finished";
    }

    release(owner: TOwner): void {
        this.#documents.delete(owner);
    }
}
