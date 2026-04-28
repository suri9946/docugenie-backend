const logger = require("../utils/logger");

// Simple Word document parser
// For .docx files, we can extract content using a library like docx-parser
// For .doc files (legacy), we'll need mammoth or similar
// For now, we'll provide structure extraction helpers

const parseWordStructure = (content) => {
  // Extract heading hierarchy and structure from text
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);

  const structure = {
    headings: [],
    sections: [],
    hierarchy: [],
    formatting: {},
  };

  let currentLevel = 0;
  let sectionCount = 0;

  lines.forEach((line) => {
    // Detect heading levels by markdown/common patterns
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    const numberedHeadingMatch = line.match(/^(\d+(?:\.\d+)*)\s+([A-Z].+)$/);
    const capitalHeadingMatch = line.match(/^([A-Z][A-Z\s]{5,})$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];

      structure.headings.push({
        level,
        text,
        index: structure.headings.length,
      });

      structure.sections.push({
        heading: text,
        level,
        content: [],
        subsections: [],
      });

      currentLevel = level;
    } else if (numberedHeadingMatch) {
      const numbering = numberedHeadingMatch[1];
      const text = numberedHeadingMatch[2];
      const level = numbering.split(".").length;

      structure.headings.push({
        level,
        text,
        numbering,
        index: structure.headings.length,
      });

      structure.sections.push({
        heading: text,
        level,
        numbering,
        content: [],
      });
    } else if (capitalHeadingMatch) {
      const text = capitalHeadingMatch[1];

      structure.headings.push({
        level: 1,
        text,
        isCapitalized: true,
        index: structure.headings.length,
      });

      structure.sections.push({
        heading: text,
        level: 1,
        content: [],
      });
    }
  });

  // Build hierarchy
  structure.hierarchy = buildHierarchy(structure.sections);

  return structure;
};

const buildHierarchy = (sections) => {
  const hierarchy = [];
  const stack = [];

  sections.forEach((section) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      hierarchy.push(section);
    } else {
      const parent = stack[stack.length - 1];
      if (!parent.subsections) parent.subsections = [];
      parent.subsections.push(section);
    }

    stack.push(section);
  });

  return hierarchy;
};

const extractDocxStructure = (buffer) => {
  // For .docx files (which are ZIP archives containing XML)
  // This is a placeholder - in production, you'd use a library like:
  // - docx (for reading docx)
  // - mammoth (for doc/docx parsing)

  try {
    // Try to detect if it's a valid docx file
    const isZip = buffer.toString("hex", 0, 4) === "504b0304";
    if (!isZip) {
      logger.warn("Uploaded file does not appear to be a valid DOCX file");
      return null;
    }

    // For now, return metadata about the file
    return {
      type: "docx",
      detectedFormat: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: buffer.length,
      note: "Full DOCX parsing requires docx library",
    };
  } catch (error) {
    logger.error("Failed to detect DOCX structure", { message: error.message });
    return null;
  }
};

const extractDocStructure = (buffer) => {
  // For legacy .doc files
  // This is a placeholder - would need mammoth or similar

  try {
    // Check for DOC file signature
    const isDoc = buffer.toString("hex", 0, 2) === "d0cf";
    if (!isDoc) {
      logger.warn("Uploaded file does not appear to be a valid DOC file");
      return null;
    }

    return {
      type: "doc",
      detectedFormat: "application/msword",
      size: buffer.length,
      note: "Full DOC parsing requires mammoth or similar library",
    };
  } catch (error) {
    logger.error("Failed to detect DOC structure", { message: error.message });
    return null;
  }
};

const officeParser = require('officeparser');
let pdfParse = null;
try {
  pdfParse = require("pdf-parse");
} catch (error) {
  logger.warn("pdf-parse not installed. PDF parsing disabled.");
}

const parseUploadedDocument = async (buffer, filename) => {
  const ext = filename.split(".").pop().toLowerCase();
  logger.info("Parsing uploaded document", { filename, extension: ext });

  if (ext === "txt") {
    const content = buffer.toString("utf8");
    return { type: "text", content, structure: parseWordStructure(content) };
  } else if (ext === "docx" || ext === "doc") {
    try {
      const content = await officeParser.parseOfficeAsync(buffer);
      return { type: ext, content, structure: parseWordStructure(content), buffer };
    } catch (e) {
      logger.error("Failed to parse " + ext, e);
      return { type: "unknown", error: "Failed to parse " + ext };
    }
  } else if (ext === "pdf") {
    if (!pdfParse) {
      return { type: "unknown", error: "PDF parsing dependency missing. Install pdf-parse." };
    }
    try {
      const parsedPdf = await pdfParse(buffer);
      const content = parsedPdf.text || "";
      return { type: "pdf", content, structure: parseWordStructure(content) };
    } catch (e) {
      logger.error("Failed to parse pdf", e);
      return { type: "unknown", error: "Failed to parse pdf" };
    }
  } else {
    logger.warn("Unsupported file format", { extension: ext });
    return { type: "unknown", error: `Unsupported format: ${ext}` };
  }
};

const applyDocumentAsTemplate = (parsedDoc, existingDocument) => {
  // Apply the structure from parsed document as template for generation

  if (!parsedDoc.structure) {
    return existingDocument;
  }

  const structure = parsedDoc.structure;

  // If the parsed document has sections, use them to structure the output
  if (structure.sections && structure.sections.length > 0) {
    return {
      ...existingDocument,
      template: {
        headings: structure.headings,
        sections: structure.sections,
        hierarchy: structure.hierarchy,
      },
      formatting: {
        ...existingDocument.formatting,
        ...structure.formatting,
      },
    };
  }

  return existingDocument;
};

module.exports = {
  parseWordStructure,
  extractDocxStructure,
  extractDocStructure,
  parseUploadedDocument,
  applyDocumentAsTemplate,
  buildHierarchy,
};
