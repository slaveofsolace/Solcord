import https from "https";
import http from "http";
import {hydrateReadableStream, dryReadableStream, type DriedRequest, type DriedResponse} from "@common/native-fetch";
import {isWebhookUrl} from "./webhook";

const DEFAULT_TIMEOUT = 8_000;

const redirectCodes = new Set([301, 302, 303, 307, 308]);
const bodylessStatusCodes = new Set([101, 204, 205, 304]);
const SENSITIVE_REDIRECT_HEADERS = new Set(["authorization", "cookie", "proxy-authorization"]);
const BODY_HEADERS = new Set(["content-length", "content-type", "transfer-encoding"]);

function redirectMethod(status: number, method: string): {method: string; keepBody: boolean;} {
    const upper = method.toUpperCase();
    if (status === 303 && upper !== "HEAD") return {method: "GET", keepBody: false};
    if ((status === 301 || status === 302) && upper === "POST") return {method: "GET", keepBody: false};
    return {method: upper, keepBody: true};
}

function redirectHeaders(headers: Record<string, string> | undefined, from: URL, to: URL, keepBody: boolean): Record<string, string> | undefined {
    if (!headers) return undefined;
    const sameOrigin = from.origin === to.origin;
    return Object.fromEntries(Object.entries(headers).filter(([name]) => {
        const normalized = name.toLocaleLowerCase("en-US");
        if (!sameOrigin && SENSITIVE_REDIRECT_HEADERS.has(normalized)) return false;
        if (!keepBody && BODY_HEADERS.has(normalized)) return false;
        return true;
    }));
}

export function nativeFetch({url, signal: dryAbortSignal, body: dryBody, ...init}: DriedRequest) {
    const {promise, resolve, reject} = Promise.withResolvers<DriedResponse>();

    const maxRedirects = init.maxRedirects ?? 20;

    const body = dryBody ? hydrateReadableStream(dryBody) : null;

    let redirectCount = 0;

    function out(uri: string, res: http.IncomingMessage): DriedResponse {
        const status = res.statusCode ?? 0;

        let stream: ReadableStream | null = null;

        if (!bodylessStatusCodes.has(status)) {
            stream = new ReadableStream({
                start(controller) {
                    res.on("data", (data) => controller.enqueue(data));
                    res.on("error", (err) => controller.error(err));
                    res.once("end", () => controller.close());
                },
                type: "bytes"
            });
        }

        return {
            body: stream ? dryReadableStream(stream) : null,
            url: uri,
            headers: res.headers as Record<string, string>,
            status: status,
            statusText: res.statusMessage || "",
            redirected: redirectCount !== 0
        };
    }

    // If null or infinite no timeout | undefined or finite then timeout
    const timeout = ((t) => init.timeout === null || !isFinite(t) ? undefined : t)(init.timeout ?? DEFAULT_TIMEOUT);

    async function execute(uri: string, method: string, sendBody: boolean, headers = init.headers) {
        // Mirror the renderer's former webhook block for BdApi.Net.fetch, which runs here over
        // Node's https and does not inherit the origin/referrer of Discord.com which Discord
        // uses to block requests to webhooks by default. Checked per hop so a redirect into a
        // webhook URL is caught too.
        if (isWebhookUrl(uri)) {
            reject(new Error("Failed to fetch"));
            return;
        }

        const httpModule = uri.startsWith("http:") ? http : uri.startsWith("https:") ? https : null;
        if (!httpModule) {
            reject(new Error(`Unsupported protocol: ${uri.slice(0, uri.indexOf(":"))}:`));
            return;
        }

        const request = httpModule.request(uri, {
            headers,
            method,
            timeout,
            rejectUnauthorized: init.rejectUnauthorized
        }, (res) => {
            if (redirectCodes.has(res.statusCode!)) {
                if (init.redirect === "error") {
                    request.destroy(new Error("Failed to fetch"));
                    return;
                }
                if (init.redirect === "manual") {
                    resolve(out(uri, res));
                    return;
                }
                if (redirectCount >= maxRedirects) {
                    res.resume();
                    reject(new Error(`Maximum amount of redirects reached (${maxRedirects})`));
                    return;
                }

                if (res.headers.location) {
                    let final: URL;
                    try {
                        final = new URL(res.headers.location, uri);
                    }
                    catch (error) {
                        res.resume();
                        reject(error);
                        return;
                    }

                    const transition = redirectMethod(res.statusCode!, method);
                    if (sendBody && transition.keepBody) {
                        reject(new Error("Request body cannot be replayed across redirects"));
                        res.resume();
                        return;
                    }
                    const current = new URL(uri);
                    const nextHeaders = redirectHeaders(headers, current, final, transition.keepBody);
                    redirectCount++;
                    res.resume();
                    return execute(final.href, transition.method, sendBody && transition.keepBody, nextHeaders);
                }
            }

            resolve(out(uri, res));
        });

        request.shouldKeepAlive = init.keepalive;

        if (dryAbortSignal) {
            const undo = dryAbortSignal.addListener(() => {
                request.destroy(dryAbortSignal.reason() || new Error("Request was aborted"));
            });

            request.once("close", () => undo());
        }

        request.once("timeout", () => request.destroy(new Error("Request timed out")));

        request.once("error", (err) => reject(err));

        if (body && sendBody) {
            try {
                for await (const value of body) {
                    request.write(value);
                }

                request.end();
            }
            catch (error) {
                request.destroy(error as Error);
            }
        }
        else {request.end();}
    }

    execute(url, init.method ?? "GET", Boolean(body));

    return promise;
}
