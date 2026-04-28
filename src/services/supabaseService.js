const { supabase, isSupabaseConfigured } = require("../config/supabase");
const logger = require("../utils/logger");

const saveDocumentMetadata = async (metadata) => {
  if (!isSupabaseConfigured || !supabase) {
    logger.warn("Supabase not configured. Skipping document metadata save.");
    return {
      success: false,
      configured: false,
      reason: "Supabase not configured",
    };
  }

  try {
    const { data, error } = await supabase.from("documents").insert([metadata]);
    if (error) throw error;
    logger.info("Document metadata saved to Supabase", { documentId: metadata.documentId });
    return { success: true, data };
  } catch (error) {
    logger.error("Failed to save document metadata", { message: error.message });
    return { success: false, error: error.message };
  }
};

const saveUserInfo = async (userInfo) => {
  if (!isSupabaseConfigured || !supabase) {
    logger.warn("Supabase not configured. Skipping user info save.");
    return {
      success: false,
      configured: false,
      reason: "Supabase not configured",
    };
  }

  try {
    const { data, error } = await supabase.from("users").upsert([userInfo]);
    if (error) throw error;
    logger.info("User info saved to Supabase", { userId: userInfo.userId });
    return { success: true, data };
  } catch (error) {
    logger.error("Failed to save user info", { message: error.message });
    return { success: false, error: error.message };
  }
};

const storeGeneratedFileReference = async (fileInfo) => {
  if (!isSupabaseConfigured || !supabase) {
    logger.warn("Supabase not configured. Skipping file reference save.");
    return {
      success: false,
      configured: false,
      reason: "Supabase not configured",
    };
  }

  try {
    const { data, error } = await supabase
      .from("generated_files")
      .insert([fileInfo]);
    if (error) throw error;
    logger.info("File reference saved to Supabase", { fileId: fileInfo.fileId });
    return { success: true, data };
  } catch (error) {
    logger.error("Failed to save file reference", { message: error.message });
    return { success: false, error: error.message };
  }
};

// Payment operations
const recordPayment = async (paymentData) => {
  if (!isSupabaseConfigured || !supabase) {
    logger.warn("Supabase not configured. Cannot record payment.");
    return {
      success: false,
      configured: false,
      reason: "Supabase not configured",
    };
  }

  try {
    const { data, error } = await supabase.from("payments").insert([paymentData]);
    if (error) throw error;
    logger.info("Payment recorded in Supabase", {
      documentId: paymentData.document_id,
      status: paymentData.status,
    });
    return { success: true, data };
  } catch (error) {
    logger.error("Failed to record payment", { message: error.message });
    return { success: false, error: error.message };
  }
};

const getPaymentByReference = async (upiTxnRef) => {
  if (!isSupabaseConfigured || !supabase) {
    logger.warn("Supabase not configured. Cannot get payment.");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("upi_txn_ref", upiTxnRef)
      .single();

    if (error && error.code === "PGRST116") {
      return null; // Not found
    }
    if (error) throw error;
    return data;
  } catch (error) {
    logger.error("Failed to get payment", { message: error.message });
    return null;
  }
};

const getPaymentsByDocumentId = async (documentId) => {
  if (!isSupabaseConfigured || !supabase) {
    logger.warn("Supabase not configured. Cannot get payments.");
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    logger.error("Failed to get payments for document", { message: error.message });
    return [];
  }
};

const verifyPayment = async (upiTxnRef) => {
  if (!isSupabaseConfigured || !supabase) {
    logger.warn("Supabase not configured. Cannot verify payment.");
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("payments")
      .update({
        status: "success",
        verified: true,
        verified_at: new Date().toISOString(),
      })
      .eq("upi_txn_ref", upiTxnRef)
      .select()
      .single();

    if (error && error.code !== "PGRST116") throw error;
    logger.info("Payment verified in Supabase", { upiTxnRef });
    return data || null;
  } catch (error) {
    logger.error("Failed to verify payment", { message: error.message });
    return null;
  }
};

const isDocumentPaidInDB = async (documentId) => {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("document_id", documentId)
      .eq("status", "success")
      .eq("verified", true)
      .limit(1);

    if (error) throw error;
    return (data && data.length > 0) || false;
  } catch (error) {
    logger.error("Failed to check document payment status", { message: error.message });
    return false;
  }
};

module.exports = {
  saveDocumentMetadata,
  saveUserInfo,
  storeGeneratedFileReference,
  recordPayment,
  getPaymentByReference,
  getPaymentsByDocumentId,
  verifyPayment,
  isDocumentPaidInDB,
};

