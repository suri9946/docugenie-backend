const { getGeminiClient } = require("../config/gemini");
const logger = require("../utils/logger");

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const WORDS_PER_PAGE = 300; // Standard book page

const detectPageCount = ({ title = "", rawText = "", instructions = "" }) => {
  const searchable = `${title} ${rawText} ${instructions}`.toLowerCase();

  const exactMatch = searchable.match(/(\d+)\s*(page|pag|pg)s?/);
  if (exactMatch) {
    const pages = parseInt(exactMatch[1], 10);
    if (pages > 0) return pages;
  }

  if (/(full|complete|entire)\s*(textbook|book|notes|guide)/.test(searchable)) return 500;
  if (/textbook|complete\s*notes|full\s*guide/.test(searchable)) return 800;

  return null;
};

const detectLanguage = ({ title = "", subject = "" }) => {
  const combined = `${title} ${subject}`.toLowerCase();
  if (/java|python|javascript|c\+\+|programming/.test(combined)) return "programming";
  if (/database|sql|dbms/.test(combined)) return "database";
  return "general";
};

const generateOutline = async (targetPages, { title, subject, rawText, instructions }) => {
  const targetWords = targetPages * WORDS_PER_PAGE;
  const chaptersCount = Math.ceil(targetPages / 50); // ~50 pages per chapter

  const prompt = `Generate a detailed table of contents and chapter outline for a ${targetPages}-page textbook about "${subject || title}".

The book should have approximately ${chaptersCount} chapters, each ~${Math.round(targetPages / chaptersCount)} pages.

User notes/input: ${rawText.slice(0, 500)}

Instructions: ${instructions || "Create a comprehensive, well-structured outline"}

Return ONLY a JSON object with this structure:
{
  "title": "Book Title",
  "totalPages": ${targetPages},
  "chapters": [
    {
      "number": 1,
      "title": "Chapter Title",
      "pageCount": 50,
      "sections": ["Section 1", "Section 2", "Section 3"],
      "keyTopics": ["topic1", "topic2"]
    }
  ]
}`;

  const gemini = getGeminiClient();
  const response = await gemini.generateContent({
    model: DEFAULT_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const responseText = response.response.text();
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to generate outline - invalid response format");
  }

  return JSON.parse(jsonMatch[0]);
};

const generateChapter = async (chapterNumber, chapterTitle, sections, pageCount, { subject, style, previousContext = "" }) => {
  const targetWords = pageCount * WORDS_PER_PAGE;

  const prompt = `Write Chapter ${chapterNumber}: "${chapterTitle}" for a textbook about "${subject}".

Sections to cover: ${sections.join(", ")}

Requirements:
- Approximately ${targetWords} words (${pageCount} pages at 300 words/page)
- Writing style: ${style || "formal academic"}
- Include definitions, examples, and explanations
- Divide into subsections matching the provided sections
${previousContext ? `- Context from previous chapters: ${previousContext.slice(0, 200)}...` : ""}
- Make content self-contained but reference previous chapters where relevant

Format output as JSON:
{
  "chapter": ${chapterNumber},
  "title": "Chapter Title",
  "sections": [
    {
      "heading": "Section Name",
      "paragraphs": ["paragraph 1", "paragraph 2"],
      "keyPoints": ["point 1", "point 2"]
    }
  ],
  "summary": "Chapter summary"
}`;

  const gemini = getGeminiClient();
  const response = await gemini.generateContent({
    model: DEFAULT_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const responseText = response.response.text();
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Failed to generate chapter ${chapterNumber}`);
  }

  return JSON.parse(jsonMatch[0]);
};

const generateBookChunked = async (config) => {
  const {
    title,
    subject,
    rawText,
    style,
    instructions,
    pageCount,
    onChapterGenerated,
  } = config;

  const targetPages = pageCount || detectPageCount({ title, rawText, instructions }) || 500;
  logger.info(`Generating ${targetPages}-page book in chunked mode`, { subject });

  // Step 1: Generate outline
  logger.info("Step 1: Generating outline");
  const outline = await generateOutline(targetPages, { title, subject, rawText, instructions });

  // Step 2: Generate chapters progressively
  const allChapters = [];
  let previousContext = "";

  for (const chapter of outline.chapters) {
    logger.info(`Step 2: Generating chapter ${chapter.number}/${outline.chapters.length}`);

    const generatedChapter = await generateChapter(
      chapter.number,
      chapter.title,
      chapter.sections,
      chapter.pageCount,
      { subject, style, previousContext }
    );

    allChapters.push(generatedChapter);
    previousContext = generatedChapter.summary;

    if (onChapterGenerated) {
      onChapterGenerated(generatedChapter);
    }
  }

  // Step 3: Merge chapters into complete document
  logger.info("Step 3: Merging chapters into document");
  const formattedDocument = mergeChaptersIntoDocument({
    title: outline.title || title,
    subject,
    chapters: allChapters,
    outline,
    rawText,
    style,
  });

  return formattedDocument;
};

const mergeChaptersIntoDocument = ({ title, subject, chapters, outline, rawText, style }) => {
  const sections = [];

  // Introduction
  sections.push({
    heading: "Introduction",
    level: 1,
    paragraphs: [
      `This comprehensive textbook covers ${subject || "the subject"} in detail across ${chapters.length} chapters.`,
      rawText.slice(0, 200),
      "This material has been carefully structured to provide progressive learning from foundational concepts to advanced topics.",
    ],
    bulletPoints: [],
  });

  // Chapters
  chapters.forEach((chapter) => {
    sections.push({
      heading: chapter.title,
      level: 1,
      paragraphs: [
        ...chapter.sections.map((section) => ({
          heading: section.heading,
          level: 2,
          paragraphs: section.paragraphs || [],
          bulletPoints: section.keyPoints || [],
        })),
      ].flat(),
      bulletPoints: chapter.summary ? [chapter.summary] : [],
    });

    if (chapter.sections) {
      chapter.sections.forEach((section) => {
        sections.push({
          heading: section.heading,
          level: 2,
          paragraphs: section.paragraphs || [],
          bulletPoints: section.keyPoints || [],
        });
      });
    }
  });

  // Conclusion
  sections.push({
    heading: "Conclusion",
    level: 1,
    paragraphs: [
      "This textbook has covered all major aspects of " + (subject || "the subject") + ".",
      "The knowledge gained from these chapters provides a solid foundation for further study and professional application.",
      "Continue to review, practice, and build upon these concepts.",
    ],
    bulletPoints: [],
  });

  return {
    title: title || `${subject || "Generated"} Textbook`,
    mode: "book",
    formatting: {
      academic: true,
      headingColor: null,
    },
    introduction: `Welcome to this comprehensive ${targetPages || chapters.length * 50}-page resource on ${subject}. This material is structured for progressive learning.`,
    sections,
    conclusion: "Thank you for studying this material. Apply your knowledge wisely.",
    metadata: {
      pageCount: outline?.totalPages || chapters.length * 50,
      chapterCount: chapters.length,
      style,
    },
  };
};

const getTwoPagePreviewFromBook = (document) => {
  let preview = "";

  if (document.introduction) {
    preview += document.introduction + "\n\n";
  }

  if (document.sections && document.sections.length > 0) {
    document.sections.slice(0, 3).forEach((section) => {
      if (section.heading) {
        preview += `${section.heading}\n`;
      }
      if (Array.isArray(section.paragraphs)) {
        preview += section.paragraphs.slice(0, 2).join("\n\n") + "\n\n";
      }
    });
  }

  const lines = preview.split("\n");
  const targetLines = 60; // ~2 pages
  return lines.slice(0, targetLines).join("\n");
};

module.exports = {
  generateBookChunked,
  mergeChaptersIntoDocument,
  getTwoPagePreviewFromBook,
  detectPageCount,
  detectLanguage,
  generateOutline,
  generateChapter,
  WORDS_PER_PAGE,
};
