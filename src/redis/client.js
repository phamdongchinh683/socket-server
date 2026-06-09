const { createClient } = require("redis");
const { Redis: UpstashRedis } = require("@upstash/redis");
const { createAdapter } = require("@socket.io/redis-adapter");

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
            const res = await client.hGetAll(key);
            return res || {};
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
            const res = await redis.hgetall(key);
            return res || {};
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
            const { keys = [], arguments: args = [] } = options || {};
            return redis.eval(script, keys, args);
        },
        async info(section) {
            try {
                return redis.info(section);
            } catch {
                return null;
            }
        },
        async quit() {
            return;
        },
        get isOpen() {
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
        commandsQueueMaxLength: 1000,
    };

    return options;
}

function getRedisClient(config) {
    if (rawClient) {
        return rawClient;
    }

    if (isUpstashConfig(config)) {
        isUpstash = true;
        rawClient = buildUpstashClient(config);
        return rawClient;
    }

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

    rawClient.on("connect", () => {});

    return rawClient;
}

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

        return normalizedClient;
    }

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

async function createAdapterPubSubClients(config) {
    const adapterUrl = config.SOCKET_REDIS_URL

    if (adapterUrl) {
        const pubClient = createClient({ url: adapterUrl });
        const subClient = pubClient.duplicate();

        pubClient.on("error", (err) => {
            console.error("[redis:adapter:pub] error:", err.message || err);
        });
        subClient.on("error", (err) => {
            console.error("[redis:adapter:sub] error:", err.message || err);
        });

        await pubClient.connect();
        await subClient.connect();

        return { pubClient, subClient };
    }

    if (isUpstashConfig(config)) {
        return null;
    }

    const options = buildNodeRedisOptions(config);
    const pubClient = createClient(options);
    const subClient = pubClient.duplicate();

    pubClient.on("error", (err) => {
        console.error("[redis:adapter:pub] error:", err.message || err);
    });
    subClient.on("error", (err) => {
        console.error("[redis:adapter:sub] error:", err.message || err);
    });

    await pubClient.connect();
    await subClient.connect();

    return { pubClient, subClient };
}

module.exports = {
    getRedisClient,
    connectRedis,
    closeRedis,
    createAdapterPubSubClients,
};