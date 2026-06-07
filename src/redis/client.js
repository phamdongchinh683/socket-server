const { createClient } = require("redis");

let redisClient = null;
let connectPromise = null;

function buildRedisOptions(config) {
    if (!config.REDIS_URL) {
        throw new Error("Missing required env: REDIS_URL");
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

async function connectRedis(config) {
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
}

async function createAdapterPubSubClients(config) {
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
};
