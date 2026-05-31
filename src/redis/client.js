const { createClient } = require("redis");
const { Redis: UpstashRedis } = require("@upstash/redis");

let rawClient = null;
let normalizedClient = null;
let isConnecting = false;
let isUpstash = false;

function wrapNodeRedis(client) {
    return {
        async hGet(key, field) {
            return client.hGet(key, field);
        },
        async hSet(key, field, value) {
            if (typeof field === "object" && field !== null) {
                return client.hSet(key, field);
            }
            return client.hSet(key, field, value);
        },
        async hIncrBy(key, field, increment) {
            return client.hIncrBy(key, field, increment);
        },
        async hGetAll(key) {
            return client.hGetAll(key);
        },
        async incr(key) {
            return client.incr(key);
        },
        async setBit(key, offset, value) {
            return client.setBit(key, offset, value);
        },
        async getBit(key, offset) {
            return client.getBit(key, offset);
        },
        async bitCount(key) {
            return client.bitCount(key);
        },
        async eval(script, options) {
            return client.eval(script, options);
        },
        async info(section) {
            return client.info(section);
        },
        async quit() {
            if (client.isOpen) {
                await client.quit();
            }
        },
        get isOpen() {
            return client.isOpen;
        },
    };
}

function wrapUpstash(redis) {
    return {
        async hGet(key, field) {
            return redis.hget(key, field);
        },
        async hSet(key, field, value) {
            if (typeof field === "object" && field !== null) {
                return redis.hset(key, field);
            }
            return redis.hset(key, field, value);
        },
        async hIncrBy(key, field, increment) {
            return redis.hincrby(key, field, increment);
        },
        async hGetAll(key) {
            return redis.hgetall(key);
        },
        async incr(key) {
            return redis.incr(key);
        },
        async setBit(key, offset, value) {
            return redis.setbit(key, offset, value);
        },
        async getBit(key, offset) {
            return redis.getbit(key, offset);
        },
        async bitCount(key) {
            return redis.bitcount(key);
        },
        async eval(script, options) {
            // Upstash uses different eval signature
            const { keys = [], arguments: args = [] } = options || {};
            return redis.eval(script, keys, args);
        },
        async info(section) {
            // Upstash support for INFO is limited / may not work on all plans
            try {
                return redis.info(section);
            } catch {
                return null;
            }
        },
        async quit() {
            // Upstash is HTTP - no persistent connection to close
            return;
        },
        get isOpen() {
            // Always "open" conceptually for Upstash REST client
            return true;
        },
    };
}

function isUpstashConfig(config) {
    return !!(config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN);
}

function buildUpstashClient(config) {
    return new UpstashRedis({
        url: config.UPSTASH_REDIS_REST_URL,
        token: config.UPSTASH_REDIS_REST_TOKEN,
    });
}

function buildNodeRedisOptions(config) {
    const options = {
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
        // Better defaults for presence system
        commandsQueueMaxLength: 1000,
    };

    if (config.REDIS_URL) {
        options.url = config.REDIS_URL;
        return options;
    }

    options.socket.host = config.REDIS_HOST;
    options.socket.port = config.REDIS_PORT;

    if (config.REDIS_PASSWORD) {
        options.password = config.REDIS_PASSWORD;
    }

    if (config.REDIS_DB != null) {
        options.database = config.REDIS_DB;
    }

    return options;
}

/**
 * Get or create the (raw) Redis client.
 * For most use cases, prefer connectRedis() which returns a normalized adapter.
 */
function getRedisClient(config) {
    if (rawClient) {
        return rawClient;
    }

    if (isUpstashConfig(config)) {
        isUpstash = true;
        rawClient = buildUpstashClient(config);
        return rawClient;
    }

    // Standard node-redis
    isUpstash = false;
    const options = buildNodeRedisOptions(config);
    rawClient = createClient(options);

    let errorCount = 0;
    rawClient.on("error", (err) => {
        errorCount += 1;
        if (errorCount <= 3) {
            console.error("[redis] Client error:", err.message || err);
        }
    });

    rawClient.on("connect", () => {
        console.log("[redis] Connected");
    });

    return rawClient;
}

/**
 * Connect and return a **normalized** Redis client with consistent camelCase API.
 * Works with both node-redis (TCP) and @upstash/redis (REST).
 *
 * Methods provided:
 *   hGet, hSet, hIncrBy, hGetAll, incr, setBit, quit, isOpen
 */
async function connectRedis(config) {
    if (normalizedClient) {
        return normalizedClient;
    }

    const wantsUpstash = isUpstashConfig(config);

    if (wantsUpstash) {
        isUpstash = true;
        const upstash = buildUpstashClient(config);
        rawClient = upstash;
        normalizedClient = wrapUpstash(upstash);
        console.log("[redis] Using Upstash Redis (REST)");
        return normalizedClient;
    }

    // node-redis path
    isUpstash = false;
    const raw = getRedisClient(config);

    if (!raw.isOpen && !isConnecting) {
        isConnecting = true;
        try {
            await raw.connect();
        } finally {
            isConnecting = false;
        }
    }

    normalizedClient = wrapNodeRedis(raw);
    return normalizedClient;
}

/**
 * Close the Redis connection (no-op for Upstash).
 */
async function closeRedis() {
    if (normalizedClient) {
        try {
            await normalizedClient.quit();
        } catch (_) {}
        normalizedClient = null;
        rawClient = null;
        return;
    }

    if (rawClient) {
        if (isUpstash) {
            rawClient = null;
        } else if (rawClient.isOpen) {
            await rawClient.quit().catch(() => {});
            rawClient = null;
        }
    }
}

module.exports = {
    getRedisClient,
    connectRedis,
    closeRedis,
};