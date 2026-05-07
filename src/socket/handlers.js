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
const ALLOWED_CALL_TYPES = new Set(["voice", "video"]);
const activeCallsByBoxId = new Map();

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
      const activeCall = activeCallsByBoxId.get(String(boxId));
      if (activeCall) {
        socket.emit("chat:call:active", activeCall);
      }

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

    socket.on("chat:call:start", (payload = {}) => {
      if (!payload.boxId) return;
      const existingCall = activeCallsByBoxId.get(String(payload.boxId));
      if (existingCall) {
        socket.emit("chat:call:active", existingCall);
        return;
      }

      const callType = ALLOWED_CALL_TYPES.has(payload.callType) ? payload.callType : "voice";
      const callSession = {
        userId: socket.data.userId,
        boxId: String(payload.boxId),
        callType,
        startedAt: Date.now(),
      };
      activeCallsByBoxId.set(String(payload.boxId), callSession);

      socket.to(String(payload.boxId)).emit("chat:call:start", callSession);
    });

    socket.on("chat:call:offer", (payload = {}) => {
      if (!payload.boxId || !payload.offer) return;
      socket.to(String(payload.boxId)).emit("chat:call:offer", {
        userId: socket.data.userId,
        boxId: payload.boxId,
        offer: payload.offer,
      });
    });

    socket.on("chat:call:answer", (payload = {}) => {
      if (!payload.boxId || !payload.answer) return;
      socket.to(String(payload.boxId)).emit("chat:call:answer", {
        userId: socket.data.userId,
        boxId: payload.boxId,
        answer: payload.answer,
      });
    });

    socket.on("chat:call:ice-candidate", (payload = {}) => {
      if (!payload.boxId || !payload.candidate) return;
      socket.to(String(payload.boxId)).emit("chat:call:ice-candidate", {
        userId: socket.data.userId,
        boxId: payload.boxId,
        candidate: payload.candidate,
      });
    });

    socket.on("chat:call:reject", (payload = {}) => {
      if (!payload.boxId) return;
      activeCallsByBoxId.delete(String(payload.boxId));
      socket.to(String(payload.boxId)).emit("chat:call:reject", {
        userId: socket.data.userId,
        boxId: String(payload.boxId),
      });
    });

    socket.on("chat:call:end", (payload = {}) => {
      if (!payload.boxId) return;
      activeCallsByBoxId.delete(String(payload.boxId));
      socket.to(String(payload.boxId)).emit("chat:call:end", {
        userId: socket.data.userId,
        boxId: String(payload.boxId),
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
