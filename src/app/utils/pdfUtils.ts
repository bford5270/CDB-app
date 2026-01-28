/**
 * PDF Text Extraction Utility
 * Uses pdf.js to extract text from uploaded PDF files
 */

import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker - use the bundled worker from pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Extract text content from a PDF file
 * @param file - The PDF file to extract text from
 * @returns Promise resolving to the extracted text
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const textParts: string[] = [];
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Build text with position awareness for tabular data
      const items = textContent.items as Array<{
        str: string;
        transform: number[];
        width: number;
        height: number;
      }>;
      
      // Sort items by Y position (top to bottom), then X position (left to right)
      // Note: PDF Y coordinates increase upward, so we sort descending for top-to-bottom
      const sortedItems = items.sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5]; // Y position (descending)
        if (Math.abs(yDiff) > 5) return yDiff; // Different lines
        return a.transform[4] - b.transform[4]; // Same line, sort by X (ascending)
      });
      
      let lastY: number | null = null;
      let lineText = '';
      
      for (const item of sortedItems) {
        const currentY = item.transform[5];
        
        // Check if we're on a new line (Y position changed significantly)
        if (lastY !== null && Math.abs(currentY - lastY) > 5) {
          if (lineText.trim()) {
            textParts.push(lineText.trim());
          }
          lineText = '';
        }
        
        // Add space between items on the same line if there's a gap
        if (lineText && item.str.trim()) {
          lineText += ' ';
        }
        
        lineText += item.str;
        lastY = currentY;
      }
      
      // Don't forget the last line
      if (lineText.trim()) {
        textParts.push(lineText.trim());
      }
      
      // Add page separator
      if (pageNum < pdf.numPages) {
        textParts.push('--- PAGE BREAK ---');
      }
    }
    
    return textParts.join('\n');
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a file is a valid PDF
 * @param file - The file to check
 * @returns boolean indicating if file is a PDF
 */
export function isPDF(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
