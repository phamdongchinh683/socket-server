const jwt = require("jsonwebtoken");

function normalizeToken(value) {
    if (typeof value !== "string") {
        return "";
    }

    const raw = value.trim();
    if (!raw) {
        return "";
    }

    return raw.replace(/^Bearer\s+/i, "").trim();
}

function extractJwtToken(socket) {
    const fromAuth = socket?.handshake?.auth?.token;
    if (typeof fromAuth === "string" && fromAuth.trim()) {
        return normalizeToken(fromAuth);
    }

    const bearer =
        socket?.handshake?.headers?.authorization ||
        socket?.handshake?.headers?.Authorization;

    if (typeof bearer === "string" && bearer.trim()) {
        return normalizeToken(bearer);
    }

    return "";
}

function extractUserId(socket) {
    if (typeof socket.data.userId === "string" && socket.data.userId.length > 0) {
        return socket.data.userId;
    }

    return socket.id;
}

function buildSocketAuthMiddleware({ jwtSecret }) {
    return (socket, next) => {
        const token = extractJwtToken(socket);
        if (!token) {
            return next(new Error("Unauthorized: missing JWT"));
        }

        try {
            const payload = jwt.verify(token, jwtSecret);
            const userIdRaw = payload?.id;

            if (userIdRaw == null || String(userIdRaw).trim() === "") {
                return next(new Error("Unauthorized: JWT missing id"));
            }

            socket.data.userId = String(userIdRaw).trim();
            socket.data.jwtPayload = payload;
            socket.data.bearerToken = token;

            return next();
        } catch {
            return next(new Error("Unauthorized: invalid or expired JWT"));
        }
    };
}

module.exports = {
    extractUserId,
    buildSocketAuthMiddleware,
};