const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const {
  AlignmentType,
  Document,
  Footer,
  Header,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  SectionType,
  TextRun,
  VerticalAlignSection,
} = require("docx");

const GENERATED_DIR = path.join(__dirname, "..", "..", "generated");
const FONT_FAMILY = "Times New Roman";
const COLORS = {
  text: "000000",
  heading: "1E40AF",
  muted: "475569",
  divider: "CBD5E1",
};
const STANDARD_MARGINS = {
  top: 1440,
  right: 1440,
  bottom: 1440,
  left: 1440,
};

const sanitizeFileName = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "document";

const createTextRun = (text, options = {}) =>
  new TextRun({
    text,
    font: FONT_FAMILY,
    color: COLORS.text,
    size: 24,
    noProof: true,
    ...options,
  });

const getFormatting = (options = {}) => ({
  headingColor:
    options.formatting?.headingColor ||
    options.headingColor ||
    COLORS.heading,
});

const createHeader = (title) =>
  new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          createTextRun(title, {
            size: 20,
            italics: true,
            color: COLORS.muted,
          }),
        ],
      }),
    ],
  });

const createFooter = () =>
  new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          createTextRun("Page ", {
            size: 20,
            color: COLORS.muted,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: FONT_FAMILY,
            size: 20,
            color: COLORS.muted,
            noProof: true,
          }),
        ],
      }),
    ],
  });

const createCoverSpacer = (after = 360) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after },
    children: [createTextRun("")],
  });

const createCoverPageParagraphs = (structuredDocument, options = {}) => {
  const subject = options.subject || "____________________";

  return [
    createCoverSpacer(520),
    createCoverSpacer(420),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [
        createTextRun(structuredDocument.title, {
          bold: true,
          size: 56,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 760 },
      children: [
        createTextRun(`Subject: ${subject}`, {
          italics: true,
          size: 28,
          color: COLORS.muted,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      children: [
        createTextRun("Name: ____________________", {
          size: 24,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      children: [
        createTextRun("Course: ____________________", {
          size: 24,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      children: [
        createTextRun("Date: ____________________", {
          size: 24,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      children: [new PageBreak()],
    }),
  ];
};

const createSectionDivider = () =>
  new Paragraph({
    spacing: { before: 80, after: 180 },
    border: {
      bottom: {
        color: COLORS.divider,
        space: 1,
        size: 6,
      },
    },
    children: [createTextRun("")],
  });

const createHeadingParagraph = (heading, formatting = {}) =>
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 260, after: 140 },
    keepNext: true,
    children: [
      createTextRun(heading, {
        bold: true,
        size: 32,
        color: formatting.headingColor || COLORS.heading,
      }),
    ],
  });

const createSubheadingParagraph = (heading, formatting = {}) =>
  new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 180, after: 100 },
    keepNext: true,
    children: [
      createTextRun(heading, {
        bold: true,
        size: 28,
        color: formatting.headingColor || COLORS.heading,
      }),
    ],
  });

const createBodyParagraph = (text) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 180, line: 360 },
    children: [createTextRun(text)],
  });

const createBulletParagraph = (text) =>
  new Paragraph({
    bullet: { level: 0 },
    indent: { left: 720, hanging: 360 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 360 },
    children: [createTextRun(text)],
  });

const createCodeParagraph = (code) =>
  new Paragraph({
    spacing: { before: 100, after: 160 },
    shading: {
      fill: "F8FAFC",
    },
    border: {
      top: { color: "CBD5E1", space: 1, size: 4 },
      bottom: { color: "CBD5E1", space: 1, size: 4 },
      left: { color: "CBD5E1", space: 1, size: 4 },
      right: { color: "CBD5E1", space: 1, size: 4 },
    },
    children: [
      new TextRun({
        text: code,
        font: "Courier New",
        size: 20,
        color: "0F172A",
        noProof: true,
      }),
    ],
  });

const createBodySectionParagraphs = (structuredDocument, options = {}) => {
  const formatting = getFormatting(options);
  const paragraphs = [
    createHeadingParagraph("Introduction", formatting),
    createBodyParagraph(structuredDocument.introduction),
    createSectionDivider(),
  ];

  structuredDocument.sections.forEach((section) => {
    const sectionParagraphs = Array.isArray(section.paragraphs)
      ? section.paragraphs
      : [];
    const sectionBulletPoints = Array.isArray(section.bulletPoints)
      ? section.bulletPoints
      : [];

    paragraphs.push(
      section.level && section.level > 1
        ? createSubheadingParagraph(section.heading, formatting)
        : createHeadingParagraph(section.heading, formatting)
    );

    if (sectionParagraphs.length > 0) {
      sectionParagraphs.forEach((paragraph, index) => {
        if (index === 0 && sectionParagraphs.length > 1) {
          paragraphs.push(createSubheadingParagraph("Discussion", formatting));
        }

        paragraphs.push(createBodyParagraph(paragraph));
      });
    }

    if (sectionBulletPoints.length > 0) {
      paragraphs.push(createSubheadingParagraph("Key Points", formatting));

      sectionBulletPoints.forEach((bulletPoint) => {
        paragraphs.push(createBulletParagraph(bulletPoint));
      });
    }

    if (Array.isArray(section.codeExamples) && section.codeExamples.length > 0) {
      paragraphs.push(createSubheadingParagraph("Code Examples", formatting));

      section.codeExamples.forEach((example) => {
        paragraphs.push(createBodyParagraph(`Language: ${example.language}`));
        paragraphs.push(createCodeParagraph(example.code));
      });
    }

    paragraphs.push(createSectionDivider());
  });

  paragraphs.push(
    createHeadingParagraph("Conclusion", formatting),
    createBodyParagraph(structuredDocument.conclusion)
  );

  return paragraphs;
};

const generateDocxFile = async (structuredDocument, options = {}) => {
  await fs.mkdir(GENERATED_DIR, { recursive: true });

  const fileBaseName = sanitizeFileName(structuredDocument.title);
  const fileName = `${fileBaseName}-${Date.now()}-${crypto
    .randomUUID()
    .slice(0, 8)}.docx`;
  const absolutePath = path.join(GENERATED_DIR, fileName);
  const header = createHeader(structuredDocument.title);
  const footer = createFooter();

  const document = new Document({
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            margin: STANDARD_MARGINS,
          },
          verticalAlign: VerticalAlignSection.CENTER,
        },
        headers: {
          default: header,
        },
        footers: {
          default: footer,
        },
        children: createCoverPageParagraphs(structuredDocument, options),
      },
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            margin: STANDARD_MARGINS,
          },
        },
        headers: {
          default: header,
        },
        footers: {
          default: footer,
        },
        children: createBodySectionParagraphs(structuredDocument, options),
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  await fs.writeFile(absolutePath, buffer);

  return {
    fileName,
    absolutePath,
    relativePath: `/generated/${fileName}`,
    sizeInBytes: buffer.length,
  };
};

module.exports = {
  generateDocxFile,
};
