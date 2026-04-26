const formatMeta = (meta) => {
  if (!meta || Object.keys(meta).length === 0) {
    return "";
  }

  return ` ${JSON.stringify(meta)}`;
};

const log = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  console[level](`[${timestamp}] ${message}${formatMeta(meta)}`);
};

module.exports = {
  info: (message, meta) => log("log", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
};

