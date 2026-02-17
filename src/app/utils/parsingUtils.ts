// parsingUtils.ts - Navy CDB Application Parsing Utilities
// Handles parsing of ODC, OSR, and PSR documents

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface PromotionHistoryEntry {
  rank: string;
  dateOfRank: string; // ISO format YYYY-MM-DD
}

export interface AQDEntry {
  code: string;
  year: string;
  title: string;
}

export interface SecurityClearance {
  eligibility: string;      // V, T, S, C, N
  level: string;            // V, T, S, C, N  
  investigationDate: string; // ISO format YYYY-MM
  grantedDate: string;       // ISO format YYYY-MM
  expirationDate: string;    // ISO format YYYY-MM
  eligibilityDescription: string;
  levelDescription: string;
}

export interface FitrepEntry {
  payGrade: string;         // O1, O2, O3, O4, O5, O6
  station: string;
  duty: string;
  startDate: string;        // ISO format YYYY-MM-DD
  endDate: string;          // ISO format YYYY-MM-DD
  months: number;
  reportingSenior: {
    name: string;
    payGrade: string;
    title: string;
  };
  traits: number[];         // 5 trait scores (1-5)
  individualAverage: number;
  rsAverage: number;        // Reporting Senior cumulative average
  rsCumCount: number;       // Number of reports by this RS
  promotionRec: string;     // SP, PR, P, MP, EP, NOB, B
  promotionRecCounts: {
    sp: number;
    pr: number;
    p: number;
    mp: number;
    ep: number;
  };
  prt: string;
  reportType: string;       // RG, CC, AT, TR, NOB
}

export interface PSRSummary {
  totalFitreps: number;
  gradedFitreps: number;    // Excludes NOB/AT reports
  averageIndividual: number;
  epCount: number;
  mpCount: number;
  pCount: number;
  prCount: number;
  spCount: number;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  issues: string[];
  fitreps: FitrepEntry[];
  belowRSAverageCount: number;     // How many times individual avg < RS avg
  belowRSAveragePercentage: number; // Percentage of times below RS avg
}

export interface OfficerData {
  name?: string;
  rank?: string;
  designator?: string;
  yearGroup?: string;
  promotionHistory: PromotionHistoryEntry[];
  boardCertified?: boolean;
  aqds: AQDEntry[];
  securityClearance?: SecurityClearance;
  courses: Array<{ code: string; name: string; date: string }>;
  education: Array<{ institution: string; degree: string; year: string }>;
  psrSummary?: PSRSummary;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Valid AQD codes for Medical Corps officers
const VALID_AQD_CODES = new Set([
  '67A', '67B', '67G', '67H', '67I', '67J', '67K', '67L', '67M', '67N',
  'JS7', 'JS8', 'JS9',
  '62D', '6ZB', '6ZC', '6ZF', '6ZG', '6ZH',
  '68M', '68N', '68O', '68P', '68Q',
  'FMF', 'SCW', 'SWO', 'NAV', 'AQD',
  '6OC', '6OD', '6OE',
  'GMO', 'FS1', 'FS2', 'FS3',
  '2P1', '2P2', '2P3', '2PA', '2PH', '2PO', '2PS', '2PT',
  '7ZE', '7ZF', '7ZG', '7ZH', '7ZI', '7ZJ', '7ZK', '7ZL'
]);

// Standard Medical Corps rank progression
const RANK_PROGRESSION = ['ENS', 'LTJG', 'LT', 'LCDR', 'CDR', 'CAPT', 'RDML', 'RADM', 'VADM', 'ADM'];
const O_GRADE_PROGRESSION = ['O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10'];

// Security clearance codes
const CLEARANCE_CODES: Record<string, string> = {
  'V': 'Top Secret - SCI Eligible',
  'T': 'Top Secret',
  'S': 'Secret',
  'C': 'Confidential',
  'N': 'None',
  'L': 'Interim Secret',
  'I': 'Interim Top Secret'
};

// ============================================================================
// DATE PARSING UTILITIES
// ============================================================================

/**
 * Parse MMDDYY format date (e.g., 090124 = Sep 1, 2024)
 */
export function parseMMDDYY(dateStr: string): string | null {
  if (!dateStr || dateStr.length !== 6) return null;
  
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  const year = parseInt(dateStr.substring(4, 6), 10);
  
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  
  // Century logic: 00-50 = 2000s, 51-99 = 1900s
  const fullYear = year <= 50 ? 2000 + year : 1900 + year;
  
  // Validate the date is reasonable (1950-2050)
  if (fullYear < 1950 || fullYear > 2050) return null;
  
  return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parse MMYY format date (e.g., 0520 = May 2020)
 */
export function parseMMYY(dateStr: string): string | null {
  if (!dateStr || dateStr.length !== 4) return null;
  
  const month = parseInt(dateStr.substring(0, 2), 10);
  const year = parseInt(dateStr.substring(2, 4), 10);
  
  if (isNaN(month) || isNaN(year)) return null;
  if (month < 1 || month > 12) return null;
  
  // Century logic: 00-50 = 2000s, 51-99 = 1900s
  const fullYear = year <= 50 ? 2000 + year : 1900 + year;
  
  return `${fullYear}-${String(month).padStart(2, '0')}`;
}

/**
 * Parse YYMM format date (e.g., 2105 = May 2021)
 */
export function parseYYMM(dateStr: string): string | null {
  if (!dateStr || dateStr.length !== 4) return null;
  
  const year = parseInt(dateStr.substring(0, 2), 10);
  const month = parseInt(dateStr.substring(2, 4), 10);
  
  if (isNaN(month) || isNaN(year)) return null;
  if (month < 1 || month > 12) return null;
  
  // Century logic: 00-50 = 2000s, 51-99 = 1900s
  const fullYear = year <= 50 ? 2000 + year : 1900 + year;
  
  return `${fullYear}-${String(month).padStart(2, '0')}`;
}

/**
 * Format ISO date for display
 */
export function formatDateForDisplay(isoDate: string): string {
  if (!isoDate) return 'Unknown';
  
  try {
    const date = new Date(isoDate + (isoDate.length === 7 ? '-01' : ''));
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short',
      day: isoDate.length > 7 ? 'numeric' : undefined
    });
  } catch {
    return isoDate;
  }
}

// ============================================================================
// ODC PARSING FUNCTIONS
// ============================================================================

/**
 * Extract promotion history from ODC text
 * Looks for DOR line with multiple 6-digit dates (MMDDYY format)
 */
export function extractPromotionHistoryFromODC(text: string): PromotionHistoryEntry[] {
  const history: PromotionHistoryEntry[] = [];
  const lines = text.split('\n');
  
  // Pattern 1: Look for line with DOR (Date of Rank) information
  // Example formats:
  // "DOR: 100124 090118 052112" or "100124 090118 052112 S4 LCDR"
  // Try to extract ranks from the same line if possible
  for (const line of lines) {
    // Look for lines that might contain DOR information
    const upperLine = line.toUpperCase();
    if (!upperLine.includes('DOR') && !/\b\d{6}\s+\d{6}/.test(line)) {
      continue; // Skip lines without multiple dates or DOR keyword
    }

    // Find sequences of 6 digits that look like dates
    const dateMatches = line.match(/\b(\d{6})\b/g);

    if (dateMatches && dateMatches.length >= 2) {
      const validDates: string[] = [];

      for (const match of dateMatches) {
        const parsed = parseMMDDYY(match);
        if (parsed) {
          const year = parseInt(parsed.substring(0, 4), 10);
          // Filter to reasonable years (1980-2040)
          if (year >= 1980 && year <= 2040) {
            validDates.push(parsed);
          }
        }
      }

      if (validDates.length >= 2) {
        // Sort chronologically (oldest first)
        validDates.sort((a, b) => a.localeCompare(b));

        // Remove duplicates
        const uniqueDates = [...new Set(validDates)];

        // For DOR lines with 2-4 dates, use Medical Corps rank progression
        // Rank labels on DOR lines (like "S4 LCDR") often just show current rank at time of printing
        // and shouldn't be used to determine the progression
        // Medical Corps typically commission as LT (O3) and progress: LT → LCDR → CDR → CAPT
        const medicalRanks = ['LT', 'LCDR', 'CDR', 'CAPT', 'RDML', 'RADM'];

        for (let i = 0; i < uniqueDates.length && i < medicalRanks.length; i++) {
          history.push({
            rank: medicalRanks[i],
            dateOfRank: uniqueDates[i]
          });
        }

        if (history.length > 0) {
          return history;
        }
      }
    }
  }
  
  // Pattern 2: Look for explicit rank + date combinations
  // Formats like: "LCDR 090118", "CDR: 100124", "Promoted to CDR on 010124"
  const rankDatePatterns = [
    // Rank followed by date: "LCDR 090118" or "LCDR: 090118"
    /\b(ENS|LTJG|LT|LCDR|CDR|CAPT|RDML|RADM)\s*:?\s*(\d{6})\b/gi,
    // Date followed by rank: "090118 LCDR" or "090118 - LCDR"
    /\b(\d{6})\s*[-:]?\s*(ENS|LTJG|LT|LCDR|CDR|CAPT|RDML|RADM)\b/gi,
    // DOR with rank: "DOR CDR 100124" or "DOR: 100124 CDR"
    /\bDOR\s+(ENS|LTJG|LT|LCDR|CDR|CAPT|RDML|RADM)?\s*:?\s*(\d{6})/gi,
  ];

  for (const pattern of rankDatePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let rank: string | undefined;
      let dateStr: string | undefined;

      // Check if first capture group is a rank or date
      if (/^\d{6}$/.test(match[1])) {
        // First group is date, second is rank
        dateStr = match[1];
        rank = match[2]?.toUpperCase();
      } else {
        // First group is rank, second is date
        rank = match[1]?.toUpperCase();
        dateStr = match[2];
      }

      const parsed = parseMMDDYY(dateStr);

      if (parsed && rank && RANK_PROGRESSION.includes(rank)) {
        history.push({ rank, dateOfRank: parsed });
      }
    }
  }

  // Pattern 3: Look for promotion records with context
  // "Promoted to CDR", "Advanced to CAPT", etc.
  const promotionPattern = /(?:promoted?|advanced?)\s+(?:to\s+)?(\b(?:ENS|LTJG|LT|LCDR|CDR|CAPT|RDML|RADM)\b).*?(\d{6})/gi;
  let promoMatch;
  while ((promoMatch = promotionPattern.exec(text)) !== null) {
    const rank = promoMatch[1]?.toUpperCase();
    const dateStr = promoMatch[2];
    const parsed = parseMMDDYY(dateStr);

    if (parsed && rank && RANK_PROGRESSION.includes(rank)) {
      history.push({ rank, dateOfRank: parsed });
    }
  }
  
  // Remove duplicates and sort
  const uniqueHistory = history.filter((entry, index, self) =>
    index === self.findIndex(e => e.rank === entry.rank && e.dateOfRank === entry.dateOfRank)
  );
  
  return uniqueHistory.sort((a, b) => a.dateOfRank.localeCompare(b.dateOfRank));
}

/**
 * Determine current rank from promotion history based on today's date
 *
 * IMPORTANT: This function correctly handles future promotion dates.
 * For example, if an ODC was printed on Sep 15, 2024 showing rank as LCDR,
 * but contains a CDR promotion date of Oct 1, 2024, this function will:
 * - Return LCDR if today is before Oct 1, 2024
 * - Return CDR if today is on or after Oct 1, 2024
 *
 * This ensures the rank reflects the officer's CURRENT rank as of today,
 * not the rank shown on the document when it was printed.
 */
export function determineCurrentRank(history: PromotionHistoryEntry[]): string | undefined {
  if (!history || history.length === 0) return undefined;

  const today = new Date().toISOString().split('T')[0];

  // Find most recent rank where DOR (Date of Rank) is on or before today
  const validRanks = history
    .filter(entry => entry.dateOfRank <= today)
    .sort((a, b) => b.dateOfRank.localeCompare(a.dateOfRank)); // Most recent first

  if (validRanks.length > 0 && process.env.NODE_ENV === 'development') {
    console.log('Current rank determination:', {
      today,
      allPromotions: history,
      validPromotions: validRanks,
      selectedRank: validRanks[0]?.rank
    });
  }

  return validRanks[0]?.rank;
}

/**
 * Extract AQDs from ODC text
 * Pattern: CODE YY TITLE (e.g., "62D 22 *FACULTY DEV")
 */
export function extractAQDsFromODC(text: string): AQDEntry[] {
  const aqds: AQDEntry[] = [];
  const lines = text.split('\n');
  
  // Pattern: 3-character code, 2-digit year, title
  // Examples: "62D 22 *FACULTY DEV", "JS7 23 JPME PHASE1", "6OC 18 HOSPSHIP"
  const aqdPattern = /^([A-Z0-9]{2,3})\s+(\d{2})\s+\*?(.+?)$/i;
  
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(aqdPattern);
    
    if (match) {
      const code = match[1].toUpperCase();
      const year = match[2];
      const title = match[3].trim().replace(/^\*/, '');
      
      // Validate against known AQD codes
      if (VALID_AQD_CODES.has(code)) {
        aqds.push({ code, year, title });
      }
    }
  }
  
  // Also look for inline AQD patterns
  const inlinePattern = /\b([A-Z0-9]{2,3})\s+(\d{2})\s+([A-Z\s]{3,})/g;
  let match;
  
  while ((match = inlinePattern.exec(text)) !== null) {
    const code = match[1].toUpperCase();
    if (VALID_AQD_CODES.has(code)) {
      const existing = aqds.find(a => a.code === code);
      if (!existing) {
        aqds.push({
          code,
          year: match[2],
          title: match[3].trim()
        });
      }
    }
  }
  
  // Remove duplicates by code
  return aqds.filter((aqd, index, self) =>
    index === self.findIndex(a => a.code === aqd.code)
  );
}

/**
 * Extract board certification status from ODC
 * K = Board Certified, J = Not Board Certified
 * Pattern: Usually appears as part of specialty code like "16Q0K" or "16Q0J"
 */
export function extractBoardCertification(text: string): boolean | undefined {
  // Look for patterns like 16Q0K, 16Q0J, etc.
  // The last character K or J indicates board certification status
  
  // Pattern: digits followed by Q (or other letters) and ending in K or J
  const certPattern = /\d{2}[A-Z]\d[KJ]\b/g;
  const matches = text.match(certPattern);
  
  if (matches && matches.length > 0) {
    // Check the last character of the first match
    const lastChar = matches[0].charAt(matches[0].length - 1).toUpperCase();
    return lastChar === 'K'; // K = Board Certified, J = Not Board Certified
  }
  
  // Also check for explicit mentions
  if (/\bBOARD\s*CERT/i.test(text)) {
    return true;
  }
  if (/\bNOT\s+BOARD\s*CERT/i.test(text)) {
    return false;
  }
  
  return undefined;
}

/**
 * Extract security clearance from ODC blocks 92/93
 * Block 92: [Eligibility][Level][InvestigationMMYY] e.g., "SS 65 0520" or "VV1015"
 * Block 93: [GrantedMMYY] e.g., "1115"
 * 
 * Your format: "SS 65 0520" where SS = Secret/Secret, 0520 = May 2020 investigation
 */
export function extractSecurityClearance(text: string): SecurityClearance | undefined {
  // Look for clearance patterns
  // Pattern 1: SS 65 0520 (with spaces and extra digits)
  // Pattern 2: VV1015 / 1115 (traditional format)
  
  const clearance: Partial<SecurityClearance> = {};
  
  // Try to find the clearance line - look for SS, VV, TT, etc.
  // Your format: "SS 65 0520 E Y 40671 20040 08-17-24 YE X3"
  const ssPattern = /\b(SS|VV|TT|CC|NN|SV|VS|TV|VT|ST|TS)\b.*?(\d{4})\b/i;
  const match = text.match(ssPattern);
  
  if (match) {
    const codes = match[1].toUpperCase();
    const investigationDate = match[2]; // MMYY format
    
    clearance.eligibility = codes[0];
    clearance.level = codes[1];
    clearance.eligibilityDescription = CLEARANCE_CODES[codes[0]] || 'Unknown';
    clearance.levelDescription = CLEARANCE_CODES[codes[1]] || 'Unknown';
    
    // Parse investigation date (MMYY format like 0520 = May 2020)
    const parsedInvestigation = parseMMYY(investigationDate);
    if (parsedInvestigation) {
      clearance.investigationDate = parsedInvestigation;
      
      // For granted date, it's often the same or shortly after investigation
      // If not found separately, use investigation date
      clearance.grantedDate = parsedInvestigation;
      
      // Calculate expiration based on level
      const grantedYear = parseInt(parsedInvestigation.substring(0, 4), 10);
      const grantedMonth = parsedInvestigation.substring(5, 7);
      
      let expirationYears = 10; // Default for Secret
      if (clearance.level === 'V' || clearance.level === 'T') {
        expirationYears = 6; // Top Secret/SCI expires in 6 years
      } else if (clearance.level === 'C') {
        expirationYears = 15; // Confidential expires in 15 years
      }
      
      const expirationYear = grantedYear + expirationYears;
      clearance.expirationDate = `${expirationYear}-${grantedMonth}`;
    }
    
    return clearance as SecurityClearance;
  }
  
  // Alternative pattern: Look for traditional block 92/93 format
  // Block 92: VV1015, Block 93: 1115
  const traditionalPattern = /\b([VTSCNLI])([VTSCNLI])(\d{4})\b/;
  const traditionalMatch = text.match(traditionalPattern);
  
  if (traditionalMatch) {
    clearance.eligibility = traditionalMatch[1];
    clearance.level = traditionalMatch[2];
    clearance.eligibilityDescription = CLEARANCE_CODES[traditionalMatch[1]] || 'Unknown';
    clearance.levelDescription = CLEARANCE_CODES[traditionalMatch[2]] || 'Unknown';
    
    const investigationDate = parseMMYY(traditionalMatch[3]);
    if (investigationDate) {
      clearance.investigationDate = investigationDate;
      clearance.grantedDate = investigationDate; // Will be updated if Block 93 found
      
      // Calculate expiration
      const grantedYear = parseInt(investigationDate.substring(0, 4), 10);
      const grantedMonth = investigationDate.substring(5, 7);
      
      let expirationYears = 10;
      if (clearance.level === 'V' || clearance.level === 'T') {
        expirationYears = 6;
      }
      
      clearance.expirationDate = `${grantedYear + expirationYears}-${grantedMonth}`;
    }
    
    // Look for Block 93 (granted date) nearby
    const block93Pattern = /\b(\d{4})\b/g;
    let b93Match;
    while ((b93Match = block93Pattern.exec(text)) !== null) {
      const grantedDate = parseMMYY(b93Match[1]);
      if (grantedDate && grantedDate !== clearance.investigationDate) {
        clearance.grantedDate = grantedDate;
        
        // Recalculate expiration based on granted date
        const grantedYear = parseInt(grantedDate.substring(0, 4), 10);
        const grantedMonth = grantedDate.substring(5, 7);
        
        let expirationYears = 10;
        if (clearance.level === 'V' || clearance.level === 'T') {
          expirationYears = 6;
        }
        
        clearance.expirationDate = `${grantedYear + expirationYears}-${grantedMonth}`;
        break;
      }
    }
    
    return clearance as SecurityClearance;
  }
  
  return undefined;
}

/**
 * Extract year group from ODC
 */
export function extractYearGroup(text: string): string | undefined {
  // Look for YG or year group patterns
  const patterns = [
    /\bYG\s*[:\s]?\s*(\d{2})\b/i,
    /\bYEAR\s*GROUP\s*[:\s]?\s*(\d{2})\b/i,
    /\b(\d{2})\s+\d{4}\b.*?LCDR/i, // Year group often appears before designator
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return undefined;
}

/**
 * Extract designator from ODC
 */
export function extractDesignator(text: string): string | undefined {
  // Medical Corps designator is 2100
  const pattern = /\b(21\d{2}|22\d{2}|23\d{2}|24\d{2})\b/;
  const match = text.match(pattern);
  return match ? match[1] : undefined;
}

// ============================================================================
// PSR PARSING FUNCTIONS
// ============================================================================

/**
 * Parse PSR (Performance Summary Report) text
 * Based on actual PSR format from your document
 */
export function parsePSR(text: string): PSRSummary {
  const fitreps: FitrepEntry[] = [];
  const issues: string[] = [];
  
  const lines = text.split('\n');
  
  // Pattern to match PSR lines
  // PG | STATION | DUTY | DATES | MOS | RS NAME | RS PG | RS TITLE | TRAITS | AVERAGES | PROMO REC | PRT | TYPE
  // Example: "O3 NAVHOSP CAMPE PGY 1 061212 8 IVERSON 06 co 0 0 4 2 0 3.33 307 X p"
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Look for lines starting with O-grade (O1-O6, O01-O06)
    const gradeMatch = trimmed.match(/^O?(\d)\s+/i);
    if (!gradeMatch) continue;
    
    const payGrade = `O${gradeMatch[1]}`;
    const restOfLine = trimmed.substring(gradeMatch[0].length);
    
    try {
      const fitrep = parsePSRLine(payGrade, restOfLine, trimmed);
      if (fitrep) {
        fitreps.push(fitrep);
      }
    } catch (e) {
      // Skip unparseable lines
      console.log('Could not parse PSR line:', trimmed);
    }
  }
  
  // Calculate summary statistics
  const gradedFitreps = fitreps.filter(f => 
    f.reportType !== 'NOB' && f.reportType !== 'AT' && f.individualAverage > 0
  );
  
  const totalIndAvg = gradedFitreps.reduce((sum, f) => sum + f.individualAverage, 0);
  const averageIndividual = gradedFitreps.length > 0 
    ? Math.round((totalIndAvg / gradedFitreps.length) * 100) / 100 
    : 0;
  
  // Count promotion recommendations
  const epCount = fitreps.filter(f => f.promotionRec === 'EP').length;
  const mpCount = fitreps.filter(f => f.promotionRec === 'MP' || f.promotionRec === 'PP').length;
  const pCount = fitreps.filter(f => f.promotionRec === 'P').length;
  const prCount = fitreps.filter(f => f.promotionRec === 'PR').length;
  const spCount = fitreps.filter(f => f.promotionRec === 'SP').length;
  
  // Determine trend
  let trend: 'improving' | 'stable' | 'declining' | 'insufficient_data' = 'insufficient_data';
  
  if (gradedFitreps.length >= 3) {
    const recent = gradedFitreps.slice(-3);
    const avgFirst = recent[0].individualAverage;
    const avgLast = recent[recent.length - 1].individualAverage;
    
    if (avgLast > avgFirst + 0.1) {
      trend = 'improving';
    } else if (avgLast < avgFirst - 0.1) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }
  }
  
  // Check for issues
  // 1. Gaps in reporting dates - flag ANY gap (there should be no gaps in FITREP coverage)
  for (let i = 1; i < fitreps.length; i++) {
    const prev = fitreps[i - 1];
    const curr = fitreps[i];

    if (prev.endDate && curr.startDate) {
      const prevEnd = new Date(prev.endDate);
      const currStart = new Date(curr.startDate);
      const gapDays = Math.round((currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24));

      // Flag any gap of 1 day or more (end date should be day before start date of next report)
      if (gapDays > 1) {
        issues.push(`🔴 GAP: ${gapDays} day${gapDays !== 1 ? 's' : ''} between ${prev.endDate} and ${curr.startDate} - FITREPs should have continuous coverage`);
      }
    }
  }

  // 2. Leftward movement in promotion recommendations
  // IMPORTANT: Only flag leftward movement within SAME rank AND SAME reporting senior
  // Leftward movement is ACCEPTABLE when advancing ranks or changing RS
  const promoOrder = ['SP', 'PR', 'P', 'MP', 'EP'];

  for (let i = 1; i < gradedFitreps.length; i++) {
    const prev = gradedFitreps[i - 1];
    const curr = gradedFitreps[i];

    const prevRec = prev.promotionRec;
    const currRec = curr.promotionRec;

    const prevIdx = promoOrder.indexOf(prevRec);
    const currIdx = promoOrder.indexOf(currRec);

    // Check if this is leftward movement
    if (prevIdx > 0 && currIdx >= 0 && currIdx < prevIdx) {
      const sameRank = prev.payGrade === curr.payGrade;
      const sameRS = prev.reportingSenior?.name === curr.reportingSenior?.name;

      if (sameRank && sameRS) {
        // PROBLEMATIC: Leftward movement within same rank and same RS
        issues.push(`🔴 LEFTWARD: ${prevRec} → ${currRec} under same RS (${curr.reportingSenior?.name || 'Unknown'}) at ${curr.payGrade} (${curr.endDate})`);
      } else if (!sameRank) {
        // ACCEPTABLE: Leftward movement when advancing rank
        issues.push(`ℹ️ Note: ${prevRec} → ${currRec} on rank advancement (${prev.payGrade} → ${curr.payGrade}) - This is acceptable`);
      } else if (!sameRS) {
        // ACCEPTABLE: Leftward movement when changing RS
        issues.push(`ℹ️ Note: ${prevRec} → ${currRec} on RS change (${prev.reportingSenior?.name || 'Unknown'} → ${curr.reportingSenior?.name || 'Unknown'}) - This is acceptable`);
      }
    }
  }

  // Calculate how many times officer was below RS average
  const fitrepsWithRSAverage = gradedFitreps.filter(f => f.rsAverage && f.rsAverage > 0);
  const belowRSAverageCount = fitrepsWithRSAverage.filter(f =>
    f.individualAverage < f.rsAverage
  ).length;
  const belowRSAveragePercentage = fitrepsWithRSAverage.length > 0
    ? Math.round((belowRSAverageCount / fitrepsWithRSAverage.length) * 100)
    : 0;

  return {
    totalFitreps: fitreps.length,
    gradedFitreps: gradedFitreps.length,
    averageIndividual,
    epCount,
    mpCount,
    pCount,
    prCount,
    spCount,
    trend,
    issues,
    fitreps,
    belowRSAverageCount,
    belowRSAveragePercentage
  };
}

/**
 * Parse a single PSR line
 */
function parsePSRLine(payGrade: string, restOfLine: string, fullLine: string): FitrepEntry | null {
  const fitrep: Partial<FitrepEntry> = {
    payGrade,
    traits: [],
    promotionRecCounts: { sp: 0, pr: 0, p: 0, mp: 0, ep: 0 }
  };
  
  // Try to extract dates (MMDDYY format, 6 digits)
  const dateMatches = fullLine.match(/\b(\d{6})\b/g);
  if (dateMatches && dateMatches.length >= 2) {
    const startDate = parseMMDDYY(dateMatches[0]);
    const endDate = parseMMDDYY(dateMatches[1]);
    
    if (startDate) fitrep.startDate = startDate;
    if (endDate) fitrep.endDate = endDate;
    
    // Calculate months
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      fitrep.months = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
    }
  }
  
  // Extract station (first word after grade)
  const stationMatch = restOfLine.match(/^([A-Z\-]+\s*[A-Z\-]*)/i);
  if (stationMatch) {
    fitrep.station = stationMatch[1].trim();
  }
  
  // Extract individual average (decimal number like 3.33, 4.17, etc.)
  const avgMatches = fullLine.match(/\b(\d\.\d{2})\b/g);
  if (avgMatches && avgMatches.length >= 1) {
    fitrep.individualAverage = parseFloat(avgMatches[0]);
    if (avgMatches.length >= 2) {
      fitrep.rsAverage = parseFloat(avgMatches[1]);
    }
  }
  
  // Extract traits (5 single digits in a row, usually "0 0 4 2 0" or "00420")
  const traitPattern = /\b0\s*0\s*(\d)\s*(\d)\s*(\d)\b/;
  const traitMatch = fullLine.match(traitPattern);
  if (traitMatch) {
    fitrep.traits = [0, 0, parseInt(traitMatch[1]), parseInt(traitMatch[2]), parseInt(traitMatch[3])];
  } else {
    // Alternative: look for 5 space-separated single digits
    const altTraitPattern = /(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)/;
    const altMatch = fullLine.match(altTraitPattern);
    if (altMatch) {
      fitrep.traits = [
        parseInt(altMatch[1]),
        parseInt(altMatch[2]),
        parseInt(altMatch[3]),
        parseInt(altMatch[4]),
        parseInt(altMatch[5])
      ];
    }
  }
  
  // Extract promotion recommendation (EP, MP, P, PR, SP, B, N, NOB)
  // Look for the X marker followed by promotion rec or standalone markers
  if (/\bEP\b/i.test(fullLine) || /X\s*\d*\s*EP/i.test(fullLine)) {
    fitrep.promotionRec = 'EP';
  } else if (/\bPP\b/i.test(fullLine) || /\bMP\b/i.test(fullLine)) {
    fitrep.promotionRec = 'MP'; // PP appears to be Must Promote in your PSR
  } else if (/\bPN\b/i.test(fullLine)) {
    fitrep.promotionRec = 'P'; // PN seems to be Promotable with N PRT
  } else if (/\bX\s+P\b/i.test(fullLine) || /\sP\s+RG\b/i.test(fullLine)) {
    fitrep.promotionRec = 'P';
  } else if (/\bPR\b/i.test(fullLine)) {
    fitrep.promotionRec = 'PR';
  } else if (/\bSP\b/i.test(fullLine)) {
    fitrep.promotionRec = 'SP';
  } else if (/\bNOB\b/i.test(fullLine) || /\bB\b\s*(RG|CC|AT)/i.test(fullLine)) {
    fitrep.promotionRec = 'NOB';
  } else if (/\bN\b\s*(RG|CC|AT)/i.test(fullLine)) {
    fitrep.promotionRec = 'NOB';
  }
  
  // Extract report type (RG, CC, AT, TR)
  if (/\bRG\b/i.test(fullLine)) {
    fitrep.reportType = 'RG';
  } else if (/\bCC\b/i.test(fullLine)) {
    fitrep.reportType = 'CC';
  } else if (/\bAT\b/i.test(fullLine)) {
    fitrep.reportType = 'AT';
  } else if (/\bTR\b/i.test(fullLine)) {
    fitrep.reportType = 'TR';
  }
  
  // Extract PRT (P, F, N, etc.)
  const prtMatch = fullLine.match(/\b(P|F|N)\s+(RG|CC|AT|TR)\b/i);
  if (prtMatch) {
    fitrep.prt = prtMatch[1].toUpperCase();
  }
  
  // Extract reporting senior name
  const namePattern = /\b([A-Z]{2,})\s+([A-Z])\s+([A-Z])\b/i;
  const nameMatch = fullLine.match(namePattern);
  if (nameMatch) {
    fitrep.reportingSenior = {
      name: nameMatch[1],
      payGrade: 'O6', // Usually CO
      title: 'CO'
    };
  }
  
  // Only return if we have minimum required data
  if (fitrep.payGrade && (fitrep.endDate || fitrep.individualAverage)) {
    return fitrep as FitrepEntry;
  }
  
  return null;
}

// ============================================================================
// MAIN PARSING FUNCTIONS
// ============================================================================

/**
 * Parse ODC (Officer Data Card) text
 */
export function parseODC(text: string): OfficerData {
  const data: OfficerData = {
    promotionHistory: [],
    aqds: [],
    courses: [],
    education: []
  };
  
  // Extract promotion history
  data.promotionHistory = extractPromotionHistoryFromODC(text);
  
  // Determine current rank
  data.rank = determineCurrentRank(data.promotionHistory);
  
  // Extract AQDs
  data.aqds = extractAQDsFromODC(text);
  
  // Extract board certification
  data.boardCertified = extractBoardCertification(text);
  
  // Extract security clearance
  data.securityClearance = extractSecurityClearance(text);
  
  // Extract year group
  data.yearGroup = extractYearGroup(text);
  
  // Extract designator
  data.designator = extractDesignator(text);
  
  return data;
}

/**
 * Parse OSR (Officer Summary Record) text - similar structure to ODC
 */
export function parseOSR(text: string): OfficerData {
  // OSR parsing is similar to ODC but may have different layout
  return parseODC(text);
}

/**
 * Merge data from multiple documents
 */
export function mergeOfficerData(...dataSources: OfficerData[]): OfficerData {
  const merged: OfficerData = {
    promotionHistory: [],
    aqds: [],
    courses: [],
    education: []
  };
  
  for (const data of dataSources) {
    // Prefer non-empty values
    if (data.name && !merged.name) merged.name = data.name;
    if (data.rank && !merged.rank) merged.rank = data.rank;
    if (data.designator && !merged.designator) merged.designator = data.designator;
    if (data.yearGroup && !merged.yearGroup) merged.yearGroup = data.yearGroup;
    if (data.boardCertified !== undefined && merged.boardCertified === undefined) {
      merged.boardCertified = data.boardCertified;
    }
    if (data.securityClearance && !merged.securityClearance) {
      merged.securityClearance = data.securityClearance;
    }
    if (data.psrSummary && !merged.psrSummary) {
      merged.psrSummary = data.psrSummary;
    }
    
    // Merge arrays (deduplicate)
    merged.promotionHistory = [...merged.promotionHistory, ...data.promotionHistory];
    merged.aqds = [...merged.aqds, ...data.aqds];
    merged.courses = [...merged.courses, ...data.courses];
    merged.education = [...merged.education, ...data.education];
  }
  
  // Deduplicate promotion history
  merged.promotionHistory = merged.promotionHistory.filter((entry, index, self) =>
    index === self.findIndex(e => e.rank === entry.rank)
  ).sort((a, b) => a.dateOfRank.localeCompare(b.dateOfRank));
  
  // Deduplicate AQDs
  merged.aqds = merged.aqds.filter((aqd, index, self) =>
    index === self.findIndex(a => a.code === aqd.code)
  );
  
  return merged;
}

// ============================================================================
// EXPORT HELPERS
// ============================================================================

export function getClearanceLevelText(code: string): string {
  return CLEARANCE_CODES[code] || 'Unknown';
}

export function isValidAQD(code: string): boolean {
  return VALID_AQD_CODES.has(code.toUpperCase());
}

export function getRankFromOGrade(oGrade: string): string {
  const index = O_GRADE_PROGRESSION.indexOf(oGrade.toUpperCase());
  return index >= 0 ? RANK_PROGRESSION[index] : oGrade;
}

export function getOGradeFromRank(rank: string): string {
  const index = RANK_PROGRESSION.indexOf(rank.toUpperCase());
  return index >= 0 ? O_GRADE_PROGRESSION[index] : '';
}

// ============================================================================
// PROMOTION BOARD TIMELINE UTILITIES
// ============================================================================

/**
 * Promotion board schedule data
 * Maps fiscal year to in-zone DOR windows and board dates
 */
const PROMOTION_BOARD_SCHEDULE = [
  {
    fy: 26,
    inZoneStart: '2019-10-01',
    inZoneEnd: '2020-09-30',
    boards: {
      O4: { convenes: '2025-05', fitrepDeadline: '2025-01' },
      O5: { convenes: '2025-05', fitrepDeadline: '2024-10' },
      O6: { convenes: '2025-02', fitrepDeadline: '2024-04' }
    }
  },
  {
    fy: 27,
    inZoneStart: '2020-10-01',
    inZoneEnd: '2021-09-30',
    boards: {
      O4: { convenes: '2026-05', fitrepDeadline: '2026-01' },
      O5: { convenes: '2026-05', fitrepDeadline: '2025-10' },
      O6: { convenes: '2026-02', fitrepDeadline: '2025-04' }
    }
  },
  {
    fy: 28,
    inZoneStart: '2021-10-01',
    inZoneEnd: '2022-09-30',
    boards: {
      O4: { convenes: '2027-05', fitrepDeadline: '2027-01' },
      O5: { convenes: '2027-05', fitrepDeadline: '2026-10' },
      O6: { convenes: '2027-02', fitrepDeadline: '2026-04' }
    }
  },
  {
    fy: 29,
    inZoneStart: '2022-10-01',
    inZoneEnd: '2023-09-30',
    boards: {
      O4: { convenes: '2028-05', fitrepDeadline: '2028-01' },
      O5: { convenes: '2028-05', fitrepDeadline: '2027-10' },
      O6: { convenes: '2028-02', fitrepDeadline: '2027-04' }
    }
  },
  {
    fy: 30,
    inZoneStart: '2023-10-01',
    inZoneEnd: '2024-09-30',
    boards: {
      O4: { convenes: '2029-05', fitrepDeadline: '2029-01' },
      O5: { convenes: '2029-05', fitrepDeadline: '2028-10' },
      O6: { convenes: '2029-02', fitrepDeadline: '2028-04' }
    }
  },
  {
    fy: 31,
    inZoneStart: '2024-10-01',
    inZoneEnd: '2025-09-30',
    boards: {
      O4: { convenes: '2030-05', fitrepDeadline: '2030-01' },
      O5: { convenes: '2030-05', fitrepDeadline: '2029-10' },
      O6: { convenes: '2030-02', fitrepDeadline: '2029-04' }
    }
  }
];

export interface PromotionTimeline {
  currentRank: string;
  currentPayGrade: string;
  dateOfRank: string;
  inZoneFY: number | null;
  nextRank: string | null;
  nextPayGrade: string | null;
  boardConvenes: string | null;
  fitrepDeadline: string | null;
  daysUntilBoard: number | null;
  daysUntilFitrepDeadline: number | null;
  isInZone: boolean;
}

/**
 * Calculate promotion timeline for an officer based on current rank and DOR
 */
export function calculatePromotionTimeline(
  currentRank: string,
  dateOfRank: string
): PromotionTimeline {
  const payGrade = getOGradeFromRank(currentRank);
  const rankIndex = RANK_PROGRESSION.indexOf(currentRank.toUpperCase());
  const nextRank = rankIndex >= 0 && rankIndex < RANK_PROGRESSION.length - 1
    ? RANK_PROGRESSION[rankIndex + 1]
    : null;
  const nextPayGrade = nextRank ? getOGradeFromRank(nextRank) : null;

  // Find the FY where officer is in-zone based on DOR
  let inZoneFY: number | null = null;
  let boardInfo: { convenes: string; fitrepDeadline: string } | null = null;

  for (const schedule of PROMOTION_BOARD_SCHEDULE) {
    if (dateOfRank >= schedule.inZoneStart && dateOfRank <= schedule.inZoneEnd) {
      inZoneFY = schedule.fy;
      // Get board info for next rank
      if (nextPayGrade && nextPayGrade in schedule.boards) {
        boardInfo = schedule.boards[nextPayGrade as keyof typeof schedule.boards];
      }
      break;
    }
  }

  // Calculate days until board and FITREP deadline
  const today = new Date();
  let daysUntilBoard: number | null = null;
  let daysUntilFitrepDeadline: number | null = null;

  if (boardInfo) {
    const boardDate = new Date(boardInfo.convenes + '-01');
    const fitrepDate = new Date(boardInfo.fitrepDeadline + '-01');

    daysUntilBoard = Math.ceil((boardDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    daysUntilFitrepDeadline = Math.ceil((fitrepDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    currentRank,
    currentPayGrade: payGrade,
    dateOfRank,
    inZoneFY,
    nextRank,
    nextPayGrade,
    boardConvenes: boardInfo?.convenes || null,
    fitrepDeadline: boardInfo?.fitrepDeadline || null,
    daysUntilBoard,
    daysUntilFitrepDeadline,
    isInZone: inZoneFY !== null
  };
}
