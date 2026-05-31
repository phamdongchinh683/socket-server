const http = require("http");
const { loadConfig } = require("./config/env");
const { createLogger } = require("./logger");
const { registerSocketServer } = require("./plugins/socket");
const { sendHealthResponse } = require("./routes/health");
const { closeRedis } = require("./redis/client");

function buildServer() {
  const config = loadConfig();
  const log = createLogger(config.LOG_LEVEL);

  const app = { config, log };

  const httpServer = http.createServer((req, res) => {
    const method = req.method || "GET";
    const url = req.url?.split("?")[0] || "/";

    if (method === "GET" && url === "/health") {
      // Handle async health check (Redis-backed online count via bitmap)
      Promise.resolve(sendHealthResponse(res, httpServer.io)).catch((err) => {
        log.error({ err }, "Health check failed");
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: "ERROR", error: "Health check failed" }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  const io = registerSocketServer(httpServer, app);
  httpServer.io = io;

  async function close() {
    await new Promise((resolve) => io.close(resolve));
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
