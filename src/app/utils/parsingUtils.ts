/**
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
  payGrade: string;
  periodStart: string;
  periodEnd: string;
  reportingSenior: string;
  rsGrade: string;
  individualAverage: number;
  cumulativeAverage: number;
  rsAverage: number;
  summaryGroup: string;
  promotionRec: string;
  trait1: number;
  trait2: number;
  trait3: number;
  trait4: number;
  trait5: number;
  physicalReadiness: string;
  reportType: string;
}

export interface PSRAnalysisResult {
  fitreps: FitrepEntry[];
  issues: string[];
  summary: {
    totalFitreps: number;
    averageIndividual: number;
    averageCumulative: number;
    epCount: number;
    mpCount: number;
    pCount: number;
    trend: 'improving' | 'stable' | 'declining';
  };
}

export interface ParsedOfficerData {
  rankHistory: RankDate[];
  currentRank: string;
  yearGroup: string;
  designator: string;
  boardCertified: boolean | null;
  subspecialtyCode: string;
  education: {
    undergrad: { school: string; year: string; degree: string; major: string } | null;
    medical: { school: string; year: string; degree: string; major: string } | null;
  };
  courses: { code: string; name: string; completionDate: string; weeks: number }[];
  aqds: AQDEntry[];
  securityClearance: {
    eligibility: string;
    level: string;
    investigationDate: string;
    grantedDate: string;
    expirationDate: string;
  } | null;
  currentStation: string;
  currentBillet: string;
  warnings: string[];
  source: 'ODC' | 'OSR' | 'combined';
}

// ============================================================================
// VALID AQD CODES - Whitelist approach
// ============================================================================

const VALID_AQD_CODES: { [code: string]: string } = {
  // Executive/Leadership
  '67A': 'Executive Medicine',
  '67B': 'Expeditionary Medicine',
  '67G': 'Managed Care Executive',
  'ELI': 'Executive Medicine (Legacy)',
  
  // Joint PME
  'JS7': 'JPME Phase I',
  'JS8': 'JPME Phase II',
  'JCO': 'Joint Qualified Officer',
  
  // Academic/Faculty
  '62D': 'Faculty Development',
  '6ZB': 'Assistant Professor',
  '6ZC': 'Associate Professor',
  '6ZF': 'Researcher',
  '6ZP': 'Professor',
  
  // Operational/Specialty
  '68M': 'Global Health Engagement',
  '68O': 'Medical Milestone E',
  '6OC': 'Hospital Ship',
  'FMF': 'Fleet Marine Force',
  'SWO': 'Surface Warfare',
  'SCW': 'Seabee Combat Warfare',
  'DMO': 'Diving Medical Officer',
  'UMO': 'Undersea Medical Officer',
  'SMO': 'Submarine Medical Officer',
  'AMO': 'Aviation Medical Officer',
  'RAD': 'Radiation Health',
  'FSO': 'Flight Surgeon',
  'NFS': 'Naval Flight Surgeon',
  'AFS': 'Aerospace Physiologist',
  
  // Training
  'GME': 'Graduate Medical Education',
  'RES': 'Residency Trained',
  'FEL': 'Fellowship Trained',
  'CAC': 'Combat Casualty Care',
  'TRM': 'Trauma',
  'ICU': 'Critical Care',
  'EMT': 'Emergency Medicine',
};

// Security clearance codes
const CLEARANCE_CODES: { [code: string]: string } = {
  'V': 'Top Secret - SCI Eligible',
  'T': 'Top Secret',
  'S': 'Secret',
  'C': 'Confidential',
  'N': 'None',
};

// ============================================================================
// DATE PARSING UTILITIES
// ============================================================================

/**
 * Parse MMDDYY format (e.g., 090124 = Sep 1, 2024)
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
  
  // Assume 00-50 = 2000-2050, 51-99 = 1951-1999
  const yyyy = yearNum <= 50 ? `20${yy}` : `19${yy}`;
  
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse MMYY format (e.g., 0615 = June 2015)
 */
function parseMMYY(dateStr: string): string | null {
  const cleaned = dateStr.trim();
  
  if (cleaned.length !== 4 || !/^\d{4}$/.test(cleaned)) {
    return null;
  }
  
  const mm = cleaned.substring(0, 2);
  const yy = cleaned.substring(2, 4);
  
  const monthNum = parseInt(mm);
  const yearNum = parseInt(yy);
  
  if (monthNum < 1 || monthNum > 12) {
    return null;
  }
  
  const yyyy = yearNum <= 50 ? `20${yy}` : `19${yy}`;
  
  return `${yyyy}-${mm}`;
}

/**
 * Calculate clearance expiration: TS = 6 years, Secret = 10 years
 */
function calculateClearanceExpiration(grantedDate: string, level: string): string {
  if (!grantedDate) return '';
  
  const [year, month] = grantedDate.split('-').map(Number);
  const yearsValid = level.includes('Top Secret') ? 6 : 10;
  
  return `${year + yearsValid}-${month.toString().padStart(2, '0')}`;
}

function isValidPromotionDate(dateStr: string): boolean {
  const year = parseInt(dateStr.substring(0, 4));
  return year >= 1990 && year <= 2040;
}

export function determineCurrentRank(rankHistory: RankDate[]): string {
  if (rankHistory.length === 0) return '';
  
  const today = new Date();
  const sorted = [...rankHistory].sort(
    (a, b) => new Date(a.dateOfRank).getTime() - new Date(b.dateOfRank).getTime()
  );
  
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
  
  // Extract designator (block 4) - look for 2100, 2105, 2300, etc.
  const designatorMatch = text.match(/\b(2100|2105|2300|2305|2310|2315|2320|2325|2330|2335|2340|2345|2350|2355|2500|2505|2510)\b/);
  if (designatorMatch) {
    result.designator = designatorMatch[1];
    console.log('Found designator:', result.designator);
  }
  
  // Extract current grade from block 5 (e.g., "LCDR" or "CDR")
  const gradeMatch = text.match(/\b(ENS|LTJG|LT|LCDR|CDR|CAPT|RDML|RADM)\s+\d{2}\s+\d+/);
  if (gradeMatch) {
    result.currentRank = gradeMatch[1];
    console.log('Found grade from block 5:', result.currentRank);
  }
  
  // Extract Year Group (block 6)
  const yrgMatch = text.match(/\b(ENS|LTJG|LT|LCDR|CDR|CAPT)\s+(\d{2})\s+\d+/);
  if (yrgMatch) {
    result.yearGroup = yrgMatch[2];
    console.log('Found year group:', result.yearGroup);
  }
  
  // Extract promotion history - look for DOR line with 6-digit dates
  // Format: "DOR" followed by dates like "090124  090118  052112"
  result.rankHistory = extractPromotionHistoryFromODC(text);
  
  // Determine actual current rank based on DOR dates
  if (result.rankHistory.length > 0) {
    const actualCurrentRank = determineCurrentRank(result.rankHistory);
    if (actualCurrentRank) {
      console.log(`Actual current rank based on DOR: ${actualCurrentRank}`);
      result.currentRank = actualCurrentRank;
    }
  }
  
  // Extract subspecialty/board certification (look for pattern like 16Q0K or 16Q0J)
  const subspecMatch = text.match(/\b(\d{2}[A-Z]\d[JK])\b/);
  if (subspecMatch) {
    result.subspecialtyCode = subspecMatch[1];
    result.boardCertified = subspecMatch[1].endsWith('K');
    console.log('Found subspecialty:', result.subspecialtyCode, 'Board certified:', result.boardCertified);
  }
  
  // Extract AQDs from block 72 section
  result.aqds = extractAQDsFromODC(text);
  
  // Extract courses from block 52
  result.courses = extractCoursesFromODC(text);
  
  // Extract education
  result.education = extractEducationFromODC(text);
  
  // Extract security clearance (blocks 92/93)
  result.securityClearance = extractSecurityClearance(text);
  
  // Extract current duty station and billet
  const stationMatch = text.match(/PRESENT DUTY STATION\s*\n?\s*([A-Z0-9\s]+?)(?:\s{2,}|$)/i) ||
                       text.match(/\b(1ST MED BN|USUHS|NAVHOSP\s+\w+|NMRTC\s+\w+|NMCSD|NMCP)/i);
  if (stationMatch) {
    result.currentStation = stationMatch[1].trim();
    console.log('Found station:', result.currentStation);
  }
  
  const billetMatch = text.match(/DIR\s+[A-Z\/]+|DEPT\s+HEAD|GMO|RESIDNT|FELLOW/i);
  if (billetMatch) {
    result.currentBillet = billetMatch[0].trim();
    console.log('Found billet:', result.currentBillet);
  }
  
  return result;
}

/**
 * Extract promotion history from ODC
 * Looks for the DOR line which contains dates in MMDDYY format
 * Order is typically: FLAG, CAPT, CDR, LCDR, LT, LTJG, ENS
 */
function extractPromotionHistoryFromODC(text: string): RankDate[] {
  const ranks: RankDate[] = [];
  
  console.log('Extracting promotion history...');
  
  // Look for the DOR line - it follows the rank headers
  // Pattern: "DOR" followed by multiple 6-digit dates
  const dorLineMatch = text.match(/DOR\s*\n?\s*([\d\s]+)/i) ||
                       text.match(/(\d{6}\s+\d{6}\s+\d{6})/);
  
  if (dorLineMatch) {
    console.log('Found DOR line:', dorLineMatch[0]);
    
    // Extract all 6-digit dates
    const dateMatches = dorLineMatch[0].match(/\b(\d{6})\b/g);
    
    if (dateMatches) {
      console.log('Date matches:', dateMatches);
      
      // ODC format: dates are in order from senior to junior
      // Typical order: FLAG, CAPT, CDR, LCDR, LT, LTJG, ENS
      // But most officers won't have all ranks, so we need to figure out which dates go with which ranks
      
      const validDates: { raw: string; parsed: string }[] = [];
      
      for (const dateStr of dateMatches) {
        const parsed = parseMMDDYY(dateStr);
        if (parsed && isValidPromotionDate(parsed)) {
          validDates.push({ raw: dateStr, parsed });
        }
      }
      
      console.log('Valid dates:', validDates);
      
      // Sort dates chronologically (oldest first)
      validDates.sort((a, b) => new Date(a.parsed).getTime() - new Date(b.parsed).getTime());
      
      // Standard Medical Corps progression (most officers follow this)
      const rankProgression = ['LT', 'LCDR', 'CDR', 'CAPT', 'RDML', 'RADM'];
      
      // Assign ranks based on number of dates
      // If we have 3 dates, they're probably LT, LCDR, CDR
      for (let i = 0; i < validDates.length && i < rankProgression.length; i++) {
        ranks.push({
          rank: rankProgression[i],
          dateOfRank: validDates[i].parsed,
        });
      }
      
      console.log('Extracted rank history:', ranks);
    }
  }
  
  // If we didn't find DOR line, try alternative pattern
  if (ranks.length === 0) {
    console.log('DOR line not found, trying alternative extraction...');
    
    // Look for dates near rank names
    const rankPatterns = [
      { rank: 'CAPT', pattern: /CAPT[^\d]*(\d{6})/i },
      { rank: 'CDR', pattern: /\bCDR[^\d]*(\d{6})/i },
      { rank: 'LCDR', pattern: /LCDR[^\d]*(\d{6})/i },
      { rank: 'LT', pattern: /\bLT\s+(\d{6})/i },
    ];
    
    for (const { rank, pattern } of rankPatterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = parseMMDDYY(match[1]);
        if (parsed && isValidPromotionDate(parsed)) {
          ranks.push({ rank, dateOfRank: parsed });
        }
      }
    }
  }
  
  return ranks;
}

/**
 * Extract AQDs from ODC block 72
 * Format: CODE YY TITLE (e.g., "62D 22 *FACULTY DEV")
 */
function extractAQDsFromODC(text: string): AQDEntry[] {
  const aqds: AQDEntry[] = [];
  const foundCodes = new Set<string>();
  
  console.log('Extracting AQDs...');
  
  // Look for AQD section (block 72)
  // Pattern: 3-character code, 2-digit year, title
  const aqdPattern = /\b([A-Z0-9]{2,3})\s+(\d{2})\s+\*?([A-Z\s]+)/g;
  
  let match;
  while ((match = aqdPattern.exec(text)) !== null) {
    const code = match[1];
    const year = match[2];
    const title = match[3].trim();
    
    // Only accept if it's a known valid AQD code
    if (VALID_AQD_CODES[code] && !foundCodes.has(code)) {
      foundCodes.add(code);
      aqds.push({
        code,
        year: `20${year}`,
        title: VALID_AQD_CODES[code] || title.substring(0, 30),
      });
      console.log('Found AQD:', code, year, title);
    }
  }
  
  // Also try to find standalone known codes
  for (const [code, defaultTitle] of Object.entries(VALID_AQD_CODES)) {
    if (!foundCodes.has(code)) {
      const standalonePattern = new RegExp(`\\b${code}\\s+(\\d{2})\\b`, 'i');
      const standaloneMatch = text.match(standalonePattern);
      if (standaloneMatch) {
        foundCodes.add(code);
        aqds.push({
          code,
          year: `20${standaloneMatch[1]}`,
          title: defaultTitle,
        });
        console.log('Found standalone AQD:', code);
      }
    }
  }
  
  console.log('Total AQDs found:', aqds.length);
  return aqds;
}

/**
 * Extract courses from ODC block 52
 * Format: CODE COURSE_NAME MMYY DUR
 */
function extractCoursesFromODC(text: string): { code: string; name: string; completionDate: string; weeks: number }[] {
  const courses: { code: string; name: string; completionDate: string; weeks: number }[] = [];
  
  // Pattern: 3-digit code, course name, MMYY completion, 2-digit duration
  const coursePattern = /\b(\d{3})\s+([A-Za-z\s]+?)\s+(\d{4})\s+(\d{1,2})\b/g;
  
  let match;
  while ((match = coursePattern.exec(text)) !== null) {
    const code = match[1];
    const name = match[2].trim();
    const complDate = match[3];
    const weeks = parseInt(match[4]);
    
    // Validate - course names should be reasonable length
    if (name.length >= 3 && name.length <= 30 && weeks > 0 && weeks < 52) {
      const parsedDate = parseMMYY(complDate);
      if (parsedDate) {
        courses.push({
          code,
          name,
          completionDate: parsedDate,
          weeks,
        });
      }
    }
  }
  
  console.log('Courses found:', courses.length);
  return courses;
}

/**
 * Extract education from ODC (blocks 54-60)
 */
function extractEducationFromODC(text: string): ParsedOfficerData['education'] {
  const education: ParsedOfficerData['education'] = {
    undergrad: null,
    medical: null,
  };
  
  // Look for medical school - pattern: SCHOOL YY DOCTOR MEDICINE
  const medMatch = text.match(/([A-Z]+(?:\s+[A-Z]+)?)\s+(\d{2})\s+DOCTOR\s+([A-Z]+)/i);
  if (medMatch) {
    education.medical = {
      school: medMatch[1].trim(),
      year: `20${medMatch[2]}`,
      degree: 'MD',
      major: medMatch[3].trim(),
    };
    console.log('Found medical education:', education.medical);
  }
  
  // Look for undergrad - pattern: SCHOOL YY BACH/... MAJOR
  const undergradMatch = text.match(/([A-Z]+(?:\s+[A-Z]+)?)\s+(\d{2})\s+BACH[A-Z\/]*\s+([A-Z]+)/i);
  if (undergradMatch) {
    education.undergrad = {
      school: undergradMatch[1].trim(),
      year: `20${undergradMatch[2]}`,
      degree: 'BS',
      major: undergradMatch[3].trim(),
    };
    console.log('Found undergrad education:', education.undergrad);
  }
  
  return education;
}

/**
 * Extract security clearance from blocks 92 and 93
 * Format: [Eligibility Code] [Actual Code] [Investigation MMYY] [Granted MMYY]
 */
function extractSecurityClearance(text: string): ParsedOfficerData['securityClearance'] {
  console.log('Extracting security clearance...');
  
  // Pattern: Two clearance codes (V, T, S, C, N) followed by two 4-digit dates
  const fullPattern = /\b([VTSCN])\s+([VTSCN])\s+(\d{4})\s+(\d{4})\b/i;
  const match = text.match(fullPattern);
  
  if (match) {
    const eligibilityCode = match[1].toUpperCase();
    const actualCode = match[2].toUpperCase();
    const investigationMMYY = match[3];
    const grantedMMYY = match[4];
    
    const eligibility = CLEARANCE_CODES[eligibilityCode] || eligibilityCode;
    const level = CLEARANCE_CODES[actualCode] || actualCode;
    const investigationDate = parseMMYY(investigationMMYY) || '';
    const grantedDate = parseMMYY(grantedMMYY) || '';
    const expirationDate = calculateClearanceExpiration(grantedDate, level);
    
    console.log('Found clearance:', { eligibility, level, investigationDate, grantedDate, expirationDate });
    
    return {
      eligibility,
      level,
      investigationDate,
      grantedDate,
      expirationDate,
    };
  }
  
  // Try simpler pattern - just two codes and one date
  const simplePattern = /\b([VTSCN])\s+([VTSCN])\s+(\d{4})\b/i;
  const simpleMatch = text.match(simplePattern);
  
  if (simpleMatch) {
    const eligibilityCode = simpleMatch[1].toUpperCase();
    const actualCode = simpleMatch[2].toUpperCase();
    const dateMMYY = simpleMatch[3];
    
    const eligibility = CLEARANCE_CODES[eligibilityCode] || eligibilityCode;
    const level = CLEARANCE_CODES[actualCode] || actualCode;
    const investigationDate = parseMMYY(dateMMYY) || '';
    
    console.log('Found clearance (simple):', { eligibility, level, investigationDate });
    
    return {
      eligibility,
      level,
      investigationDate,
      grantedDate: '',
      expirationDate: '',
    };
  }
  
  console.log('No security clearance found');
  return null;
}

// ============================================================================
// OSR PARSING
// ============================================================================

export function parseOSR(text: string): Partial<ParsedOfficerData> {
  const result: Partial<ParsedOfficerData> = {
    rankHistory: [],
    aqds: [],
    courses: [],
    warnings: [],
    source: 'OSR',
  };
  
  console.log('=== PARSING OSR ===');
  
  // OSR parsing is similar to ODC but may have different layout
  // Reuse ODC extraction functions
  
  const yrgMatch = text.match(/YG\s*(\d{2})/i);
  if (yrgMatch) {
    result.yearGroup = yrgMatch[1];
  }
  
  const designatorMatch = text.match(/\b(2100|2105|2300|2305)\b/);
  if (designatorMatch) {
    result.designator = designatorMatch[1];
  }
  
  result.rankHistory = extractPromotionHistoryFromODC(text);
  result.aqds = extractAQDsFromODC(text);
  result.education = extractEducationFromODC(text);
  result.securityClearance = extractSecurityClearance(text);
  
  return result;
}

// ============================================================================
// PSR PARSING
// ============================================================================

export function parsePSR(text: string): PSRAnalysisResult {
  console.log('=== PARSING PSR ===');
  console.log('PSR text length:', text.length);
  console.log('PSR text preview:', text.substring(0, 500));
  
  const fitreps: FitrepEntry[] = [];
  const issues: string[] = [];
  
  // PSR format is tabular - each row is a FITREP record
  // Look for lines that start with pay grade (O1-O6)
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Skip header lines
    if (line.includes('PERFORMANCE SUMMARY') ||
        line.includes('NAME(LAST') ||
        line.includes('REPORTING SENIOR') ||
        line.includes('TRAITS') ||
        !line.trim()) {
      continue;
    }
    
    // Look for lines starting with O-grade
    const gradeMatch = line.match(/^\s*(O-?[1-6]|O[1-6])\s+/i);
    if (!gradeMatch) continue;
    
    console.log('Found FITREP line:', line.substring(0, 100));
    
    const payGrade = gradeMatch[1].replace('-', '').toUpperCase();
    
    // Extract dates (MMDDYY format)
    const dateMatches = [...line.matchAll(/\b(\d{6})\b/g)];
    const periodStart = dateMatches.length > 0 ? parseMMDDYY(dateMatches[0][1]) || '' : '';
    const periodEnd = dateMatches.length > 1 ? parseMMDDYY(dateMatches[1][1]) || '' : '';
    
    // Extract trait scores (looking for 5 single digits or decimal averages)
    const traitMatch = line.match(/\b([1-5])\s+([1-5])\s+([1-5])\s+([1-5])\s+([1-5])\b/);
    const traits = traitMatch ? 
      [parseInt(traitMatch[1]), parseInt(traitMatch[2]), parseInt(traitMatch[3]), 
       parseInt(traitMatch[4]), parseInt(traitMatch[5])] :
      [0, 0, 0, 0, 0];
    
    // Extract averages (decimal numbers like 4.60)
    const avgMatches = [...line.matchAll(/\b(\d\.\d{2})\b/g)];
    const individualAverage = avgMatches.length > 0 ? parseFloat(avgMatches[0][1]) : 0;
    const cumulativeAverage = avgMatches.length > 1 ? parseFloat(avgMatches[1][1]) : 0;
    const rsAverage = avgMatches.length > 2 ? parseFloat(avgMatches[2][1]) : 0;
    
    // Extract promotion recommendation (EP, MP, P, PR, SP)
    const promoMatch = line.match(/\b(EP|MP|P|PR|SP)\b/i);
    const promotionRec = promoMatch ? promoMatch[1].toUpperCase() : '';
    
    // Extract report type (RG = Regular, TR = Transfer, CC = Concurrent)
    const typeMatch = line.match(/\b(RG|TR|CC|AT|NOB)\b/i);
    const reportType = typeMatch ? typeMatch[1].toUpperCase() : 'RG';
    
    // Extract physical readiness (P = Pass, N = Not observed, F = Fail)
    const prtMatch = line.match(/\b([PNF])\s+(RG|TR|CC|AT)/i);
    const physicalReadiness = prtMatch ? prtMatch[1].toUpperCase() : '';
    
    // Extract summary group
    const sgMatch = line.match(/\b(\d{1,2})\s+OF\s+(\d{1,2})\b/i);
    const summaryGroup = sgMatch ? `${sgMatch[1]} of ${sgMatch[2]}` : '';
    
    fitreps.push({
      payGrade,
      periodStart,
      periodEnd,
      reportingSenior: '',
      rsGrade: '',
      individualAverage,
      cumulativeAverage,
      rsAverage,
      summaryGroup,
      promotionRec,
      trait1: traits[0],
      trait2: traits[1],
      trait3: traits[2],
      trait4: traits[3],
      trait5: traits[4],
      physicalReadiness,
      reportType,
    });
  }
  
  console.log('Parsed', fitreps.length, 'FITREP entries');
  
  // Calculate summary statistics
  const summary = calculatePSRSummary(fitreps);
  
  // Analyze for issues
  analyzePSRIssues(fitreps, issues);
  
  return { fitreps, issues, summary };
}

function calculatePSRSummary(fitreps: FitrepEntry[]): PSRAnalysisResult['summary'] {
  const validFitreps = fitreps.filter(f => f.individualAverage > 0);
  
  const totalFitreps = validFitreps.length;
  const averageIndividual = totalFitreps > 0 ?
    validFitreps.reduce((sum, f) => sum + f.individualAverage, 0) / totalFitreps : 0;
  const averageCumulative = totalFitreps > 0 ?
    validFitreps.reduce((sum, f) => sum + f.cumulativeAverage, 0) / totalFitreps : 0;
  
  const epCount = validFitreps.filter(f => f.promotionRec === 'EP').length;
  const mpCount = validFitreps.filter(f => f.promotionRec === 'MP').length;
  const pCount = validFitreps.filter(f => f.promotionRec === 'P').length;
  
  // Determine trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (validFitreps.length >= 3) {
    const sortedByDate = [...validFitreps].sort((a, b) => 
      new Date(a.periodEnd || '').getTime() - new Date(b.periodEnd || '').getTime()
    );
    const recent = sortedByDate.slice(-2);
    const older = sortedByDate.slice(0, -2);
    
    if (recent.length > 0 && older.length > 0) {
      const recentAvg = recent.reduce((s, f) => s + f.individualAverage, 0) / recent.length;
      const olderAvg = older.reduce((s, f) => s + f.individualAverage, 0) / older.length;
      
      if (recentAvg > olderAvg + 0.1) trend = 'improving';
      else if (recentAvg < olderAvg - 0.1) trend = 'declining';
    }
  }
  
  return {
    totalFitreps,
    averageIndividual: Math.round(averageIndividual * 100) / 100,
    averageCumulative: Math.round(averageCumulative * 100) / 100,
    epCount,
    mpCount,
    pCount,
    trend,
  };
}

function analyzePSRIssues(fitreps: FitrepEntry[], issues: string[]): void {
  // Sort by end date
  const sorted = [...fitreps]
    .filter(f => f.periodEnd)
    .sort((a, b) => new Date(a.periodEnd).getTime() - new Date(b.periodEnd).getTime());
  
  // Check for date gaps
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = new Date(sorted[i - 1].periodEnd);
    const currStart = new Date(sorted[i].periodStart);
    const gapDays = Math.floor((currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24));
    
    if (gapDays > 30) {
      issues.push(`⚠️ DATE GAP: ${gapDays}-day gap between ${sorted[i - 1].periodEnd} and ${sorted[i].periodStart}`);
    }
  }
  
  // Check for soft breakouts (concurrent reports)
  for (const fitrep of fitreps) {
    if (fitrep.reportType === 'CC') {
      issues.push(`📋 CONCURRENT REPORT: Soft breakout detected for period ending ${fitrep.periodEnd}`);
    }
  }
  
  // Check for declining recommendations at same grade
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].payGrade === sorted[i - 1].payGrade) {
      const promoRanking = { 'EP': 5, 'MP': 4, 'P': 3, 'PR': 2, 'SP': 1 };
      const prevScore = promoRanking[sorted[i - 1].promotionRec as keyof typeof promoRanking] || 0;
      const currScore = promoRanking[sorted[i].promotionRec as keyof typeof promoRanking] || 0;
      
      if (currScore < prevScore && prevScore > 0) {
        issues.push(`🔴 LEFTWARD MOVEMENT: Promotion recommendation declined at ${sorted[i].payGrade}`);
      }
    }
  }
}

// ============================================================================
// MERGE FUNCTION
// ============================================================================

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
  
  // Prefer ODC data, fall back to OSR
  if (odcData?.rankHistory && odcData.rankHistory.length > 0) {
    merged.rankHistory = odcData.rankHistory;
  } else if (osrData?.rankHistory && osrData.rankHistory.length > 0) {
    merged.rankHistory = osrData.rankHistory;
  }
  
  merged.currentRank = determineCurrentRank(merged.rankHistory);
  merged.yearGroup = odcData?.yearGroup || osrData?.yearGroup || '';
  merged.designator = odcData?.designator || osrData?.designator || '';
  merged.boardCertified = odcData?.boardCertified ?? osrData?.boardCertified ?? null;
  merged.subspecialtyCode = odcData?.subspecialtyCode || osrData?.subspecialtyCode || '';
  merged.securityClearance = odcData?.securityClearance || osrData?.securityClearance || null;
  merged.currentStation = odcData?.currentStation || osrData?.currentStation || '';
  merged.currentBillet = odcData?.currentBillet || osrData?.currentBillet || '';
  
  merged.education = {
    undergrad: odcData?.education?.undergrad || osrData?.education?.undergrad || null,
    medical: odcData?.education?.medical || osrData?.education?.medical || null,
  };
  
  // Merge courses (dedupe by code)
  const allCourses = [...(odcData?.courses || []), ...(osrData?.courses || [])];
  const uniqueCourses = new Map<string, typeof allCourses[0]>();
  for (const course of allCourses) {
    if (!uniqueCourses.has(course.code)) {
      uniqueCourses.set(course.code, course);
    }
  }
  merged.courses = Array.from(uniqueCourses.values());
  
  // Merge AQDs (dedupe by code)
  const allAQDs = [...(odcData?.aqds || []), ...(osrData?.aqds || [])];
  const uniqueAQDs = new Map<string, AQDEntry>();
  for (const aqd of allAQDs) {
    if (!uniqueAQDs.has(aqd.code)) {
      uniqueAQDs.set(aqd.code, aqd);
    }
  }
  merged.aqds = Array.from(uniqueAQDs.values());
  
  merged.warnings = [...(odcData?.warnings || []), ...(osrData?.warnings || [])];
  
  return merged;
}
