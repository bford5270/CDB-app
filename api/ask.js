// api/ask.js - Vercel Serverless Function
// Handles two modes:
//   1. action: 'parse-documents' — AI extraction of ODC/OSR/PSR (three separate calls)
//   2. (default) Q&A against uploaded reference documents

import { readFileSync } from 'fs';
import { join } from 'path';

function buildCoursesKnowledge() {
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'fy26-courses.json'), 'utf8');
    const d = JSON.parse(raw);
    const lines = [
      `=== FY26 NAVMED COURSE CATALOG (MEDICAL CORPS) — STRUCTURED DATA ===`,
      `Source: ${d.source} | Updated: ${d.lastUpdated}`,
      `Career Planner POC: ${d.pocCareerPlanner.name} | ${d.pocCareerPlanner.email}`,
      '',
      'COURSES:',
    ];
    for (const c of d.courses) {
      lines.push(`• ${c.name} [${c.id}]: target rank ${(c.targetRank || []).join('/')} | ${c.requirement || ''}`.slice(0, 180));
      if (c.cin) lines.push(`  CIN: ${c.cin}`);
      if (c.contributesToAQD) lines.push(`  → Contributes to AQD: ${c.contributesToAQD}`);
      if (c.status) lines.push(`  STATUS: ${c.status}`);
    }
    lines.push('', 'AQD PATHWAYS:');
    for (const [code, aqd] of Object.entries(d.aqds)) {
      lines.push(`• ${code} — ${aqd.name}: ${aqd.description}`);
      const reqs = Object.entries(aqd.requirements).map(([k, v]) => `${k}: ${v}`).join(' | ');
      lines.push(`  Reqs: ${reqs}`);
    }
    lines.push('', 'CAREER MILESTONES BY RANK:');
    for (const [rank, m] of Object.entries(d.careerMilestones)) {
      lines.push(`• ${rank} (${m.typicalYears} yrs): ${m.focus.join(', ')}`);
      lines.push(`  Recommended: ${m.recommendedCourses.join(', ')}`);
    }
    return lines.join('\n');
  } catch (e) {
    console.warn('Could not load FY26 courses:', e.message);
    return '';
  }
}

const FY26_COURSES_KNOWLEDGE = buildCoursesKnowledge();

function buildAQDReference() {
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'aqd-master-list.json'), 'utf8');
    const d = JSON.parse(raw);
    const lines = ['=== MASTER AQD REFERENCE LIST ==='];
    for (const [code, name] of Object.entries(d.aqds)) {
      lines.push(`  ${code}: ${name}`);
    }
    return lines.join('\n');
  } catch (e) {
    console.warn('Could not load AQD master list:', e.message);
    return '';
  }
}

const AQD_REFERENCE = buildAQDReference();

// Strip OCR garbage before sending to Claude.
// PSR PDFs especially produce lines that are >60% box-drawing characters.
function cleanDocumentText(text, docType) {
  if (!text) return '';
  let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
  if (docType === 'psr') {
    const lines = cleaned.split('\n');
    cleaned = lines
      .map(line => {
        if (line.length < 4) return line;
        const usable = (line.match(/[a-zA-Z0-9 .,\/\-:|()]/g) || []).length;
        return usable / line.length < 0.45 ? '' : line;
      })
      .reduce((acc, line, i, arr) => {
        if (line === '' && i > 0 && arr[i - 1] === '') return acc;
        acc.push(line);
        return acc;
      }, [])
      .join('\n');
  }
  return cleaned
    .replace(/\t/g, ' ')
    .replace(/ {4,}/g, '   ')
    .replace(/\n{5,}/g, '\n\n\n');
}

// Post-parse validation: remove impossible rank dates and backward progressions,
// and normalize the two-letter clearance code to a human-readable level.
function validateParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;

  const RANK_ORDER = ['ENS', 'LTJG', 'LT', 'LCDR', 'CDR', 'CAPT'];

  if (Array.isArray(parsed.rankHistory)) {
    parsed.rankHistory = parsed.rankHistory
      .filter(e => e && e.rank && e.date && typeof e.date === 'string')
      .map(e => ({ ...e, rank: e.rank.toUpperCase().trim() }))
      .filter(e => RANK_ORDER.includes(e.rank))
      .filter(e => {
        const year = parseInt(e.date.substring(0, 4), 10);
        return !isNaN(year) && year >= 1995 && year <= 2033;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .reduce((acc, entry) => {
        const maxIdx = acc.length > 0 ? RANK_ORDER.indexOf(acc[acc.length - 1].rank) : -1;
        if (RANK_ORDER.indexOf(entry.rank) > maxIdx) acc.push(entry);
        return acc;
      }, []);
  }

  if (parsed.clearanceLevel) {
    const cl = parsed.clearanceLevel.toUpperCase().replace(/\s/g, '');
    if (/^S/.test(cl) || cl === 'SS') parsed.clearanceLevel = 'Secret';
    else if (/^(T|TS)/.test(cl) || cl === 'TT') parsed.clearanceLevel = 'Top Secret';
    else if (/^V/.test(cl) || cl === 'VV' || cl.includes('SCI')) parsed.clearanceLevel = 'Top Secret';
    else if (cl === 'N' || cl === 'NONE') parsed.clearanceLevel = 'None';
  }

  return parsed;
}

function scrubPII(text) {
  if (!text) return '';
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b\d{3} \d{2} \d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b(SSN|Social Security)[:\s#]+\d{9}\b/gi, '[SSN REDACTED]')
    .replace(/\b(DODID|EDIPI|EDI-PI|DOD\s+ID)[:\s]+\d{10}\b/gi, '[DOD ID REDACTED]')
    .replace(/\b(DOB|Date\s+of\s+Birth|Birth\s+Date|Born)[:\s]+[\d\/\-\.]+/gi, '[DOB REDACTED]')
    .replace(/\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, '[PHONE REDACTED]')
    .replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[EMAIL REDACTED]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP REDACTED]')
    .replace(/\b(?:\d{4}[-\s]?){3}\d{1,4}\b/g, '[CARD REDACTED]')
    .replace(/\b(routing|account|acct|RTN)[:\s#]+\d{9,17}\b/gi, '[ACCOUNT REDACTED]')
    .replace(/\b(passport|PASSNO)[:\s#]+[A-Z]{0,2}\d{6,9}\b/gi, '[PASSPORT REDACTED]')
    .replace(/\b\d{1,6}\s+[A-Za-z0-9\s]{3,30}\b(Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Circle|Cir)\b/gi, '[ADDRESS REDACTED]')
    .replace(/\b(ZIP|Zip Code|Postal Code)[:\s]+\d{5}(-\d{4})?\b/gi, '[ZIP REDACTED]');
}

// Walk the string tracking brace depth and string state to extract the outermost JSON object.
function extractJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return text.substring(start, i + 1);
    }
  }
  return null;
}

// Build the user-turn content for a Claude call.
// When a base64 PDF is available, sends a native document block + instruction text.
// Falls back to plain text when base64 is absent.
function buildUserContent(textMessage, base64Pdf) {
  if (base64Pdf) {
    return [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
      },
      { type: 'text', text: textMessage },
    ];
  }
  return textMessage;
}

// Call Anthropic and return a parsed JSON object. Throws on API error or invalid JSON.
// When base64Pdf is provided, uses the native PDF document API (higher accuracy on tables).
// model defaults to Haiku (fast); pass 'claude-sonnet-4-6' for complex parsing tasks.
async function callClaude(systemPrompt, userMessage, apiKey, label, base64Pdf, model = 'claude-haiku-4-5-20251001') {
  const content = buildUserContent(userMessage, base64Pdf);
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (base64Pdf) headers['anthropic-beta'] = 'pdfs-2024-09-25';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Claude ${label} error:`, res.status, errText.substring(0, 300));
    throw new Error(`Claude API error ${res.status} on ${label}`);
  }

  const data = await res.json();
  const rawText = data.content?.[0]?.text || '';
  if (data.stop_reason === 'max_tokens') {
    console.warn(`${label} response truncated at max_tokens`);
  }
  console.log(`${label} raw (first 400):`, rawText.substring(0, 400));

  let jsonText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const extracted = extractJsonObject(jsonText);
  if (extracted) jsonText = extracted;

  try {
    return JSON.parse(jsonText);
  } catch (e) {
    console.error(`${label} JSON parse error:`, e.message, '\nRaw (first 600):', rawText.substring(0, 600));
    throw new Error(`${label}: AI returned invalid JSON`);
  }
}

// ============================================================================
// FOCUSED SYSTEM PROMPTS
// ============================================================================

function buildOdcSystemPrompt(today) {
  return [
    'You are a Navy personnel record parser. You are parsing ONLY the Officer Data Card (ODC).',
    'RETURN ONLY a valid JSON object. No markdown, no code fences, no explanation.',
    `TODAY'S DATE: ${today}`,
    '',
    '=== RANK / PROMOTION HISTORY EXTRACTION ===',
    'Navy rank order (O1→O6): ENS → LTJG → LT → LCDR → CDR → CAPT.',
    '',
    'PRIMARY SOURCE — "Promotion History" block on the ODC:',
    'The ODC contains a chart or table explicitly labeled "Promotion History" (sometimes "Date of Rank" or "Promotion Dates").',
    'This block has one row per rank showing the rank abbreviation and a 6-digit date side by side.',
    'Extract EVERY rank-date pair from this block into rankHistory. This is the authoritative source.',
    '',
    'RULES:',
    '1. A rank row MUST have a non-blank 6-digit date next to it to be included.',
    '   If the date field is empty, dashes, zeros, or "N/A" → the officer has NOT been promoted to that rank. OMIT it.',
    '2. The Promotion History chart lists ALL potential ranks (ENS through CAPT) — future ranks have blank dates.',
    '   Higher ranks with no date = not yet promoted. DO NOT include them.',
    '3. LTJG rarely appears — only include it if it has an explicit 6-digit date.',
    '4. Do NOT pick up 6-digit numbers from other ODC fields (PEBD, PRD, EAOS, UIC codes, report numbers).',
    '   A number is a DOR only if it is in the Promotion History block adjacent to a rank abbreviation.',
    '',
    'DATE FORMAT: Promotion History dates are 6-digit MMDDYY → convert to YYYY-MM-DD.',
    '  "010924" → 2024-01-09  |  "090118" → 2018-09-01  |  "052808" → 2008-05-28',
    'Valid DOR years: 2000–2032. Discard any entry whose converted year falls outside this range.',
    '',
    'CLEARANCE DATE: 4-digit MMYY format → convert to YYYY-MM. "0520"→2020-05  "1118"→2018-11',
    '',
    `SET "rank" = most recent rankHistory entry whose date ≤ today (${today}).`,
    '',
    '=== AQD EXTRACTION (ODC ONLY) ===',
    'Extract AQD codes from ODC Block 72 / "Additional Qualification Designators" section.',
    'EXCLUDE: clearance codes (SS/TT/VV/TS), rank abbrevs (ENS/LTJG/LT/LCDR/CDR/CAPT),',
    '  4-digit designator codes (2100–2399), report types (RG/CC/AT/TR), specialty codes ending in K/J/T.',
    'Return [] if no AQD section found.',
    '',
    '=== BOARD CERTIFICATION ===',
    'Look for a specialty code where the LAST character is K or J (e.g. "16Q0K" or "16Q0J").',
    'K = Board Certified (set boardCertified=true, certificationCode="K").',
    'J = Board Eligible / NOT Board Certified (set boardCertified=false, certificationCode="J").',
    'T = In Training (set boardCertified=false, certificationCode=null).',
    '',
    '=== OTHER ODC FIELDS ===',
    'name: officer full name as printed.',
    'designator: 4-digit code (e.g. 2100, 2300). yearGroup: 2-digit YG.',
    'clearanceLevel: the two-letter clearance eligibility/level code from the ODC — return it as-is (e.g., "SS", "TT", "VV").',
    'clearanceDate: 4-digit MMYY → YYYY-MM.',
    '',
    'Return ONLY this JSON (null for unknown strings, 0 for unknown numbers, [] for unknown arrays, false for unknown booleans):',
    '{',
    '  "name": null,',
    '  "rank": null,',
    '  "designator": null,',
    '  "yearGroup": null,',
    '  "rankHistory": [{"rank": "LT", "date": "YYYY-MM-DD"}],',
    '  "boardCertified": null,',
    '  "certificationCode": null,',
    '  "clearanceLevel": "",',
    '  "clearanceDate": "",',
    '  "aqds": [],',
    '  "warnings": [],',
    '  "confidence": {"rankHistory": "medium", "aqds": "medium"}',
    '}',
  ].join('\n');
}

function buildOsrSystemPrompt(odcResult) {
  const ctx = odcResult.name
    ? `Officer context from ODC: name=${odcResult.name}, rank=${odcResult.rank || 'unknown'}, designator=${odcResult.designator || 'unknown'}.`
    : 'ODC data not available.';
  return [
    'You are a Navy personnel record parser. You are parsing ONLY the Officer Summary Record (OSR).',
    'RETURN ONLY a valid JSON object. No markdown, no code fences, no explanation.',
    ctx,
    '',
    '=== EDUCATION ===',
    'hasUndergrad: true if any undergraduate degree is listed.',
    'hasMedicalSchool: true if medical school (MD/DO) or nursing degree is listed.',
    '',
    '=== AQD EXTRACTION (OSR ONLY) ===',
    'Extract AQD codes from the OSR "Special Qualifications" section.',
    'OSR may spell out AQD names (e.g. "67A Executive Medicine") — extract just the code ("67A").',
    'EXCLUDE: clearance codes (SS/TT/VV/TS), rank abbrevs (ENS/LTJG/LT/LCDR/CDR/CAPT),',
    '  4-digit designator codes (2100–2399), report types (RG/CC/AT/TR).',
    'Return [] if no Special Qualifications section found.',
    '',
    'Return ONLY this JSON:',
    '{',
    '  "hasUndergrad": false,',
    '  "hasMedicalSchool": false,',
    '  "aqds": []',
    '}',
  ].join('\n');
}

function buildPsrSystemPrompt(odcResult) {
  const ctx = odcResult.rank
    ? `Officer context from ODC: rank=${odcResult.rank}, name=${odcResult.name || 'unknown'}.`
    : 'ODC data not available.';
  return [
    'You are a Navy personnel record parser. You are parsing ONLY the Performance Summary Record (PSR).',
    'RETURN ONLY a valid JSON object. No markdown, no code fences, no explanation.',
    ctx,
    '',
    '=== PSR PARSING (CRITICAL — NO HALLUCINATION) ===',
    'STRICT RULE: Every field you extract must come VERBATIM from the document text. Do NOT infer, guess, or fill in missing values.',
    'Station/command names: copy EXACTLY as they appear. Do NOT substitute, abbreviate, or invent command names.',
    '  If a station name is garbled or unreadable, use the garbled text as-is or leave it blank — NEVER guess a real command name.',
    'Numbers (scores, averages, counts): copy EXACTLY from the document. Do NOT round, estimate, or calculate.',
    'Dates: extract from/to dates as printed. If garbled, leave blank rather than guessing.',
    '',
    'The PSR table uses pipe-separated columns (|). Each row represents one FITREP period.',
    'Columns appear left-to-right as: pay grade | from date | to date | station/command | trait scores | individual avg | RS avg | RS count | promotion rec | report type.',
    '',
    'From PSR: each FITREP has pay grade, from/to dates, station, reporting senior, 5 trait scores (1-5),',
    'individual average, RS cumulative average (the "R/S CUM" column — typically 3.5–4.5), RS count (# of officers',
    'at that pay grade the reporting senior has reported on), promotion rec (EP/MP/P/PR/SP/NOB), report type (RG/CC/AT/TR/NOB).',
    '',
    '=== PROMOTION RECOMMENDATION ===',
    'Each FITREP row has a "PRT" column (1-2 chars) — use this as primary source:',
    '  N=NOB, B=NOB, P=Promotable, MP=Must Promote, SP=Select Promotable, PR=Progressing',
    '  PP=Early Promote (EP). KEY: "PP" is TWO chars meaning EP — the "E" OCRs as "P" in Navy PDFs. "PP" ≠ "P".',
    '  PN=also likely Early Promote (EP) — OCR artifact where "E"→"P" and "P"→"N".',
    'BACKUP: 5 marker columns left-to-right: SP | PR | P | MP | EP (position 1=SP, 5=EP). If ambiguous → null.',
    'SUMMARY ROW: Use "EP N  MP N  P N" totals to set earlyPromotes/mustPromotes/promotables counts.',
    'NOB reports: PRT shows N or B; no rec scored.',
    'rscaAverage: mean of rsAverage across all graded (non-NOB) FITREPs.',
    '',
    'PSR ANALYSIS RULES:',
    'trend: compare recent 3 vs oldest 3 promo recs. Values: improving/declining/stable/insufficient_data',
    'psrIssues: flag leftward movement (EP to MP, MP to P, P to PR in consecutive graded reports),',
    'date gaps over 3 months between consecutive FITREPs, 2 or more consecutive P or below.',
    'belowRSAverageCount: count fitreps where individualAverage is less than rsAverage.',
    '',
    'Return ONLY this JSON (0 for unknown numbers, [] for unknown arrays, "insufficient_data" for unknown trend):',
    '{',
    '  "fitrepAverage": 0,',
    '  "rscaAverage": 0,',
    '  "fitrepCount": 0,',
    '  "earlyPromotes": 0,',
    '  "mustPromotes": 0,',
    '  "promotables": 0,',
    '  "progressings": 0,',
    '  "psrTrend": "insufficient_data",',
    '  "psrIssues": [],',
    '  "belowRSAverageCount": 0,',
    '  "belowRSAveragePercentage": 0,',
    '  "fitreps": [{"payGrade":"","station":"","startDate":"","endDate":"","individualAverage":0,"rsAverage":0,"promotionRec":"","reportType":""}],',
    '  "warnings": [],',
    '  "confidence": {"psrData": "medium"}',
    '}',
  ].join('\n');
}

// Merge ODC, OSR, and PSR parsed results into the full ExtractedOfficerData shape.
function mergeResults(odcResult, osrResult, psrResult) {
  // Deduplicate AQDs from ODC and OSR.
  const aqds = [...new Set([...(odcResult.aqds || []), ...(osrResult.aqds || [])])];

  // Merge warnings from all three calls.
  const warnings = [
    ...(odcResult.warnings || []),
    ...(psrResult.warnings || []),
  ];

  // Composite confidence: overall = min of individual levels.
  const levelRank = { high: 2, medium: 1, low: 0 };
  const rankToLevel = ['low', 'medium', 'high'];
  const odcConf = odcResult.confidence || {};
  const psrConf = psrResult.confidence || {};
  const minRank = Math.min(
    levelRank[odcConf.rankHistory] ?? 1,
    levelRank[odcConf.aqds] ?? 1,
    levelRank[psrConf.psrData] ?? 1,
  );
  const overall = rankToLevel[minRank];

  return {
    name: odcResult.name ?? null,
    rank: odcResult.rank ?? null,
    designator: odcResult.designator ?? null,
    yearGroup: odcResult.yearGroup ?? null,
    rankHistory: odcResult.rankHistory ?? [],
    boardCertified: odcResult.boardCertified ?? null,
    certificationCode: odcResult.certificationCode ?? null,
    clearanceLevel: odcResult.clearanceLevel ?? '',
    clearanceDate: odcResult.clearanceDate ?? '',
    aqds,
    hasUndergrad: osrResult.hasUndergrad ?? false,
    hasMedicalSchool: osrResult.hasMedicalSchool ?? false,
    fitrepAverage: psrResult.fitrepAverage ?? 0,
    rscaAverage: psrResult.rscaAverage ?? 0,
    fitrepCount: psrResult.fitrepCount ?? 0,
    earlyPromotes: psrResult.earlyPromotes ?? 0,
    mustPromotes: psrResult.mustPromotes ?? 0,
    promotables: psrResult.promotables ?? 0,
    progressings: psrResult.progressings ?? 0,
    psrTrend: psrResult.psrTrend ?? 'insufficient_data',
    psrIssues: psrResult.psrIssues ?? [],
    belowRSAverageCount: psrResult.belowRSAverageCount ?? 0,
    belowRSAveragePercentage: psrResult.belowRSAveragePercentage ?? 0,
    fitreps: psrResult.fitreps ?? [],
    warnings,
    confidence: {
      rankHistory: odcConf.rankHistory ?? 'medium',
      aqds: odcConf.aqds ?? 'medium',
      psrData: psrConf.psrData ?? 'medium',
      overall,
    },
  };
}

// ============================================================================
// HANDLER
// ============================================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured');
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const body = req.body || {};
    const { action } = body;

    // =========================================================================
    // MODE 1: DOCUMENT PARSING — three focused sequential/parallel Claude calls
    // =========================================================================
    if (action === 'parse-documents') {
      const { odc, osr, psr, odcBase64, osrBase64, psrBase64 } = body;

      if (!odc && !osr && !psr) {
        return res.status(400).json({ error: 'At least one document is required' });
      }

      const today = new Date().toISOString().split('T')[0];

      // --- Call 1: ODC (must run first — OSR/PSR prompts use its results) ---
      let odcResult = {
        name: null, rank: null, designator: null, yearGroup: null,
        rankHistory: [], boardCertified: null, certificationCode: null,
        clearanceLevel: '', clearanceDate: '', aqds: [], warnings: [],
        confidence: { rankHistory: 'medium', aqds: 'medium' },
      };

      if (odc) {
        const odcText = scrubPII(cleanDocumentText(odc, 'odc'));
        odcResult = await callClaude(
          buildOdcSystemPrompt(today),
          'Parse this Officer Data Card (ODC):\n\n' + odcText,
          apiKey,
          'ODC',
          odcBase64 || null,
          'claude-haiku-4-5-20251001',
        );
      }

      // --- Calls 2 + 3: OSR and PSR in parallel after ODC ---
      const osrDefault = { hasUndergrad: false, hasMedicalSchool: false, aqds: [] };
      const psrDefault = {
        fitrepAverage: 0, rscaAverage: 0, fitrepCount: 0,
        earlyPromotes: 0, mustPromotes: 0, promotables: 0, progressings: 0,
        psrTrend: 'insufficient_data', psrIssues: [], belowRSAverageCount: 0,
        belowRSAveragePercentage: 0, fitreps: [], warnings: [],
        confidence: { psrData: 'medium' },
      };

      const [osrResult, psrResult] = await Promise.all([
        osr
          ? callClaude(
              buildOsrSystemPrompt(odcResult),
              'Parse this Officer Summary Record (OSR):\n\n' + scrubPII(cleanDocumentText(osr, 'osr')),
              apiKey,
              'OSR',
              osrBase64 || null,
              'claude-haiku-4-5-20251001',
            ).catch(e => {
              console.error('OSR parse failed (using defaults):', e.message);
              return { ...osrDefault, warnings: ['OSR parsing failed — education and OSR AQDs not extracted'] };
            })
          : Promise.resolve(osrDefault),

        psr
          ? callClaude(
              buildPsrSystemPrompt(odcResult),
              'Parse this Performance Summary Record (PSR):\n\n' + scrubPII(cleanDocumentText(psr, 'psr')),
              apiKey,
              'PSR',
              psrBase64 || null,
              'claude-haiku-4-5-20251001',
            ).catch(e => {
              console.error('PSR parse failed (using defaults):', e.message);
              return { ...psrDefault, warnings: ['PSR parsing failed — FITREP data not extracted'] };
            })
          : Promise.resolve(psrDefault),
      ]);

      const merged = mergeResults(odcResult, osrResult, psrResult);
      const validated = validateParsed(merged);
      return res.status(200).json(validated);
    }

    // =========================================================================
    // MODE 2: Q&A
    // =========================================================================
    const { question: rawQuestion, context: rawContext, documentCount } = body;

    if (!rawQuestion) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const question = scrubPII(rawQuestion);
    const context = scrubPII(rawContext);

    const coursesSupplement = FY26_COURSES_KNOWLEDGE
      ? '\n\n## EMBEDDED STRUCTURED DATA — FY26 NAVMED COURSE CATALOG\n\nUse this as authoritative course/AQD data. It supplements (does not replace) uploaded catalog documents.\n\n' + FY26_COURSES_KNOWLEDGE
      : '';

    const systemPrompt = 'You are a pragmatic, detail-oriented assistant for Navy Medical Corps officers preparing for Career Development Boards (CDB).\n\n'
      + 'Your ONLY job is to extract and present information from the uploaded reference documents and the embedded structured data below. You are NOT a general advisor.\n\n'
      + '## ABSOLUTE REQUIREMENTS:\n\n'
      + 'NEVER GIVE GENERIC ADVICE. Always answer from the documents with specific citations.\n\n'
      + 'Format citations as: "According to [Document Name] [Year]: \'[quoted text]\'\"\n\n'
      + '## YEAR-AWARE CITATION RULES:\n\n'
      + 'Documents are labeled with their year (e.g., [Year: 2026]). '
      + 'Always prefer the most recent year catalog for course recommendations. '
      + 'If citing an older catalog, flag it: "This was in the FY25 catalog - verify it is still offered."\n\n'
      + '## DOCUMENT SEARCH PRIORITY:\n'
      + '1. Medical Corps CDB Slide Presentation (most current guidance)\n'
      + '2. Schofer Promo Prep PDF (comprehensive prep guide)\n'
      + '3. CDB guidance documents\n'
      + '4. Course catalogs - USE MOST RECENT YEAR\n'
      + '5. NAVADMINs and official instructions\n\n'
      + '## RESPONSE STYLE:\n'
      + '- Concrete specifics (course codes, dates, procedures), not principles\n'
      + '- Quote exact language from docs when it matters\n'
      + '- Include all relevant details from the source\n'
      + '- Use "consider" / "you may want to" rather than "you must" unless the doc explicitly requires it\n\n'
      + (documentCount > 0
        ? 'You have access to ' + documentCount + ' document(s), ordered most-recent-year first. Prefer the newest year when making recommendations.'
        : 'No documents uploaded yet. Use the embedded FY26 course catalog data above to answer course-related questions.')
      + coursesSupplement;

    let userMessage = question;
    if (context && context.trim()) {
      userMessage = '## REFERENCE DOCUMENTS TO SEARCH:\n\n'
        + context
        + '\n\n---\n\n'
        + '## QUESTION: ' + question + '\n\n'
        + '## YOUR TASK:\n'
        + '1. Search most recent year documents first\n'
        + '2. Find SPECIFIC information: exact requirements, course names, dates, procedures\n'
        + '3. QUOTE the relevant text and CITE the document name and year\n'
        + '4. NO GENERIC ADVICE - only facts from the documents\n'
        + '5. If not found, say "I could not find..." and stop';
    } else {
      userMessage = '## QUESTION: ' + question + '\n\n'
        + 'No reference documents uploaded yet. Please upload documents to the Documents tab before asking questions.';
    }

    const qaRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!qaRes.ok) {
      const errorText = await qaRes.text();
      console.error('Claude Q&A error:', qaRes.status, errorText);
      return res.status(500).json({ error: 'Failed to get AI response' });
    }

    const qaData = await qaRes.json();
    const answer = (qaData.content && qaData.content[0] && qaData.content[0].text) || 'Sorry, I could not generate a response.';

    return res.status(200).json({
      answer,
      documentsSearched: documentCount || 0,
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
