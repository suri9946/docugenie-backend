const path = require("path");
const { formatDocumentWithAI } = require("../services/aiService");
const {
  continueDocumentToWordTarget,
  countDocumentWords,
} = require("../services/aiService");
const { generateDocxFile } = require("../services/docxService");
const {
  applyReferenceTemplate,
  buildBookDocument,
  buildPreviewText,
  detectBookMode,
  extractReferenceTemplate,
} = require("../services/documentPlanningService");
const {
  generateBookChunked,
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
const getDocumentFullText = (document = {}) => {
  const parts = [];
  if (document.introduction) parts.push(document.introduction);
  if (Array.isArray(document.sections)) {
    document.sections.forEach((section) => {
      if (section.heading) parts.push(section.heading);
      if (Array.isArray(section.paragraphs)) parts.push(...section.paragraphs);
      if (Array.isArray(section.bulletPoints)) {
        parts.push(...section.bulletPoints.map((point) => `- ${point}`));
      }
    });
  }
  if (document.conclusion) parts.push(document.conclusion);
  return parts.filter(Boolean).join("\n\n").trim();
};

const parseTargetWords = (wordCountValue, customWordCountValue) => {
  const predefined = new Set([1000, 3000, 5000, 10000]);
  const parsedWordCount = Number(wordCountValue);
  const parsedCustom = Number(customWordCountValue);

  if (Number.isFinite(parsedWordCount) && predefined.has(parsedWordCount)) {
    return parsedWordCount;
  }
  if (
    Number.isFinite(parsedWordCount) &&
    parsedWordCount >= 300 &&
    parsedWordCount <= 50000
  ) {
    return parsedWordCount;
  }
  if (
    Number.isFinite(parsedCustom) &&
    parsedCustom >= 300 &&
    parsedCustom <= 50000
  ) {
    return parsedCustom;
  }
  return null;
};

const buildLockedPreviewFromFullText = (fullText, isLocked) => {
  const words = String(fullText || "").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (!isLocked) {
    return fullText;
  }

  const ratio = Math.min(0.5, Math.max(0.2, Number(process.env.LOCKED_PREVIEW_RATIO || 0.3)));
  const previewWords = Math.max(650, Math.floor(words.length * ratio));
  const visible = words.slice(0, previewWords).join(" ");
  return visible + (words.length > previewWords ? "\n\n...[Premium content hidden. Unlock to view full document]..." : "");
};

const generateDocument = async (req, res) => {
  const isSSE = req.headers.accept && req.headers.accept.includes("text/event-stream");

  if (isSSE) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (res.flushHeaders) res.flushHeaders();
  }

  const sendProgress = (message, data = {}) => {
    logger.info(`[generate] Progress: ${message}`);
    if (isSSE) {
      res.write(`data: ${JSON.stringify({ type: "progress", message, ...data })}\n\n`);
      if (res.flush) res.flush();
    }
  };

  const sendResult = (data) => {
    if (isSSE) {
      res.write(`data: ${JSON.stringify({ type: "success", data })}\n\n`);
      res.end();
    } else {
      res.status(200).json({ success: true, data });
    }
  };

  const sendError = (error, status = 500) => {
    logger.error("[generate] Failed", { message: error.message });
    if (isSSE) {
      res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
      res.end();
    } else {
      res.status(status).json({ success: false, message: error.message });
    }
  };

  try {
    sendProgress("Starting document generation...");
    const { title, rawText, instructions, subject, style, wordCount, customWordCount, generationMode } = req.body || {};
    let referenceText = req.body?.referenceText || "";
    let wordDocStructure = null;

    const normalizedRawText = typeof rawText === "string" ? rawText.trim() : "";

    if (req.file && req.file.buffer) {
      sendProgress("Parsing uploaded reference file...");
      try {
        const parsedDoc = await parseUploadedDocument(req.file.buffer, req.file.originalname);
        if (parsedDoc.type === "text" || parsedDoc.type === "doc" || parsedDoc.type === "docx") {
          referenceText = parsedDoc.content;
        }
        wordDocStructure = parsedDoc.structure;
        sendProgress(`Parsed ${parsedDoc.type} reference file successfully.`);
      } catch (parseError) {
        logger.error("[generate] Parse error", { message: parseError.message });
      }
    }
    if (!normalizedRawText && !referenceText.trim()) {
      return sendError(new Error("Provide rawText or upload a reference/template document."), 400);
    }

    const appBaseUrl = (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, "");
    const template = extractReferenceTemplate(referenceText, instructions);
    const targetWords = parseTargetWords(wordCount, customWordCount);
    const bookMode = detectBookMode({ title, rawText: normalizedRawText, instructions, subject });
    const targetPageCount = detectPageCount({ title, rawText: normalizedRawText, instructions });

    let aiResult;

    if (bookMode && targetPageCount) {
      sendProgress(`Detected book format: planning ${targetPageCount} pages...`);
      try {
        const bookDocument = await generateBookChunked({
          title, subject, rawText: normalizedRawText || referenceText, style, instructions, pageCount: targetPageCount,
          onChapterGenerated: (chapter) => sendProgress(`Generated Chapter ${chapter.chapter}: ${chapter.title}`)
        });
        aiResult = { provider: "docugenie-book-generator", usedFallback: false, formattedDocument: bookDocument };
      } catch (bookGenError) {
        throw new Error("Book generation failed: " + bookGenError.message);
      }
    } else {
      sendProgress("Generating standard structured document format...", { progress: 35 });
      aiResult = await formatDocumentWithAI({ title, rawText: normalizedRawText || referenceText, referenceText, instructions, subject, style });
    }

    if (!aiResult || !aiResult.formattedDocument) {
      throw new Error("AI failed to return formatted document.");
    }

    sendProgress("Applying templates and formatting...", { progress: 55 });
    if (!bookMode && (template.headings.length > 0 || template.formatting.headingColor)) {
      aiResult.formattedDocument = applyReferenceTemplate(aiResult.formattedDocument, template);
    }

    if (wordDocStructure) {
      aiResult.formattedDocument = applyDocumentAsTemplate({ structure: wordDocStructure }, aiResult.formattedDocument);
    }

    if (targetWords && !bookMode) {
      sendProgress(`Adjusting length towards ${targetWords} words...`, { progress: 70, targetWords });
      const continued = await continueDocumentToWordTarget({
        document: aiResult.formattedDocument,
        payload: {
          title,
          rawText: normalizedRawText,
          subject,
          style,
          instructions,
          generationMode,
        },
        targetWords,
        onProgress: (detail) =>
          sendProgress(detail.message, {
            progress: 75,
            currentWords: detail.currentWords,
            targetWords: detail.targetWords,
          }),
      });
      aiResult.formattedDocument = continued.document;
    }

    if (!aiResult.formattedDocument.previewText) {
      aiResult.formattedDocument.previewText = buildPreviewText(aiResult.formattedDocument);
    }

    sendProgress("Building final DOCX file representation...", { progress: 85 });
    const fileResult = await generateDocxFile(aiResult.formattedDocument, {
      subject, formatting: aiResult.formattedDocument.formatting || template.formatting,
    });

    const documentId = path.parse(fileResult.fileName).name;
    const generatedAt = new Date().toISOString();
    const fullContentText = getDocumentFullText(aiResult.formattedDocument) || normalizedRawText;

    const totalWords = countDocumentWords(aiResult.formattedDocument) || countWords(fullContentText);
    const estimatedPages = bookMode ? (targetPageCount || 500) : Math.ceil(totalWords / 300);
    const locked = estimatedPages > 5;
    const preview = buildLockedPreviewFromFullText(fullContentText, locked);

    const metadata = {
      documentId, title: aiResult.formattedDocument.title, subject: subject || null, style,
      aiProvider: aiResult.provider, usedFallback: aiResult.usedFallback, mode: bookMode ? "book" : "standard",
      paid: !locked, templateApplied: template.headings.length > 0, wordDocUsed: Boolean(wordDocStructure),
      targetPageCount, generatedAt, targetWords: targetWords || null, generationMode: generationMode || "draft",
    };

    const fileLinks = {
      fileName: fileResult.fileName, relativePath: fileResult.relativePath, downloadUrl: `${appBaseUrl}/api/download/${documentId}`,
      sizeInBytes: fileResult.sizeInBytes, detailsUrl: `${appBaseUrl}/api/documents/${documentId}`, previewUrl: `${appBaseUrl}/api/preview/${documentId}`,
    };

    try {
      await saveGeneratedDocumentArtifacts({
        documentId, metadata, formattedPreview: fullContentText,
        lockedPreview: { isLocked: locked, visiblePreview: preview, message: "Full document unlocks after payment verification." },
        structuredContent: aiResult.formattedDocument, file: fileLinks,
      });

      await saveDocumentMetadata({ ...metadata, fileName: fileResult.fileName, filePath: fileResult.relativePath });
      await storeGeneratedFileReference({ documentId, fileName: fileResult.fileName, filePath: fileResult.relativePath, generatedAt });
    } catch (saveError) {
      logger.error("[generate] failed to save artifacts", { message: saveError.message });
    }

    logger.info("[generate] document generated successfully", { documentId, mode: metadata.mode, totalWords, targetWords });

    sendProgress("Finalizing response...", { progress: 100, totalWords, targetWords });

    sendResult({
      metadata: { ...metadata, file: fileLinks },
      preview, locked, totalWords,
    });

  } catch (error) {
    sendError(error);
  }
};

module.exports = {
  generateDocument,
};
