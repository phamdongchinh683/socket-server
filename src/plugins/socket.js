const { Server } = require("socket.io");
const { buildSocketAuthMiddleware } = require("../socket/auth");
const { registerSocketHandlers } = require("../socket/handlers");
const { createSocketStore } = require("../socket/store");

function registerSocketServer(fastify) {
  const io = new Server(fastify.server, {
    cors: {
      origin: "*",
    },
  });
  const socketStore = createSocketStore();

  fastify.decorate("socketStore", socketStore);
  io.use(buildSocketAuthMiddleware(fastify.config.SOCKET_SECRET_KEY));
  registerSocketHandlers(io, socketStore, fastify);

  fastify.decorate("io", io);

  fastify.addHook("onClose", (instance, done) => {
    instance.io.close();
    done();
  });
}

module.exports = {
  registerSocketServer,
};
