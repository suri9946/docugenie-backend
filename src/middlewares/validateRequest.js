const allowedStyles = ["formal", "academic", "professional", "simple", "casual"];

const buildValidationError = (message, details) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = details;
  return error;
};

const validateGenerateRequest = (req, res, next) => {
  const { title, rawText, referenceText, instructions, subject, style } = req.body || {};
  const errors = [];

  if (title !== undefined && title !== null && typeof title !== "string") {
    errors.push("title must be a string when provided.");
  }

  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    errors.push("rawText is required and must be a non-empty string.");
  }

  if (subject !== undefined && subject !== null && typeof subject !== "string") {
    errors.push("subject must be a string when provided.");
  }

  if (
    referenceText !== undefined &&
    referenceText !== null &&
    typeof referenceText !== "string"
  ) {
    errors.push("referenceText must be a string when provided.");
  }

  if (
    instructions !== undefined &&
    instructions !== null &&
    typeof instructions !== "string"
  ) {
    errors.push("instructions must be a string when provided.");
  }

  if (style !== undefined && style !== null && typeof style !== "string") {
    errors.push("style must be a string when provided.");
  }

  const normalizedTitle = typeof title === "string" ? title.trim() : undefined;
  const normalizedRawText = typeof rawText === "string" ? rawText.trim() : "";
  const normalizedReferenceText =
    typeof referenceText === "string" ? referenceText.trim() : undefined;
  const normalizedInstructions =
    typeof instructions === "string" ? instructions.trim() : undefined;
  const normalizedSubject =
    typeof subject === "string" ? subject.trim() : undefined;
  const normalizedStyle =
    typeof style === "string" && style.trim().length > 0
      ? style.trim().toLowerCase()
      : "formal";

  if (normalizedTitle && normalizedTitle.length > 150) {
    errors.push("title must be 150 characters or less.");
  }

  if (normalizedSubject && normalizedSubject.length > 100) {
    errors.push("subject must be 100 characters or less.");
  }

  if (!allowedStyles.includes(normalizedStyle)) {
    errors.push(`style must be one of: ${allowedStyles.join(", ")}.`);
  }

  if (errors.length > 0) {
    return next(buildValidationError("Validation failed.", errors));
  }

  req.body = {
    title: normalizedTitle,
    rawText: normalizedRawText,
    referenceText: normalizedReferenceText,
    instructions: normalizedInstructions,
    subject: normalizedSubject,
    style: normalizedStyle,
  };

  return next();
};

module.exports = {
  validateGenerateRequest,
};
