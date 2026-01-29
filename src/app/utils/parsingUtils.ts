//**
 * Navy Officer Document Parsing Utilities
 * 
 * Parses ODC (Officer Data Card), OSR (Officer Summary Record), and PSR (Performance Summary Report)
 * to extract career progression data for Career Development Board preparation.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface RankDate {
  rank: string;
  dateOfRank: string; // YYYY-MM-DD format
}

export interface AQDEntry {
  code: string;
  year: string;
  title: string;
}

export interface FitrepEntry {
  payGrade: string;        // O1, O3, O4, etc.
  station: string;         // Duty station
  duty: string;            // Billet title
  startDate: string;       // YYYY-MM-DD
  endDate: string;         // YYYY-MM-DD
  months: number;          // Months in billet
  reportingSenior: {
    name: string;
    payGrade: string;
    title: string;
  };
  traits: number[];        // 5 trait marks (counts at each level 1-5)
  individualAverage: number;
  cumulativeAverage: number;
  rsAverage: number;       // Reporting senior's cumulative average
  promotionRec: {
    sp: number;            // Significant Problems
    pr: number;            // Progressing
    p: number;             // Promotable
    mp: number;            // Must Promote
    ep: number;            // Early Promote
  };
  prt: string;             // Physical Readiness Test result (P/N/B)
  reportType: string;      // RG (Regular), AT (Attrite), CC (Concurrent), etc.
}

export interface PSRAnalysisResult {
  fitreps: FitrepEntry[];
  issues: string[];
  summary: {
    totalFitreps: number;
    averageIndividual: number;
    epCount: number;
    mpCount: number;
    pCount: number;
    trend: 'improving' | 'stable' | 'declining';
    hasLeftwardMovement: boolean;
    hasDateGaps: boolean;
    hasSoftBreakouts: boolean;
  };
}

export interface ParsedOfficerData {
  // Rank information
  rankHistory: RankDate[];
  currentRank: string;
  yearGroup: string;
  designator: string;
  
  // Board certification
  boardCertified: boolean | null;
  subspecialtyCode: string;
  
  // Education
  education: {
    undergrad: { school: string; year: string; degree: string; major: string } | null;
    medical: { school: string; year: string; degree: string; major: string } | null;
  };
  
  // Service schools/courses
  courses: { code: string; name: string; completionDate: string; weeks: number }[];
  
  // AQDs
  aqds: AQDEntry[];
  
  // Security clearance
  securityClearance: {
    level: string;  // S = Secret, T = Top Secret
    investigationYear: string;
  } | null;
  
  // Duty history
  currentStation: string;
  currentBillet: string;
  
  // Parsing metadata
  warnings: string[];
  source: 'ODC' | 'OSR' | 'combined';
}

// ============================================================================
// DATE PARSING UTILITIES
// ============================================================================

/**
 * Parse MMDDYY format to YYYY-MM-DD
 */
export function parseMMDDYY(dateStr: string): string | null {
  const cleaned = dateStr.trim();
  
  if (cleaned.length !== 6 || !/^\d{6}$/.test(cleaned)) {
    return null;
  }
  
  const mm = cleaned.substring(0, 2);
  const dd = cleaned.substring(2, 4);
  const yy = cleaned.substring(4, 6);
  
  const monthNum = parseInt(mm);
  const dayNum = parseInt(dd);
  const yearNum = parseInt(yy);
  
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    return null;
  }
  
  // Convert YY to YYYY (00-50 = 2000s, 51-99 = 1900s)
  const yyyy = yearNum <= 50 ? `20${yy}` : `19${yy}`;
  
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse YYMMDD format to YYYY-MM-DD (used in some OSR fields)
 */
export function parseYYMMDD(dateStr: string): string | null {
  const cleaned = dateStr.trim();
  
  if (cleaned.length !== 6 || !/^\d{6}$/.test(cleaned)) {
    return null;
  }
  
  const yy = cleaned.substring(0, 2);
  const mm = cleaned.substring(2, 4);
  const dd = cleaned.substring(4, 6);
  
  const monthNum = parseInt(mm);
  const dayNum = parseInt(dd);
  const yearNum = parseInt(yy);
  
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    return null;
  }
  
  const yyyy = yearNum <= 50 ? `20${yy}` : `19${yy}`;
  
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Check if a date is a valid promotion date (not a birthdate, within reasonable range)
 */
function isValidPromotionDate(dateStr: string): boolean {
  const year = parseInt(dateStr.substring(0, 4));
  return year >= 2000 && year <= 2035;
}

/**
 * Determine actual current rank based on promotion dates and current date
 */
export function determineCurrentRank(rankHistory: RankDate[]): string {
  if (rankHistory.length === 0) return '';
  
  const today = new Date();
  const sorted = [...rankHistory].sort(
    (a, b) => new Date(a.dateOfRank).getTime() - new Date(b.dateOfRank).getTime()
  );
  
  // Find the highest rank where the date has passed
  let currentRank = sorted[0].rank;
  for (const entry of sorted) {
    const dorDate = new Date(entry.dateOfRank);
    if (dorDate <= today) {
      currentRank = entry.rank;
    }
  }
  
  return currentRank;
}

// ============================================================================
// ODC PARSING
// ============================================================================

/**
 * Parse Officer Data Card (ODC) text
 */
export function parseODC(text: string): Partial<ParsedOfficerData> {
  const result: Partial<ParsedOfficerData> = {
    rankHistory: [],
    aqds: [],
    courses: [],
    warnings: [],
    source: 'ODC',
  };
  
  console.log('=== PARSING ODC ===');
  console.log('Text length:', text.length);
  
  // Extract designator (Field 4) - should be 2100 for Medical Corps
  const designatorMatch = text.match(/\b(2100|2105|2300|2305)\b/);
  if (designatorMatch) {
    result.designator = designatorMatch[1];
    console.log('Found designator:', result.designator);
  }
  
  // Extract Year Group (YRG field)
  const yrgMatch = text.match(/\bYRG\b[^\d]*(\d{2})\b/i) || text.match(/\bYG\s*(\d{2})\b/i);
  if (yrgMatch) {
    result.yearGroup = yrgMatch[1];
    console.log('Found year group:', result.yearGroup);
  }
  
  // Extract current grade from the header area
  // Looking for pattern: "M 2100 LCDR 08" where LCDR is grade
  const gradeMatch = text.match(/\b2100\s+(ENS|LTJG|LT|LCDR|CDR|CAPT|RDML|RADM)\b/i);
  if (gradeMatch) {
    result.currentRank = gradeMatch[1].toUpperCase();
    console.log('Found current grade field:', result.currentRank);
  }
  
  // ========== PROMOTION HISTORY EXTRACTION ==========
  // The ODC has a "PROMOTION HISTORY" section with columns:
  // 36 FLAG CAPT CDR LCDR LT LTJG ENS W-2
  // And data below showing dates under each column header
  // Format: "090124 090118 052112" (dates in MMDDYY under CDR, LCDR, LT columns)
  
  result.rankHistory = extractPromotionHistory(text);
  
  // Determine actual current rank based on dates
  if (result.rankHistory.length > 0) {
    const actualCurrentRank = determineCurrentRank(result.rankHistory);
    if (actualCurrentRank && actualCurrentRank !== result.currentRank) {
      console.log(`Rank updated: Document shows ${result.currentRank} but based on DOR, actual rank is ${actualCurrentRank}`);
      result.currentRank = actualCurrentRank;
    }
  }
  
  // ========== SUBSPECIALTY / BOARD CERTIFICATION ==========
  // Look for patterns like "16Q0K" where last char is J (not certified) or K (certified)
  const subspecMatch = text.match(/\b(\d{2}[A-Z]\d[JK])\b/);
  if (subspecMatch) {
    result.subspecialtyCode = subspecMatch[1];
    result.boardCertified = subspecMatch[1].endsWith('K');
    console.log('Found subspecialty code:', result.subspecialtyCode, 'Board certified:', result.boardCertified);
  }
  
  // ========== AQD EXTRACTION ==========
  result.aqds = extractAQDs(text);
  
  // ========== COURSE EXTRACTION ==========
  result.courses = extractCourses(text);
  
  // ========== EDUCATION ==========
  result.education = extractEducation(text);
  
  // ========== SECURITY CLEARANCE ==========
  result.securityClearance = extractSecurityClearance(text);
  
  // ========== CURRENT DUTY ==========
  const stationMatch = text.match(/PRESENT DUTY STATION[^\n]*\n([^\n]+)/i) ||
                       text.match(/(\d+\w*\s+MED\s+BN|NAVHOSP\s+\w+|NMRTC\s+\w+|USU\w*\s+\w+)/i);
  if (stationMatch) {
    result.currentStation = stationMatch[1].trim();
  }
  
  const billetMatch = text.match(/PRESENT BILLET[^\n]*\n([^\n]+)/i) ||
                      text.match(/PRIMARY DUTY[^\n]*\n([^\n]+)/i);
  if (billetMatch) {
    result.currentBillet = billetMatch[1].trim();
  }
  
  return result;
}

/**
 * Extract promotion history dates from ODC text
 */
function extractPromotionHistory(text: string): RankDate[] {
  const ranks: RankDate[] = [];
  
  // Method 1: Look for the promotion history section with column headers
  // The format shows dates under rank column headers
  // "36 FLAG CAPT CDR LCDR LT LTJG ENS W-2"
  // followed by dates like "090124 090118 052112"
  
  const lines = text.split('\n');
  let inPromotionSection = false;
  let columnHeaders: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Find the header line with rank names
    if (line.includes('FLAG') && line.includes('CAPT') && line.includes('CDR')) {
      inPromotionSection = true;
      // Extract column order
      columnHeaders = ['FLAG', 'CAPT', 'CDR', 'LCDR', 'LT', 'LTJG', 'ENS'];
      console.log('Found promotion history header');
      continue;
    }
    
    // Look for a line with multiple 6-digit dates (MMDDYY format)
    if (inPromotionSection) {
      const datePattern = /\b(\d{6})\b/g;
      const matches = [...line.matchAll(datePattern)];
      
      if (matches.length >= 2) {
        console.log('Found potential date line:', line);
        console.log('Dates found:', matches.map(m => m[1]));
        
        // These dates appear in order from highest rank to lowest
        // But we only have dates for ranks the person has achieved
        // Need to figure out which ranks these correspond to
        
        // The dates are typically ordered: newest rank first (highest achieved)
        // For a LCDR: CDR_DOR (if selected), LCDR_DOR, LT_DOR
        const dates = matches.map(m => m[1]);
        
        // Filter to valid promotion dates (not birthdates)
        const validDates = dates
          .map(d => ({ raw: d, parsed: parseMMDDYY(d) }))
          .filter(d => d.parsed && isValidPromotionDate(d.parsed));
        
        console.log('Valid promotion dates:', validDates);
        
        // For Medical Corps (2100), typical progression is LT -> LCDR -> CDR -> CAPT
        // The dates are listed newest first
        // If we have 3 dates and current rank is LCDR with CDR date in future:
        // dates[0] = CDR DOR (future), dates[1] = LCDR DOR, dates[2] = LT DOR
        
        // Let's assign based on date order (oldest = earliest rank)
        const sortedByDate = [...validDates].sort(
          (a, b) => new Date(a.parsed!).getTime() - new Date(b.parsed!).getTime()
        );
        
        // Medical Corps progression (doctors typically start as LT)
        const mcRankProgression = ['LT', 'LCDR', 'CDR', 'CAPT', 'RDML', 'RADM'];
        
        for (let j = 0; j < sortedByDate.length && j < mcRankProgression.length; j++) {
          ranks.push({
            rank: mcRankProgression[j],
            dateOfRank: sortedByDate[j].parsed!,
          });
        }
        
        if (ranks.length > 0) {
          console.log('Extracted rank history:', ranks);
          break; // Found what we need
        }
      }
    }
  }
  
  // Method 2: If method 1 didn't work, try looking for specific patterns
  if (ranks.length === 0) {
    console.log('Method 1 failed, trying alternative extraction...');
    
    // Look for pattern like "CDR" or "LCDR" followed by dates nearby
    // Or look for "DOR" indicators
    
    // Try to find date clusters
    const allDates = [...text.matchAll(/\b(\d{6})\b/g)]
      .map(m => ({ raw: m[1], parsed: parseMMDDYY(m[1]) }))
      .filter(d => d.parsed && isValidPromotionDate(d.parsed));
    
    // Remove duplicates
    const uniqueDates = Array.from(
      new Map(allDates.map(d => [d.parsed, d])).values()
    ).sort((a, b) => new Date(a.parsed!).getTime() - new Date(b.parsed!).getTime());
    
    console.log('All unique valid dates:', uniqueDates);
    
    if (uniqueDates.length >= 1) {
      const mcRankProgression = ['LT', 'LCDR', 'CDR', 'CAPT', 'RDML', 'RADM'];
      
      for (let j = 0; j < uniqueDates.length && j < mcRankProgression.length; j++) {
        ranks.push({
          rank: mcRankProgression[j],
          dateOfRank: uniqueDates[j].parsed!,
        });
      }
    }
  }
  
  return ranks;
}

/**
 * Extract AQD entries from text
 * 
 * ODC Block 72 Format: [3-char code] [2-digit year] [title]
 * Example: "6ZF 18 RESEARCHER"
 *          "FMF 15 FLEET MARINE FORCE"
 *          "JS7 23 JPME PHASE1"
 * 
 * OSR Format: Title only in "Special Qualifications" section
 */
function extractAQDs(text: string): AQDEntry[] {
  const aqds: AQDEntry[] = [];
  
  // Common words to filter out (these are NOT AQD codes)
  const filterWords = new Set(['THE', 'AND', 'FOR', 'CODE', 'YR', 'BLK', 'SEE', 'NOT', 'HAS', 'WAS', 'ARE', 'ALL', 'ANY']);
  
  // Filter out document structure codes with 4-digit parenthetical numbers
  // These are line numbers/position references, NOT AQDs
  // Example false positives: SSHTA(2012), ERACBD(2019), ACDASED(2027)
  const isDocumentStructureCode = (line: string): boolean => {
    return /[A-Z]{3,}\(\d{4}\)/.test(line);
  };
  
  const lines = text.split('\n');
  let inAQDSection = false;
  let inSpecialQualSection = false;
  
  for (const line of lines) {
    // Skip lines that look like document structure codes
    if (isDocumentStructureCode(line)) {
      continue;
    }
    
    // Detect Block 72 / AQD section start
    if (line.includes('72') && (line.includes('ADDITIONAL QUAL') || line.includes('AQD'))) {
      inAQDSection = true;
      continue;
    }
    if (line.includes('ADDITIONAL QUAL DESIG') || line.includes('ADDITIONAL QUALIFICATION')) {
      inAQDSection = true;
      continue;
    }
    
    // Detect OSR Special Qualifications section
    if (line.includes('SPECIAL QUAL') || line.includes('SPEC QUAL')) {
      inSpecialQualSection = true;
      continue;
    }
    
    // Exit section on new block number or major section header
    if (/^\s*\d{2}\s+[A-Z]{3,}/.test(line) && !line.includes('ADDITIONAL')) {
      inAQDSection = false;
    }
    
    // ODC Block 72 AQD pattern: exactly 3 alphanumeric code + space + 2-digit year + space + title
    // Pattern: "6ZF 18 RESEARCHER" or "FMF 15 FLEET MARINE FORCE"
    const aqdMatch = line.match(/^\s*([A-Z0-9]{3})\s+(\d{2})\s+\*?([A-Z][A-Z\s*]+)/i);
    if (aqdMatch) {
      const code = aqdMatch[1].toUpperCase();
      const year = aqdMatch[2];
      const title = aqdMatch[3].trim().replace(/^\*/, '').replace(/\s+/g, ' ');
      
      // Validate: code should be 3 chars, year should be reasonable (00-50 for 2000s)
      const yearNum = parseInt(year);
      if (!filterWords.has(code) && title.length > 2 && yearNum >= 0 && yearNum <= 50) {
        if (!aqds.find(a => a.code === code)) {
          aqds.push({ code, year: `20${year}`, title });
        }
      }
    }
    
    // Also look for inline format within lines (not at start)
    const inlineMatches = [...line.matchAll(/\b([A-Z0-9]{3})\s+(\d{2})\s+\*?([A-Z][A-Z\s]{3,})/gi)];
    for (const match of inlineMatches) {
      const code = match[1].toUpperCase();
      const year = match[2];
      const title = match[3].trim().replace(/^\*/, '').replace(/\s+/g, ' ');
      
      const yearNum = parseInt(year);
      if (!aqds.find(a => a.code === code) && !filterWords.has(code) && yearNum >= 0 && yearNum <= 50) {
        aqds.push({ code, year: `20${year}`, title });
      }
    }
  }
  
  // Search for known AQD patterns anywhere in text (as backup)
  const knownAQDPatterns = [
    { pattern: /\b(67A)\s+(\d{2})?\s*(EXECUTIVE|EXEC\s*MED)/i, title: 'Executive Medicine' },
    { pattern: /\b(67B)\s+(\d{2})?\s*(EXPEDITIONARY|EXPED)/i, title: 'Expeditionary Medicine' },
    { pattern: /\b(67G)\s+(\d{2})?\s*(MANAGED\s*CARE)/i, title: 'Managed Care' },
    { pattern: /\b(JS7)\s+(\d{2})?\s*(JPME|JOINT.*PHASE\s*1)/i, title: 'JPME Phase 1' },
    { pattern: /\b(JS8)\s+(\d{2})?\s*(JPME|JOINT.*PHASE\s*2)/i, title: 'JPME Phase 2' },
    { pattern: /\b(62D)\s+(\d{2})?\s*(FACULTY|FAC\s*DEV)/i, title: 'Faculty Development' },
    { pattern: /\b(6ZC)\s+(\d{2})?\s*(ASSOC\s*PROF|ASSOCIATE)/i, title: 'Associate Professor' },
    { pattern: /\b(6ZB)\s+(\d{2})?\s*(ASST\s*PROF|ASSISTANT)/i, title: 'Assistant Professor' },
    { pattern: /\b(6ZF)\s+(\d{2})?\s*(RESEARCH)/i, title: 'Researcher' },
    { pattern: /\b(68M)\s+(\d{2})?\s*(GHS|GLOBAL)/i, title: 'Global Health' },
    { pattern: /\b(6OC)\s+(\d{2})?\s*(HOSP|HOSPSHIP)/i, title: 'Hospital Ship' },
    { pattern: /\b(FMF)\s+(\d{2})?\s*(FLEET\s*MARINE|WARFARE)/i, title: 'Fleet Marine Force' },
    { pattern: /\b(SWO)\s+(\d{2})?\s*(SURFACE\s*WARFARE)/i, title: 'Surface Warfare Officer' },
    { pattern: /\b(SCW)\s+(\d{2})?\s*(SEABEE\s*COMBAT)/i, title: 'Seabee Combat Warfare' },
  ];
  
  for (const { pattern, title } of knownAQDPatterns) {
    const match = text.match(pattern);
    if (match && !aqds.find(a => a.code === match[1].toUpperCase())) {
      const year = match[2] ? `20${match[2]}` : '';
      aqds.push({ code: match[1].toUpperCase(), year, title });
    }
  }
  
  console.log('Extracted AQDs:', aqds);
  return aqds;
}

/**
 * Extract service schools/courses from text
 */
function extractCourses(text: string): { code: string; name: string; completionDate: string; weeks: number }[] {
  const courses: { code: string; name: string; completionDate: string; weeks: number }[] = [];
  
  // Look for SERVICE SCHOOLS section
  // Format: CODE COURSE NAME COMPL DUR
  // Example: "064 TROP MED COURSE 0421 10"
  
  const coursePattern = /\b(\d{3})\s+([A-Z\s]+?)\s+(\d{4})\s+(\d{1,2})\b/gi;
  const matches = [...text.matchAll(coursePattern)];
  
  for (const match of matches) {
    const code = match[1];
    const name = match[2].trim();
    const complDate = match[3]; // MMYY format
    const weeks = parseInt(match[4]);
    
    // Parse MMYY to YYYY-MM
    const mm = complDate.substring(0, 2);
    const yy = complDate.substring(2, 4);
    const yyyy = parseInt(yy) <= 50 ? `20${yy}` : `19${yy}`;
    
    if (name.length > 3 && weeks > 0 && weeks < 52) {
      courses.push({
        code,
        name,
        completionDate: `${yyyy}-${mm}`,
        weeks,
      });
    }
  }
  
  console.log('Extracted courses:', courses);
  return courses;
}

/**
 * Extract education information from text
 */
function extractEducation(text: string): ParsedOfficerData['education'] {
  const education: ParsedOfficerData['education'] = {
    undergrad: null,
    medical: null,
  };
  
  // Look for education patterns
  // Format: "GEORGETN U 12 DOCTOR MEDICINE"
  //         "TULANE 08 BACH/1PRO SCIENCES"
  
  // Medical school pattern
  const medMatch = text.match(/([A-Z]+(?:\s+[A-Z]+)?)\s+(\d{2})\s+DOCTOR\s+([A-Z]+)/i);
  if (medMatch) {
    education.medical = {
      school: medMatch[1].trim(),
      year: `20${medMatch[2]}`,
      degree: 'MD',
      major: medMatch[3].trim(),
    };
  }
  
  // Also check for MD/DO designation
  if (!education.medical) {
    const mdMatch = text.match(/([A-Z]+(?:\s+[A-Z]+)?)\s+(\d{2})\s+\w*\s*(MD|DO|MEDICINE)/i);
    if (mdMatch) {
      education.medical = {
        school: mdMatch[1].trim(),
        year: `20${mdMatch[2]}`,
        degree: mdMatch[3].toUpperCase() === 'MEDICINE' ? 'MD' : mdMatch[3].toUpperCase(),
        major: 'Medicine',
      };
    }
  }
  
  // Undergraduate pattern
  const undergradMatch = text.match(/([A-Z]+(?:\s+[A-Z]+)?)\s+(\d{2})\s+BACH[A-Z\/]*\s+([A-Z]+)/i);
  if (undergradMatch) {
    education.undergrad = {
      school: undergradMatch[1].trim(),
      year: `20${undergradMatch[2]}`,
      degree: 'BS',
      major: undergradMatch[3].trim(),
    };
  }
  
  console.log('Extracted education:', education);
  return education;
}

/**
 * Extract security clearance from text
 * 
 * ODC Field 92 SECURITY formats:
 * - "V V" or "V V [year]" = Top Secret (V = inVestigation at TS level)
 * - "S S" or "S S [year]" = Secret
 * - "T T" or "T [year]" = Top Secret (alternate format)
 * - Investigation year is 2-digit (e.g., "65" = 2065 or 1965, context-dependent)
 */
function extractSecurityClearance(text: string): ParsedOfficerData['securityClearance'] {
  // Look for security clearance indicator in various formats
  
  // Format 1: "V V" pattern for Top Secret (most common)
  const vvMatch = text.match(/\bV\s+V\s*(\d{2})?\b/i);
  if (vvMatch) {
    const year = vvMatch[1] || '';
    return {
      level: 'Top Secret',
      investigationYear: year ? `20${year}` : '',
    };
  }
  
  // Format 2: "S S" pattern for Secret
  const ssMatch = text.match(/\bS\s+S\s*(\d{2})?\b/i);
  if (ssMatch) {
    const year = ssMatch[1] || '';
    return {
      level: 'Secret',
      investigationYear: year ? `20${year}` : '',
    };
  }
  
  // Format 3: SECURITY field with T or S indicator
  const clearanceMatch = text.match(/SECURITY[^\n]*\b([TSV])\s+(?:[TSV]\s+)?(\d{2})/i);
  if (clearanceMatch) {
    const level = clearanceMatch[1].toUpperCase();
    const year = clearanceMatch[2];
    
    return {
      level: level === 'V' || level === 'T' ? 'Top Secret' : 'Secret',
      investigationYear: `20${year}`,
    };
  }
  
  // Format 4: Standalone pattern like "T 65" or "S 65" near SECURITY
  const standaloneMatch = text.match(/\b([TSV])\s+([TSV])?\s*(\d{2})\s+\d{4}\b/);
  if (standaloneMatch) {
    const level = standaloneMatch[1].toUpperCase();
    const year = standaloneMatch[3];
    
    return {
      level: level === 'V' || level === 'T' ? 'Top Secret' : 'Secret',
      investigationYear: `20${year}`,
    };
  }
  
  return null;
}

// ============================================================================
// OSR PARSING
// ============================================================================

/**
 * Parse Officer Summary Record (OSR) text
 */
export function parseOSR(text: string): Partial<ParsedOfficerData> {
  const result: Partial<ParsedOfficerData> = {
    rankHistory: [],
    aqds: [],
    courses: [],
    warnings: [],
    source: 'OSR',
  };
  
  console.log('=== PARSING OSR ===');
  
  // OSR format has similar fields but in different layout
  // The promotion dates appear in the "HIGHEST FLAG CAPT CDR LCDR LT LTJG ENS" row
  
  // Extract Year Group
  const yrgMatch = text.match(/YG\s*(\d{2})/i);
  if (yrgMatch) {
    result.yearGroup = yrgMatch[1];
  }
  
  // Extract designator
  const designatorMatch = text.match(/DESIGNATOR[^\d]*(\d{4})/i) || text.match(/\b(2100|2105)\b/);
  if (designatorMatch) {
    result.designator = designatorMatch[1];
  }
  
  // Extract promotion dates from the "HIGHEST FLAG" row
  // Format: "240901 180901 120521" under CDR, LCDR, LT columns
  const promotionMatch = text.match(/HIGHEST\s+FLAG.*?(\d{6})\s+(\d{6})\s+(\d{6})/i);
  if (promotionMatch) {
    // These are in YYMMDD format in OSR (different from ODC!)
    const dates = [promotionMatch[1], promotionMatch[2], promotionMatch[3]]
      .map(d => parseYYMMDD(d))
      .filter(d => d && isValidPromotionDate(d));
    
    // OSR shows: CDR date, LCDR date, LT date
    const ranks = ['CDR', 'LCDR', 'LT'];
    for (let i = 0; i < dates.length; i++) {
      if (dates[i]) {
        result.rankHistory!.push({ rank: ranks[i], dateOfRank: dates[i]! });
      }
    }
  }
  
  // Fallback: look for dates in the header area
  if (result.rankHistory!.length === 0) {
    const allDates = [...text.matchAll(/\b(\d{6})\b/g)];
    const validDates = allDates
      .map(m => {
        // Try both formats
        const mmddyy = parseMMDDYY(m[1]);
        const yymmdd = parseYYMMDD(m[1]);
        return mmddyy && isValidPromotionDate(mmddyy) ? mmddyy :
               yymmdd && isValidPromotionDate(yymmdd) ? yymmdd : null;
      })
      .filter(d => d !== null);
    
    const uniqueDates = [...new Set(validDates)].sort(
      (a, b) => new Date(a!).getTime() - new Date(b!).getTime()
    );
    
    const mcRanks = ['LT', 'LCDR', 'CDR', 'CAPT'];
    for (let i = 0; i < uniqueDates.length && i < mcRanks.length; i++) {
      result.rankHistory!.push({ rank: mcRanks[i], dateOfRank: uniqueDates[i]! });
    }
  }
  
  // Extract subspecialty/board certification
  const subspecMatch = text.match(/\b(\d{2}[A-Z]\d[JK])\b/);
  if (subspecMatch) {
    result.subspecialtyCode = subspecMatch[1];
    result.boardCertified = subspecMatch[1].endsWith('K');
  }
  
  // Extract AQDs from "SPECIAL QUALIFICATIONS" section
  result.aqds = extractAQDs(text);
  
  // Extract education
  result.education = extractEducation(text);
  
  // Extract current station/billet
  const stationMatch = text.match(/PRESENT DUTY STATION[^\n]*\n\s*([^\n]+)/i);
  if (stationMatch) {
    result.currentStation = stationMatch[1].trim();
  }
  
  const billetMatch = text.match(/PRESENT BILLET[^\n]*\n\s*([^\n]+)/i);
  if (billetMatch) {
    result.currentBillet = billetMatch[1].trim();
  }
  
  return result;
}

// ============================================================================
// PSR PARSING
// ============================================================================

/**
 * Parse Performance Summary Report (PSR) text
 */
export function parsePSR(text: string): PSRAnalysisResult {
  console.log('=== PARSING PSR ===');
  
  const fitreps: FitrepEntry[] = [];
  const issues: string[] = [];
  
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Skip header lines
    if (line.includes('PERFORMANCE SUMMARY') || 
        line.includes('NAME(LAST') ||
        line.includes('REPORTING SENIOR') ||
        line.includes('PAGE') ||
        line.includes('TRAITS') ||
        !line.trim()) {
      continue;
    }
    
    // PSR line pattern:
    // PG | STATION | DUTY | DATES | MOS | RS NAME | RS PG | RS TITLE | TRAITS 1-5 | IND AVG | CUM AVG | RS# | RS CUM | PROMO REC | PRT | TYPE
    // Example: "O3 NAVHOSP CAMPE PGY 1 061212 8 IVERSON 06 CO 0 0 4 2 0 3.33 307 X p"
    //          "N TRN 013113 K J 3.33 3.79 0 0 12 0 0 RG"
    
    // Look for lines starting with pay grade (O1, O2, O3, O4, O5, O6)
    const pgMatch = line.match(/^(O[1-6])\s+/i);
    if (!pgMatch) continue;
    
    const payGrade = pgMatch[1].toUpperCase();
    
    // Extract station and duty
    const stationMatch = line.match(/O[1-6]\s+([A-Z\-]+\s+[A-Z]+)/i);
    const station = stationMatch ? stationMatch[1].trim() : 'Unknown';
    
    // Extract dates (MMDDYY format)
    const dateMatches = [...line.matchAll(/\b(\d{6})\b/g)];
    if (dateMatches.length < 1) continue;
    
    const startDate = parseMMDDYY(dateMatches[0][1]);
    // End date might be on next line or same line
    let endDate: string | null = null;
    
    // Look for second date
    if (dateMatches.length >= 2) {
      const potentialEndDate = parseMMDDYY(dateMatches[1][1]);
      // Make sure it's after start date
      if (potentialEndDate && startDate && new Date(potentialEndDate) > new Date(startDate)) {
        endDate = potentialEndDate;
      }
    }
    
    if (!startDate) continue;
    
    // Extract reporting senior name (usually UPPERCASE name followed by initials)
    const rsMatch = line.match(/\b([A-Z]{4,})\s+([A-Z])\s+([A-Z])\b/);
    const rsName = rsMatch ? rsMatch[1] : 'Unknown';
    
    // Extract traits (5 numbers in a row)
    const traitsMatch = line.match(/\b(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d+\.\d+)/);
    const traits = traitsMatch ? 
      [parseInt(traitsMatch[1]), parseInt(traitsMatch[2]), parseInt(traitsMatch[3]), 
       parseInt(traitsMatch[4]), parseInt(traitsMatch[5])] : 
      [0, 0, 0, 0, 0];
    const indAvg = traitsMatch ? parseFloat(traitsMatch[6]) : 0;
    
    // Extract promotion recommendations
    // Format: SP PR P MP EP (counts at each level)
    const promoMatch = line.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+[PN]?\s*(RG|AT|CC)/i);
    const promotionRec = promoMatch ? {
      sp: parseInt(promoMatch[1]),
      pr: parseInt(promoMatch[2]),
      p: parseInt(promoMatch[3]),
      mp: parseInt(promoMatch[4]),
      ep: parseInt(promoMatch[5]),
    } : { sp: 0, pr: 0, p: 0, mp: 0, ep: 0 };
    
    // Extract PRT and report type
    const prtMatch = line.match(/\b([PNB])\s*(RG|AT|CC|TR)\b/i);
    const prt = prtMatch ? prtMatch[1].toUpperCase() : '';
    const reportType = prtMatch ? prtMatch[2].toUpperCase() : 'RG';
    
    // Calculate months
    let months = 0;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      months = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
    }
    
    fitreps.push({
      payGrade,
      station,
      duty: '', // Would need more parsing
      startDate: startDate || '',
      endDate: endDate || '',
      months,
      reportingSenior: {
        name: rsName,
        payGrade: 'O6', // Usually CO is O6
        title: 'CO',
      },
      traits,
      individualAverage: indAvg,
      cumulativeAverage: 0, // Would need more parsing
      rsAverage: 0,
      promotionRec,
      prt,
      reportType,
    });
  }
  
  // Simplified parsing: Look for promotion recommendation columns
  // The PSR shows columns: SP PR P MP EP with X marks
  const xMarkPattern = /(\d+)\s+(\d+)\s+(\d+)\s+X?\s*(\d+)\s+X?\s*(\d+)/g;
  
  console.log('Parsed', fitreps.length, 'FITREP entries');
  
  // Analyze for issues
  analyzeForIssues(fitreps, issues);
  
  // Calculate summary
  const summary = calculateSummary(fitreps);
  
  return { fitreps, issues, summary };
}

/**
 * Analyze FITREPs for issues (leftward movement, gaps, etc.)
 */
function analyzeForIssues(fitreps: FitrepEntry[], issues: string[]): void {
  if (fitreps.length < 2) return;
  
  // Sort by end date
  const sorted = [...fitreps]
    .filter(f => f.endDate)
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  
  let previousEntry: FitrepEntry | null = null;
  
  for (const entry of sorted) {
    if (previousEntry) {
      // Check for date gaps
      const prevEnd = new Date(previousEntry.endDate);
      const currStart = new Date(entry.startDate);
      const gapDays = Math.floor((currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24));
      
      if (gapDays > 30) {
        issues.push(`⚠️ DATE GAP: ${gapDays}-day gap between ${previousEntry.endDate} and ${entry.startDate}`);
      }
      
      // Check for leftward movement (worse promotion rec with same RS and rank)
      if (entry.payGrade === previousEntry.payGrade &&
          entry.reportingSenior.name === previousEntry.reportingSenior.name) {
        
        // Calculate "promotion score" (higher = better)
        const prevScore = previousEntry.promotionRec.ep * 4 + previousEntry.promotionRec.mp * 3 + 
                         previousEntry.promotionRec.p * 2 + previousEntry.promotionRec.pr * 1;
        const currScore = entry.promotionRec.ep * 4 + entry.promotionRec.mp * 3 + 
                         entry.promotionRec.p * 2 + entry.promotionRec.pr * 1;
        
        if (currScore < prevScore && prevScore > 0) {
          issues.push(
            `🔴 LEFTWARD MOVEMENT: Promotion recommendation declined with same reporting senior (${entry.reportingSenior.name}) ` +
            `at ${entry.payGrade}. This is concerning and should be addressed. (Period ending: ${entry.endDate})`
          );
        }
      }
    }
    
    // Check for concurrent/soft breakout reports
    if (entry.reportType === 'CC') {
      issues.push(`📋 CONCURRENT REPORT: Soft breakout detected for period ending ${entry.endDate}`);
    }
    
    previousEntry = entry;
  }
}

/**
 * Calculate PSR summary statistics
 */
function calculateSummary(fitreps: FitrepEntry[]): PSRAnalysisResult['summary'] {
  const validFitreps = fitreps.filter(f => f.individualAverage > 0);
  
  const totalFitreps = validFitreps.length;
  const averageIndividual = totalFitreps > 0 ?
    validFitreps.reduce((sum, f) => sum + f.individualAverage, 0) / totalFitreps : 0;
  
  const epCount = validFitreps.reduce((sum, f) => sum + f.promotionRec.ep, 0);
  const mpCount = validFitreps.reduce((sum, f) => sum + f.promotionRec.mp, 0);
  const pCount = validFitreps.reduce((sum, f) => sum + f.promotionRec.p, 0);
  
  // Determine trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (validFitreps.length >= 3) {
    const recentAvg = validFitreps.slice(-2).reduce((sum, f) => sum + f.individualAverage, 0) / 2;
    const olderAvg = validFitreps.slice(0, -2).reduce((sum, f) => sum + f.individualAverage, 0) / 
                     Math.max(1, validFitreps.length - 2);
    
    if (recentAvg > olderAvg + 0.1) trend = 'improving';
    else if (recentAvg < olderAvg - 0.1) trend = 'declining';
  }
  
  return {
    totalFitreps,
    averageIndividual,
    epCount,
    mpCount,
    pCount,
    trend,
    hasLeftwardMovement: false, // Will be set based on issues
    hasDateGaps: false,
    hasSoftBreakouts: false,
  };
}

// ============================================================================
// COMBINED PARSING
// ============================================================================

/**
 * Merge data from multiple documents
 */
export function mergeOfficerData(
  odcData: Partial<ParsedOfficerData> | null,
  osrData: Partial<ParsedOfficerData> | null
): ParsedOfficerData {
  const merged: ParsedOfficerData = {
    rankHistory: [],
    currentRank: '',
    yearGroup: '',
    designator: '',
    boardCertified: null,
    subspecialtyCode: '',
    education: { undergrad: null, medical: null },
    courses: [],
    aqds: [],
    securityClearance: null,
    currentStation: '',
    currentBillet: '',
    warnings: [],
    source: 'combined',
  };
  
  // Merge rank history (prefer ODC as it's more detailed)
  if (odcData?.rankHistory && odcData.rankHistory.length > 0) {
    merged.rankHistory = odcData.rankHistory;
  } else if (osrData?.rankHistory && osrData.rankHistory.length > 0) {
    merged.rankHistory = osrData.rankHistory;
  }
  
  // Determine current rank from merged history
  merged.currentRank = determineCurrentRank(merged.rankHistory);
  
  // Merge other fields (prefer ODC, fall back to OSR)
  merged.yearGroup = odcData?.yearGroup || osrData?.yearGroup || '';
  merged.designator = odcData?.designator || osrData?.designator || '';
  merged.boardCertified = odcData?.boardCertified ?? osrData?.boardCertified ?? null;
  merged.subspecialtyCode = odcData?.subspecialtyCode || osrData?.subspecialtyCode || '';
  merged.securityClearance = odcData?.securityClearance || osrData?.securityClearance || null;
  merged.currentStation = odcData?.currentStation || osrData?.currentStation || '';
  merged.currentBillet = odcData?.currentBillet || osrData?.currentBillet || '';
  
  // Merge education
  merged.education = {
    undergrad: odcData?.education?.undergrad || osrData?.education?.undergrad || null,
    medical: odcData?.education?.medical || osrData?.education?.medical || null,
  };
  
  // Merge courses (deduplicate by code)
  const allCourses = [...(odcData?.courses || []), ...(osrData?.courses || [])];
  const uniqueCourses = new Map<string, typeof allCourses[0]>();
  for (const course of allCourses) {
    if (!uniqueCourses.has(course.code)) {
      uniqueCourses.set(course.code, course);
    }
  }
  merged.courses = Array.from(uniqueCourses.values());
  
  // Merge AQDs (deduplicate by code)
  const allAQDs = [...(odcData?.aqds || []), ...(osrData?.aqds || [])];
  const uniqueAQDs = new Map<string, AQDEntry>();
  for (const aqd of allAQDs) {
    if (!uniqueAQDs.has(aqd.code)) {
      uniqueAQDs.set(aqd.code, aqd);
    }
  }
  merged.aqds = Array.from(uniqueAQDs.values());
  
  // Merge warnings
  merged.warnings = [...(odcData?.warnings || []), ...(osrData?.warnings || [])];
  
  return merged;
}