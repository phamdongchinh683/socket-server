const { getOnlineUsersCount, getOnlineMemoryStats } = require("../socket/online-store");

async function sendHealthResponse(res, io) {
    res.json({
        status: "OK",
    })

    module.exports = {
        sendHealthResponse,
    }
}