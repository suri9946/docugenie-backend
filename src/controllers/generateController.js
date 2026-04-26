const path = require("path");
const { formatDocumentWithAI } = require("../services/aiService");
const { generateDocxFile } = require("../services/docxService");
const {
  applyReferenceTemplate,
  buildBookDocument,
  buildPreviewText,
  detectBookMode,
  extractReferenceTemplate,
  getTwoPagePreview,
} = require("../services/documentPlanningService");
const {
  saveGeneratedDocumentArtifacts,
} = require("../services/generatedDocumentService");
const {
  saveDocumentMetadata,
  storeGeneratedFileReference,
} = require("../services/supabaseService");

const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

const buildFallbackResponse = (rawText, metadata = {}) => ({
  success: true,
  data: {
    metadata: {
      documentId: `fallback-${Date.now()}`,
      title: "Generated Document",
      aiProvider: "fallback",
      usedFallback: true,
      generatedAt: new Date().toISOString(),
      ...metadata,
    },
    preview: rawText.slice(0, 800),
    locked: false,
    totalWords: countWords(rawText),
  },
});

const buildSafeFallbackDocument = ({ title, rawText, subject, style, template }) => {
  const document = {
    title: title || `${subject || "Generated"} Document`,
    mode: "standard",
    formatting: template?.formatting || {},
    introduction:
      "This document was generated with the safe local formatter because the AI provider was unavailable.",
    sections: [
      {
        heading: subject ? `${subject} Overview` : "Overview",
        level: 1,
        paragraphs: [
          rawText,
          "The content is preserved and organized into a readable academic structure so the user can still preview and download a valid document after payment.",
        ],
        bulletPoints: [
          `Writing style: ${style || "formal"}`,
          "Generated safely without interrupting the request.",
        ],
      },
      {
        heading: "Summary",
        level: 1,
        paragraphs: [rawText.slice(0, 800)],
        bulletPoints: [],
      },
      {
        heading: "References",
        level: 1,
        paragraphs: ["User-provided source text and optional uploaded reference template."],
        bulletPoints: [],
      },
    ],
    conclusion:
      "This fallback document keeps the workflow complete while preserving the submitted material.",
  };

  document.previewText = buildPreviewText(document);
  return document;
};

const generateDocument = async (req, res) => {
  try {
    console.log("[generate] incoming req.body:", req.body);

    const { title, rawText, instructions, subject, style } = req.body || {};

    let { referenceText } = req.body || {};

    if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
      return res.status(400).json({
        success: false,
        message: "Missing or empty 'rawText' in request body.",
      });
    }

    const normalizedRawText = rawText.trim();
    if (req.file && req.file.buffer) {
      referenceText = req.file.buffer.toString("utf8");
    }

    const appBaseUrl = (
      process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5000}`
    ).replace(/\/$/, "");

    const template = extractReferenceTemplate(referenceText, instructions);
    const bookMode = detectBookMode({
      title,
      rawText: normalizedRawText,
      instructions,
      subject,
    });

    console.log("[generate] before document generation", {
      bookMode,
      hasReferenceTemplate: template.headings.length > 0,
    });

    let aiResult;
    if (bookMode) {
      aiResult = {
        provider: "docugenie-book-generator",
        usedFallback: false,
        formattedDocument: buildBookDocument(
          {
            title,
            rawText: normalizedRawText,
            referenceText,
            instructions,
            subject,
            style,
          },
          template
        ),
      };
    } else {
      try {
        aiResult = await formatDocumentWithAI({
          title,
          rawText: normalizedRawText,
          referenceText,
          instructions,
          subject,
          style,
        });
      } catch (aiError) {
        console.error("Generate error:", aiError);
        aiResult = {
          provider: "safe-local-fallback",
          usedFallback: true,
          formattedDocument: buildSafeFallbackDocument({
            title,
            rawText: normalizedRawText,
            subject,
            style,
            template,
          }),
        };
      }
    }

    console.log("[generate] after Gemini response:", {
      provider: aiResult && aiResult.provider,
      usedFallback: Boolean(aiResult && aiResult.usedFallback),
      hasFormattedDocument: Boolean(aiResult && aiResult.formattedDocument),
    });

    if (!aiResult || !aiResult.formattedDocument) {
      console.error("Generate error:", new Error("AI returned no formatted document."));
      return res.status(200).json(buildFallbackResponse(normalizedRawText));
    }

    if (!bookMode && (template.headings.length > 0 || template.formatting.headingColor)) {
      aiResult.formattedDocument = applyReferenceTemplate(
        aiResult.formattedDocument,
        template
      );
    }

    if (!aiResult.formattedDocument.previewText) {
      aiResult.formattedDocument.previewText = buildPreviewText(
        aiResult.formattedDocument
      );
    }

    const fileResult = await generateDocxFile(aiResult.formattedDocument, {
      subject,
      formatting: aiResult.formattedDocument.formatting || template.formatting,
    });

    const documentId = path.parse(fileResult.fileName).name;
    const generatedAt = new Date().toISOString();
    const fullContentText =
      typeof aiResult.formattedDocument.previewText === "string" &&
      aiResult.formattedDocument.previewText.trim()
        ? aiResult.formattedDocument.previewText
        : normalizedRawText;

    const words = fullContentText.split(/\s+/).filter(Boolean);
    const totalWords = words.length;
    const locked = true;
    const preview = getTwoPagePreview(fullContentText);

    const metadata = {
      documentId,
      title: aiResult.formattedDocument.title,
      subject: subject || null,
      style,
      aiProvider: aiResult.provider,
      usedFallback: aiResult.usedFallback,
      mode: bookMode ? "book" : "standard",
      paid: false,
      templateApplied: template.headings.length > 0,
      generatedAt,
    };

    const fileLinks = {
      fileName: fileResult.fileName,
      relativePath: fileResult.relativePath,
      downloadUrl: `${appBaseUrl}/documents/${documentId}/download`,
      sizeInBytes: fileResult.sizeInBytes,
      detailsUrl: `${appBaseUrl}/documents/${documentId}`,
      previewUrl: `${appBaseUrl}/documents/${documentId}/preview`,
      directDownloadUrl: `${appBaseUrl}/documents/${documentId}/download`,
    };

    try {
      await saveGeneratedDocumentArtifacts({
        documentId,
        metadata,
        formattedPreview: fullContentText,
        lockedPreview: {
          isLocked: locked,
          visiblePreview: preview,
          message:
            "Preview locking is a placeholder for the future frontend + payment flow.",
        },
        structuredContent: aiResult.formattedDocument,
        file: fileLinks,
      });

      await saveDocumentMetadata({
        ...metadata,
        fileName: fileResult.fileName,
        filePath: fileResult.relativePath,
      });

      await storeGeneratedFileReference({
        documentId,
        fileName: fileResult.fileName,
        filePath: fileResult.relativePath,
        generatedAt,
      });
    } catch (saveError) {
      console.error("Generate error:", saveError);
    }

    return res.status(200).json({
      success: true,
      data: {
        metadata: {
          ...metadata,
          file: fileLinks,
        },
        preview,
        locked,
        totalWords,
      },
    });
  } catch (error) {
    console.error("Generate error:", error);
    const fallbackRawText =
      typeof req.body?.rawText === "string" ? req.body.rawText.trim() : "";

    if (fallbackRawText) {
      return res.status(200).json(buildFallbackResponse(fallbackRawText));
    }

    return res.status(400).json({
      success: false,
      message: "Missing or empty 'rawText' in request body.",
    });
  }
};

module.exports = {
  generateDocument,
};
