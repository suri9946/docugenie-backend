const express = require("express");
const {
  createPaymentOrder,
  getPaymentHealth,
  verifyPaymentSignature,
} = require("../controllers/paymentController");

const router = express.Router();

router.get("/health", getPaymentHealth);
router.post("/create-order", createPaymentOrder);
router.post("/verify", verifyPaymentSignature);

module.exports = router;

