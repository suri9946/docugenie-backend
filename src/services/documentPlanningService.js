const BOOK_MODE_KEYWORDS = [
  "full notes",
  "book",
  "all topics",
  "many pages",
  "textbook",
  "complete guide",
];

const PROGRAMMING_KEYWORDS = [
  "programming",
  "javascript",
  "java",
  "python",
  "c++",
  "c#",
  "node",
  "react",
  "html",
  "css",
  "sql",
  "algorithm",
  "data structure",
];

const COLOR_MAP = {
  red: "DC2626",
  blue: "1E40AF",
  green: "15803D",
  purple: "7E22CE",
  black: "000000",
  gray: "475569",
  grey: "475569",
};

const splitSentences = (text) =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const toTitleCase = (value) =>
  value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));

const detectBookMode = ({ title = "", rawText = "", instructions = "", subject = "" }) => {
  const searchable = `${title} ${rawText} ${instructions} ${subject}`.toLowerCase();
  return BOOK_MODE_KEYWORDS.some((keyword) => searchable.includes(keyword));
};

const detectProgrammingSubject = ({ title = "", rawText = "", instructions = "", subject = "" }) => {
  const searchable = `${title} ${rawText} ${instructions} ${subject}`.toLowerCase();
  return PROGRAMMING_KEYWORDS.some((keyword) => searchable.includes(keyword));
};

const extractInstructionFormatting = (instructions = "") => {
  const formatting = {
    headingColor: null,
    academic: /academic|assignment|university|college|formal/i.test(instructions),
  };

  const headingColorMatch = instructions.match(/headings?\s+(?:in|as|should be|must be)?\s*(red|blue|green|purple|black|gray|grey)/i);
  const allHeadingsColorMatch = instructions.match(/all\s+headings?\s+(?:in|as|should be|must be)?\s*(red|blue|green|purple|black|gray|grey)/i);
  const colorName = (allHeadingsColorMatch || headingColorMatch)?.[1]?.toLowerCase();

  if (colorName) {
    formatting.headingColor = COLOR_MAP[colorName] || null;
  }

  return formatting;
};

const inferLevel = (line) => {
  if (/^\s*(chapter|unit)\s+\d+/i.test(line)) return 1;
  if (/^\s*\d+\.\s+/.test(line)) return 1;
  if (/^\s*\d+\.\d+\s+/.test(line)) return 2;
  if (/^\s*\d+\.\d+\.\d+\s+/.test(line)) return 3;
  if (/^[A-Z][A-Z\s]{6,}$/.test(line)) return 1;
  return 2;
};

const extractReferenceTemplate = (referenceText = "", instructions = "") => {
  const lines = referenceText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const headings = [];
  const numbering = [];

  lines.forEach((line) => {
    const withoutMarkdown = line.replace(/^#+\s*/, "");
    const numbered = withoutMarkdown.match(/^((?:\d+\.)+\d*|[A-Z]\.|[IVX]+\.)\s+(.+)/i);
    const looksLikeHeading =
      /^#+\s+/.test(line) ||
      numbered ||
      /^(chapter|unit|module|part|section)\s+\d+/i.test(withoutMarkdown) ||
      (withoutMarkdown.length <= 90 &&
        !/[.!?]$/.test(withoutMarkdown) &&
        withoutMarkdown.split(/\s+/).length <= 12);

    if (looksLikeHeading) {
      headings.push({
        text: numbered ? numbered[2].trim() : withoutMarkdown,
        level: inferLevel(withoutMarkdown),
        numbering: numbered ? numbered[1] : null,
      });
      if (numbered) numbering.push(numbered[1]);
    }
  });

  return {
    headings,
    numbering,
    hasBullets: lines.some((line) => /^[-*•]\s+/.test(line)),
    formatting: extractInstructionFormatting(instructions),
    writingPattern:
      lines.join(" ").split(/\s+/).filter(Boolean).length > 800
        ? "long-form"
        : "concise-structured",
  };
};

const buildParagraph = (topic, subject, seedSentences, index) => {
  const seed = seedSentences[index % Math.max(seedSentences.length, 1)] || topic;
  return `${topic} is an important part of ${subject}. ${seed} In textbook study, this topic should be understood through definitions, purpose, process, examples, advantages, limitations, and practical applications. A learner should first identify the core idea, then connect it with related concepts, and finally apply it through exercises or real scenarios.`;
};

const buildCodeExample = (topic, subject) => {
  const lower = `${topic} ${subject}`.toLowerCase();
  if (lower.includes("python")) {
    return {
      language: "python",
      code: `def explain_${topic.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "topic"}():\n    concept = "${topic}"\n    print(f"Learning {concept} step by step")\n\nexplain_topic = explain_${topic.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "topic"}\nexplain_topic()`,
    };
  }

  return {
    language: "javascript",
    code: `function explainTopic(topic) {\n  const steps = ['definition', 'example', 'practice'];\n  return steps.map((step) => \`\${topic}: \${step}\`);\n}\n\nconsole.log(explainTopic('${topic.replace(/'/g, "\\'")}'));`,
  };
};

const buildBookDocument = (payload, template = extractReferenceTemplate(payload.referenceText, payload.instructions)) => {
  const subject = payload.subject || payload.title || "DocuGenie Study Material";
  const title = payload.title || `Complete Guide to ${subject}`;
  const seedSentences = splitSentences(payload.rawText);
  const programming = detectProgrammingSubject(payload);
  const templateHeadings = template.headings.map((heading) => heading.text).filter(Boolean);
  const fallbackTopics = [
    "Foundations and Scope",
    "Core Concepts",
    "Important Terminology",
    "Detailed Explanations",
    "Practical Applications",
    "Worked Examples",
    "Common Mistakes",
    "Review and Practice",
  ];
  const topics = (templateHeadings.length > 0 ? templateHeadings : fallbackTopics).slice(0, 14);

  const sections = [
    {
      heading: "Table of Contents",
      level: 1,
      paragraphs: topics.map((topic, index) => `Chapter ${index + 1}: ${topic}`),
      bulletPoints: [],
    },
  ];

  topics.forEach((topic, index) => {
    const chapterNumber = index + 1;
    sections.push({
      heading: `Chapter ${chapterNumber}: ${topic}`,
      level: 1,
      paragraphs: [
        buildParagraph(topic, subject, seedSentences, index),
        `This chapter progresses from basic understanding to application. It explains ${topic.toLowerCase()} in a way suitable for exam preparation, classroom notes, and self-study. Key ideas are repeated with context so the reader can revise quickly and still retain conceptual depth.`,
        `In academic writing, ${topic.toLowerCase()} should be connected to definitions, causes, effects, procedures, and outcomes. This helps transform short notes into a complete textbook-style explanation rather than a brief essay.`,
      ],
      bulletPoints: [
        `Define ${topic} clearly before using advanced terms.`,
        `Connect ${topic} with the broader subject of ${subject}.`,
        `Use examples to verify understanding.`,
      ],
    });

    sections.push({
      heading: `Unit ${chapterNumber}.1: Topic-by-Topic Explanation`,
      level: 2,
      paragraphs: [
        `${topic} can be divided into smaller learning units. Each unit should include the meaning of the concept, why it matters, how it works, and where it is applied. This structure creates complete notes that are useful for long-form study.`,
        `A strong answer on ${topic.toLowerCase()} should include introduction, explanation, diagram or example where possible, advantages, limitations, and conclusion. This progression makes the document suitable as a guide or book chapter.`,
      ],
      bulletPoints: [],
    });

    sections.push({
      heading: `Unit ${chapterNumber}.2: Examples`,
      level: 2,
      paragraphs: [
        `Example 1: Consider a learner studying ${topic.toLowerCase()} for the first time. The learner begins with definitions, identifies main features, compares the concept with related topics, and then solves short questions.`,
        `Example 2: In a real academic assignment, ${topic.toLowerCase()} can be explained with a case study, a process flow, or a practical scenario. This improves clarity and makes the document more useful than a summary.`,
      ],
      bulletPoints: [],
      codeExamples: programming ? [buildCodeExample(topic, subject)] : [],
    });

    sections.push({
      heading: `Unit ${chapterNumber}.3: Exercises`,
      level: 2,
      paragraphs: [],
      bulletPoints: [
        `Write a short note on ${topic}.`,
        `Explain the importance of ${topic} in ${subject}.`,
        `List two examples and two limitations related to ${topic}.`,
        `Prepare a five-point revision summary for ${topic}.`,
      ],
    });
  });

  sections.push({
    heading: "Summary",
    level: 1,
    paragraphs: [
      `This guide presented ${subject} as a structured long-form learning document. It moved chapter by chapter through foundations, explanations, examples, and exercises so the final output behaves like textbook notes rather than a short essay.`,
    ],
    bulletPoints: topics.slice(0, 8).map((topic) => `${topic} was explained with academic progression and practice points.`),
  });

  sections.push({
    heading: "References",
    level: 1,
    paragraphs: [
      "Class notes, standard textbooks, instructor-provided reference material, and the uploaded template structure were used as the formatting and organization basis for this generated document.",
    ],
    bulletPoints: [],
  });

  const document = {
    title,
    mode: "book",
    formatting: template.formatting,
    introduction: `This book-style document provides complete notes on ${subject}. It is organized with a cover page, table of contents, chapters, units, examples, exercises, summary, and references. The content follows a textbook tone and expands the submitted material into a structured guide.`,
    sections,
    conclusion: `The document concludes with a complete academic overview of ${subject}, supporting both revision and deeper study.`,
  };

  document.previewText = buildPreviewText(document);
  return document;
};

const applyReferenceTemplate = (document, template) => {
  if (!template.headings.length) {
    return {
      ...document,
      formatting: {
        ...(document.formatting || {}),
        ...template.formatting,
      },
    };
  }

  const sourceSections = Array.isArray(document.sections) ? document.sections : [];
  const sections = template.headings.map((heading, index) => {
    const source = sourceSections[index % Math.max(sourceSections.length, 1)] || {};
    return {
      heading: heading.numbering ? `${heading.numbering} ${heading.text}` : heading.text,
      level: heading.level,
      paragraphs:
        Array.isArray(source.paragraphs) && source.paragraphs.length > 0
          ? source.paragraphs
          : [buildParagraph(heading.text, document.title, splitSentences(document.previewText || document.introduction || ""), index)],
      bulletPoints: template.hasBullets
        ? source.bulletPoints || [`Key point for ${heading.text}`, `Application of ${heading.text}`]
        : source.bulletPoints || [],
      codeExamples: source.codeExamples || [],
    };
  });

  const templatedDocument = {
    ...document,
    formatting: {
      ...(document.formatting || {}),
      ...template.formatting,
    },
    sections,
  };

  templatedDocument.previewText = buildPreviewText(templatedDocument);
  return templatedDocument;
};

const buildPreviewText = (document) => {
  const parts = [document.title, document.introduction];

  document.sections.forEach((section) => {
    parts.push(section.heading);
    parts.push(...(section.paragraphs || []));
    if (section.bulletPoints?.length) {
      parts.push(section.bulletPoints.map((point) => `- ${point}`).join("\n"));
    }
    if (section.codeExamples?.length) {
      section.codeExamples.forEach((example) => {
        parts.push(`Code Example (${example.language})\n${example.code}`);
      });
    }
  });

  parts.push("Conclusion", document.conclusion);
  return parts.filter(Boolean).join("\n\n").trim();
};

const getTwoPagePreview = (text) => {
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, 650).join(" ") + (words.length > 650 ? "..." : "");
};

module.exports = {
  applyReferenceTemplate,
  buildBookDocument,
  buildPreviewText,
  detectBookMode,
  detectProgrammingSubject,
  extractReferenceTemplate,
  getTwoPagePreview,
};
