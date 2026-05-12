const { Server } = require("socket.io");
const { buildSocketAuthMiddleware } = require("../socket/auth");
const { registerSocketHandlers } = require("../socket/handlers");

function parseSocketTransports(value) {
  const transports = String(value || "websocket")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return transports.length > 0 ? transports : ["websocket"];
}

function registerSocketServer(httpServer, app) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
    transports: parseSocketTransports(app.config.SOCKET_TRANSPORTS),
    perMessageDeflate: app.config.SOCKET_PER_MESSAGE_DEFLATE,
    serveClient: app.config.SOCKET_SERVE_CLIENT,
    allowEIO3: false,
  });

  io.use(
    buildSocketAuthMiddleware({
      jwtSecret: app.config.JWT_SECRET,
      internalSocketToken: app.config.INTERNAL_SOCKET_TOKEN,
    })
  );
  registerSocketHandlers(io, app);

  return io;
}

module.exports = {
  registerSocketServer,
};
