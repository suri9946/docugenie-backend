const Razorpay = require("razorpay");
const crypto = require("crypto");
const { successResponse, errorResponse } = require("../utils/apiResponse");
const { markDocumentAsPaid } = require("../services/paymentService");
const logger = require("../utils/logger");

const INR_TO_PAISE = 100;

const getPaymentConfig = () => ({
  keyId: process.env.RAZORPAY_KEY_ID?.trim(),
  keySecret: process.env.RAZORPAY_KEY_SECRET?.trim(),
});

const getKeyMode = (keyId) => {
  if (typeof keyId !== "string") {
    return null;
  }

  if (keyId.startsWith("rzp_test_")) {
    return "test";
  }

  if (keyId.startsWith("rzp_live_")) {
    return "live";
  }

  return null;
};

const validatePaymentConfig = () => {
  const { keyId, keySecret } = getPaymentConfig();
  const issues = [];
  const mode = getKeyMode(keyId);

  if (!keyId) {
    issues.push("RAZORPAY_KEY_ID is missing.");
  } else if (!mode) {
    issues.push("RAZORPAY_KEY_ID must start with rzp_test_ or rzp_live_.");
  }

  if (!keySecret) {
    issues.push("RAZORPAY_KEY_SECRET is missing.");
  } else if (keySecret.startsWith("rzp_test_") || keySecret.startsWith("rzp_live_")) {
    issues.push("RAZORPAY_KEY_SECRET appears to contain a public key id. Use the matching Razorpay key secret instead.");
  }

  return {
    configured: issues.length === 0,
    issues,
    mode,
    keyIdPrefix: keyId ? keyId.slice(0, 9) : null,
    hasKeyId: Boolean(keyId),
    hasKeySecret: Boolean(keySecret),
  };
};

const getRazorpayErrorDetails = (error) => ({
  statusCode: error.statusCode || error.status,
  message: error.message,
  description: error.error?.description || error.description,
  reason: error.error?.reason || error.reason,
  field: error.error?.field || error.field,
  code: error.error?.code || error.code,
});

const getRazorpayClient = () => {
  const { keyId, keySecret } = getPaymentConfig();

  if (!keyId || !keySecret) {
    return null;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};

const createPaymentOrder = async (req, res, next) => {
  try {
    const { documentId } = req.body || {};
    const amountInRupees = Number(req.body?.amount);

    if (!documentId || typeof documentId !== "string") {
      return res
        .status(400)
        .json(errorResponse("documentId is required and must be a string"));
    }

    if (req.body?.amount === undefined || req.body?.amount === null) {
      return res
        .status(400)
        .json(errorResponse("amount is required in rupees"));
    }

    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
      return res
        .status(400)
        .json(errorResponse("amount must be a positive number in rupees"));
    }

    const amount = Math.round(amountInRupees * INR_TO_PAISE);
    const configStatus = validatePaymentConfig();
    const { keyId } = getPaymentConfig();
    const razorpay = getRazorpayClient();

    if (!configStatus.configured || !razorpay) {
      logger.error("Razorpay configuration is invalid.", configStatus);
      return res
        .status(500)
        .json(errorResponse("Payment gateway configuration is invalid.", configStatus.issues));
    }

    const options = {
      amount,
      currency: "INR",
      receipt: `doc_${documentId}_${Date.now()}`,
      notes: {
        documentId,
      },
    };

    const order = await razorpay.orders.create(options);

    return res.status(201).json(
      successResponse("Payment order created successfully", {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: keyId,
        documentId,
      })
    );
  } catch (error) {
    const razorpayError = getRazorpayErrorDetails(error);
    logger.error("Razorpay order creation failed.", razorpayError);

    if (error.statusCode === 401 || error.statusCode === 403) {
      return res
        .status(500)
        .json(errorResponse(
          "Payment gateway rejected the configured Razorpay credentials. Verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET belong to the same Razorpay mode.",
          razorpayError
        ));
    }

    if (
      error.message &&
      error.message.includes("validation") &&
      error.statusCode === 400
    ) {
      return res
        .status(400)
        .json(errorResponse("Invalid payment request: " + error.message));
    }

    return next(error);
  }
};

const getPaymentHealth = (req, res) => {
  const configStatus = validatePaymentConfig();

  if (!configStatus.configured) {
    return res.status(500).json(
      errorResponse("Payment configuration is invalid.", {
        ...configStatus,
        ready: false,
      })
    );
  }

  return res.status(200).json(
    successResponse("Payment configuration status.", {
      ...configStatus,
      ready: true,
    })
  );
};

const verifyPaymentSignature = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, documentId } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !documentId) {
      return res.status(400).json(errorResponse("Missing payment verification data"));
    }

    const { keySecret } = getPaymentConfig();

    if (!keySecret) {
      return res
        .status(503)
        .json(errorResponse("Payment gateway is not configured."));
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      await markDocumentAsPaid(documentId);

      return res.status(200).json(
        successResponse("Payment verified successfully", {
          documentId,
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
        })
      );
    } else {
      return res
        .status(403)
        .json(errorResponse("Payment signature verification failed"));
    }
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createPaymentOrder,
  getPaymentHealth,
  validatePaymentConfig,
  verifyPaymentSignature,
};
