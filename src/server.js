const Fastify = require("fastify");
const fastifyEnv = require("@fastify/env");
const { envOptions } = require("./config/env");
const { registerSocketServer } = require("./plugins/socket");
const healthRoutes = require("./routes/health");

async function buildServer() {
  const fastify = Fastify({
    logger: true,
  });

  await fastify.register(fastifyEnv, envOptions);
  await fastify.register(healthRoutes);

  registerSocketServer(fastify);

  return fastify;
}

module.exports = {
  buildServer,
};
