const userOnlines = new Map();

function toValidUserId(value) {
  if (value == null) {
    return "";
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : "";
}

function addOnlineSocket(userId, socketId) {
  if (!userOnlines.has(userId)) {
    userOnlines.set(userId, new Set());
  }

  const sockets = userOnlines.get(userId);
  sockets.add(socketId);
  return sockets.size;
}

function removeOnlineSocket(userId, socketId) {
  const sockets = userOnlines.get(userId);
  if (!sockets) {
    return 0;
  }

  sockets.delete(socketId);
  if (sockets.size === 0) {
    userOnlines.delete(userId);
    return 0;
  }

  return sockets.size;
}

function getOnlineUserIds() {
  return [...userOnlines.keys()];
}

function getOnlineUsersCount() {
  return userOnlines.size;
}

module.exports = {
  toValidUserId,
  addOnlineSocket,
  removeOnlineSocket,
  getOnlineUserIds,
  getOnlineUsersCount,
};
