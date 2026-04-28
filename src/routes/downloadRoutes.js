const express = require("express");
const { downloadDocument } = require("../controllers/downloadController");

const router = express.Router();

router.get("/:documentId", downloadDocument);

module.exports = router;

