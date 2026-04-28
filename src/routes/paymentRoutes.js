const express = require("express");
const {
  generateUPIPaymentRequest,
  verifyUPIPayment,
  getPaymentStatus,
  getPaymentHealth: getUPIPaymentHealth,
} = require("../controllers/upiPaymentController");
const {
  createPaymentOrder,
  verifyPaymentSignature,
  getPaymentHealth: getRazorpayHealth,
} = require("../controllers/paymentController");

const router = express.Router();
const razorpayEnabled = process.env.ENABLE_RAZORPAY === "true";

router.get("/health", getUPIPaymentHealth);
router.post("/upi/generate", generateUPIPaymentRequest);
router.post("/upi/verify", verifyUPIPayment);
router.get("/upi/status", getPaymentStatus);
if (razorpayEnabled) {
  router.get("/razorpay/health", getRazorpayHealth);
  router.post("/razorpay/order", createPaymentOrder);
  router.post("/razorpay/verify", verifyPaymentSignature);
} else {
  const disabledMessage = {
    success: false,
    message: "Razorpay is currently disabled. Use UPI endpoints.",
  };
  router.use("/razorpay", (req, res) => res.status(503).json(disabledMessage));
}

module.exports = router;

