const express = require("express");
const multer = require("multer");
const { generateDocument } = require("../controllers/generateController");
const { validateGenerateRequest } = require("../middlewares/validateRequest");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

const handleReferenceUpload = (req, res, next) => {
  upload.single("referenceFile")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "Invalid reference file upload.",
      });
    }

    return next();
  });
};

router.post("/", handleReferenceUpload, validateGenerateRequest, generateDocument);

module.exports = router;
