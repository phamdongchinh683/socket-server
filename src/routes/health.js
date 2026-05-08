const { getOnlineUsersCount } = require("../socket/online-store");

async function healthRoutes(fastify) {
  fastify.get("/health", async () => {
    const clientsCount = fastify.io ? fastify.io.engine.clientsCount : 0;
    const onlineUsers = getOnlineUsersCount();

    return {
      message: "OK",
      clients: clientsCount,
      onlineUsers,
    };
  });
}

module.exports = healthRoutes;
