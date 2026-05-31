const { getOnlineUsersCount, getOnlineMemoryStats } = require("../socket/online-store");

async function sendHealthResponse(res, io) {
    res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
    });
    res.end(JSON.stringify({
        status: "ok",
    }))
}

module.exports = {
    sendHealthResponse,
};