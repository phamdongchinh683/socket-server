const { Server } = require("socket.io");
const { buildSocketAuthMiddleware } = require("../socket/auth");
const { registerSocketHandlers } = require("../socket/handlers");

function registerSocketServer(fastify) {
  const io = new Server(fastify.server, {
    cors: {
      origin: "*",
    },
  });

  io.use(buildSocketAuthMiddleware(fastify.config.JWT_SECRET));
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
