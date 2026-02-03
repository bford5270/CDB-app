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
  station: string;
  duty: string;
  startDate: string;
  endDate: string;
  months: number;
  reportingSenior: {
    name: string;
    payGrade: string;
    title: string;
  };
  traits: number[];
  individualAverage: number;
  cumulativeAverage: number;
  rsAverage: number;
  promotionRec: {
    sp: number;
    pr: number;
    p: number;
    mp: number;
    ep: number;
  };
  prt: string;
  reportType: string;
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
    eligibility: string;      // What they're eligible for
    level: string;            // What they actually have
    investigationDate: string; // Block 92: MMYY when investigation initiated
    grantedDate: string;       // Block 93: MMYY when clearance granted
    expirationDate: string;    // Calculated expiration
  } | null;
  currentStation: string;
  currentBillet: string;
  warnings: string[];
  source: 'ODC' | 'OSR' | 'combined';
}

// ============================================================================
// VALID AQD CODES - Only these will be recognized
// ============================================================================

const VALID_AQD_CODES: { [code: string]: string } = {
  // Executive/Leadership
  '67A': 'Executive Medicine',
  '67B': 'Expeditionary Medicine',
  '67G': 'Managed Care Executive',
  'ELI': 'Executive Medicine (Legacy)',
  
  // Joint Professional Military Education
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
  '68O': 'Medical Department Milestone E',
  '6OC': 'Hospital Ship',
  'FMF': 'Fleet Marine Force Warfare',
  'SWO': 'Surface Warfare Officer',
  'SCW': 'Seabee Combat Warfare',
  'DMO': 'Diving Medical Officer',
  'UMO': 'Undersea Medical Officer',
  'SMO': 'Submarine Medical Officer',
  'AMO': 'Aviation Medical Officer',
  'RAD': 'Radiation Health Officer',
  'FSO': 'Flight Surgeon',
  'NFS': 'Naval Flight Surgeon',
  'AFS': 'Aerospace Physiologist',
  
  // GME/Training
  'GME': 'Graduate Medical Education',
  'RES': 'Residency Trained',
  'FEL': 'Fellowship Trained',
  
  // Other Medical
  'CAC': 'Combat Casualty Care',
  'TRM': 'Trauma',
  'ICU': 'Critical Care',
  'EMT': 'Emergency Medicine Trained',
};

// Security clearance codes from ODC
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
  
  const yyyy = yearNum <= 50 ? `20${yy}` : `19${yy}`;
  
  return `${yyyy}-${mm}-${dd}`;
}

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
 * Parse MMYY format to YYYY-MM (for security clearance dates)
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
 * Calculate clearance expiration based on grant date and level
 * Top Secret: 6 years, Secret: 10 years
 */
function calculateClearanceExpiration(grantedDate: string, level: string): string {
  if (!grantedDate) return '';
  
  const [year, month] = grantedDate.split('-').map(Number);
  
  // Top Secret (T or V) = 6 years, Secret (S) = 10 years
  const yearsValid = (level === 'Top Secret' || level === 'Top Secret - SCI Eligible') ? 6 : 10;
  
  const expYear = year + yearsValid;
  const expMonth = month.toString().padStart(2, '0');
  
  return `${expYear}-${expMonth}`;
}

function isValidPromotionDate(dateStr: string): boolean {
  const year = parseInt(dateStr.substring(0, 4));
  return year >= 2000 && year <= 2035;
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
// AQD EXTRACTION - Only matches known valid codes
// ============================================================================

function extractAQDs(text: string): AQDEntry[] {
  const aqds: AQDEntry[] = [];
  const foundCodes = new Set<string>();
  
  // Method 1: Look for known AQD codes with year pattern
  for (const [code, defaultTitle] of Object.entries(VALID_AQD_CODES)) {
    const pattern = new RegExp(`\\b${code}\\s+(\\d{2})\\s+([A-Z][A-Z\\s*]{2,})`, 'gi');
    const matches = [...text.matchAll(pattern)];
    
    for (const match of matches) {
      if (!foundCodes.has(code)) {
        const year = match[1];
        const title = match[2].trim().replace(/\s+/g, ' ').substring(0, 30);
        foundCodes.add(code);
        aqds.push({
          code,
          year: `20${year}`,
          title: title || defaultTitle,
        });
      }
    }
    
    // Also try without the title (just code + year)
    if (!foundCodes.has(code)) {
      const simplePattern = new RegExp(`\\b${code}\\s+(\\d{2})\\b`, 'gi');
      const simpleMatch = text.match(simplePattern);
      if (simpleMatch) {
        const yearMatch = simpleMatch[0].match(/(\d{2})$/);
        if (yearMatch) {
          foundCodes.add(code);
          aqds.push({
            code,
            year: `20${yearMatch[1]}`,
            title: defaultTitle,
          });
        }
      }
    }
  }
  
  // Method 2: Look for AQD codes mentioned anywhere (without year)
  for (const [code, defaultTitle] of Object.entries(VALID_AQD_CODES)) {
    if (!foundCodes.has(code)) {
      const titleKeywords = defaultTitle.split(' ')[0].toUpperCase();
      const contextPattern = new RegExp(`\\b${code}\\b[^\\n]{0,20}${titleKeywords}`, 'gi');
      
      if (contextPattern.test(text)) {
        foundCodes.add(code);
        aqds.push({
          code,
          year: '',
          title: defaultTitle,
        });
      }
    }
  }
  
  console.log('Extracted AQDs (validated):', aqds);
  return aqds;
}

// ============================================================================
// SECURITY CLEARANCE EXTRACTION - Blocks 92 and 93
// ============================================================================

/**
 * Extract security clearance from ODC Blocks 92 and 93
 * 
 * Block 92 format: [Eligibility Code] [Actual Code] [Investigation Date MMYY]
 * Block 93 format: [Granted Date MMYY]
 * 
 * Codes:
 * V = Top Secret - SCI Eligible
 * T = Top Secret
 * S = Secret
 * C = Confidential
 * N = None
 * 
 * Top Secret valid for 6 years, Secret valid for 10 years
 */
function extractSecurityClearance(text: string): ParsedOfficerData['securityClearance'] {
  console.log('=== EXTRACTING SECURITY CLEARANCE ===');
  
  // Look for Block 92/93 pattern
  // Format: "V V 0615 1115" where:
  // - First letter = eligibility
  // - Second letter = actual clearance
  // - First 4-digit = investigation date (MMYY)
  // - Second 4-digit = granted date (MMYY) - this is in Block 93
  
  // Pattern 1: Two letters followed by two 4-digit dates
  const fullPattern = /\b([VTSCN])\s+([VTSCN])\s+(\d{4})\s+(\d{4})\b/i;
  const fullMatch = text.match(fullPattern);
  
  if (fullMatch) {
    const eligibilityCode = fullMatch[1].toUpperCase();
    const actualCode = fullMatch[2].toUpperCase();
    const investigationMMYY = fullMatch[3];
    const grantedMMYY = fullMatch[4];
    
    const eligibility = CLEARANCE_CODES[eligibilityCode] || eligibilityCode;
    const level = CLEARANCE_CODES[actualCode] || actualCode;
    const investigationDate = parseMMYY(investigationMMYY) || '';
    const grantedDate = parseMMYY(grantedMMYY) || '';
    const expirationDate = calculateClearanceExpiration(grantedDate, level);
    
    console.log('Found clearance (full pattern):', {
      eligibility, level, investigationDate, grantedDate, expirationDate
    });
    
    return {
      eligibility,
      level,
      investigationDate,
      grantedDate,
      expirationDate,
    };
  }
  
  // Pattern 2: Look near "SECURITY" or "92" or "93" labels
  const securitySection = text.match(/(?:SECURITY|92|93)[^\n]*\n?([^\n]+)/i);
  if (securitySection) {
    const sectionText = securitySection[1];
    
    // Try to find the pattern within this section
    const sectionMatch = sectionText.match(/([VTSCN])\s+([VTSCN])\s+(\d{4})(?:\s+(\d{4}))?/i);
    if (sectionMatch) {
      const eligibilityCode = sectionMatch[1].toUpperCase();
      const actualCode = sectionMatch[2].toUpperCase();
      const investigationMMYY = sectionMatch[3];
      const grantedMMYY = sectionMatch[4] || '';
      
      const eligibility = CLEARANCE_CODES[eligibilityCode] || eligibilityCode;
      const level = CLEARANCE_CODES[actualCode] || actualCode;
      const investigationDate = parseMMYY(investigationMMYY) || '';
      const grantedDate = grantedMMYY ? parseMMYY(grantedMMYY) || '' : '';
      const expirationDate = calculateClearanceExpiration(grantedDate, level);
      
      console.log('Found clearance (section pattern):', {
        eligibility, level, investigationDate, grantedDate, expirationDate
      });
      
      return {
        eligibility,
        level,
        investigationDate,
        grantedDate,
        expirationDate,
      };
    }
  }
  
  // Pattern 3: Just look for any two clearance codes followed by dates anywhere
  const anywherePattern = /([VTSCN])\s+([VTSCN])\s+(\d{4})/gi;
  const anywhereMatches = [...text.matchAll(anywherePattern)];
  
  for (const match of anywhereMatches) {
    const eligibilityCode = match[1].toUpperCase();
    const actualCode = match[2].toUpperCase();
    const dateMMYY = match[3];
    
    // Validate it looks like a clearance date (month 01-12)
    const month = parseInt(dateMMYY.substring(0, 2));
    if (month >= 1 && month <= 12) {
      const eligibility = CLEARANCE_CODES[eligibilityCode] || eligibilityCode;
      const level = CLEARANCE_CODES[actualCode] || actualCode;
      const investigationDate = parseMMYY(dateMMYY) || '';
      
      // Try to find a second date nearby for granted date
      const afterMatch = text.substring(text.indexOf(match[0]) + match[0].length);
      const grantedMatch = afterMatch.match(/^\s*(\d{4})\b/);
      const grantedDate = grantedMatch ? parseMMYY(grantedMatch[1]) || '' : '';
      const expirationDate = calculateClearanceExpiration(grantedDate, level);
      
      console.log('Found clearance (anywhere pattern):', {
        eligibility, level, investigationDate, grantedDate, expirationDate
      });
      
      return {
        eligibility,
        level,
        investigationDate,
        grantedDate,
        expirationDate,
      };
    }
  }
  
  console.log('No security clearance found');
  return null;
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
  
  // Extract designator
  const designatorMatch = text.match(/\b(2100|2105|2300|2305)\b/);
  if (designatorMatch) {
    result.designator = designatorMatch[1];
    console.log('Found designator:', result.designator);
  }
  
  // Extract Year Group
  const yrgMatch = text.match(/\bYRG\b[^\d]*(\d{2})\b/i) || text.match(/\bYG\s*(\d{2})\b/i);
  if (yrgMatch) {
    result.yearGroup = yrgMatch[1];
    console.log('Found year group:', result.yearGroup);
  }
  
  // Extract current grade
  const gradeMatch = text.match(/\b2100\s+(ENS|LTJG|LT|LCDR|CDR|CAPT|RDML|RADM)\b/i);
  if (gradeMatch) {
    result.currentRank = gradeMatch[1].toUpperCase();
    console.log('Found current grade field:', result.currentRank);
  }
  
  // Extract promotion history
  result.rankHistory = extractPromotionHistory(text);
  
  // Determine actual current rank based on dates
  if (result.rankHistory.length > 0) {
    const actualCurrentRank = determineCurrentRank(result.rankHistory);
    if (actualCurrentRank && actualCurrentRank !== result.currentRank) {
      console.log(`Rank updated: Document shows ${result.currentRank} but based on DOR, actual rank is ${actualCurrentRank}`);
      result.currentRank = actualCurrentRank;
    }
  }
  
  // Extract subspecialty/board certification
  const subspecMatch = text.match(/\b(\d{2}[A-Z]\d[JK])\b/);
  if (subspecMatch) {
    result.subspecialtyCode = subspecMatch[1];
    result.boardCertified = subspecMatch[1].endsWith('K');
    console.log('Found subspecialty code:', result.subspecialtyCode, 'Board certified:', result.boardCertified);
  }
  
  // Extract AQDs (using validated extraction)
  result.aqds = extractAQDs(text);
  
  // Extract courses
  result.courses = extractCourses(text);
  
  // Extract education
  result.education = extractEducation(text);
  
  // Extract security clearance (Blocks 92 and 93)
  result.securityClearance = extractSecurityClearance(text);
  
  // Extract current duty
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

function extractPromotionHistory(text: string): RankDate[] {
  const ranks: RankDate[] = [];
  
  const lines = text.split('\n');
  let inPromotionSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.includes('FLAG') && line.includes('CAPT') && line.includes('CDR')) {
      inPromotionSection = true;
      console.log('Found promotion history header');
      continue;
    }
    
    if (inPromotionSection) {
      const datePattern = /\b(\d{6})\b/g;
      const matches = [...line.matchAll(datePattern)];
      
      if (matches.length >= 2) {
        console.log('Found potential date line:', line);
        console.log('Dates found:', matches.map(m => m[1]));
        
        const dates = matches.map(m => m[1]);
        
        const validDates = dates
          .map(d => ({ raw: d, parsed: parseMMDDYY(d) }))
          .filter(d => d.parsed && isValidPromotionDate(d.parsed));
        
        console.log('Valid promotion dates:', validDates);
        
        const sortedByDate = [...validDates].sort(
          (a, b) => new Date(a.parsed!).getTime() - new Date(b.parsed!).getTime()
        );
        
        const mcRankProgression = ['LT', 'LCDR', 'CDR', 'CAPT', 'RDML', 'RADM'];
        
        for (let j = 0; j < sortedByDate.length && j < mcRankProgression.length; j++) {
          ranks.push({
            rank: mcRankProgression[j],
            dateOfRank: sortedByDate[j].parsed!,
          });
        }
        
        if (ranks.length > 0) {
          console.log('Extracted rank history:', ranks);
          break;
        }
      }
    }
  }
  
  if (ranks.length === 0) {
    console.log('Method 1 failed, trying alternative extraction...');
    
    const allDates = [...text.matchAll(/\b(\d{6})\b/g)]
      .map(m => ({ raw: m[1], parsed: parseMMDDYY(m[1]) }))
      .filter(d => d.parsed && isValidPromotionDate(d.parsed));
    
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

function extractCourses(text: string): { code: string; name: string; completionDate: string; weeks: number }[] {
  const courses: { code: string; name: string; completionDate: string; weeks: number }[] = [];
  
  const coursePattern = /\b(\d{3})\s+([A-Z\s]+?)\s+(\d{4})\s+(\d{1,2})\b/gi;
  const matches = [...text.matchAll(coursePattern)];
  
  for (const match of matches) {
    const code = match[1];
    const name = match[2].trim();
    const complDate = match[3];
    const weeks = parseInt(match[4]);
    
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

function extractEducation(text: string): ParsedOfficerData['education'] {
  const education: ParsedOfficerData['education'] = {
    undergrad: null,
    medical: null,
  };
  
  const medMatch = text.match(/([A-Z]+(?:\s+[A-Z]+)?)\s+(\d{2})\s+DOCTOR\s+([A-Z]+)/i);
  if (medMatch) {
    education.medical = {
      school: medMatch[1].trim(),
      year: `20${medMatch[2]}`,
      degree: 'MD',
      major: medMatch[3].trim(),
    };
  }
  
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
  
  const yrgMatch = text.match(/YG\s*(\d{2})/i);
  if (yrgMatch) {
    result.yearGroup = yrgMatch[1];
  }
  
  const designatorMatch = text.match(/DESIGNATOR[^\d]*(\d{4})/i) || text.match(/\b(2100|2105)\b/);
  if (designatorMatch) {
    result.designator = designatorMatch[1];
  }
  
  const promotionMatch = text.match(/HIGHEST\s+FLAG.*?(\d{6})\s+(\d{6})\s+(\d{6})/i);
  if (promotionMatch) {
    const dates = [promotionMatch[1], promotionMatch[2], promotionMatch[3]]
      .map(d => parseYYMMDD(d))
      .filter(d => d && isValidPromotionDate(d));
    
    const ranks = ['CDR', 'LCDR', 'LT'];
    for (let i = 0; i < dates.length; i++) {
      if (dates[i]) {
        result.rankHistory!.push({ rank: ranks[i], dateOfRank: dates[i]! });
      }
    }
  }
  
  if (result.rankHistory!.length === 0) {
    const allDates = [...text.matchAll(/\b(\d{6})\b/g)];
    const validDates = allDates
      .map(m => {
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
  
  const subspecMatch = text.match(/\b(\d{2}[A-Z]\d[JK])\b/);
  if (subspecMatch) {
    result.subspecialtyCode = subspecMatch[1];
    result.boardCertified = subspecMatch[1].endsWith('K');
  }
  
  result.aqds = extractAQDs(text);
  result.education = extractEducation(text);
  result.securityClearance = extractSecurityClearance(text);
  
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

export function parsePSR(text: string): PSRAnalysisResult {
  console.log('=== PARSING PSR ===');
  
  const fitreps: FitrepEntry[] = [];
  const issues: string[] = [];
  
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.includes('PERFORMANCE SUMMARY') || 
        line.includes('NAME(LAST') ||
        line.includes('REPORTING SENIOR') ||
        line.includes('PAGE') ||
        line.includes('TRAITS') ||
        !line.trim()) {
      continue;
    }
    
    const pgMatch = line.match(/^(O[1-6])\s+/i);
    if (!pgMatch) continue;
    
    const payGrade = pgMatch[1].toUpperCase();
    
    const stationMatch = line.match(/O[1-6]\s+([A-Z\-]+\s+[A-Z]+)/i);
    const station = stationMatch ? stationMatch[1].trim() : 'Unknown';
    
    const dateMatches = [...line.matchAll(/\b(\d{6})\b/g)];
    if (dateMatches.length < 1) continue;
    
    const startDate = parseMMDDYY(dateMatches[0][1]);
    let endDate: string | null = null;
    
    if (dateMatches.length >= 2) {
      const potentialEndDate = parseMMDDYY(dateMatches[1][1]);
      if (potentialEndDate && startDate && new Date(potentialEndDate) > new Date(startDate)) {
        endDate = potentialEndDate;
      }
    }
    
    if (!startDate) continue;
    
    const rsMatch = line.match(/\b([A-Z]{4,})\s+([A-Z])\s+([A-Z])\b/);
    const rsName = rsMatch ? rsMatch[1] : 'Unknown';
    
    const traitsMatch = line.match(/\b(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d+\.\d+)/);
    const traits = traitsMatch ? 
      [parseInt(traitsMatch[1]), parseInt(traitsMatch[2]), parseInt(traitsMatch[3]), 
       parseInt(traitsMatch[4]), parseInt(traitsMatch[5])] : 
      [0, 0, 0, 0, 0];
    const indAvg = traitsMatch ? parseFloat(traitsMatch[6]) : 0;
    
    const promoMatch = line.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+[PN]?\s*(RG|AT|CC)/i);
    const promotionRec = promoMatch ? {
      sp: parseInt(promoMatch[1]),
      pr: parseInt(promoMatch[2]),
      p: parseInt(promoMatch[3]),
      mp: parseInt(promoMatch[4]),
      ep: parseInt(promoMatch[5]),
    } : { sp: 0, pr: 0, p: 0, mp: 0, ep: 0 };
    
    const prtMatch = line.match(/\b([PNB])\s*(RG|AT|CC|TR)\b/i);
    const prt = prtMatch ? prtMatch[1].toUpperCase() : '';
    const reportType = prtMatch ? prtMatch[2].toUpperCase() : 'RG';
    
    let months = 0;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      months = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
    }
    
    fitreps.push({
      payGrade,
      station,
      duty: '',
      startDate: startDate || '',
      endDate: endDate || '',
      months,
      reportingSenior: {
        name: rsName,
        payGrade: 'O6',
        title: 'CO',
      },
      traits,
      individualAverage: indAvg,
      cumulativeAverage: 0,
      rsAverage: 0,
      promotionRec,
      prt,
      reportType,
    });
  }
  
  console.log('Parsed', fitreps.length, 'FITREP entries');
  
  analyzeForIssues(fitreps, issues);
  const summary = calculateSummary(fitreps);
  
  return { fitreps, issues, summary };
}

function analyzeForIssues(fitreps: FitrepEntry[], issues: string[]): void {
  if (fitreps.length < 2) return;
  
  const sorted = [...fitreps]
    .filter(f => f.endDate)
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  
  let previousEntry: FitrepEntry | null = null;
  
  for (const entry of sorted) {
    if (previousEntry) {
      const prevEnd = new Date(previousEntry.endDate);
      const currStart = new Date(entry.startDate);
      const gapDays = Math.floor((currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24));
      
      if (gapDays > 30) {
        issues.push(`⚠️ DATE GAP: ${gapDays}-day gap between ${previousEntry.endDate} and ${entry.startDate}`);
      }
      
      if (entry.payGrade === previousEntry.payGrade &&
          entry.reportingSenior.name === previousEntry.reportingSenior.name) {
        
        const prevScore = previousEntry.promotionRec.ep * 4 + previousEntry.promotionRec.mp * 3 + 
                         previousEntry.promotionRec.p * 2 + previousEntry.promotionRec.pr * 1;
        const currScore = entry.promotionRec.ep * 4 + entry.promotionRec.mp * 3 + 
                         entry.promotionRec.p * 2 + entry.promotionRec.pr * 1;
        
        if (currScore < prevScore && prevScore > 0) {
          issues.push(
            `🔴 LEFTWARD MOVEMENT: Promotion recommendation declined with same reporting senior (${entry.reportingSenior.name}) ` +
            `at ${entry.payGrade}. (Period ending: ${entry.endDate})`
          );
        }
      }
    }
    
    if (entry.reportType === 'CC') {
      issues.push(`📋 CONCURRENT REPORT: Soft breakout detected for period ending ${entry.endDate}`);
    }
    
    previousEntry = entry;
  }
}

function calculateSummary(fitreps: FitrepEntry[]): PSRAnalysisResult['summary'] {
  const validFitreps = fitreps.filter(f => f.individualAverage > 0);
  
  const totalFitreps = validFitreps.length;
  const averageIndividual = totalFitreps > 0 ?
    validFitreps.reduce((sum, f) => sum + f.individualAverage, 0) / totalFitreps : 0;
  
  const epCount = validFitreps.reduce((sum, f) => sum + f.promotionRec.ep, 0);
  const mpCount = validFitreps.reduce((sum, f) => sum + f.promotionRec.mp, 0);
  const pCount = validFitreps.reduce((sum, f) => sum + f.promotionRec.p, 0);
  
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
    hasLeftwardMovement: false,
    hasDateGaps: false,
    hasSoftBreakouts: false,
  };
}

// ============================================================================
// COMBINED PARSING
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
  
  const allCourses = [...(odcData?.courses || []), ...(osrData?.courses || [])];
  const uniqueCourses = new Map<string, typeof allCourses[0]>();
  for (const course of allCourses) {
    if (!uniqueCourses.has(course.code)) {
      uniqueCourses.set(course.code, course);
    }
  }
  merged.courses = Array.from(uniqueCourses.values());
  
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
