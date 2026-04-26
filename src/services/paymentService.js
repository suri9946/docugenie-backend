const { getGeneratedDocumentRecord, markGeneratedDocumentPaid } = require("./generatedDocumentService");

const paidDocumentIds = new Set();

const isDocumentPaid = async (documentId) => {
  if (typeof documentId !== "string" || documentId.trim().length === 0) {
    return false;
  }

  if (paidDocumentIds.has(documentId)) {
    return true;
  }

  try {
    const record = await getGeneratedDocumentRecord(documentId);
    return Boolean(record.metadata && record.metadata.paid);
  } catch (error) {
    return false;
  }
};

const markDocumentAsPaid = async (documentId) => {
  if (typeof documentId === "string" && documentId.trim().length > 0) {
    paidDocumentIds.add(documentId);
    await markGeneratedDocumentPaid(documentId);
  }
};

module.exports = {
  isDocumentPaid,
  markDocumentAsPaid,
};
