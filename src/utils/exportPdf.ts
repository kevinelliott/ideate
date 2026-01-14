import { jsPDF } from "jspdf";
import type { Idea } from "../stores/ideasStore";

interface PdfExportOptions {
  idea: Idea;
}

/**
 * Export an idea to PDF format.
 * Returns a Blob that can be saved to a file.
 */
export function exportIdeaToPdf({ idea }: PdfExportOptions): Blob {
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
    border: [220, 220, 220] as [number, number, number],
  };

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

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...colors.primary);
  const titleLines = wrapText(idea.title, contentWidth, 24);
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
    const summaryLines = wrapText(idea.summary, contentWidth, 12);
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

    // Parse markdown-ish content
    const lines = idea.description.split("\n");
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines but add spacing
      if (!trimmedLine) {
        y += 4;
        continue;
      }

      // Headers
      if (trimmedLine.startsWith("### ")) {
        checkPageBreak(12);
        y += 4;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(...colors.primary);
        const headerText = trimmedLine.replace(/^### /, "");
        doc.text(headerText, margin, y);
        y += 8;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        continue;
      }

      if (trimmedLine.startsWith("## ")) {
        checkPageBreak(14);
        y += 6;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(...colors.primary);
        const headerText = trimmedLine.replace(/^## /, "");
        doc.text(headerText, margin, y);
        y += 9;
        // Add subtle line under h2
        doc.setDrawColor(...colors.border);
        doc.setLineWidth(0.3);
        doc.line(margin, y, margin + contentWidth, y);
        y += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        continue;
      }

      if (trimmedLine.startsWith("# ")) {
        checkPageBreak(16);
        y += 8;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(...colors.primary);
        const headerText = trimmedLine.replace(/^# /, "");
        doc.text(headerText, margin, y);
        y += 10;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        continue;
      }

      // Bullet points
      if (trimmedLine.startsWith("- ") || trimmedLine.startsWith("* ")) {
        const bulletText = trimmedLine.replace(/^[-*] /, "");
        const bulletLines = wrapText(bulletText, contentWidth - 8, 11);
        bulletLines.forEach((bLine: string, i: number) => {
          checkPageBreak(6);
          if (i === 0) {
            doc.setTextColor(...colors.accent);
            doc.text("•", margin, y);
            doc.setTextColor(...colors.primary);
          }
          doc.text(bLine, margin + 6, y);
          y += 5.5;
        });
        continue;
      }

      // Numbered lists
      const numberedMatch = trimmedLine.match(/^(\d+)\. (.+)$/);
      if (numberedMatch) {
        const num = numberedMatch[1];
        const listText = numberedMatch[2];
        const listLines = wrapText(listText, contentWidth - 10, 11);
        listLines.forEach((lLine: string, i: number) => {
          checkPageBreak(6);
          if (i === 0) {
            doc.setTextColor(...colors.muted);
            doc.text(`${num}.`, margin, y);
            doc.setTextColor(...colors.primary);
          }
          doc.text(lLine, margin + 8, y);
          y += 5.5;
        });
        continue;
      }

      // Bold text (simple handling)
      let processedLine = trimmedLine.replace(/\*\*(.+?)\*\*/g, "$1");
      processedLine = processedLine.replace(/`(.+?)`/g, "$1");

      // Regular paragraph
      const paraLines = wrapText(processedLine, contentWidth, 11);
      paraLines.forEach((pLine: string) => {
        checkPageBreak(6);
        doc.text(pLine, margin, y);
        y += 5.5;
      });
    }
  }

  // Footer with date
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
  doc.text("Ideate", pageWidth - margin, footerY, { align: "right" });

  return doc.output("blob");
}
