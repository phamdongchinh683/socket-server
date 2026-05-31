const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { buildSocketAuthMiddleware } = require("../socket/auth");
const { registerSocketHandlers } = require("../socket/handlers");
const { createAdapterPubSubClients } = require("../redis/client");

function parseSocketTransports(value) {
    const transports = String(value || "websocket")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    return transports.length > 0 ? transports : ["websocket"];
}

async function registerSocketServer(httpServer, app) {
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
        },
        transports: parseSocketTransports(app.config.SOCKET_TRANSPORTS),
        perMessageDeflate: app.config.SOCKET_PER_MESSAGE_DEFLATE,
        serveClient: app.config.SOCKET_SERVE_CLIENT,
        allowEIO3: false,
    });

    try {
        const adapterClients = await createAdapterPubSubClients(app.config);

        if (adapterClients) {
            const { pubClient, subClient } = adapterClients;
            const prefix = app.config.REDIS_KEY_PREFIX || "socket";
            const key = `${prefix}:socket.io`;

            io.adapter(createAdapter(pubClient, subClient, { key }));

            io._redisAdapterClients = { pubClient, subClient };

            try {
                const eventsSub = subClient.duplicate();
                await eventsSub.connect();

                await eventsSub.subscribe("socket:events", (rawMessage) => {
                    try {
                        const payload = JSON.parse(rawMessage);

                        if (payload.targetId && payload.event) {
                            io.to(String(payload.targetId)).emit(payload.event, payload.data || {});
                        } else {
                            app.log.warn({ payload }, "socket:events skipped - missing targetId or event");
                        }
                    } catch (parseErr) {
                        app.log.error({ err: parseErr.message }, "socket:events failed to parse message");
                    }
                });

                io._socketEventsSub = eventsSub;

            } catch (err) {
                app.log.error({ err }, "Failed to subscribe to 'socket:events' channel");
            }
        } else {
            app.log.warn("Socket.IO Redis adapter disabled (Upstash detected) - run only 1 instance");
        }
    } catch (err) {
        app.log.error({ err }, "Failed to initialize Socket.IO Redis adapter - continuing without it");
    }

    io.use(
        buildSocketAuthMiddleware({
            jwtSecret: app.config.JWT_SECRET,
        })
    );
    registerSocketHandlers(io, app);

    return io;
}

module.exports = {
    registerSocketServer,
};