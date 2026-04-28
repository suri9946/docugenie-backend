const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { getGeneratedDocumentRecord } = require("./generatedDocumentService");

const GENERATED_DIR = path.join(__dirname, "..", "..", "generated");

const buildTextFromStructuredDocument = (document = {}) => {
  const parts = [];
  if (document.title) parts.push(document.title);
  if (document.introduction) parts.push(`\nIntroduction\n${document.introduction}`);
  if (Array.isArray(document.sections)) {
    document.sections.forEach((section) => {
      if (section.heading) parts.push(`\n${section.heading}`);
      if (Array.isArray(section.paragraphs)) parts.push(...section.paragraphs);
      if (Array.isArray(section.bulletPoints)) {
        parts.push(...section.bulletPoints.map((point) => `- ${point}`));
      }
    });
  }
  if (document.conclusion) parts.push(`\nConclusion\n${document.conclusion}`);
  return parts.filter(Boolean).join("\n\n").trim();
};

const exportAsTxt = async (record) => {
  const content =
    record.formattedPreview || buildTextFromStructuredDocument(record.structuredContent);
  const fileName = `${record.documentId}.txt`;
  const absolutePath = path.join(GENERATED_DIR, fileName);
  await fsp.writeFile(absolutePath, content, "utf8");
  return { fileName, absolutePath };
};

const exportAsPdf = async (record) => {
  let PDFDocument;
  try {
    PDFDocument = require("pdfkit");
  } catch (error) {
    const dependencyError = new Error("PDF export dependency missing. Install pdfkit.");
    dependencyError.statusCode = 503;
    throw dependencyError;
  }

  const content =
    record.formattedPreview || buildTextFromStructuredDocument(record.structuredContent);
  const fileName = `${record.documentId}.pdf`;
  const absolutePath = path.join(GENERATED_DIR, fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(absolutePath);
    doc.pipe(stream);
    doc.font("Times-Roman").fontSize(12).text(content, {
      width: 500,
      align: "justify",
      lineGap: 4,
    });
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return { fileName, absolutePath };
};

const getDownloadInfoByFormat = async (documentId, format = "docx") => {
  const normalized = String(format || "docx").toLowerCase();
  const record = await getGeneratedDocumentRecord(documentId);

  if (normalized === "docx") {
    const absolutePath = path.join(GENERATED_DIR, record.file.fileName);
    try {
      await fsp.access(absolutePath);
    } catch (error) {
      const notFoundError = new Error("Generated DOCX file not found");
      notFoundError.statusCode = 404;
      throw notFoundError;
    }
    return {
      fileName: record.file.fileName,
      absolutePath,
    };
  }
  if (normalized === "txt") {
    return exportAsTxt(record);
  }
  if (normalized === "pdf") {
    return exportAsPdf(record);
  }

  const error = new Error("Unsupported export format");
  error.statusCode = 400;
  throw error;
};

module.exports = {
  getDownloadInfoByFormat,
  buildTextFromStructuredDocument,
};
