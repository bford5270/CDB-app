import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Cluster an array of X coordinates into column bands using a tolerance threshold.
// Returns the sorted list of band center X values.
function detectColumnBands(xValues: number[], tolerance = 15): number[] {
  if (xValues.length === 0) return [];
  const sorted = [...xValues].sort((a, b) => a - b);
  const bands: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const lastBand = bands[bands.length - 1];
    const bandCenter = lastBand.reduce((s, v) => s + v, 0) / lastBand.length;
    if (Math.abs(sorted[i] - bandCenter) <= tolerance) {
      lastBand.push(sorted[i]);
    } else {
      bands.push([sorted[i]]);
    }
  }
  return bands.map(b => b.reduce((s, v) => s + v, 0) / b.length);
}

// Assign an X value to the nearest column band index.
function assignToBand(x: number, bands: number[]): number {
  let nearest = 0;
  let minDist = Math.abs(x - bands[0]);
  for (let i = 1; i < bands.length; i++) {
    const d = Math.abs(x - bands[i]);
    if (d < minDist) { minDist = d; nearest = i; }
  }
  return nearest;
}

export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const textParts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items = textContent.items as Array<{
        str: string;
        transform: number[];
        width: number;
        height: number;
      }>;

      // Collect all X positions to detect column structure for this page.
      const allX = items.filter(i => i.str.trim()).map(i => i.transform[4]);
      const bands = detectColumnBands(allX);
      const isTabular = bands.length >= 3;

      // Sort top-to-bottom, left-to-right.
      const sorted = [...items].sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 5) return yDiff;
        return a.transform[4] - b.transform[4];
      });

      // Group items into Y-proximity rows.
      const rows: Array<typeof items> = [];
      let currentRow: typeof items = [];
      let lastY: number | null = null;

      for (const item of sorted) {
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 5) {
          if (currentRow.length > 0) rows.push(currentRow);
          currentRow = [];
        }
        currentRow.push(item);
        lastY = y;
      }
      if (currentRow.length > 0) rows.push(currentRow);

      // Emit each row. For tabular pages, use pipe-separated columns; otherwise join with spaces.
      for (const row of rows) {
        if (!row.some(i => i.str.trim())) continue;

        let line: string;
        if (isTabular) {
          const slots = new Array<string>(bands.length).fill('');
          for (const item of row) {
            if (!item.str.trim()) continue;
            const col = assignToBand(item.transform[4], bands);
            slots[col] = slots[col] ? slots[col] + ' ' + item.str.trim() : item.str.trim();
          }
          // Trim trailing empty columns, then join non-trivial rows.
          while (slots.length > 1 && !slots[slots.length - 1]) slots.pop();
          line = slots.join(' | ');
        } else {
          line = row.map(i => i.str).join(' ').trim();
        }

        if (line.trim()) textParts.push(line.trim());
      }

      if (pageNum < pdf.numPages) textParts.push('--- PAGE BREAK ---');
    }

    return textParts.join('\n');
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Read the raw PDF bytes and return them as a base64 string for the Anthropic
// native PDF document API. Bypasses pdf.js entirely — no text extraction needed.
export async function extractBase64FromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  // Process in 8KB chunks to avoid call-stack limits on large PDFs.
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function isPDF(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
