const fs = require("fs");
const path = require("path");

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }

  return defaultValue;
}

function requireString(name) {
  const value = process.env[name];
  if (value == null || String(value).trim() === "") {
    throw new Error(`Missing required env: ${name}`);
  }

  return String(value).trim();
}

function loadConfig() {
  loadDotEnv();

  const port = Number(process.env.PORT);
  return {
    PORT: Number.isFinite(port) && port > 0 ? port : 4444,
    HOST: process.env.HOST?.trim() || "0.0.0.0",
    JWT_SECRET: requireString("JWT_SECRET"),
    API_URL: requireString("API_URL"),
    INTERNAL_SOCKET_TOKEN: requireString("INTERNAL_SOCKET_TOKEN"),
    LOG_LEVEL: process.env.LOG_LEVEL?.trim() || "error",
    SOCKET_TRANSPORTS: process.env.SOCKET_TRANSPORTS?.trim() || "websocket",
    SOCKET_PER_MESSAGE_DEFLATE: parseBoolean(
      process.env.SOCKET_PER_MESSAGE_DEFLATE,
      false
    ),
    SOCKET_SERVE_CLIENT: parseBoolean(process.env.SOCKET_SERVE_CLIENT, false),
  };
}

module.exports = {
  loadConfig,
};
