const { createClient } = require("redis");

let nodeRedisClient = null;
let connectPromise = null;
let upstashRawClient = null;

/** Determine active mode. Throws if neither configured. */
function getRedisMode(config) {
    if (config && config.REDIS_MODE) {
        return config.REDIS_MODE; // 'upstash' | 'redis' (enforced in env.js)
    }
    const hasUpstash = !!(config && config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN);
    const hasTcp = !!config?.REDIS_URL;
    if (hasUpstash) return "upstash";
    if (hasTcp) return "redis";
    throw new Error("Missing Redis config: set either UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN or REDIS_URL");
}

function isUpstashMode(config) {
    return getRedisMode(config) === "upstash";
}

function buildRedisOptions(config) {
    if (!config.REDIS_URL) {
        throw new Error("REDIS_URL is required for TCP/redis mode");
    }
    return {
        url: config.REDIS_URL,
        socket: {
            reconnectStrategy: (retries) => {
                if (retries > 10) {
                    return new Error("Redis max reconnection attempts reached");
                }
                return Math.min(retries * 100, 3000);
            },
            connectTimeout: 10000,
            keepAlive: 30000,
            noDelay: true,
        },
        commandsQueueMaxLength: 1000,
    };
}

function attachErrorLogger(client, label) {
    let errorCount = 0;
    client.on("error", (err) => {
        errorCount += 1;
        if (errorCount <= 3) {
            console.error(`[${label}] error:`, err.message || err);
        }
    });
}

// --- TCP / node-redis path ---
function getNodeRedisClient(config) {
    if (!nodeRedisClient) {
        nodeRedisClient = createClient(buildRedisOptions(config));
        attachErrorLogger(nodeRedisClient, "redis");
    }
    return nodeRedisClient;
}

function normalizeNodeRedis(raw) {
    return {
        // Always use (script, keysArray, argsArray) from caller
        async eval(script, keys, args) {
            return raw.eval(script, { keys, arguments: args });
        },
        hincrby(key, field, increment) {
            return raw.hIncrBy(key, field, increment);
        },
        hget(key, field) {
            return raw.hGet(key, field);
        },
        hset(key, field, value) {
            return raw.hSet(key, field, value);
        },
        hgetall(key) {
            return raw.hGetAll(key);
        },
        incr(key) {
            return raw.incr(key);
        },
        setbit(key, offset, value) {
            return raw.setBit(key, offset, value);
        },
        getbit(key, offset) {
            return raw.getBit(key, offset);
        },
        bitcount(key) {
            return raw.bitCount(key);
        },
    };
}

// --- Upstash REST path ---
function getUpstashRawClient(config) {
    if (!upstashRawClient) {
        const { Redis } = require("@upstash/redis");
        upstashRawClient = new Redis({
            url: config.UPSTASH_REDIS_REST_URL,
            token: config.UPSTASH_REDIS_REST_TOKEN,
        });
    }
    return upstashRawClient;
}

function normalizeUpstash(raw) {
    return {
        async eval(script, keys, args) {
            return raw.eval(script, keys, args);
        },
        hincrby(key, field, increment) {
            return raw.hincrby(key, field, increment);
        },
        hget(key, field) {
            return raw.hget(key, field);
        },
        hset(key, field, value) {
            return raw.hset(key, { [field]: value });
        },
        async hgetall(key) {
            const res = await raw.hgetall(key);
            return res || {};
        },
        incr(key) {
            return raw.incr(key);
        },
        setbit(key, offset, value) {
            return raw.setbit(key, offset, value);
        },
        getbit(key, offset) {
            return raw.getbit(key, offset);
        },
        bitcount(key) {
            return raw.bitcount(key);
        },
    };
}

// --- Public API ---

/**
 * Returns a normalized redis client (same method names regardless of backend).
 * For 'redis' (TCP) mode: ensures the client is connected.
 * For 'upstash' mode: returns immediately (HTTP).
 */
async function getNormalizedRedis(config) {
    const mode = getRedisMode(config);

    if (mode === "upstash") {
        const raw = getUpstashRawClient(config);
        return normalizeUpstash(raw);
    }

    // TCP mode
    const raw = getNodeRedisClient(config);
    if (!raw.isOpen) {
        if (!connectPromise) {
            connectPromise = raw.connect().finally(() => { connectPromise = null; });
        }
        await connectPromise;
    }
    return normalizeNodeRedis(raw);
}

/** Backwards-compatible connect (used at startup for logging + warming) */
async function connectRedis(config) {
    const mode = getRedisMode(config);
    if (mode === "upstash") {
        getUpstashRawClient(config);
        return { mode: "upstash" };
    }
    const client = getNodeRedisClient(config);
    if (client.isOpen) return client;
    if (!connectPromise) {
        connectPromise = client.connect().finally(() => { connectPromise = null; });
    }
    await connectPromise;
    return client;
}

async function closeRedis() {
    if (nodeRedisClient && nodeRedisClient.isOpen) {
        await nodeRedisClient.quit().catch(() => {});
    }
    nodeRedisClient = null;
    connectPromise = null;
    upstashRawClient = null; // stateless
}

/** Only available in 'redis' (TCP) mode. Throws otherwise. */
async function createAdapterPubSubClients(config) {
    const mode = getRedisMode(config);
    if (mode !== "redis") {
        throw new Error("Socket.IO Redis adapter chỉ hỗ trợ khi dùng REDIS_URL (TCP mode). Khi dùng Upstash REST (UPSTASH_REDIS_REST_*) thì chỉ chạy được single instance (không có adapter).");
    }
    const pubClient = createClient(buildRedisOptions(config));
    const subClient = pubClient.duplicate();

    attachErrorLogger(pubClient, "redis:adapter:pub");
    attachErrorLogger(subClient, "redis:adapter:sub");

    await Promise.all([pubClient.connect(), subClient.connect()]);
    return { pubClient, subClient };
}

module.exports = {
    getNormalizedRedis,
    connectRedis,
    closeRedis,
    createAdapterPubSubClients,
    getRedisMode,
    isUpstashMode,
};
