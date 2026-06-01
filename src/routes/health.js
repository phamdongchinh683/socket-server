const { getOnlineUsersCount, getOnlineMemoryStats } = require("../socket/online-store");

async function sendHealthResponse(res, io) {
    let onlineUsers = 0;
    try {
        onlineUsers = await getOnlineUsersCount();
    } catch (_) {
        // best effort, do not fail health check
    }

    let redisMemory = null;
    try {
        const memStats = await getOnlineMemoryStats();
        redisMemory = memStats;
    } catch (_) {
        // best effort
    }

    const mem = process.memoryUsage();
    const nodeMemory = {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
    };

    const clients = io && io.sockets ? io.sockets.sockets.size : 0;

    const payload = {
        status: "OK",
        message: "OK",
        clients,
        onlineUsers,
        memory: {
            redis: redisMemory,
            node: nodeMemory,
        },
        timestamp: new Date().toISOString(),
    };

    res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    res.end(JSON.stringify(payload));
}

module.exports = {
    sendHealthResponse,
};