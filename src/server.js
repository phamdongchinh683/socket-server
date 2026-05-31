const http = require("http");
const { loadConfig } = require("./config/env");
const { createLogger } = require("./logger");
const { registerSocketServer } = require("./plugins/socket");
const { sendHealthResponse } = require("./routes/health");
const { closeRedis } = require("./redis/client");

async function buildServer() {
    const config = loadConfig();
    const log = createLogger(config.LOG_LEVEL);

    const app = { config, log };

    const httpServer = http.createServer((req, res) => {
        const method = req.method || "GET";
        const url = req.url?.split("?")[0] || "/";

        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
    });

    const io = await registerSocketServer(httpServer, app);
    httpServer.io = io;

    async function close() {
        await new Promise((resolve) => io.close(resolve));

        const adapterClients = io._redisAdapterClients;
        if (adapterClients) {
            try {
                await adapterClients.pubClient.quit().catch(() => {});
                await adapterClients.subClient.quit().catch(() => {});
            } catch (err) {
                log.error({ err }, "Failed to close Redis adapter clients");
            }
        }

        if (io._socketEventsSub) {
            try {
                await io._socketEventsSub.quit().catch(() => {});
            } catch (err) {
                log.error({ err }, "Failed to close socket:events subscriber");
            }
        }

        await closeRedis().catch((err) => log.error({ err }, "Redis close failed"));
    }

    return {
        httpServer,
        io,
        config,
        log,
        close,
    };
}

module.exports = {
    buildServer,
};