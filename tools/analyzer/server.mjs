#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { analyzeProject, toSarif } from "./engine.mjs";

const args = process.argv.slice(2);
const root = resolve(readArg("--root") ?? process.cwd());
const profilePath = readArg("--profile");
const port = Number(readArg("--port") ?? process.env.TYPESEA_ANALYZER_PORT ?? "4178");
const host = readArg("--host") ?? "127.0.0.1";
const staticRoot = resolve(root, "tools/analyzer/static");

let cachedAnalysis = undefined;
let cachedAt = 0;
const CACHE_TTL_MS = 1_500;

const server = createServer((request, response) => {
    routeRequest(request, response).then(
        undefined,
        (error) => {
            const message = error instanceof Error ? error.message : String(error);
            sendJson(response, 500, {
                error: "internal-error",
                message
            });
        }
    );
});

server.listen(port, host, () => {
    console.log(`TypeSea analyzer listening on http://${host}:${String(port)}`);
});

function readArg(name) {
    const index = args.indexOf(name);
    if (index === -1) {
        return undefined;
    }
    return args[index + 1];
}

async function routeRequest(request, response) {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname === "/api/health") {
        sendJson(response, 200, {
            ok: true,
            root
        });
        return;
    }
    if (url.pathname === "/api/analysis") {
        const refresh = url.searchParams.get("refresh") === "1";
        const analysis = await readAnalysis(refresh);
        sendJson(response, 200, analysis);
        return;
    }
    if (url.pathname === "/api/sarif") {
        const refresh = url.searchParams.get("refresh") === "1";
        const analysis = await readAnalysis(refresh);
        sendJson(response, 200, toSarif(analysis));
        return;
    }
    if (url.pathname === "/api/source") {
        const path = url.searchParams.get("path");
        if (path === null || path.includes("\0")) {
            sendJson(response, 400, {
                error: "bad-path"
            });
            return;
        }
        const absolute = resolve(root, path);
        if (!isInside(root, absolute)) {
            sendJson(response, 403, {
                error: "path-outside-root"
            });
            return;
        }
        const source = await readFile(absolute, "utf8");
        sendJson(response, 200, {
            path: relative(root, absolute).replaceAll("\\", "/"),
            source
        });
        return;
    }
    await serveStatic(url.pathname, response);
}

async function readAnalysis(refresh) {
    const now = Date.now();
    if (!refresh && cachedAnalysis !== undefined && now - cachedAt < CACHE_TTL_MS) {
        return cachedAnalysis;
    }
    cachedAnalysis = await analyzeProject({ root, profilePath });
    cachedAt = now;
    return cachedAnalysis;
}

async function serveStatic(pathname, response) {
    const cleanPath = pathname === "/" ? "index.html" : pathname.slice(1);
    const absolute = resolve(staticRoot, cleanPath);
    if (!isInside(staticRoot, absolute)) {
        sendText(response, 403, "Forbidden", "text/plain; charset=utf-8");
        return;
    }
    const exists = await readFile(absolute).then(
        (buffer) => buffer,
        () => undefined
    );
    if (exists === undefined) {
        const fallback = await readFile(join(staticRoot, "index.html"));
        sendBuffer(response, 200, fallback, "text/html; charset=utf-8");
        return;
    }
    sendBuffer(response, 200, exists, contentType(absolute));
}

function sendJson(response, status, value) {
    sendText(response, status, JSON.stringify(value), "application/json; charset=utf-8");
}

function sendText(response, status, value, type) {
    response.writeHead(status, {
        "content-type": type,
        "cache-control": "no-store"
    });
    response.end(value);
}

function sendBuffer(response, status, value, type) {
    response.writeHead(status, {
        "content-type": type,
        "cache-control": "no-store"
    });
    response.end(value);
}

function contentType(path) {
    const ext = extname(path);
    if (ext === ".html") {
        return "text/html; charset=utf-8";
    }
    if (ext === ".css") {
        return "text/css; charset=utf-8";
    }
    if (ext === ".js") {
        return "text/javascript; charset=utf-8";
    }
    if (ext === ".svg") {
        return "image/svg+xml";
    }
    return "application/octet-stream";
}

function isInside(parent, child) {
    const rel = relative(parent, child);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
