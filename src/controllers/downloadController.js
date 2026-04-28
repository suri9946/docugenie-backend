const { getDownloadInfoByFormat } = require("../services/exportService");
const { isDocumentPaid } = require("../services/paymentService");
const { errorResponse } = require("../utils/apiResponse");

const DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

const downloadDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const format = req.query?.format || "docx";

    // Validate the identifier early to block malformed requests and path traversal attempts.
    if (!DOCUMENT_ID_PATTERN.test(documentId)) {
      return res
        .status(400)
        .json(errorResponse("Invalid documentId"));
    }

    if (!(await isDocumentPaid(documentId))) {
      return res
        .status(403)
        .json(errorResponse("Payment required to download document"));
    }

    try {
      const { fileName, absolutePath } = await getDownloadInfoByFormat(documentId, format);

      return res.download(absolutePath, fileName);
    } catch (error) {
      if (error.statusCode === 404) {
        return res.status(404).json(errorResponse("Document not found"));
      }

      throw error;
    }
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  downloadDocument,
};
