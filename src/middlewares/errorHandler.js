const { errorResponse } = require("../utils/apiResponse");
const logger = require("../utils/logger");

const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found.`);
  error.statusCode = 404;
  next(error);
};

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === "production";

  logger.error("Request failed", {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    message: error.message,
  });

  res.status(statusCode).json(
    errorResponse(
      error.message || "Internal server error.",
      isProduction && statusCode === 500
        ? null
        : error.details || (statusCode === 500 ? error.stack : null)
    )
  );
};

module.exports = {
  notFoundHandler,
  errorHandler,
};

