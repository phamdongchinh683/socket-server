const { getOnlineUserIds, getOnlineUsersCount } = require("../socket/online-store");

async function healthRoutes(fastify) {
  fastify.get("/health", async () => {
    const clientsCount = fastify.io ? fastify.io.engine.clientsCount : 0;
    const onlineUsers = getOnlineUsersCount();
    const onlineUserIds = getOnlineUserIds();

    return {
      status: "ok",
      clients: clientsCount,
      onlineUsers,
      onlineUserIds,
    };
  });
}

module.exports = healthRoutes;
