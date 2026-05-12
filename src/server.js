const http = require("http");
const { loadConfig } = require("./config/env");
const { createLogger } = require("./logger");
const { registerSocketServer } = require("./plugins/socket");
const { sendHealthResponse } = require("./routes/health");

function buildServer() {
  const config = loadConfig();
  const log = createLogger(config.LOG_LEVEL);

  const httpServer = http.createServer((req, res) => {
    const method = req.method || "GET";
    const url = req.url?.split("?")[0] || "/";

    if (method === "GET" && url === "/health") {
      sendHealthResponse(res, httpServer.io);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  const app = { config, log };
  const io = registerSocketServer(httpServer, app);
  httpServer.io = io;

  async function close() {
    await new Promise((resolve) => io.close(resolve));
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
