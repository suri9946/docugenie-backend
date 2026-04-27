const express = require("express");
const {
  generateUPIPaymentRequest,
  verifyUPIPayment,
  getPaymentStatus,
  getPaymentHealth,
} = require("../controllers/upiPaymentController");

const router = express.Router();

router.get("/health", getPaymentHealth);
router.post("/upi/generate", generateUPIPaymentRequest);
router.post("/upi/verify", verifyUPIPayment);
router.get("/upi/status", getPaymentStatus);

module.exports = router;

