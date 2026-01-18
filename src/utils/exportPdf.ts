import { jsPDF } from "jspdf";
import type { Idea } from "../stores/ideasStore";
import type { Story, PrdMetadata } from "../stores/prdStore";

interface PdfExportOptions {
  idea: Idea;
  logoDataUrl?: string;
}

interface PrdPdfExportOptions {
  stories: Story[];
  metadata: PrdMetadata;
  projectName: string;
  logoDataUrl?: string;
}

/**
 * Load the Ideate logo as a data URL for embedding in PDFs.
 */
export async function loadLogoForPdf(): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } else {
        reject(new Error("Could not get canvas context"));
      }
    };
    img.onerror = () => reject(new Error("Failed to load logo"));
    img.src = "/icons/icon-transparent.png";
  });
}

/**
 * Export an idea to PDF format.
 * Returns a Blob that can be saved to a file.
 */
export function exportIdeaToPdf({ idea, logoDataUrl }: PdfExportOptions): Blob {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const colors = {
    primary: [34, 34, 34] as [number, number, number],
    secondary: [100, 100, 100] as [number, number, number],
    accent: [34, 197, 94] as [number, number, number],
    muted: [150, 150, 150] as [number, number, number],
    lightMuted: [180, 180, 180] as [number, number, number],
    border: [220, 220, 220] as [number, number, number],
  };

  // Indentation levels
  const bulletIndent = 4;
  const nestedBulletIndent = 8;

  // Helper to check if we need a new page
  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  };

  // Helper to wrap text and return lines
  const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(text, maxWidth);
  };

  // Helper to strip emojis (jsPDF can't render them)
  const stripEmojis = (text: string): string => {
    return text
      .replace(/[\u{1F600}-\u{1F64F}]/gu, "") // Emoticons
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, "") // Misc symbols & pictographs
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, "") // Transport & map symbols
      .replace(/[\u{1F700}-\u{1F77F}]/gu, "") // Alchemical symbols
      .replace(/[\u{1F780}-\u{1F7FF}]/gu, "") // Geometric shapes extended
      .replace(/[\u{1F800}-\u{1F8FF}]/gu, "") // Supplemental arrows-C
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, "") // Supplemental symbols & pictographs
      .replace(/[\u{1FA00}-\u{1FA6F}]/gu, "") // Chess symbols
      .replace(/[\u{1FA70}-\u{1FAFF}]/gu, "") // Symbols & pictographs extended-A
      .replace(/[\u{2600}-\u{26FF}]/gu, "") // Misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, "") // Dingbats
      .replace(/[\u{FE00}-\u{FE0F}]/gu, "") // Variation selectors
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "") // Flags
      .trim();
  };

  // Helper to clean text of markdown artifacts
  const cleanText = (text: string): string => {
    return stripEmojis(text
      .replace(/\*\*(.+?)\*\*/g, "$1") // Bold
      .replace(/\*(.+?)\*/g, "$1") // Italic
      .replace(/_(.+?)_/g, "$1") // Underscore italic
      .replace(/`(.+?)`/g, "$1") // Inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links - keep text
      .replace(/^#+\s*/, "")); // Leading hashes that weren't caught
  };

  // Add logo to top right
  if (logoDataUrl) {
    const logoSize = 22;
    const logoX = pageWidth - margin - logoSize;
    const logoY = margin - 15;
    doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoSize, logoSize);
    
    // Add "ideate.sh" text centered under logo
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...colors.lightMuted);
    const logoTextX = logoX + logoSize / 2;
    doc.text("ideate.sh", logoTextX, logoY + logoSize + 1.5, { align: "center" });
  }

  // Title (leave room for logo)
  const titleMaxWidth = logoDataUrl ? contentWidth - 25 : contentWidth;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...colors.primary);
  const titleLines = wrapText(stripEmojis(idea.title), titleMaxWidth, 24);
  titleLines.forEach((line: string) => {
    checkPageBreak(12);
    doc.text(line, margin, y);
    y += 10;
  });

  y += 4;

  // Accent line under title
  doc.setDrawColor(...colors.accent);
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin + 40, y);
  y += 10;

  // Summary
  if (idea.summary) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(12);
    doc.setTextColor(...colors.secondary);
    const summaryLines = wrapText(stripEmojis(idea.summary), contentWidth, 12);
    summaryLines.forEach((line: string) => {
      checkPageBreak(6);
      doc.text(line, margin, y);
      y += 6;
    });
    y += 8;
  }

  // Description
  if (idea.description) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...colors.primary);

    // Parse markdown content
    const lines = idea.description.split("\n");
    let inCodeBlock = false;
    let currentIndentLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Track leading whitespace for nested lists
      const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
      currentIndentLevel = Math.floor(leadingSpaces / 2);
      
      // Skip empty lines but add spacing
      if (!trimmedLine) {
        y += 3;
        continue;
      }

      // Code blocks
      if (trimmedLine.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        y += 2;
        continue;
      }

      if (inCodeBlock) {
        doc.setFont("courier", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...colors.secondary);
        const codeLines = wrapText(line, contentWidth - 10, 9);
        codeLines.forEach((codeLine: string) => {
          checkPageBreak(5);
          doc.text(codeLine, margin + 5, y);
          y += 4.5;
        });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        continue;
      }

      // H1 Headers
      if (trimmedLine.startsWith("# ") && !trimmedLine.startsWith("## ")) {
        checkPageBreak(16);
        y += 8;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.setTextColor(...colors.primary);
        const headerText = cleanText(trimmedLine.replace(/^#\s+/, ""));
        const headerLines = wrapText(headerText, contentWidth, 18);
        headerLines.forEach((hLine: string) => {
          doc.text(hLine, margin, y);
          y += 8;
        });
        y += 2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        continue;
      }

      // H2 Headers
      if (trimmedLine.startsWith("## ") && !trimmedLine.startsWith("### ")) {
        checkPageBreak(14);
        y += 6;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(...colors.primary);
        const headerText = cleanText(trimmedLine.replace(/^##\s+/, ""));
        const headerLines = wrapText(headerText, contentWidth, 14);
        headerLines.forEach((hLine: string) => {
          doc.text(hLine, margin, y);
          y += 6;
        });
        y += 1;
        // Add subtle line under h2
        doc.setDrawColor(...colors.border);
        doc.setLineWidth(0.3);
        doc.line(margin, y, margin + contentWidth, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        continue;
      }

      // H3 Headers
      if (trimmedLine.startsWith("### ")) {
        checkPageBreak(12);
        y += 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...colors.primary);
        const headerText = cleanText(trimmedLine.replace(/^###\s+/, ""));
        const headerLines = wrapText(headerText, contentWidth, 12);
        headerLines.forEach((hLine: string) => {
          doc.text(hLine, margin, y);
          y += 5.5;
        });
        y += 2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        continue;
      }

      // H4+ Headers
      if (trimmedLine.match(/^#{4,}\s+/)) {
        checkPageBreak(10);
        y += 4;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...colors.primary);
        const headerText = cleanText(trimmedLine.replace(/^#+\s+/, ""));
        const headerLines = wrapText(headerText, contentWidth, 11);
        headerLines.forEach((hLine: string) => {
          doc.text(hLine, margin, y);
          y += 5;
        });
        y += 2;
        doc.setFont("helvetica", "normal");
        continue;
      }

      // Bullet points (with nesting support)
      if (trimmedLine.match(/^[-*+]\s+/)) {
        const bulletText = cleanText(trimmedLine.replace(/^[-*+]\s+/, ""));
        const indent = margin + bulletIndent + (currentIndentLevel * nestedBulletIndent / 2);
        const textIndent = indent + 5;
        const availableWidth = contentWidth - (indent - margin) - 5;
        
        const bulletLines = wrapText(bulletText, availableWidth, 11);
        bulletLines.forEach((bLine: string, idx: number) => {
          checkPageBreak(6);
          if (idx === 0) {
            doc.setTextColor(...colors.accent);
            doc.text("•", indent, y);
            doc.setTextColor(...colors.primary);
          }
          doc.text(bLine, textIndent, y);
          y += 5.5;
        });
        continue;
      }

      // Numbered lists
      const numberedMatch = trimmedLine.match(/^(\d+)[.)]\s+(.+)$/);
      if (numberedMatch) {
        const num = numberedMatch[1];
        const listText = cleanText(numberedMatch[2]);
        const indent = margin + bulletIndent;
        const textIndent = indent + 6;
        const availableWidth = contentWidth - bulletIndent - 6;
        
        const listLines = wrapText(listText, availableWidth, 11);
        listLines.forEach((lLine: string, idx: number) => {
          checkPageBreak(6);
          if (idx === 0) {
            doc.setTextColor(...colors.muted);
            doc.text(`${num}.`, indent, y);
            doc.setTextColor(...colors.primary);
          }
          doc.text(lLine, textIndent, y);
          y += 5.5;
        });
        continue;
      }

      // Blockquotes
      if (trimmedLine.startsWith(">")) {
        const quoteText = cleanText(trimmedLine.replace(/^>\s*/, ""));
        checkPageBreak(8);
        
        doc.setFont("helvetica", "italic");
        doc.setFontSize(11);
        doc.setTextColor(...colors.secondary);
        
        const quoteLines = wrapText(quoteText, contentWidth - 15, 11);
        const quoteStartY = y;
        quoteLines.forEach((qLine: string) => {
          doc.text(qLine, margin + 10, y);
          y += 5.5;
        });
        
        // Draw accent bar on left
        doc.setDrawColor(...colors.accent);
        doc.setLineWidth(1);
        doc.line(margin + 5, quoteStartY - 3, margin + 5, y - 2);
        
        y += 2;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.primary);
        continue;
      }

      // Horizontal rules
      if (trimmedLine.match(/^[-*_]{3,}$/)) {
        checkPageBreak(8);
        y += 4;
        doc.setDrawColor(...colors.border);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + contentWidth, y);
        y += 6;
        continue;
      }

      // Regular paragraph
      const cleanedLine = cleanText(trimmedLine);
      const paraLines = wrapText(cleanedLine, contentWidth, 11);
      paraLines.forEach((pLine: string) => {
        checkPageBreak(6);
        doc.text(pLine, margin, y);
        y += 5.5;
      });
    }
  }

  // Footer with date on each page
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    const footerY = pageHeight - 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...colors.muted);
    
    const createdDate = new Date(idea.createdAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc.text(`Created: ${createdDate}`, margin, footerY);
    
    if (totalPages > 1) {
      doc.text(`Page ${page} of ${totalPages}`, pageWidth / 2, footerY, { align: "center" });
    }
    
    doc.text("Ideate", pageWidth - margin, footerY, { align: "right" });
  }

  return doc.output("blob");
}

/**
 * Export a PRD with user stories to PDF format.
 * Returns a Blob that can be saved to a file.
 */
export function exportPrdToPdf({ stories, metadata, projectName, logoDataUrl }: PrdPdfExportOptions): Blob {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const colors = {
    primary: [34, 34, 34] as [number, number, number],
    secondary: [100, 100, 100] as [number, number, number],
    accent: [34, 197, 94] as [number, number, number],
    muted: [150, 150, 150] as [number, number, number],
    success: [34, 197, 94] as [number, number, number],
    pending: [150, 150, 150] as [number, number, number],
    border: [220, 220, 220] as [number, number, number],
  };

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  };

  const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(text, maxWidth);
  };

  // Add logo to top right
  if (logoDataUrl) {
    const logoSize = 22;
    const logoX = pageWidth - margin - logoSize;
    const logoY = margin - 15;
    doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoSize, logoSize);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    const logoTextX = logoX + logoSize / 2;
    doc.text("ideate.sh", logoTextX, logoY + logoSize + 1.5, { align: "center" });
  }

  // Title
  const titleMaxWidth = logoDataUrl ? contentWidth - 25 : contentWidth;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...colors.primary);
  const title = metadata.project || projectName;
  const titleLines = wrapText(title, titleMaxWidth, 24);
  titleLines.forEach((line: string) => {
    checkPageBreak(12);
    doc.text(line, margin, y);
    y += 10;
  });

  y += 2;

  // Subtitle: Product Requirements Document
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...colors.secondary);
  doc.text("Product Requirements Document", margin, y);
  y += 8;

  // Accent line under title
  doc.setDrawColor(...colors.accent);
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin + 40, y);
  y += 10;

  // Description if available
  if (metadata.description) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(...colors.secondary);
    const descLines = wrapText(metadata.description, contentWidth, 11);
    descLines.forEach((line: string) => {
      checkPageBreak(6);
      doc.text(line, margin, y);
      y += 5.5;
    });
    y += 6;
  }

  // Summary stats
  const completedCount = stories.filter(s => s.passes).length;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...colors.muted);
  doc.text(`${stories.length} User Stories • ${completedCount} Complete`, margin, y);
  y += 12;

  // User Stories section header
  checkPageBreak(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...colors.primary);
  doc.text("User Stories", margin, y);
  y += 8;

  // Stories
  stories.forEach((story) => {
    checkPageBreak(35);
    
    // Story ID and status
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...colors.accent);
    doc.text(story.id, margin, y);
    
    // Status indicator
    const statusText = story.passes ? "Complete" : "Pending";
    const statusColor = story.passes ? colors.success : colors.pending;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...statusColor);
    const idWidth = doc.getTextWidth(story.id);
    doc.text(` • ${statusText}`, margin + idWidth, y);
    
    y += 6;

    // Story title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...colors.primary);
    const titleLines = wrapText(story.title, contentWidth, 11);
    titleLines.forEach((line: string) => {
      checkPageBreak(6);
      doc.text(line, margin, y);
      y += 5.5;
    });
    y += 2;

    // Story description
    if (story.description) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...colors.secondary);
      const descLines = wrapText(story.description, contentWidth, 10);
      descLines.slice(0, 4).forEach((line: string) => {
        checkPageBreak(5);
        doc.text(line, margin, y);
        y += 5;
      });
      y += 2;
    }

    // Acceptance criteria
    if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...colors.muted);
      doc.text("Acceptance Criteria:", margin, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...colors.secondary);
      story.acceptanceCriteria.forEach((criterion) => {
        checkPageBreak(5);
        const criteriaLines = wrapText(`• ${criterion}`, contentWidth - 5, 9);
        criteriaLines.forEach((line: string) => {
          doc.text(line, margin + 3, y);
          y += 4.5;
        });
      });
      y += 2;
    }

    // Draw card border
    const cardEndY = y;
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.3);
    doc.line(margin, cardEndY, margin + contentWidth, cardEndY);
    
    y += 6;
  });

  // Footer with date on each page
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    const footerY = pageHeight - 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...colors.muted);
    
    const today = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc.text(`Generated: ${today}`, margin, footerY);
    
    if (totalPages > 1) {
      doc.text(`Page ${page} of ${totalPages}`, pageWidth / 2, footerY, { align: "center" });
    }
    
    doc.text("Ideate", pageWidth - margin, footerY, { align: "right" });
  }

  return doc.output("blob");
}
