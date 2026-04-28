const { getGeminiClient } = require("../config/gemini");
const logger = require("../utils/logger");

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const documentJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    introduction: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          content: { type: "string" },
          paragraphs: {
            type: "array",
            items: { type: "string" },
          },
          bulletPoints: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["heading"],
      },
    },
    conclusion: { type: "string" },
  },
  required: ["title", "introduction", "sections", "conclusion"],
};

const cleanTitle = (title) => {
  if (typeof title !== "string") {
    return "";
  }

  let cleaned = title.replace(/^title\s*/i, "").trim();
  return cleaned;
};

const toCleanString = (value, fallback = "") => {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
};

const toStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const splitParagraphs = (rawText) =>
  rawText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const splitTextBlocks = (rawText) =>
  rawText
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

const splitBulletLines = (rawText) =>
  rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*\u2022]\s+/.test(line))
    .map((line) => line.replace(/^[-*\u2022]\s+/, "").trim())
    .filter(Boolean);

const splitSentences = (rawText) =>
  rawText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const chunkSentences = (sentences, chunkSize = 2) => {
  const chunks = [];

  for (let index = 0; index < sentences.length; index += chunkSize) {
    chunks.push(sentences.slice(index, index + chunkSize).join(" "));
  }

  return chunks.filter(Boolean);
};

const ACADEMIC_BLACKLIST_KEYWORDS = [
  "preview",
  "payment",
  "workflow",
  "draft is ready",
  "analysis",
  "main discussion",
];

const shouldRemoveAcademicLine = (line) => {
  const normalizedLine = line.toLowerCase().trim();

  if (!normalizedLine) {
    return false;
  }

  return ACADEMIC_BLACKLIST_KEYWORDS.some((keyword) =>
    normalizedLine.includes(keyword)
  );
};

const processPostPipelineStrictly = (
  document,
  allowedHeadings = [],
  payload = {}
) => {
  // STEP 1: Clean title
  let title = document.title || "";
  title = cleanTitle(title).trim();
  if (!title) {
    title =
      payload.title || `${payload.subject || "Generated"} Document`;
  }

  // STEP 2: Remove forbidden lines from all text fields
  const removeForbiddenLines = (text) => {
    if (!text) return text;
    return text
      .split("\n")
      .filter((line) => !shouldRemoveAcademicLine(line))
      .join("\n")
      .trim();
  };

  const cleanedIntroduction = removeForbiddenLines(
    document.introduction || ""
  );
  const cleanedConclusion = removeForbiddenLines(document.conclusion || "");

  // STEP 3: Filter sections to only include allowed headings
  let processedSections = Array.isArray(document.sections)
    ? document.sections
    : [];

  if (allowedHeadings.length > 0) {
    processedSections = filterSectionsByAllowedHeadings(
      processedSections,
      allowedHeadings
    );
  }

  // Clean sections content
  const cleanedSections = processedSections.map((section) => ({
    heading: section.heading,
    paragraphs: (section.paragraphs || [])
      .map((p) => removeForbiddenLines(p))
      .filter(Boolean),
    bulletPoints: (section.bulletPoints || [])
      .map((bp) => removeForbiddenLines(bp))
      .filter(Boolean),
  }));

  // STEP 4: Final clean text
  return {
    title,
    introduction: cleanedIntroduction,
    sections: cleanedSections.filter(
      (s) => s.paragraphs.length > 0 || s.bulletPoints.length > 0
    ),
    conclusion: cleanedConclusion,
  };
};

const buildPreviewText = (document) => {
  const parts = [document.introduction];

  document.sections.forEach((section) => {
    parts.push(section.heading);
    parts.push(...section.paragraphs);

    if (section.bulletPoints.length > 0) {
      parts.push(section.bulletPoints.map((point) => `- ${point}`).join("\n"));
    }
  });

  parts.push(document.conclusion);

  return parts.filter(Boolean).join("\n\n").trim();
};

const normalizeSectionParagraphs = (section) => {
  const directParagraphs = toStringArray(section.paragraphs);

  if (directParagraphs.length > 0) {
    return directParagraphs.map(stripUnwantedAcademicLeakage).filter(Boolean);
  }

  const content = stripUnwantedAcademicLeakage(toCleanString(section.content));

  if (!content) {
    return [];
  }

  return splitParagraphs(content);
};

const sanitizeHeading = (heading, fallback) => {
  const cleanedHeading = stripUnwantedAcademicLeakage(toCleanString(heading));

  if (!cleanedHeading) {
    return fallback;
  }

  if (cleanedHeading.toLowerCase() === "main discussion") {
    return fallback;
  }

  return cleanedHeading;
};

const normalizeStructuredDocument = (document, payload) => {
  const normalizedSections = Array.isArray(document.sections)
    ? document.sections
      .map((section, index) => ({
        heading: sanitizeHeading(section.heading, `Section ${index + 1}`),
        paragraphs: normalizeSectionParagraphs(section),
        bulletPoints: toStringArray(section.bulletPoints)
          .map(stripUnwantedAcademicLeakage)
          .filter(Boolean),
      }))
      .filter(
        (section) =>
          section.heading ||
          section.paragraphs.length > 0 ||
          section.bulletPoints.length > 0
      )
    : [];

  // Clean title first
  let cleanedTitle = cleanTitle(
    toCleanString(
      document.title,
      payload.title || `${payload.subject || "General"} Document`
    )
  );

  const safeDocument = {
    title: stripUnwantedAcademicLeakage(cleanedTitle),
    introduction: stripUnwantedAcademicLeakage(
      toCleanString(document.introduction)
    ),
    sections: normalizedSections,
    conclusion: stripUnwantedAcademicLeakage(toCleanString(document.conclusion)),
  };

  if (safeDocument.sections.length === 0) {
    const paragraphs = splitParagraphs(payload.rawText);

    safeDocument.sections = [
      {
        heading: payload.subject ? `${payload.subject} Analysis` : "Discussion",
        paragraphs: paragraphs.slice(1),
        bulletPoints: splitBulletLines(payload.rawText),
      },
    ];
  }

  if (!safeDocument.introduction) {
    safeDocument.introduction =
      splitParagraphs(payload.rawText)[0] ||
      "This document was generated from the submitted raw text.";
  }

  if (!safeDocument.conclusion) {
    safeDocument.conclusion =
      "The discussion above presents the core academic analysis in a clear and structured form.";
  }

  safeDocument.previewText = buildPreviewText(safeDocument);

  return safeDocument;
};

const buildFallbackDocument = (payload) => {
  const paragraphs = splitParagraphs(payload.rawText);
  const sentences = splitSentences(payload.rawText);
  const bulletPoints = splitBulletLines(payload.rawText);
  const bodyParagraphs =
    paragraphs.length > 1
      ? paragraphs.slice(1)
      : chunkSentences(sentences.slice(2), 2);

  const sections = [
    {
      heading: payload.subject ? `${payload.subject} Overview` : "Discussion",
      paragraphs:
        bodyParagraphs.length > 0
          ? bodyParagraphs.slice(0, 3)
          : [payload.rawText.trim()],
      bulletPoints: bulletPoints.slice(0, 5),
    },
  ];

  if (bodyParagraphs.length > 3) {
    sections.push({
      heading: "Additional Notes",
      paragraphs: bodyParagraphs.slice(3),
      bulletPoints: [],
    });
  }

  const fallbackDocument = {
    title: payload.title || `${payload.subject || "Generated"} Document`,
    introduction:
      paragraphs[0] ||
      chunkSentences(sentences.slice(0, 2), 2)[0] ||
      "This document was generated with the local fallback formatter.",
    sections,
    conclusion:
      "This document provides a structured academic summary based on the submitted content.",
  };

  fallbackDocument.previewText = buildPreviewText(fallbackDocument);

  return fallbackDocument;
};

const buildStandardPrompt = ({ title, rawText, subject, style }) => `
You are DocuGenie, an expert document formatter for polished academic and professional assignments.

Transform the raw text into a clean, readable document structure.
Rules:
- Keep the meaning of the original text.
- Improve grammar, clarity, and flow.
- Use a ${style} tone.
- Create helpful section headings.
- Use bullet points only when they make the content easier to read.
- Return valid JSON only.

Requested title: ${title || "Infer an appropriate title"}
Subject: ${subject || "General"}

JSON format:
{
  "title": "string",
  "introduction": "string",
  "sections": [
    {
      "heading": "string",
      "paragraphs": ["string"],
      "bulletPoints": ["string"]
    }
  ],
  "conclusion": "string"
}

Raw text:
${rawText}
`.trim();

const looksLikeHeading = (line) => {
  const normalizedLine = line.trim();

  if (!normalizedLine) {
    return false;
  }

  if (/^[-*\u2022]\s+/.test(normalizedLine)) {
    return false;
  }

  if (/[.!?]$/.test(normalizedLine)) {
    return false;
  }

  const wordCount = normalizedLine.split(/\s+/).filter(Boolean).length;
  return wordCount > 0 && wordCount <= 12;
};

const extractReferenceStructure = (referenceText) => {
  const blocks = splitTextBlocks(referenceText);
  const headings = [];
  const bulletHeadings = new Set();
  let currentHeading = null;

  blocks.forEach((block, index) => {
    const normalizedBlock = block.replace(/^#+\s*/, "").trim();
    const lines = normalizedBlock
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (index === 0) {
      return;
    }

    if (lines.length === 1 && looksLikeHeading(lines[0])) {
      currentHeading = lines[0];
      headings.push(currentHeading);
      return;
    }

    const hasBullets = lines.some((line) => /^[-*\u2022]\s+/.test(line));

    if (hasBullets && currentHeading) {
      bulletHeadings.add(currentHeading);
    }
  });

  return {
    headings,
    bulletHeadings: Array.from(bulletHeadings),
  };
};

const filterSectionsByAllowedHeadings = (sections, allowedHeadings) => {
  if (!Array.isArray(allowedHeadings) || allowedHeadings.length === 0) {
    return sections;
  }

  const normalizeHeading = (heading) =>
    heading
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, "");

  const normalizedAllowed = allowedHeadings.map(normalizeHeading);

  return sections.filter((section) => {
    const sectionHeading = normalizeHeading(section.heading || "");
    return normalizedAllowed.some(
      (allowed) =>
        allowed === sectionHeading || sectionHeading.includes(allowed)
    );
  });
};

const buildReferencePrompt = ({
  rawText,
  referenceText,
  instructions,
  referenceStructure,
}) => `
You are an expert academic writer.

USER CONTENT:
${rawText}

REFERENCE DOCUMENT:
${referenceText}

INSTRUCTIONS:
${instructions || "No additional instructions provided."}

TASK:

1. Extract headings from reference.
2. Use EXACT SAME headings in output.
3. Do NOT add new headings.
4. Expand user content into full academic text.
5. Minimum length: 400–700 words.
6. Maintain formal tone.
7. Use bullet points ONLY if present in reference.

STRICT RULES:
- No extra sections
- No system text
- No meta text
- No "Title", "Analysis", or "Main Discussion" sections
- Do NOT mention: preview, payment, workflow, draft is ready

Reference headings detected:
${referenceStructure.headings.length > 0 ? referenceStructure.headings.join(" | ") : "No explicit headings detected. Infer the exact structure directly from the reference document."}

Reference sections with bullets:
${referenceStructure.bulletHeadings.length > 0 ? referenceStructure.bulletHeadings.join(" | ") : "No bullet sections detected."}

OUTPUT FORMAT (STRICT):

Title

<Heading 1>
Paragraphs...

<Heading 2>
Paragraphs...

- Bullets if present

<Heading 3>
Paragraphs...
`.trim();

const stripUnwantedAcademicLeakage = (text) =>
  text
    .split("\n")
    .filter((line) => !shouldRemoveAcademicLine(line))
    .join("\n")
    .trim();

const isBulletBlock = (block) => {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    lines.length > 0 &&
    lines.every((line) => /^[-*\u2022]\s+/.test(line))
  );
};

const isHeadingBlock = (block) => {
  const normalizedBlock = block.replace(/^#+\s*/, "").trim();
  const lines = normalizedBlock.split("\n").map((line) => line.trim()).filter(Boolean);

  if (lines.length !== 1) {
    return false;
  }

  const line = lines[0];
  const wordCount = line.split(/\s+/).filter(Boolean).length;

  return !/^[-*\u2022]\s+/.test(line) && !/[.!?]$/.test(line) && wordCount <= 12;
};

const parseReferenceStructuredText = (responseText, payload, allowedHeadings = []) => {
  const blocks = splitTextBlocks(responseText);

  if (blocks.length === 0) {
    return normalizeStructuredDocument({}, payload);
  }

  const title = blocks[0];
  const sections = [];
  const introductionBlocks = [];
  const conclusionBlocks = [];
  let currentSection = null;
  let inConclusion = false;

  for (const block of blocks.slice(1)) {
    const normalizedBlock = block.replace(/^#+\s*/, "").trim();

    if (isHeadingBlock(block)) {
      if (/^conclusion$/i.test(normalizedBlock)) {
        currentSection = null;
        inConclusion = true;
        continue;
      }

      currentSection = {
        heading: normalizedBlock,
        paragraphs: [],
        bulletPoints: [],
      };
      sections.push(currentSection);
      inConclusion = false;
      continue;
    }

    if (isBulletBlock(block)) {
      const bullets = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^[-*\u2022]\s+/, "").trim())
        .filter(Boolean);

      if (currentSection) {
        currentSection.bulletPoints.push(...bullets);
      } else if (inConclusion) {
        conclusionBlocks.push(...bullets.map((bullet) => `- ${bullet}`));
      } else {
        introductionBlocks.push(...bullets.map((bullet) => `- ${bullet}`));
      }

      continue;
    }

    const normalizedParagraph = normalizedBlock.replace(/\n+/g, " ").trim();

    if (currentSection) {
      currentSection.paragraphs.push(normalizedParagraph);
    } else if (inConclusion) {
      conclusionBlocks.push(normalizedParagraph);
    } else {
      introductionBlocks.push(normalizedParagraph);
    }
  }

  const rawDocument = {
    title,
    introduction: introductionBlocks.join("\n\n"),
    sections,
    conclusion: conclusionBlocks.join("\n\n"),
  };

  // Apply strict post-processing pipeline
  const processedDocument = processPostPipelineStrictly(
    rawDocument,
    allowedHeadings,
    payload
  );

  return normalizeStructuredDocument(processedDocument, payload);
};

const generateJsonStructuredContent = async (geminiClient, prompt, payload) => {
  const fetchContent = async () => {
    const response = await geminiClient.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: documentJsonSchema,
      },
    });
    const responseText = typeof response.text === "function" ? response.text() : response.text;
    if (!responseText) throw new Error("Gemini returned an empty response.");
    return responseText;
  };

  const responseText = await pRetry(fetchContent, {
    retries: 3,
    onFailedAttempt: error => {
      logger.warn(`JSON generation attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
    }
  });

  const parsedDocument = JSON.parse(responseText);
  return normalizeStructuredDocument(parsedDocument, payload);
};

const pRetry = require('p-retry');

const generateReferenceStructuredContent = async (
  geminiClient,
  prompt,
  payload,
  referenceStructure
) => {
  const fetchContent = async () => {
    const response = await geminiClient.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
      config: { responseMimeType: "text/plain" },
    });
    const responseText = typeof response.text === "function" ? response.text() : response.text;
    if (!responseText) throw new Error("Gemini returned an empty reference response.");
    return responseText;
  };

  const responseText = await pRetry(fetchContent, {
    retries: 3,
    onFailedAttempt: error => {
      logger.warn(`Reference attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`);
    }
  });

  const cleanedResponseText = stripUnwantedAcademicLeakage(responseText);

  return parseReferenceStructuredText(
    cleanedResponseText,
    payload,
    referenceStructure.headings
  );
};

const formatDocumentWithAI = async (payload) => {
  const geminiClient = getGeminiClient();
  const hasReferenceText =
    typeof payload.referenceText === "string" &&
    payload.referenceText.trim().length > 0;

  if (!geminiClient) {
    const error = new Error("GEMINI_API_KEY is missing. Cannot format document.");
    error.statusCode = 500;
    throw error;
  }

  try {
    if (hasReferenceText) {
      const referenceStructure = extractReferenceStructure(payload.referenceText);
      const formattedDocument = await generateReferenceStructuredContent(
        geminiClient,
        buildReferencePrompt({ ...payload, referenceStructure }),
        payload,
        referenceStructure
      );
      return { provider: "gemini-reference", usedFallback: false, formattedDocument };
    }

    const formattedDocument = await generateJsonStructuredContent(
      geminiClient,
      buildStandardPrompt(payload),
      payload
    );
    return { provider: "gemini", usedFallback: false, formattedDocument };
  } catch (serviceError) {
    logger.error("Gemini formatting failed.", {
      model: DEFAULT_MODEL,
      message: serviceError.message,
    });

    const error = new Error(
      "Gemini AI could not format the document. Check your API key, model name, and request content."
    );
    error.statusCode = 502;
    error.details = serviceError.message;
    throw error;
  }
};

const countDocumentWords = (document = {}) => {
  const parts = [];
  if (typeof document.introduction === "string") {
    parts.push(document.introduction);
  }
  if (Array.isArray(document.sections)) {
    document.sections.forEach((section) => {
      if (typeof section.heading === "string") {
        parts.push(section.heading);
      }
      if (Array.isArray(section.paragraphs)) {
        parts.push(...section.paragraphs);
      }
      if (Array.isArray(section.bulletPoints)) {
        parts.push(...section.bulletPoints);
      }
    });
  }
  if (typeof document.conclusion === "string") {
    parts.push(document.conclusion);
  }
  return parts.join(" ").split(/\s+/).filter(Boolean).length;
};

const mergeExpansionIntoDocument = (baseDocument, expansionDocument) => {
  const merged = {
    ...baseDocument,
    sections: Array.isArray(baseDocument.sections) ? [...baseDocument.sections] : [],
  };

  if (Array.isArray(expansionDocument.sections) && expansionDocument.sections.length > 0) {
    expansionDocument.sections.forEach((incomingSection) => {
      const existing = merged.sections.find(
        (section) =>
          typeof section.heading === "string" &&
          typeof incomingSection.heading === "string" &&
          section.heading.toLowerCase().trim() === incomingSection.heading.toLowerCase().trim()
      );

      if (existing) {
        existing.paragraphs = [
          ...(Array.isArray(existing.paragraphs) ? existing.paragraphs : []),
          ...(Array.isArray(incomingSection.paragraphs) ? incomingSection.paragraphs : []),
        ].filter(Boolean);
        existing.bulletPoints = [
          ...(Array.isArray(existing.bulletPoints) ? existing.bulletPoints : []),
          ...(Array.isArray(incomingSection.bulletPoints) ? incomingSection.bulletPoints : []),
        ].filter(Boolean);
      } else {
        merged.sections.push({
          heading: incomingSection.heading || `Section ${merged.sections.length + 1}`,
          paragraphs: Array.isArray(incomingSection.paragraphs) ? incomingSection.paragraphs : [],
          bulletPoints: Array.isArray(incomingSection.bulletPoints) ? incomingSection.bulletPoints : [],
          level: incomingSection.level || 1,
        });
      }
    });
  }

  if (typeof expansionDocument.conclusion === "string" && expansionDocument.conclusion.trim()) {
    merged.conclusion = `${merged.conclusion || ""}\n\n${expansionDocument.conclusion}`.trim();
  }

  return normalizeStructuredDocument(merged, { rawText: merged.introduction || "" });
};

const continueDocumentToWordTarget = async ({
  document,
  payload,
  targetWords,
  minRatio = 0.9,
  maxAttempts = 6,
  onProgress,
}) => {
  if (!targetWords || targetWords < 200) {
    return { document, totalWords: countDocumentWords(document), attempts: 0, targetReached: false };
  }

  const geminiClient = getGeminiClient();
  if (!geminiClient) {
    return { document, totalWords: countDocumentWords(document), attempts: 0, targetReached: false };
  }

  let current = document;
  let currentWords = countDocumentWords(current);
  const minimumTarget = Math.floor(targetWords * minRatio);
  let attempts = 0;

  while (currentWords < minimumTarget && attempts < maxAttempts) {
    attempts += 1;
    const remaining = Math.max(targetWords - currentWords, 180);
    if (onProgress) {
      onProgress({
        message: `Extending content (${currentWords}/${targetWords} words)...`,
        currentWords,
        targetWords,
      });
    }

    const continuationPrompt = `
You are extending an academic document to reach a target length without changing its structure.
Current document title: ${current.title}
Target total words: ${targetWords}
Current total words: ${currentWords}
Need roughly ${remaining} more words.

Rules:
- Keep the same section headings and tone.
- Add substantial, non-repetitive academic paragraphs.
- Preserve citation style and structure.
- Do not remove existing content.
- Return valid JSON only with fields: title, introduction, sections, conclusion.

Current document JSON:
${JSON.stringify(current).slice(0, 18000)}
`.trim();

    const expansion = await generateJsonStructuredContent(geminiClient, continuationPrompt, payload);
    current = mergeExpansionIntoDocument(current, expansion);
    currentWords = countDocumentWords(current);
  }

  return {
    document: current,
    totalWords: currentWords,
    attempts,
    targetReached: currentWords >= minimumTarget,
  };
};

module.exports = {
  formatDocumentWithAI,
  continueDocumentToWordTarget,
  countDocumentWords,
};
