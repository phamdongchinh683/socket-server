const fs = require("fs");
const path = require("path");

function loadDotEnv() {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) {
        return;
    }

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const eq = trimmed.indexOf("=");
        if (eq === -1) {
            continue;
        }

        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

function parseBoolean(value, defaultValue) {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }

    const normalized = String(value).trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
        return true;
    }
    if (normalized === "false" || normalized === "0") {
        return false;
    }

    return defaultValue;
}

function requireString(name) {
    const value = process.env[name];
    if (value == null || String(value).trim() === "") {
        throw new Error(`Missing required env: ${name}`);
    }

    return String(value).trim();
}

function loadConfig() {
    loadDotEnv();

    const port = Number(process.env.PORT);
    const redisPort = Number(process.env.REDIS_PORT);
    const cacheTtl = Number(process.env.ONLINE_CACHE_TTL_MS);

    return {
        PORT: Number.isFinite(port) && port > 0 ? port : 4444,
        HOST: process.env.HOST?.trim() || "0.0.0.0",

        JWT_SECRET: requireString("JWT_SECRET"),
        API_URL: requireString("API_URL"),
        INTERNAL_SOCKET_TOKEN: requireString("INTERNAL_SOCKET_TOKEN"),

        LOG_LEVEL: process.env.LOG_LEVEL?.trim() || "error",
        SOCKET_TRANSPORTS: process.env.SOCKET_TRANSPORTS?.trim() || "websocket",
        SOCKET_PER_MESSAGE_DEFLATE: parseBoolean(
            process.env.SOCKET_PER_MESSAGE_DEFLATE,
            false
        ),
        SOCKET_SERVE_CLIENT: parseBoolean(process.env.SOCKET_SERVE_CLIENT, false),

        // Redis (TCP / self-hosted)
        REDIS_URL: process.env.REDIS_URL?.trim() || null,
        REDIS_HOST: process.env.REDIS_HOST?.trim() || "127.0.0.1",
        REDIS_PORT: Number.isFinite(redisPort) && redisPort > 0 ? redisPort : 6379,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD?.trim() || null,
        REDIS_DB: Number.isFinite(Number(process.env.REDIS_DB)) ? Number(process.env.REDIS_DB) : 0,
        REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX?.trim() || "socket",

        // Upstash Redis (REST)
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL?.trim() || null,
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || null,

        // Online user tracking cache
        ONLINE_CACHE_TTL_MS: Number.isFinite(cacheTtl) && cacheTtl > 0 ? cacheTtl : 4000,
    };
}

module.exports = {
    loadConfig,
};