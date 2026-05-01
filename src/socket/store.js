function createSocketStore() {
  const userToSocketIds = new Map();
  const socketIdToUser = new Map();

  return {
    addConnection(userId, socketId) {
      const socketIds = userToSocketIds.get(userId) || new Set();
      socketIds.add(socketId);
      userToSocketIds.set(userId, socketIds);
      socketIdToUser.set(socketId, userId);
    },
    removeConnection(socketId) {
      const userId = socketIdToUser.get(socketId);
      if (!userId) {
        return null;
      }

      socketIdToUser.delete(socketId);
      const socketIds = userToSocketIds.get(userId);
      if (socketIds) {
        socketIds.delete(socketId);
        if (socketIds.size === 0) {
          userToSocketIds.delete(userId);
        }
      }

      return userId;
    },
    getSocketIdByUserId(userId) {
      const socketIds = userToSocketIds.get(userId);
      if (!socketIds || socketIds.size === 0) {
        return null;
      }

      return socketIds.values().next().value;
    },
    getSocketIdsByUserId(userId) {
      const socketIds = userToSocketIds.get(userId);
      if (!socketIds) {
        return [];
      }

      return Array.from(socketIds);
    },
    getUserIdBySocketId(socketId) {
      return socketIdToUser.get(socketId) || null;
    },
    getOnlineUsersCount() {
      return userToSocketIds.size;
    },
  };
}

module.exports = {
  createSocketStore,
};
