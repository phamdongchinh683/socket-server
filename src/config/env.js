const envSchema = {
  type: "object",
  required: ["PORT", "HOST", "SOCKET_SECRET_KEY"],
  properties: {
    PORT: { type: "number", default: 3000 },
    HOST: { type: "string", default: "0.0.0.0" },
    SOCKET_SECRET_KEY: { type: "string", minLength: 1 },
  },
};

const envOptions = {
  confKey: "config",
  schema: envSchema,
  dotenv: true,
};

module.exports = {
  envOptions,
};
