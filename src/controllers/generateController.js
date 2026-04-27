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
  generateBookChunked,
  getTwoPagePreviewFromBook,
  detectPageCount,
} = require("../services/bookGenerationService");
const {
  parseUploadedDocument,
  applyDocumentAsTemplate,
} = require("../services/wordParsingService");
const {
  saveGeneratedDocumentArtifacts,
} = require("../services/generatedDocumentService");
const {
  saveDocumentMetadata,
  storeGeneratedFileReference,
} = require("../services/supabaseService");

const logger = require("../utils/logger");

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
    logger.info("[generate] incoming request", { hasFile: Boolean(req.file) });

    const { title, rawText, instructions, subject, style } = req.body || {};

    let referenceText = req.body?.referenceText || "";
    let wordDocStructure = null;

    if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
      return res.status(400).json({
        success: false,
        message: "Missing or empty 'rawText' in request body.",
      });
    }

    const normalizedRawText = rawText.trim();

    // Parse uploaded reference file (txt, doc, or docx)
    if (req.file && req.file.buffer) {
      logger.info("[generate] parsing uploaded reference file", {
        filename: req.file.originalname,
        size: req.file.size,
      });

      try {
        const parsedDoc = await parseUploadedDocument(
          req.file.buffer,
          req.file.originalname
        );

        if (parsedDoc.type === "text") {
          referenceText = parsedDoc.content;
        }

        wordDocStructure = parsedDoc.structure;
        logger.info("[generate] reference file parsed successfully", {
          type: parsedDoc.type,
        });
      } catch (parseError) {
        logger.error("[generate] failed to parse reference file", {
          message: parseError.message,
        });
        // Continue without the reference file
      }
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
    const targetPageCount = detectPageCount({
      title,
      rawText: normalizedRawText,
      instructions,
    });

    logger.info("[generate] document generation mode", {
      bookMode,
      targetPages: targetPageCount,
      hasReferenceTemplate: template.headings.length > 0,
      hasWordDocStructure: Boolean(wordDocStructure),
    });

    let aiResult;

    // Generate book in chunked mode if book mode is detected
    if (bookMode && targetPageCount) {
      logger.info("[generate] starting chunked book generation", { targetPages: targetPageCount });

      try {
        const bookDocument = await generateBookChunked({
          title,
          subject,
          rawText: normalizedRawText,
          style,
          instructions,
          pageCount: targetPageCount,
          onChapterGenerated: (chapter) => {
            logger.info("[generate] chapter generated", {
              chapter: chapter.chapter,
              title: chapter.title,
            });
          },
        });

        aiResult = {
          provider: "docugenie-book-generator",
          usedFallback: false,
          formattedDocument: bookDocument,
        };
      } catch (bookGenError) {
        logger.error("[generate] book generation failed", { message: bookGenError.message });
        // Fallback to standard generation
        bookMode = false;
      }
    }

    // Standard generation if not book mode or book generation failed
    if (!aiResult) {
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
        logger.error("[generate] AI formatting failed", { message: aiError.message });
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

    if (!aiResult || !aiResult.formattedDocument) {
      logger.error("[generate] no formatted document returned");
      return res.status(200).json(buildFallbackResponse(normalizedRawText));
    }

    // Apply reference template if available and not in book mode
    if (!bookMode && (template.headings.length > 0 || template.formatting.headingColor)) {
      aiResult.formattedDocument = applyReferenceTemplate(
        aiResult.formattedDocument,
        template
      );
    }

    // Apply Word document as template if available
    if (wordDocStructure) {
      aiResult.formattedDocument = applyDocumentAsTemplate(
        { structure: wordDocStructure },
        aiResult.formattedDocument
      );
    }

    // Build preview text
    if (!aiResult.formattedDocument.previewText) {
      if (bookMode) {
        aiResult.formattedDocument.previewText = getTwoPagePreviewFromBook(
          aiResult.formattedDocument
        );
      } else {
        aiResult.formattedDocument.previewText = buildPreviewText(
          aiResult.formattedDocument
        );
      }
    }

    // Generate DOCX file
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

    const totalWords = countWords(fullContentText);
    const estimatedPages = bookMode ? (targetPageCount || 500) : Math.ceil(totalWords / 300);
    const locked = estimatedPages > 5;
    const preview = getTwoPagePreview(fullContentText);

    const metadata = {
      documentId,
      title: aiResult.formattedDocument.title,
      subject: subject || null,
      style,
      aiProvider: aiResult.provider,
      usedFallback: aiResult.usedFallback,
      mode: bookMode ? "book" : "standard",
      paid: !locked,
      templateApplied: template.headings.length > 0,
      wordDocUsed: Boolean(wordDocStructure),
      targetPageCount,
      generatedAt,
    };

    const fileLinks = {
      fileName: fileResult.fileName,
      relativePath: fileResult.relativePath,
      downloadUrl: `${appBaseUrl}/download/${documentId}`,
      sizeInBytes: fileResult.sizeInBytes,
      detailsUrl: `${appBaseUrl}/documents/${documentId}`,
      previewUrl: `${appBaseUrl}/preview/${documentId}`,
    };

    try {
      await saveGeneratedDocumentArtifacts({
        documentId,
        metadata,
        formattedPreview: fullContentText,
        lockedPreview: {
          isLocked: locked,
          visiblePreview: preview,
          message: "Full document unlocks after payment verification.",
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
      logger.error("[generate] failed to save artifacts", { message: saveError.message });
    }

    logger.info("[generate] document generated successfully", {
      documentId,
      mode: metadata.mode,
      totalWords,
    });

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
    logger.error("[generate] unexpected error", { message: error.message });
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
