const crypto = require("crypto");
const {
  generateUPIDeepLink,
  getUPIProviderOptions,
  generateTransactionReference,
} = require("../services/upiPaymentService");
const {
  recordPayment,
  getPaymentByReference,
  verifyPayment,
  isDocumentPaidInDB,
} = require("../services/supabaseService");
const { successResponse, errorResponse } = require("../utils/apiResponse");
const logger = require("../utils/logger");

const DEFAULT_AMOUNT = 20; // INR

const validateUPIConfig = () => {
  const merchantUpi = process.env.MERCHANT_UPI;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const issues = [];
  if (!merchantUpi) {
    issues.push("MERCHANT_UPI is not configured (required format: XXXXXXXXXX@bank)");
  }
  if (!supabaseUrl) {
    issues.push("SUPABASE_URL is not configured");
  }
  if (!supabaseKey) {
    issues.push("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return {
    configured: issues.length === 0,
    issues,
    merchantUpi: merchantUpi ? merchantUpi.replace(/(.{2}).*(@.*)/, "$1****$2") : null,
    hasSupabase: Boolean(supabaseUrl && supabaseKey),
  };
};

const generateUPIPaymentRequest = async (req, res, next) => {
  try {
    const { documentId, provider, amount = DEFAULT_AMOUNT } = req.body || {};

    if (!documentId || typeof documentId !== "string") {
      return res
        .status(400)
        .json(errorResponse("documentId is required and must be a string"));
    }

    if (!provider || typeof provider !== "string") {
      return res
        .status(400)
        .json(errorResponse("provider is required (google_pay, phonepe, paytm, or generic)"));
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res
        .status(400)
        .json(errorResponse("amount must be a positive number in rupees"));
    }

    const configStatus = validateUPIConfig();
    if (!configStatus.configured) {
      logger.error("UPI configuration invalid", configStatus);
      return res
        .status(500)
        .json(errorResponse("Payment system not configured", configStatus.issues));
    }

    // Generate UPI deep link
    const upiRequest = generateUPIDeepLink(provider, { documentId, amount });

    // Record pending payment in database
    const paymentRecord = await recordPayment({
      document_id: documentId,
      amount,
      currency: "INR",
      upi_txn_ref: upiRequest.transactionRef,
      upi_provider: provider,
      status: "pending",
      verified: false,
      merchant_upi: process.env.MERCHANT_UPI,
      metadata: {
        generatedAt: new Date().toISOString(),
      },
    });

    if (!paymentRecord.success) {
      logger.error("Failed to record payment", paymentRecord);
      return res
        .status(500)
        .json(errorResponse("Failed to initiate payment", paymentRecord.error));
    }

    logger.info("UPI payment request generated", {
      documentId,
      provider,
      amount,
      transactionRef: upiRequest.transactionRef,
    });

    return res.status(200).json(
      successResponse("UPI payment request generated", {
        deepLink: upiRequest.deepLink,
        transactionRef: upiRequest.transactionRef,
        provider,
        amount,
        documentId,
        instruction: `Opening ${provider.replace("_", " ").toUpperCase()}. Confirm payment of ₹${amount}`,
      })
    );
  } catch (error) {
    logger.error("UPI payment request generation failed", { message: error.message });
    return next(error);
  }
};

const verifyUPIPayment = async (req, res, next) => {
  try {
    const { transactionRef, documentId } = req.body || {};

    if (!transactionRef || typeof transactionRef !== "string") {
      return res
        .status(400)
        .json(errorResponse("transactionRef is required"));
    }

    if (!documentId || typeof documentId !== "string") {
      return res
        .status(400)
        .json(errorResponse("documentId is required"));
    }

    // Check if payment exists and is valid
    const existingPayment = await getPaymentByReference(transactionRef);
    if (!existingPayment) {
      return res
        .status(404)
        .json(errorResponse("Payment record not found"));
    }

    if (existingPayment.document_id !== documentId) {
      return res
        .status(403)
        .json(errorResponse("Payment does not match document"));
    }

    // Check if already verified
    if (existingPayment.verified && existingPayment.status === "success") {
      logger.info("Payment already verified", { transactionRef });
      return res.status(200).json(
        successResponse("Payment already verified", {
          verified: true,
          transactionRef,
          documentId,
          status: "success",
        })
      );
    }

    // Mark payment as verified
    const verifiedPayment = await verifyPayment(transactionRef);
    if (!verifiedPayment) {
      return res
        .status(500)
        .json(errorResponse("Failed to verify payment"));
    }

    logger.info("Payment verified successfully", {
      transactionRef,
      documentId,
    });

    return res.status(200).json(
      successResponse("Payment verified and document unlocked", {
        verified: true,
        transactionRef,
        documentId,
        status: "success",
        unlockedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    logger.error("Payment verification failed", { message: error.message });
    return next(error);
  }
};

const getPaymentStatus = async (req, res, next) => {
  try {
    const { transactionRef, documentId } = req.query || {};

    if (!transactionRef && !documentId) {
      return res
        .status(400)
        .json(errorResponse("Either transactionRef or documentId is required"));
    }

    let payment;
    if (transactionRef) {
      payment = await getPaymentByReference(transactionRef);
    } else if (documentId) {
      const isPaid = await isDocumentPaidInDB(documentId);
      return res.status(200).json(
        successResponse("Document payment status", {
          documentId,
          isPaid,
        })
      );
    }

    if (!payment) {
      return res.status(404).json(errorResponse("Payment not found"));
    }

    return res.status(200).json(
      successResponse("Payment status", {
        transactionRef,
        documentId: payment.document_id,
        status: payment.status,
        verified: payment.verified,
        amount: payment.amount,
        createdAt: payment.created_at,
        verifiedAt: payment.verified_at,
      })
    );
  } catch (error) {
    logger.error("Failed to get payment status", { message: error.message });
    return next(error);
  }
};

const getPaymentHealth = (req, res) => {
  const configStatus = validateUPIConfig();

  return res.status(configStatus.configured ? 200 : 500).json(
    successResponse("Payment system health", {
      ...configStatus,
      ready: configStatus.configured,
      providers: getUPIProviderOptions(),
    })
  );
};

module.exports = {
  generateUPIPaymentRequest,
  verifyUPIPayment,
  getPaymentStatus,
  getPaymentHealth,
  validateUPIConfig,
};
