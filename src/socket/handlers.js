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
    const isInternal = socket.handshake.auth?.type === "internal";
    if (isInternal) {
      fastify.log.info({ socketId: socket.id }, "Internal API connected");
      socket.onAny((event, payload) => {
        socket.to(String(payload.targetId)).emit(event, payload.data ?? {});
      });

      return;
    }


    const userId = toValidUserId(extractUserId(socket));

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

    socket.on("chat:typing:start", (payload = {}) => {
      if (!payload.boxId) return;
      socket.to(String(payload.boxId)).emit("chat:typing:start", {
        userId: socket.data.userId,
        boxId: payload.boxId,
      });
    });
    
    socket.on("chat:typing:stop", (payload = {}) => {
      if (!payload.boxId) return;
      socket.to(String(payload.boxId)).emit("chat:typing:stop", {
        userId: socket.data.userId,
        boxId: payload.boxId,
      });
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
