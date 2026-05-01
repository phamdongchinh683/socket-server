const { buildServer } = require("./server");

async function start() {
  const server = await buildServer();

  try {
    await server.listen({
      port: server.config.PORT,
      host: server.config.HOST,
    });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

start();
