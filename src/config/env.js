const envSchema = {
  type: "object",
  required: ["PORT", "HOST", "JWT_SECRET"],
  properties: {
    PORT: { type: "number", default: 4444 },
    HOST: { type: "string", default: "0.0.0.0" },
    JWT_SECRET: { type: "string", minLength: 1 },
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
