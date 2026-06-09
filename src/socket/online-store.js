const { getNormalizedRedis, getRedisMode } = require("../redis/client");

let redisConfig = null;
let normalizedRedis = null;

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

function getMode() {
    return getRedisMode(redisConfig);
}

async function getRedis() {
    if (!redisConfig) {
        throw new Error("Redis config not initialized. Call initOnlineStore(config) first.");
    }
    if (!normalizedRedis) {
        normalizedRedis = await getNormalizedRedis(redisConfig);
    }
    return normalizedRedis;
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
        const result = await redis.eval(ADD_ONLINE_SCRIPT, [countsKey, bitmapKey, mapKey, counterKey], [userId]);
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
            const newCount = await redis.hincrby(countsKey, userId, 1);
            if (newCount === 1) {
                const mapKey2 = getKey(MAP_KEY);
                let offset = await redis.hget(mapKey2, userId);
                if (offset == null) {
                    const counterKey2 = getKey(COUNTER_KEY);
                    offset = await redis.incr(counterKey2);
                    await redis.hset(mapKey2, userId, String(offset));
                }
                await redis.setbit(getKey(BITMAP_KEY), Number(offset), 1);

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
        const result = await redis.eval(REMOVE_ONLINE_SCRIPT, [countsKey, bitmapKey, mapKey], [userId]);
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
            const newCount = await redis.hincrby(countsKey, userId, -1);
            if (newCount <= 0) {
                await redis.hset(countsKey, userId, "0");
                const offset = await redis.hget(mapKey, userId);
                if (offset != null) {
                    await redis.setbit(bitmapKey, Number(offset), 0);
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

        const counts = await redis.hgetall(countsKey);
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
            const count = await redis.bitcount(bitmapKey);
            cachedCount = Number(count) || 0;
            cachedCountTime = now;
            return cachedCount;
        } catch (err) {
            // Fallback
            const countsKey = getKey(COUNTS_KEY);
            const counts = await redis.hgetall(countsKey);
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

        const offset = await redis.hget(mapKey, userId);
        if (offset == null) {
            return false;
        }

        try {
            const bit = await redis.getbit(bitmapKey, Number(offset));
            return bit === 1;
        } catch (err) {

            const countsKey = getKey(COUNTS_KEY);
            const count = await redis.hget(countsKey, userId);
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

        const offset = await redis.hget(mapKey, userId);
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
    // MEMORY USAGE chỉ có ý nghĩa với TCP/redis mode.
    // Upstash REST và một số managed Redis hạn chế lệnh admin này.
    if (getMode() === "upstash") {
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
                redis.eval('return redis.call("MEMORY", "USAGE", KEYS[1])', [bitmapKey], []).catch(() => null),
                redis.eval('return redis.call("MEMORY", "USAGE", KEYS[1])', [countsKey], []).catch(() => null),
                redis.eval('return redis.call("MEMORY", "USAGE", KEYS[1])', [mapKey], []).catch(() => null),
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
