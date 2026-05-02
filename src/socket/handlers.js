const { extractUserId } = require("./auth");
const { normalizeUserIdList } = require("../utils");

function registerSocketHandlers(io, fastify) {
  io.on("connection", (socket) => {
    const userId = extractUserId(socket);
    socket.data.userId = userId;
    socket.join(userId);

    fastify.log.info({ socketId: socket.id, userId }, "Connected");


    socket.on("chat:new", (payload = {}) => {
      const { body, boxId, createdAt, userIds, title } = payload;
      const message = {
        senderId: socket.data.userId,
        body,
        boxId,
        createdAt,
        title
      };

      const toUserIds = normalizeUserIdList(userIds);
      socket.to(toUserIds).emit('chat:new', message)

    });

    socket.on("chat:message:send", async (payload = {}) => {

      const { body, boxId, createdAt } = payload;
      const roomSockets = await io.in(boxId).fetchSockets();
      fastify.log.info({ boxId, members: roomSockets.length }, "Room members");
      const message = {
        senderId: socket.data.userId,
        body,
        boxId,
        createdAt,
    }

      socket.to(boxId).emit('message:new', message)
      io.to(boxId).emit('chat:message:update', message)
    });

    socket.on("chat:join", (payload = {}) => {
      const boxId = payload.boxId;
      if (!boxId) {
        return;
      }
      
      if (!socket.rooms.has(boxId)) {
        socket.join(boxId);
      }

      socket.emit("chat:joined", { boxId });

    });

    socket.on("chat:leave", (payload = {}) => {
      const boxId = payload.boxId;
      socket.leave(boxId);

      socket.to(boxId).emit("user:left", {
        userId: socket.data.userId,
      });
    });

    socket.on("disconnect", (reason) => {
      fastify.log.info({ socketId: socket.id, userId, reason }, "Disconnected");
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
