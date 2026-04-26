const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");

const generateRoutes = require("./routes/generateRoutes");
const downloadRoutes = require("./routes/downloadRoutes");
const documentRoutes = require("./routes/documentRoutes");
const previewRoutes = require("./routes/previewRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const healthRoutes = require("./routes/healthRoutes");
const { errorHandler, notFoundHandler } = require("./middlewares/errorHandler");

const app = express();

const configuredCorsOrigin = process.env.CORS_ORIGIN;
const corsOrigin =
  !configuredCorsOrigin || configuredCorsOrigin.trim() === "*"
    ? "*"
    : configuredCorsOrigin.split(",").map((origin) => origin.trim());

const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

app.use(helmet());
app.use(cors({ origin: corsOrigin }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(apiLimiter);

app.use("/generated", (req, res) =>
  res.status(403).json({
    success: false,
    message: "Payment required. Use the protected document download route.",
  })
);
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/health", healthRoutes);
app.use("/generate", generateRoutes);
app.use("/download", downloadRoutes);
app.use("/documents", documentRoutes);
app.use("/preview", previewRoutes);
app.use("/payment", paymentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
