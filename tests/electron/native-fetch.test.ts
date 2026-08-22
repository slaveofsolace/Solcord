import {afterEach, describe, expect, test} from "bun:test";
import http, {type Server} from "node:http";

import {dryReadableStream, type DriedRequest} from "../../src/common/native-fetch";
import {nativeFetch} from "../../src/electron/preload/api/fetch";


const servers: Server[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

async function listen(handler: http.RequestListener): Promise<string> {
    const server = http.createServer(handler);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address.");
    return `http://127.0.0.1:${address.port}`;
}

function request(url: string, overrides: Partial<DriedRequest> = {}): DriedRequest {
    return {
        url,
        body: null,
        headers: {},
        keepalive: false,
        method: "GET",
        redirect: "follow",
        signal: null,
        timeout: 2_000,
        maxRedirects: 5,
        rejectUnauthorized: true,
        ...overrides
    };
}

describe("native fetch redirects", () => {
    test("resolves a relative Location header", async () => {
        const root = await listen((incoming, response) => {
            if (incoming.url === "/start") {
                response.writeHead(302, {location: "/final"});
                response.end();
                return;
            }
            response.writeHead(200);
            response.end("ok");
        });
        const result = await nativeFetch(request(`${root}/start`));
        expect(result.status).toBe(200);
        expect(result.url).toBe(`${root}/final`);
        expect(result.redirected).toBe(true);
    });

    test("changes POST to GET for 303 without replaying the body", async () => {
        let finalMethod = "";
        let finalLength = "";
        const root = await listen((incoming, response) => {
            if (incoming.url === "/start") {
                incoming.resume();
                incoming.once("end", () => {
                    response.writeHead(303, {location: "/final"});
                    response.end();
                });
                return;
            }
            finalMethod = incoming.method ?? "";
            finalLength = incoming.headers["content-length"] ?? "";
            response.writeHead(204);
            response.end();
        });
        const body = dryReadableStream(new Response("payload").body!);
        const result = await nativeFetch(request(`${root}/start`, {
            method: "POST",
            body,
            headers: {"content-type": "text/plain", "content-length": "7"}
        }));
        expect(result.status).toBe(204);
        expect(finalMethod).toBe("GET");
        expect(finalLength).toBe("");
    });

    test("rejects a 307 body replay", async () => {
        const root = await listen((incoming, response) => {
            incoming.resume();
            incoming.once("end", () => {
                response.writeHead(307, {location: "/again"});
                response.end();
            });
        });
        const body = dryReadableStream(new Response("payload").body!);
        await expect(nativeFetch(request(`${root}/start`, {method: "POST", body}))).rejects.toThrow("cannot be replayed");
    });

    test("drops authorization when a redirect changes origin", async () => {
        let receivedAuthorization: string | undefined;
        const destination = await listen((incoming, response) => {
            receivedAuthorization = incoming.headers.authorization;
            response.writeHead(204);
            response.end();
        });
        const source = await listen((_incoming, response) => {
            response.writeHead(302, {location: `${destination}/final`});
            response.end();
        });
        await nativeFetch(request(`${source}/start`, {headers: {authorization: "Bearer redacted"}}));
        expect(receivedAuthorization).toBeUndefined();
    });
});
