function extractSecretKey(socket) {
  const fromAuth = socket.handshake.auth?.secretKey;
  const fromHeader = socket.handshake.headers["x-socket-secret"];
  const fromQuery = socket.handshake.query?.secretKey;

  return fromAuth || fromHeader || fromQuery;
}

function extractUserId(socket) {
  const fromAuth = socket.handshake.auth?.userId;
  const fromHeader = socket.handshake.headers["x-user-id"];
  const fromQuery = socket.handshake.query?.userId;

  return fromAuth || fromHeader || fromQuery || socket.id;
}

function buildSocketAuthMiddleware(secretKey) {
  return (socket, next) => {
    const incomingSecretKey = extractSecretKey(socket);
    if (incomingSecretKey !== secretKey) {
      return next(new Error("Unauthorized: invalid socket secret key"));
    }

    socket.data.authenticated = true;
    return next();
  };
}

module.exports = {
  extractUserId,
  buildSocketAuthMiddleware,
};
