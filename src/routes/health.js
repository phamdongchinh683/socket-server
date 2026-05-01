async function healthRoutes(fastify) {
  fastify.get("/health", async () => {
    const clientsCount = fastify.io ? fastify.io.engine.clientsCount : 0;
    const onlineUsers = fastify.socketStore
      ? fastify.socketStore.getOnlineUsersCount()
      : 0;

    return {
      status: "ok",
      clients: clientsCount,
      onlineUsers,
    };
  });
}

module.exports = healthRoutes;
