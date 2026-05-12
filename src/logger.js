const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function createLogger(level = "error") {
  const minLevel = LEVELS[level] ?? LEVELS.error;

  function write(target, message, meta) {
    if (meta === undefined) {
      target(message);
      return;
    }

    target(message, meta);
  }

  return {
    error(message, meta) {
      if (minLevel >= LEVELS.error) {
        write(console.error, message, meta);
      }
    },
    warn(message, meta) {
      if (minLevel >= LEVELS.warn) {
        write(console.warn, message, meta);
      }
    },
    info(message, meta) {
      if (minLevel >= LEVELS.info) {
        write(console.log, message, meta);
      }
    },
  };
}

module.exports = {
  createLogger,
};
