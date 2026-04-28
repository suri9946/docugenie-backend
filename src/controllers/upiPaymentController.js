const {
  generateUPIDeepLink,
  getUPIProviderOptions,
  MERCHANT_UPI,
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
const isUPITestMode = () => process.env.UPI_TEST_MODE === "true";
const localPaymentStore = new Map();

const validateUPIConfig = () => {
  const merchantUpi = process.env.MERCHANT_UPI || MERCHANT_UPI;

  const issues = [];
  if (!merchantUpi) {
    issues.push("MERCHANT_UPI is not configured (required format: XXXXXXXXXX@bank)");
  }

  return {
    configured: issues.length === 0,
    issues,
    merchantUpi: merchantUpi ? merchantUpi.replace(/(.{2}).*(@.*)/, "$1****$2") : null,
    hasSupabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
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

    localPaymentStore.set(upiRequest.transactionRef, {
      document_id: documentId,
      amount,
      status: "pending",
      verified: false,
      created_at: new Date().toISOString(),
      source: "memory",
    });

    // Payment initiation must succeed even if logging/database is unavailable.
    try {
      await recordPayment({
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
    } catch (dbError) {
      logger.warn("Payment logging failed, continuing with local UPI flow", {
        message: dbError.message,
      });
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
        genericUpiLink: upiRequest.genericUpiLink,
        qrCodeUrl: upiRequest.qrCodeUrl,
        transactionRef: upiRequest.transactionRef,
        provider,
        amount,
        documentId,
        instruction: `Opening ${provider.replace("_", " ").toUpperCase()}. Confirm payment of ₹${amount}`,
        testMode: isUPITestMode(),
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
    const allowManualVerify = process.env.ALLOW_MANUAL_UPI_VERIFY === "true" || isUPITestMode();

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
    let existingPayment = localPaymentStore.get(transactionRef) || null;
    if (!existingPayment) {
      existingPayment = await getPaymentByReference(transactionRef);
    }
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

    if (!allowManualVerify) {
      return res.status(202).json(
        successResponse("Payment submitted. Awaiting provider confirmation.", {
          verified: false,
          transactionRef,
          documentId,
          status: "pending_confirmation",
          testMode: false,
        })
      );
    }

    // Manual verification mode for testing/sandbox only
    localPaymentStore.set(transactionRef, {
      ...existingPayment,
      status: "success",
      verified: true,
      verified_at: new Date().toISOString(),
    });
    let verifiedPayment = null;
    try {
      verifiedPayment = await verifyPayment(transactionRef);
    } catch (verifyError) {
      logger.warn("DB verify failed, using local payment state", {
        message: verifyError.message,
      });
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
        testMode: isUPITestMode(),
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
      payment = localPaymentStore.get(transactionRef) || (await getPaymentByReference(transactionRef));
    } else if (documentId) {
      const localPaid = Array.from(localPaymentStore.values()).some(
        (entry) => entry.document_id === documentId && entry.status === "success" && entry.verified
      );
      const isPaid = localPaid || (await isDocumentPaidInDB(documentId));
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
      testMode: isUPITestMode(),
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
