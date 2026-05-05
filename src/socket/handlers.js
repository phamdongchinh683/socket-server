const { extractUserId } = require("./auth");
const { readUnreadCount } = require("../service/index.js");
const {
  toValidUserId,
  addOnlineSocket,
  removeOnlineSocket,
  getOnlineUserIds,
} = require("./online-store");
const GET_ONLINE_USERS_EVENT = "users:online:get";
const ONLINE_USERS_EVENT = "users:online";

function registerSocketHandlers(io, fastify) {
  io.on("connection", (socket) => {
    const userId = toValidUserId(extractUserId(socket));
    if (userId === "") {
      fastify.log.warn(
        { socketId: socket.id },
        "Rejecting socket connection because userId is invalid"
      );
      socket.disconnect(true);
      return;
    }

    socket.data.userId = userId;
    socket.join(userId);

    const onlineSocketsCount = addOnlineSocket(userId, socket.id);
    if (onlineSocketsCount === 1) {
      socket.broadcast.emit("user:online", { userId });
    }

    socket.emit(ONLINE_USERS_EVENT, { userIds: getOnlineUserIds() });
    fastify.log.info({ socketId: socket.id, userId }, "Connected");

    socket.on(GET_ONLINE_USERS_EVENT, (payload = {}, callback) => {
      const response = { userIds: getOnlineUserIds() };

      if (typeof callback === "function") {
        callback(response);
        return;
      }

      socket.emit(ONLINE_USERS_EVENT, response);
    });

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

      const onlineSocketsCount = removeOnlineSocket(userId, socket.id);
      if (onlineSocketsCount === 0) {
        socket.broadcast.emit("user:offline", { userId });
      }
      
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
