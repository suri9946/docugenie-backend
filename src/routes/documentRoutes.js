const express = require("express");
const {
  listDocuments,
  getDocumentById,
  getDocumentPreview,
  downloadDocument,
} = require("../controllers/documentController");

const router = express.Router();

router.get("/", listDocuments);
router.get("/:documentId", getDocumentById);
router.get("/:documentId/preview", getDocumentPreview);
router.get("/:documentId/download", downloadDocument);

module.exports = router;

