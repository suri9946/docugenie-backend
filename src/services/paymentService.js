const { getGeneratedDocumentRecord, markGeneratedDocumentPaid } = require("./generatedDocumentService");
const { isDocumentPaidInDB } = require("./supabaseService");
const logger = require("../utils/logger");

const paidDocumentIds = new Set();

const isDocumentPaid = async (documentId) => {
  if (typeof documentId !== "string" || documentId.trim().length === 0) {
    return false;
  }

  // Check cache first
  if (paidDocumentIds.has(documentId)) {
    return true;
  }

  // Check Supabase database for verified payment
  const isPaidInDB = await isDocumentPaidInDB(documentId);
  if (isPaidInDB) {
    paidDocumentIds.add(documentId);
    return true;
  }

  // Fallback: Check local metadata
  try {
    const record = await getGeneratedDocumentRecord(documentId);
    if (record.metadata && record.metadata.paid) {
      paidDocumentIds.add(documentId);
      return true;
    }
  } catch (error) {
    logger.debug("Document record not found for payment check", { documentId });
  }

  return false;
};

const markDocumentAsPaid = async (documentId) => {
  if (typeof documentId === "string" && documentId.trim().length > 0) {
    paidDocumentIds.add(documentId);
    try {
      await markGeneratedDocumentPaid(documentId);
    } catch (error) {
      logger.error("Failed to mark document as paid", { documentId, message: error.message });
    }
  }
};

module.exports = {
  isDocumentPaid,
  markDocumentAsPaid,
};
