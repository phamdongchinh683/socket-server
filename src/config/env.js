const envSchema = {
  type: "object",
  required: ["PORT", "HOST", "JWT_SECRET", "API_URL", "INTERNAL_SOCKET_TOKEN"],
  properties: {
    PORT: { type: "number", default: 4444 },
    HOST: { type: "string", default: "0.0.0.0" },
    JWT_SECRET: { type: "string", minLength: 1 },
    API_URL: {
      type: "string",
      minLength: 1,
    },
    INTERNAL_SOCKET_TOKEN: {
      type: "string",
      minLength: 1,
    },
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
