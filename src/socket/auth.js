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
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === "string" && fromAuth.trim()) {
    return normalizeToken(fromAuth);
  }

  const bearer =
    socket.handshake.headers.authorization ||
    socket.handshake.headers.Authorization;

  if (typeof bearer === "string" && bearer.trim()) {
    return normalizeToken(bearer);
  }

  const fromQuery = socket.handshake.query?.token;
  if (typeof fromQuery === "string" && fromQuery.trim()) {
    return normalizeToken(fromQuery);
  }

  return "";
}

function extractUserId(socket) {
  if (typeof socket.data.userId === "string" && socket.data.userId.length > 0) {
    return socket.data.userId;
  }

  return socket.id;
}

function buildSocketAuthMiddleware({ jwtSecret, internalSocketToken }) {
  return (socket, next) => {
    const isInternal = socket.handshake.auth?.type === "internal"
    if (isInternal) {
      const internalToken = socket.handshake.auth?.token

      if (internalToken !== internalSocketToken) {
        return next(new Error("Unauthorized: invalid internal token"))
      }
      return next()
    }

    const token = extractJwtToken(socket)
    if (!token) {
      return next(new Error("Unauthorized: missing JWT"))
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      const uid = payload.sub ?? payload.userId ?? payload.id;

      if (uid == null || String(uid).trim() === "") {
        return next(new Error("Unauthorized: JWT missing subject"))
      }

      socket.data.userId = String(uid)
      socket.data.jwtPayload = payload
      socket.data.bearerToken = token
      return next()
    } catch {
      return next(new Error("Unauthorized: invalid or expired JWT"))
    }
  };
}

module.exports = {
  extractJwtToken,
  extractUserId,
  buildSocketAuthMiddleware,
};
