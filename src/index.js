const { buildServer } = require("./server");
const { connectRedis } = require("./redis/client");

async function start() {
    let runtime;

    try {
        runtime = await buildServer();
        const { httpServer, config, log } = runtime;

        try {
            const r = await connectRedis(config);
            if (r && r.type === "upstash") {
                log.info("Upstash Redis connected (online user tracking ready)");
            } else {
                log.info("Redis connected (online user tracking ready)");
            }
        } catch (redisErr) {
            log.error({ err: redisErr }, "Failed to connect to Redis - online tracking will be degraded");
        }

        await new Promise((resolve, reject) => {
            httpServer.listen(config.PORT, config.HOST, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });

        log.info({ port: config.PORT, host: config.HOST },
            "Socket server listening"
        );
    } catch (error) {
        console.error(error);
        process.exit(1);
    }

    const shutdown = async(signal) => {
        runtime.log.info({ signal }, "Shutting down");
        try {
            await runtime.close();
        } catch (error) {
            runtime.log.error({ err: error }, "Shutdown failed");
            process.exit(1);
        }
        process.exit(0);
    };

    process.on("SIGINT", () => {
        shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
        shutdown("SIGTERM");
    });
}

start();
