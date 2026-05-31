const { getOnlineUsersCount, getOnlineMemoryStats } = require("../socket/online-store");

async function sendHealthResponse(res, io) {
    const clientsCount = io ? io.engine.clientsCount : 0;

    let onlineUsers = 0;
    let memory = {};

    try {
        onlineUsers = await getOnlineUsersCount();
    } catch (err) {}

    try {
        memory.redis = await getOnlineMemoryStats();
    } catch (err) {}

    const nodeMem = process.memoryUsage();
    memory.node = {
        rss: nodeMem.rss,
        heapUsed: nodeMem.heapUsed,
        heapTotal: nodeMem.heapTotal,
        external: nodeMem.external,
    };

    const body = JSON.stringify({
        message: "OK",
        clients: clientsCount,
        onlineUsers,
        memory,
    });

    res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
}

module.exports = {
    sendHealthResponse,
};