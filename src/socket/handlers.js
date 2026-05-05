const { extractUserId } = require("./auth");
const { readUnreadCount } = require("../service/index.js");

const userOnlines = new Map();

function registerSocketHandlers(io, fastify) {
  io.on("connection", (socket) => {
    const userId = extractUserId(socket);
    socket.data.userId = userId;
    socket.join(userId);

    if (!userOnlines.has(userId)) {
      userOnlines.set(userId, new Set());
    }
    userOnlines.get(userId).add(socket.id);

    if (userOnlines.get(userId).size === 1) {
      socket.broadcast.emit("user:online", { userId });
    }

    socket.emit("users:online", { userIds: [...userOnlines.keys()] });
    fastify.log.info({ socketId: socket.id, userId }, "Connected");

    socket.on("chat:new", (payload = {}) => {
      const data = {
        senderId: socket.data.userId,
        body: payload.body,
        boxId: payload.boxId,
        senderName: payload.senderName,
        receiverId: payload.receiverId,
        createdAt: payload.createdAt,
      };

      socket.to(String(payload.receiverId)).emit("chat:new", data);
    });

    socket.on("chat:message:send", (payload = {}) => {
      const message = {
        senderId: socket.data.userId,
        body: payload.body,
        boxId: payload.boxId,
        createdAt: payload.createdAt,
        receiverId: payload.receiverId
      }
      

      socket.to(String(payload.boxId)).emit('message:new', message)
      socket.to(String(payload.receiverId)).emit("chat:unread:count", { unreadReceiverCount: payload.unreadReceiverCount, unreadSenderCount: payload.unreadSenderCount, boxId: payload.boxId, lastMessage: payload.body });
    });

    socket.on("chat:join", (payload = {}) => {
      const boxId = payload.boxId;
      if (!boxId) {
        return;
      }

      if (!socket.rooms.has(String(boxId))) {
        socket.join(String(boxId));
      }

      socket.emit("chat:joined", { boxId });

    });

    socket.on("chat:read", async (payload = {}) => {
      const result = await readUnreadCount({
        baseUrl: fastify.config.API_URL,
        boxId: payload.boxId,
        token: socket.data.bearerToken,
      });

      socket.emit("chat:unread:count", { unreadReceiverCount: result.unreadReceiverCount, unreadSenderCount: result.unreadSenderCount, boxId: result.boxId });

    });

    socket.on("chat:leave", (payload = {}) => {
      const boxId = payload.boxId;
      socket.leave(String(boxId));

      socket.to(String(boxId)).emit("user:left", {
        userId: socket.data.userId,
      });
    });

    socket.on("disconnect", (reason) => {
      fastify.log.info({ socketId: socket.id, userId, reason }, "Disconnected");


      const sockets = userOnlines.get(userId);
      if (sockets) {
        sockets.delete(socket.id);

        if (sockets.size === 0) {
          userOnlines.delete(userId);
          socket.broadcast.emit("user:offline", { userId });
        }
      }
      
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
