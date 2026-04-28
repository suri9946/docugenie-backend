const {
  getGeneratedDocumentDownloadInfo,
  getGeneratedDocumentRecord,
  getGeneratedPreviewText,
  listGeneratedDocuments,
} = require("../services/generatedDocumentService");
const { isDocumentPaid } = require("../services/paymentService");
const { successResponse, errorResponse } = require("../utils/apiResponse");

const buildLinks = (documentId, appBaseUrl) => ({
  details: `${appBaseUrl}/documents/${documentId}`,
  preview: `${appBaseUrl}/documents/${documentId}/preview`,
  download: `${appBaseUrl}/documents/${documentId}/download`,
});

const listDocuments = async (req, res, next) => {
  try {
    const appBaseUrl = (
      process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5000}`
    ).replace(/\/$/, "");

    const documents = await listGeneratedDocuments();

    res.json(
      successResponse("Generated documents fetched successfully.", {
        count: documents.length,
        documents: documents.map((document) => ({
          ...document,
          links: buildLinks(document.documentId, appBaseUrl),
        })),
      })
    );
  } catch (error) {
    next(error);
  }
};

const getDocumentById = async (req, res, next) => {
  try {
    const appBaseUrl = (
      process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5000}`
    ).replace(/\/$/, "");
    const record = await getGeneratedDocumentRecord(req.params.documentId);

    res.json(
      successResponse("Generated document fetched successfully.", {
        ...record,
        links: buildLinks(record.documentId, appBaseUrl),
      })
    );
  } catch (error) {
    next(error);
  }
};

const getDocumentPreview = async (req, res, next) => {
  try {
    const previewText = await getGeneratedPreviewText(req.params.documentId);
    res.type("text/plain").send(previewText);
  } catch (error) {
    next(error);
  }
};

const downloadDocument = async (req, res, next) => {
  try {
    if (!(await isDocumentPaid(req.params.documentId))) {
      return res
        .status(403)
        .json(errorResponse("Payment required to download document"));
    }

    const { fileName, absolutePath } = await getGeneratedDocumentDownloadInfo(
      req.params.documentId
    );

    res.download(absolutePath, fileName);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listDocuments,
  getDocumentById,
  getDocumentPreview,
  downloadDocument,
};
