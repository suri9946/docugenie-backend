const fs = require("fs/promises");
const path = require("path");

const GENERATED_DIR = path.join(__dirname, "..", "..", "generated");

const buildNotFoundError = (documentId) => {
  const error = new Error(`Generated document '${documentId}' was not found.`);
  error.statusCode = 404;
  return error;
};

const getRecordPath = (documentId) =>
  path.join(GENERATED_DIR, `${documentId}.json`);

const getPreviewPath = (documentId) =>
  path.join(GENERATED_DIR, `${documentId}.txt`);

const saveGeneratedDocumentArtifacts = async ({
  documentId,
  metadata,
  formattedPreview,
  lockedPreview,
  structuredContent,
  file,
}) => {
  await fs.mkdir(GENERATED_DIR, { recursive: true });

  const record = {
    documentId,
    metadata,
    formattedPreview,
    lockedPreview,
    structuredContent,
    file: {
      ...file,
      previewTextPath: `/generated/${documentId}.txt`,
      recordPath: `/generated/${documentId}.json`,
    },
  };

  await Promise.all([
    fs.writeFile(getPreviewPath(documentId), formattedPreview, "utf8"),
    fs.writeFile(getRecordPath(documentId), JSON.stringify(record, null, 2), "utf8"),
  ]);

  return record;
};

const getGeneratedDocumentRecord = async (documentId) => {
  try {
    const rawRecord = await fs.readFile(getRecordPath(documentId), "utf8");
    return JSON.parse(rawRecord);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw buildNotFoundError(documentId);
    }

    throw error;
  }
};

const getGeneratedPreviewText = async (documentId) => {
  try {
    return await fs.readFile(getPreviewPath(documentId), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      const record = await getGeneratedDocumentRecord(documentId);
      return record.formattedPreview;
    }

    throw error;
  }
};

const getGeneratedDocumentDownloadInfo = async (documentId) => {
  const record = await getGeneratedDocumentRecord(documentId);
  const absolutePath = path.join(GENERATED_DIR, record.file.fileName);

  try {
    await fs.access(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw buildNotFoundError(documentId);
    }

    throw error;
  }

  return {
    fileName: record.file.fileName,
    absolutePath,
  };
};

const markGeneratedDocumentPaid = async (documentId) => {
  const record = await getGeneratedDocumentRecord(documentId);
  const updatedRecord = {
    ...record,
    metadata: {
      ...record.metadata,
      paid: true,
      paidAt: new Date().toISOString(),
    },
  };

  await fs.writeFile(
    getRecordPath(documentId),
    JSON.stringify(updatedRecord, null, 2),
    "utf8"
  );

  return updatedRecord;
};

const listGeneratedDocuments = async () => {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  const entries = await fs.readdir(GENERATED_DIR, { withFileTypes: true });

  const records = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) =>
        fs
          .readFile(path.join(GENERATED_DIR, entry.name), "utf8")
          .then((content) => JSON.parse(content))
      )
  );

  return records
    .sort(
      (left, right) =>
        new Date(right.metadata.generatedAt).getTime() -
        new Date(left.metadata.generatedAt).getTime()
    )
    .map((record) => ({
      documentId: record.documentId,
      title: record.metadata.title,
      subject: record.metadata.subject,
      style: record.metadata.style,
      aiProvider: record.metadata.aiProvider,
      generatedAt: record.metadata.generatedAt,
      fileName: record.file.fileName,
      previewSnippet: record.formattedPreview.slice(0, 180),
    }));
};

module.exports = {
  saveGeneratedDocumentArtifacts,
  getGeneratedDocumentRecord,
  getGeneratedPreviewText,
  getGeneratedDocumentDownloadInfo,
  markGeneratedDocumentPaid,
  listGeneratedDocuments,
};
