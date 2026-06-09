const { getUpstashClient, isUpstashConfigured, connectRedis } = require("../redis/client");

let redisConfig = null;
let redisClient = null; // node-redis or upstash instance

const BITMAP_KEY = "online:bitmap";
const COUNTS_KEY = "online:counts";
const MAP_KEY = "online:map";
const COUNTER_KEY = "online:counter";

let cachedCount = 0;
let cachedCountTime = 0;

let cachedUserIds = [];
let cachedUserIdsTime = 0;

function toValidUserId(value) {
    if (value == null) {
        return "";
    }

    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : "";
}

function getKey(name) {
    if (!redisConfig || !redisConfig.REDIS_KEY_PREFIX) {
        return name;
    }
    return `${redisConfig.REDIS_KEY_PREFIX}:${name}`;
}

function isUpstash() {
    return isUpstashConfigured(redisConfig);
}

async function getRedis() {
    if (!redisConfig) {
        throw new Error("Redis config not initialized. Call initOnlineStore(config) first.");
    }
    if (!redisClient) {
        if (isUpstash()) {
            redisClient = getUpstashClient(redisConfig);
        } else {
            redisClient = await connectRedis(redisConfig);
        }
    }
    return redisClient;
}

// Normalize eval call across node-redis and @upstash/redis
async function runEval(redis, script, keys, args) {
    if (isUpstash()) {
        // @upstash/redis: eval(script, keysArray, argsArray)
        return redis.eval(script, keys, args);
    }
    // node-redis v6
    return redis.eval(script, { keys, arguments: args });
}

// Small helpers to normalize common commands (node-redis uses Pascal-ish, upstash uses lower)
async function hIncrBy(redis, key, field, delta) {
    if (isUpstash()) return redis.hincrby(key, field, delta);
    return redis.hIncrBy(key, field, delta);
}

async function hGet(redis, key, field) {
    if (isUpstash()) return redis.hget(key, field);
    return redis.hGet(key, field);
}

async function hSet(redis, key, field, value) {
    if (isUpstash()) return redis.hset(key, { [field]: value });
    return redis.hSet(key, field, value);
}

async function hGetAll(redis, key) {
    if (isUpstash()) return redis.hgetall(key) || {};
    const res = await redis.hGetAll(key);
    return res || {};
}

async function doIncr(redis, key) {
    if (isUpstash()) return redis.incr(key);
    return redis.incr(key);
}

async function doSetBit(redis, key, offset, value) {
    if (isUpstash()) return redis.setbit(key, offset, value);
    return redis.setBit(key, offset, value);
}

async function doGetBit(redis, key, offset) {
    if (isUpstash()) return redis.getbit(key, offset);
    return redis.getBit(key, offset);
}

async function doBitCount(redis, key) {
    if (isUpstash()) return redis.bitcount(key);
    return redis.bitCount(key);
}

function initOnlineStore(config) {
    redisConfig = config;
}

function getCacheTtl() {
    return (redisConfig && redisConfig.ONLINE_CACHE_TTL_MS) || 4000;
}

const ADD_ONLINE_SCRIPT = `
  local counts_key = KEYS[1]
  local bitmap_key = KEYS[2]
  local map_key    = KEYS[3]
  local counter_key = KEYS[4]
  local user_id    = ARGV[1]

  local new_count = redis.call('HINCRBY', counts_key, user_id, 1)

  if new_count == 1 then
    local offset = redis.call('HGET', map_key, user_id)
    if not offset then
      offset = redis.call('INCR', counter_key)
      redis.call('HSET', map_key, user_id, offset)
    end
    redis.call('SETBIT', bitmap_key, offset, 1)
  end

  return new_count
`;

const REMOVE_ONLINE_SCRIPT = `
  local counts_key = KEYS[1]
  local bitmap_key = KEYS[2]
  local map_key    = KEYS[3]
  local user_id    = ARGV[1]

  local new_count = redis.call('HINCRBY', counts_key, user_id, -1)

  if new_count <= 0 then
    redis.call('HSET', counts_key, user_id, 0)
    local offset = redis.call('HGET', map_key, user_id)
    if offset then
      redis.call('SETBIT', bitmap_key, offset, 0)
    end
    return 0
  end

  return new_count
`;

async function addOnlineSocket(userId, _socketId) {
    if (!userId) return 0;

    const redis = await getRedis();
    const countsKey = getKey(COUNTS_KEY);
    const bitmapKey = getKey(BITMAP_KEY);
    const mapKey = getKey(MAP_KEY);
    const counterKey = getKey(COUNTER_KEY);

    try {
        const result = await runEval(redis, ADD_ONLINE_SCRIPT, [countsKey, bitmapKey, mapKey, counterKey], [userId]);
        const newCount = Number(result);

        if (newCount === 1) {
            cachedCount = Math.max(cachedCount, 1);
            cachedCountTime = Date.now();

            if (!cachedUserIds.includes(userId)) {
                cachedUserIds = [...cachedUserIds, userId];
                cachedUserIdsTime = Date.now();
            }
        }

        return newCount;
    } catch (err) {

        try {
            const newCount = await hIncrBy(redis, countsKey, userId, 1);
            if (newCount === 1) {
                const mapKey2 = getKey(MAP_KEY);
                let offset = await hGet(redis, mapKey2, userId);
                if (offset == null) {
                    const counterKey2 = getKey(COUNTER_KEY);
                    offset = await doIncr(redis, counterKey2);
                    await hSet(redis, mapKey2, userId, String(offset));
                }
                await doSetBit(redis, getKey(BITMAP_KEY), Number(offset), 1);

                cachedCount = Math.max(cachedCount, 1);
                cachedCountTime = Date.now();
                if (!cachedUserIds.includes(userId)) {
                    cachedUserIds = [...cachedUserIds, userId];
                    cachedUserIdsTime = Date.now();
                }
            }
            return newCount;
        } catch (fallbackErr) {

            cachedCount = Math.max(cachedCount || 0, 1);
            cachedCountTime = Date.now();
            if (!cachedUserIds.includes(userId)) {
                cachedUserIds = [...cachedUserIds, userId];
                cachedUserIdsTime = Date.now();
            }

            return 1;
        }
    }
}

async function removeOnlineSocket(userId, _socketId) {
    if (!userId) return 0;

    const redis = await getRedis();
    const countsKey = getKey(COUNTS_KEY);
    const bitmapKey = getKey(BITMAP_KEY);
    const mapKey = getKey(MAP_KEY);

    try {
        const result = await runEval(redis, REMOVE_ONLINE_SCRIPT, [countsKey, bitmapKey, mapKey], [userId]);
        const newCount = Number(result);


        if (newCount === 0) {
            cachedCount = Math.max(0, cachedCount - 1);
            cachedCountTime = Date.now();
            cachedUserIds = cachedUserIds.filter(id => id !== userId);
            cachedUserIdsTime = Date.now();
        }

        return newCount;
    } catch (err) {

        try {
            const newCount = await hIncrBy(redis, countsKey, userId, -1);
            if (newCount <= 0) {
                await hSet(redis, countsKey, userId, "0");
                const offset = await hGet(redis, mapKey, userId);
                if (offset != null) {
                    await doSetBit(redis, bitmapKey, Number(offset), 0);
                }

                cachedCount = Math.max(0, cachedCount - 1);
                cachedCountTime = Date.now();
                cachedUserIds = cachedUserIds.filter(id => id !== userId);
                cachedUserIdsTime = Date.now();

                return 0;
            }
            return newCount;
        } catch (fallbackErr) {

            cachedCount = Math.max(0, (cachedCount || 1) - 1);
            cachedCountTime = Date.now();
            cachedUserIds = cachedUserIds.filter(id => id !== userId);
            cachedUserIdsTime = Date.now();
            return 0;
        }
    }
}

async function getOnlineUserIds() {
    const now = Date.now();
    const ttl = getCacheTtl();


    if (now - cachedUserIdsTime < ttl) {
        return cachedUserIds;
    }

    try {
        const redis = await getRedis();
        const countsKey = getKey(COUNTS_KEY);

        const counts = await hGetAll(redis, countsKey);
        const online = [];

        for (const [userId, countStr] of Object.entries(counts)) {
            if (Number(countStr) > 0) {
                online.push(userId);
            }
        }

        cachedUserIds = online;
        cachedUserIdsTime = now;
        return online;
    } catch (err) {

        return cachedUserIds;
    }
}

async function getOnlineUsersCount() {
    const now = Date.now();
    const ttl = getCacheTtl();

    if (now - cachedCountTime < ttl) {
        return cachedCount;
    }

    try {
        const redis = await getRedis();
        const bitmapKey = getKey(BITMAP_KEY);

        try {
            const count = await doBitCount(redis, bitmapKey);
            cachedCount = Number(count) || 0;
            cachedCountTime = now;
            return cachedCount;
        } catch (err) {
            // Fallback
            const countsKey = getKey(COUNTS_KEY);
            const counts = await hGetAll(redis, countsKey);
            let count = 0;
            for (const value of Object.values(counts)) {
                if (Number(value) > 0) count += 1;
            }
            cachedCount = count;
            cachedCountTime = now;
            return count;
        }
    } catch (err) {
        // Total Redis failure - return cached (or 0)
        return cachedCount || 0;
    }
}

async function isUserOnline(userId) {
    if (!userId) return false;

    try {
        const redis = await getRedis();
        const mapKey = getKey(MAP_KEY);
        const bitmapKey = getKey(BITMAP_KEY);

        const offset = await hGet(redis, mapKey, userId);
        if (offset == null) {
            return false;
        }

        try {
            const bit = await doGetBit(redis, bitmapKey, Number(offset));
            return bit === 1;
        } catch (err) {

            const countsKey = getKey(COUNTS_KEY);
            const count = await hGet(redis, countsKey, userId);
            return Number(count || 0) > 0;
        }
    } catch (err) {
        // Redis unavailable or permission error - best effort false
        return false;
    }
}

/**
 * Get the raw bit offset for a user (useful for debugging).
 */
async function getUserBitOffset(userId) {
    if (!userId) return null;

    try {
        const redis = await getRedis();
        const mapKey = getKey(MAP_KEY);

        const offset = await hGet(redis, mapKey, userId);
        return offset != null ? Number(offset) : null;
    } catch (err) {
        return null;
    }
}

/**
 * Get approximate memory usage of the online tracking keys in Redis.
 * Useful for monitoring Redis memory usage.
 */
async function getOnlineMemoryStats() {
    // MEMORY USAGE is an admin command; limited or unavailable on Upstash REST / some managed Redis.
    // Return nulls for Upstash (or on any failure) to avoid breaking health checks.
    if (isUpstash()) {
        return { bitmap: null, counts: null, map: null, total: null };
    }

    try {
        const redis = await getRedis();
        const bitmapKey = getKey(BITMAP_KEY);
        const countsKey = getKey(COUNTS_KEY);
        const mapKey = getKey(MAP_KEY);

        const result = {
            bitmap: null,
            counts: null,
            map: null,
            total: null,
        };

        try {
            const [bitmapUsage, countsUsage, mapUsage] = await Promise.all([
                redis.eval('return redis.call("MEMORY", "USAGE", KEYS[1])', { keys: [bitmapKey] }).catch(() => null),
                redis.eval('return redis.call("MEMORY", "USAGE", KEYS[1])', { keys: [countsKey] }).catch(() => null),
                redis.eval('return redis.call("MEMORY", "USAGE", KEYS[1])', { keys: [mapKey] }).catch(() => null),
            ]);

            result.bitmap = bitmapUsage ? Number(bitmapUsage) : null;
            result.counts = countsUsage ? Number(countsUsage) : null;
            result.map = mapUsage ? Number(mapUsage) : null;

            const total = (result.bitmap || 0) + (result.counts || 0) + (result.map || 0);
            result.total = total > 0 ? total : null;
        } catch (err) {

        }

        return result;
    } catch (err) {

        return { bitmap: null, counts: null, map: null, total: null };
    }
}

module.exports = {
    toValidUserId,
    initOnlineStore,
    addOnlineSocket,
    removeOnlineSocket,
    getOnlineUserIds,
    getOnlineUsersCount,
    isUserOnline,
    getUserBitOffset,
    getOnlineMemoryStats,
};
