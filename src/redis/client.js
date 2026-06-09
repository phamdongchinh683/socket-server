const { createClient } = require("redis");

let redisClient = null;
let connectPromise = null;
let upstashClient = null;

function isUpstashConfigured(config) {
    return !!(config && config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN);
}

function buildRedisOptions(config) {
    if (!config.REDIS_URL) {
        throw new Error("Missing required env: REDIS_URL (for Redis adapter) or provide UPSTASH_REDIS_REST_* for Upstash");
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

function getRedisClient(config) {
    if (!redisClient) {
        redisClient = createClient(buildRedisOptions(config));
        attachErrorLogger(redisClient, "redis");
    }

    return redisClient;
}

// --- Upstash REST client (for online tracking / when using Upstash) ---
function getUpstashClient(config) {
    if (!isUpstashConfigured(config)) {
        throw new Error("Missing Upstash Redis REST credentials: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
    }
    if (!upstashClient) {
        const { Redis } = require("@upstash/redis");
        upstashClient = new Redis({
            url: config.UPSTASH_REDIS_REST_URL,
            token: config.UPSTASH_REDIS_REST_TOKEN,
        });
    }
    return upstashClient;
}

async function connectRedis(config) {
    // Upstash REST: no TCP connect needed, just validate/create client
    if (isUpstashConfigured(config)) {
        getUpstashClient(config);
        return { type: "upstash" };
    }

    // Legacy / direct Redis (node-redis) path
    if (!config.REDIS_URL) {
        throw new Error("Missing required env: REDIS_URL or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN");
    }

    const client = getRedisClient(config);

    if (client.isOpen) {
        return client;
    }

    if (!connectPromise) {
        connectPromise = client.connect().finally(() => {
            connectPromise = null;
        });
    }

    await connectPromise;
    return client;
}

async function closeRedis() {
    if (redisClient && redisClient.isOpen) {
        await redisClient.quit().catch(() => {});
    }

    redisClient = null;
    connectPromise = null;
    // Upstash client is stateless (HTTP) - nothing to close
    upstashClient = null;
}

async function createAdapterPubSubClients(config) {
    // Adapter requires real Redis protocol + pub/sub (node-redis clients).
    // Upstash REST does not provide long-lived SUBSCRIBE suitable for the adapter.
    if (isUpstashConfigured(config) && !config.REDIS_URL) {
        // No TCP redis url provided -> cannot initialize adapter
        throw new Error("Socket.IO Redis adapter requires a Redis protocol URL (REDIS_URL=rediss://...). Upstash REST is used only for online tracking. Set REDIS_URL to Upstash's Redis endpoint for adapter support, or run as single instance.");
    }

    const pubClient = createClient(buildRedisOptions(config));
    const subClient = pubClient.duplicate();

    attachErrorLogger(pubClient, "redis:adapter:pub");
    attachErrorLogger(subClient, "redis:adapter:sub");

    await Promise.all([
        pubClient.connect(),
        subClient.connect(),
    ]);

    return { pubClient, subClient };
}

module.exports = {
    getRedisClient,
    connectRedis,
    closeRedis,
    createAdapterPubSubClients,
    getUpstashClient,
    isUpstashConfigured,
};
