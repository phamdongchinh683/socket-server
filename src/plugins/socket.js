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

function registerSocketServer(fastify) {
  const io = new Server(fastify.server, {
    cors: {
      origin: "*",
    },
    transports: parseSocketTransports(fastify.config.SOCKET_TRANSPORTS),
    perMessageDeflate: fastify.config.SOCKET_PER_MESSAGE_DEFLATE,
    serveClient: fastify.config.SOCKET_SERVE_CLIENT,
    allowEIO3: false,
  });

  io.use(
    buildSocketAuthMiddleware({
      jwtSecret: fastify.config.JWT_SECRET,
      internalSocketToken: fastify.config.INTERNAL_SOCKET_TOKEN,
    })
  );
  registerSocketHandlers(io, fastify);

  fastify.decorate("io", io);

  fastify.addHook("onClose", (instance, done) => {
    instance.io.close();
    done();
  });
}

module.exports = {
  registerSocketServer,
};
