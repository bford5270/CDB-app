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

// One FITREP's promotion recommendation, read deterministically from the PSR's
// geometry (start/end ISO dates + the recommendation derived from the X-mark's
// column position).
export interface PSRPromotionRec {
  start: string;            // ISO YYYY-MM-DD
  end: string;              // ISO YYYY-MM-DD
  rec: 'EP' | 'MP' | 'P' | 'PR' | 'SP' | 'NOB';
}

function mmddyyToISO(s: string): string | null {
  if (!/^\d{6}$/.test(s)) return null;
  const mm = +s.slice(0, 2), dd = +s.slice(2, 4), yy = +s.slice(4, 6);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = yy <= 50 ? 2000 + yy : 1900 + yy;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// Extract the promotion recommendation for every FITREP row in a PSR directly
// from the PDF geometry. The recommendation is encoded only by the horizontal
// position of an "X" mark inside the SP|PR|P|MP|EP grid — a spatial signal that
// the vision model reads unreliably (it tends to default to "P" or grab the
// adjacent PRT letter). Reading the X's column deterministically is exact.
//
// PSR row layout (one FITREP = three text lines at the same x columns):
//   line A: station, START date, RS name, ind avg, RS count, X-mark, PRT letter
//   line B: payGrade, months, RS payGrade, 5 trait counts
//   line C: station cont., END date, RS initials, running avg, RSCA, type code
// The X-mark sits on line A (same y as the START date); the PRT letter (~x728)
// anchors line A and the report-type code (~x762) anchors line C.
//
// Returns [] on any non-PSR / unrecognized layout so callers degrade gracefully.
export async function extractPSRPromotionRecs(file: File): Promise<PSRPromotionRec[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const recs: PSRPromotionRec[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const tc = await page.getTextContent();
      const items = (tc.items as Array<{ str: string; transform: number[] }>)
        .map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }))
        .filter(i => i.s);

      // Header column centers. SP/PR/MP/EP appear ONLY in the header row, so the
      // first (and only) occurrence of each is the column center. The "P" header
      // is a lone "P" that also occurs as the PRT letter in data rows, so derive
      // the P column as the midpoint of the evenly-spaced PR and MP columns.
      const hdr: Record<string, number> = {};
      for (const it of items) {
        if ((it.s === 'SP' || it.s === 'PR' || it.s === 'MP' || it.s === 'EP') && hdr[it.s] === undefined) {
          hdr[it.s] = it.x;
        }
      }
      if (hdr.SP === undefined || hdr.PR === undefined || hdr.MP === undefined || hdr.EP === undefined) {
        continue; // not a recognizable PSR promotion grid on this page
      }
      const cols: Array<[PSRPromotionRec['rec'], number]> = [
        ['SP', hdr.SP], ['PR', hdr.PR], ['P', (hdr.PR + hdr.MP) / 2], ['MP', hdr.MP], ['EP', hdr.EP],
      ];
      const colOf = (x: number): PSRPromotionRec['rec'] =>
        cols.reduce((best, c) => (Math.abs(c[1] - x) < Math.abs(best[1] - x) ? c : best))[0];

      // Group items into FITREP bands: the three sub-lines of one report are ~5pt
      // apart while consecutive reports are ~20pt apart, so a >14pt y-gap starts a
      // new band. (Sign of y is irrelevant — grouping is gap-based.)
      const sorted = [...items].sort((a, b) => a.y - b.y);
      const bands: Array<typeof sorted> = [];
      let cur: typeof sorted = [];
      let lastY: number | null = null;
      for (const it of sorted) {
        if (lastY !== null && Math.abs(it.y - lastY) > 14) { if (cur.length) bands.push(cur); cur = []; }
        cur.push(it);
        lastY = it.y;
      }
      if (cur.length) bands.push(cur);

      for (const band of bands) {
        const dates = band.filter(i => /^\d{6}$/.test(i.s));
        if (dates.length < 2) continue; // header / non-data band

        const prt = band.find(i => i.x > 720 && i.x < 745 && /^[A-Z]{1,2}$/.test(i.s));
        const xMark = band.find(i => i.s === 'X' && i.x > hdr.SP - 15 && i.x < hdr.EP + 15);
        const anchorY = prt ? prt.y : (xMark ? xMark.y : Math.min(...dates.map(d => d.y)));

        const byAnchor = [...dates].sort((a, b) => Math.abs(a.y - anchorY) - Math.abs(b.y - anchorY));
        const start = mmddyyToISO(byAnchor[0].s);
        const end = mmddyyToISO(byAnchor[byAnchor.length - 1].s);
        if (!start || !end) continue;

        recs.push({ start, end, rec: xMark ? colOf(xMark.x) : 'NOB' });
      }
    }
    return recs;
  } catch (error) {
    console.error('Error extracting PSR promotion recs:', error);
    return [];
  }
}
