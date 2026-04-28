require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const logger = require("./utils/logger");
const { validatePaymentConfig } = require("./controllers/paymentController");
const app = require("./app");

const PORT = Number(process.env.PORT || 5000);
const GENERATED_DIR = path.join(__dirname, "..", "generated");
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

let server;

const paymentConfigStatus = validatePaymentConfig();

if (paymentConfigStatus.configured) {
  logger.info("Razorpay payment gateway configuration loaded.", {
    mode: paymentConfigStatus.mode,
    keyIdPrefix: paymentConfigStatus.keyIdPrefix,
    hasKeyId: paymentConfigStatus.hasKeyId,
    hasKeySecret: paymentConfigStatus.hasKeySecret,
  });
} else {
  logger.warn("Razorpay payment gateway configuration is invalid.", paymentConfigStatus);
}

const ensureRuntimeDirectories = async () => {
  await Promise.all([
    fs.mkdir(GENERATED_DIR, { recursive: true }),
    fs.mkdir(UPLOADS_DIR, { recursive: true }),
  ]);
};

const startServer = async () => {
  try {
    await ensureRuntimeDirectories();

    server = app.listen(PORT, () => {
      logger.info("DocuGenie backend server started.", {
        port: PORT,
        environment: process.env.NODE_ENV || "development",
      });
    });
  } catch (error) {
    logger.error("Failed to start the server.", { message: error.message });
    process.exit(1);
  }
};

const shutdown = (signal) => {
  logger.warn(`${signal} received. Shutting down gracefully.`);

  if (!server) {
    process.exit(0);
  }

  server.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception.", { message: error.message });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection.", {
    message: reason instanceof Error ? reason.message : String(reason),
  });
});

startServer();
