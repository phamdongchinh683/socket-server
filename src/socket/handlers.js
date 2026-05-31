const { extractUserId } = require("./auth");
const { readUnreadCount } = require("../service/index.js");
const {
    toValidUserId,
    addOnlineSocket,
    removeOnlineSocket,
    getOnlineUserIds,
    initOnlineStore,
} = require("./online-store");
const GET_ONLINE_USERS_EVENT = "users:online:get";
const ONLINE_USERS_EVENT = "users:online";
const ALLOWED_CALL_TYPES = new Set(["voice", "video"]);
const activeCallsByBoxId = new Map();

const typingTimers = new Map();   // `typing:${boxId}` -> timer
const iceRateLimit = new Map();   // boxId -> lastSent timestamp

function scheduleTypingBroadcast(socket, boxId) {
    const key = `typing:${boxId}`;

    if (typingTimers.has(key)) {
        clearTimeout(typingTimers.get(key));
    }

    const timer = setTimeout(() => {
        socket.to(boxId).emit("chat:typing:start", {
            userId: socket.data.userId,
            boxId,
        });
        typingTimers.delete(key);
    }, 400);

    typingTimers.set(key, timer);
}

function clearPendingTyping(boxId) {
    const key = `typing:${boxId}`;
    if (typingTimers.has(key)) {
        clearTimeout(typingTimers.get(key));
        typingTimers.delete(key);
    }
}

function shouldSendIceCandidate(boxId) {
    const now = Date.now();
    const lastSent = iceRateLimit.get(boxId) || 0;

    if (now - lastSent < 80) {
        return false;
    }

    iceRateLimit.set(boxId, now);
    return true;
}

function cleanupBoxState(boxId) {
    activeCallsByBoxId.delete(boxId);
    clearPendingTyping(boxId);
    iceRateLimit.delete(boxId);
}

function cleanupBoxStateOnDisconnect(userId) {
    for (const [key, timer] of typingTimers) {
        if (key.includes(userId)) {
            clearTimeout(timer);
            typingTimers.delete(key);
        }
    }
}

function registerSocketHandlers(io, app) {
    initOnlineStore(app.config);

    io.on("connection", async(socket) => {
        const userId = socket.data.userId || toValidUserId(extractUserId(socket));

        socket.join(userId);

        let onlineSocketsCount = 0;
        try {
            onlineSocketsCount = await addOnlineSocket(userId, socket.id);
        } catch (err) {
            app.log.error({ err, userId }, "Failed to add online socket in Redis");
        }

        if (onlineSocketsCount === 1) {
            socket.broadcast.emit("user:online", { userId });
        }

        let onlineUserIds = [];
        try {
            onlineUserIds = await getOnlineUserIds();
        } catch (err) {
            app.log.error({ err }, "Failed to get online users from Redis");
        }

        socket.emit(ONLINE_USERS_EVENT, { userIds: onlineUserIds });
        app.log.info({ socketId: socket.id, userId }, "Connected");

        socket.on(GET_ONLINE_USERS_EVENT, async(payload = {}, callback) => {
            let response = { userIds: [] };
            try {
                response = { userIds: await getOnlineUserIds() };
            } catch (err) {
                app.log.error({ err }, "Failed to get online users on request");
            }

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

        socket.on("chat:read", async(payload = {}) => {
            const result = await readUnreadCount({
                baseUrl: app.config.API_URL,
                boxId: payload.boxId,
                token: socket.data.bearerToken,
            });

            socket.emit("chat:unread:count", { unreadReceiverCount: result.unreadReceiverCount, unreadSenderCount: result.unreadSenderCount, boxId: result.boxId });

        });

        socket.on("chat:typing:start", (payload = {}) => {
            if (!payload.boxId) return;
            scheduleTypingBroadcast(socket, String(payload.boxId));
        });

        socket.on("chat:typing:stop", (payload = {}) => {
            if (!payload.boxId) return;
            clearPendingTyping(String(payload.boxId));
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

            const boxId = String(payload.boxId);

            if (!shouldSendIceCandidate(boxId)) {
                return; // throttled for load protection
            }

            socket.to(boxId).emit("chat:call:ice-candidate", {
                userId: socket.data.userId,
                boxId,
                candidate: payload.candidate,
            });
        });

        socket.on("chat:call:reject", (payload = {}) => {
            if (!payload.boxId) return;
            cleanupBoxState(String(payload.boxId));

            socket.to(String(payload.boxId)).emit("chat:call:reject", {
                userId: socket.data.userId,
                boxId: payload.boxId,
            });
        });

        socket.on("chat:call:end", (payload = {}) => {
            if (!payload.boxId) return;
            cleanupBoxState(String(payload.boxId));

            socket.to(String(payload.boxId)).emit("chat:call:end", {
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

        socket.on("disconnect", async(reason) => {
            app.log.info({ socketId: socket.id, userId, reason }, "Disconnected");

            let onlineSocketsCount = 0;
            try {
                onlineSocketsCount = await removeOnlineSocket(userId, socket.id);
            } catch (err) {
                app.log.error({ err, userId }, "Failed to remove online socket in Redis");
            }

            if (onlineSocketsCount === 0) {
                socket.broadcast.emit("user:offline", { userId });
            }

            cleanupBoxStateOnDisconnect(userId);
        });
    });
}

module.exports = {
    registerSocketHandlers,
};