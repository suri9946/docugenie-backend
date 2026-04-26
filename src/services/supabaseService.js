const { isSupabaseConfigured } = require("../config/supabase");
const logger = require("../utils/logger");

const buildPlaceholderResult = (operation, payload) => ({
  operation,
  saved: false,
  configured: isSupabaseConfigured,
  reason:
    "TODO: connect this placeholder to your Supabase tables or storage buckets.",
  payload,
});

const saveDocumentMetadata = async (metadata) => {
  logger.info("Supabase document metadata placeholder executed.", {
    configured: isSupabaseConfigured,
  });

  return buildPlaceholderResult("saveDocumentMetadata", metadata);
};

const saveUserInfo = async (userInfo) => {
  logger.info("Supabase user info placeholder executed.", {
    configured: isSupabaseConfigured,
  });

  return buildPlaceholderResult("saveUserInfo", userInfo);
};

const storeGeneratedFileReference = async (fileInfo) => {
  logger.info("Supabase file reference placeholder executed.", {
    configured: isSupabaseConfigured,
  });

  return buildPlaceholderResult("storeGeneratedFileReference", fileInfo);
};

module.exports = {
  saveDocumentMetadata,
  saveUserInfo,
  storeGeneratedFileReference,
};

