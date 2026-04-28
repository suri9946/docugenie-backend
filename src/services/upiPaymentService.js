const crypto = require("crypto");
const logger = require("../utils/logger");

const MERCHANT_UPI = process.env.MERCHANT_UPI || "7483353574@ibl";
const DEFAULT_AMOUNT = 99; // INR

// UPI provider deep-link formats
const UPI_DEEP_LINKS = {
  // Google Pay format: upi://pay?pa=...&pn=...&tr=...&tn=...&am=...
  google_pay: (params) => {
    return `upi://pay?pa=${encodeURIComponent(params.upi)}&pn=${encodeURIComponent(params.payeeName)}&tr=${encodeURIComponent(params.transactionRef)}&tn=${encodeURIComponent(params.description)}&am=${params.amount}`;
  },

  // PhonePe uses same UPI schema
  phonepe: (params) => {
    return `upi://pay?pa=${encodeURIComponent(params.upi)}&pn=${encodeURIComponent(params.payeeName)}&tr=${encodeURIComponent(params.transactionRef)}&tn=${encodeURIComponent(params.description)}&am=${params.amount}`;
  },

  // Paytm uses same UPI schema
  paytm: (params) => {
    return `upi://pay?pa=${encodeURIComponent(params.upi)}&pn=${encodeURIComponent(params.payeeName)}&tr=${encodeURIComponent(params.transactionRef)}&tn=${encodeURIComponent(params.description)}&am=${params.amount}`;
  },

  // Generic UPI (any app that supports UPI)
  generic: (params) => {
    return `upi://pay?pa=${encodeURIComponent(params.upi)}&pn=${encodeURIComponent(params.payeeName)}&tr=${encodeURIComponent(params.transactionRef)}&tn=${encodeURIComponent(params.description)}&am=${params.amount}`;
  },
};

const generateTransactionReference = (documentId) => {
  return `DOC${documentId.toUpperCase()}_${Date.now()}`;
};

const generateUPIDeepLink = (provider, { documentId, amount = DEFAULT_AMOUNT }) => {
  if (!MERCHANT_UPI) {
    throw new Error("MERCHANT_UPI is not configured");
  }

  if (!UPI_DEEP_LINKS[provider]) {
    throw new Error(`Invalid UPI provider: ${provider}`);
  }

  const transactionRef = generateTransactionReference(documentId);
  
  const linkParams = {
    upi: MERCHANT_UPI,
    payeeName: "DocuGenie",
    transactionRef,
    description: `DocuGenie Book #${documentId}`,
    amount: amount.toString(),
  };

  const deepLink = UPI_DEEP_LINKS[provider](linkParams);
  const genericUpiLink = UPI_DEEP_LINKS.generic(linkParams);
  const qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(genericUpiLink)}&size=280`;
  
  return {
    provider,
    deepLink,
    genericUpiLink,
    qrCodeUrl,
    transactionRef,
    amount,
    documentId,
    generatedAt: new Date().toISOString(),
  };
};

const getUPIProviderOptions = () => [
  { id: "google_pay", name: "Google Pay", icon: "google" },
  { id: "phonepe", name: "PhonePe", icon: "phonepe" },
  { id: "paytm", name: "Paytm", icon: "paytm" },
  { id: "generic", name: "Generic UPI", icon: "upi" },
];

module.exports = {
  generateUPIDeepLink,
  generateTransactionReference,
  getUPIProviderOptions,
  MERCHANT_UPI,
  DEFAULT_AMOUNT,
  UPI_DEEP_LINKS,
};
