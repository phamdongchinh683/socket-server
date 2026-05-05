const jwt = require("jsonwebtoken");

function extractJwtToken(socket) {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === "string" && fromAuth.trim()) {
    const raw = fromAuth.trim();
    return raw.startsWith("Bearer ") ? raw.slice(7) : raw;
  }

  const bearer =
    socket.handshake.headers.authorization ||
    socket.handshake.headers.Authorization;

  if (typeof bearer === "string" && bearer.startsWith("Bearer ")) {
    return bearer.slice(7).trim();
  }

  const fromQuery = socket.handshake.query?.token;
  if (typeof fromQuery === "string" && fromQuery.trim()) {
    return fromQuery.trim();
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
