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

function buildSocketAuthMiddleware(jwtSecret) {
  return (socket, next) => {
    const secret =
      typeof jwtSecret === "string" ? jwtSecret.trim() : "";
    if (secret === "") {
      return next(new Error("Unauthorized: JWT_SECRET not configured"));
    }

    const token = extractJwtToken(socket);
    if (!token) {
      return next(new Error("Unauthorized: missing JWT"));
    }

    try {
      const payload = jwt.verify(token, secret);
      const uid = payload.sub ?? payload.userId ?? payload.id;

      if (uid == null || String(uid).trim() === "") {
        return next(new Error("Unauthorized: JWT missing subject (sub / userId / id)"));
      }

      socket.data.userId = String(uid);
      socket.data.jwtPayload = payload;
      return next();
    } catch {
      return next(new Error("Unauthorized: invalid or expired JWT"));
    }
  };
}

module.exports = {
  extractJwtToken,
  extractUserId,
  buildSocketAuthMiddleware,
};
