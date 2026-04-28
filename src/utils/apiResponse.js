const successResponse = (message, data = {}) => ({
  success: true,
  message,
  data,
});

const errorResponse = (message, errors = null) => ({
  success: false,
  message,
  ...(errors ? { errors } : {}),
});

module.exports = {
  successResponse,
  errorResponse,
};

