const { getOnlineUsersCount } = require("../socket/online-store");

function sendHealthResponse(res, io) {
  const clientsCount = io ? io.engine.clientsCount : 0;
  const body = JSON.stringify({
    message: "OK",
    clients: clientsCount,
    onlineUsers: getOnlineUsersCount(),
  });

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

module.exports = {
  sendHealthResponse,
};
