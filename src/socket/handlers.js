const { extractUserId } = require("./auth");

function registerSocketHandlers(io, socketStore, fastify) {
  io.on("connection", (socket) => {
    const userId = extractUserId(socket);
    socket.data.userId = userId;

    socketStore.addConnection(userId, socket.id);

    socket.emit("connected", {
      message: "Socket connected and authenticated",
      socketId: socket.id,
      userId,
    });

    socket.on("disconnect", (reason) => {
      socketStore.removeConnection(socket.id);
      fastify.log.info({ socketId: socket.id, reason }, "Socket disconnected");
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
