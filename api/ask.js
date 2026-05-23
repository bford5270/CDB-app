// api/ask.js - Vercel Serverless Function
// Handles two modes:
//   1. action: 'parse-documents' — AI extraction of ODC/OSR/PSR
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

// Strip OCR garbage before sending to Claude.
// PSR PDFs especially produce lines that are >60% box-drawing characters.
function cleanDocumentText(text, docType) {
  if (!text) return '';
  // Remove null bytes and non-printable control characters (common in bad OCR)
  let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
  if (docType === 'psr') {
    // Drop lines that are mostly non-alphanumeric (table borders, form boxes)
    const lines = cleaned.split('\n');
    cleaned = lines
      .map(line => {
        if (line.length < 4) return line;
        const usable = (line.match(/[a-zA-Z0-9 .,\/\-:()]/g) || []).length;
        return usable / line.length < 0.45 ? '' : line;
      })
      .reduce((acc, line, i, arr) => {
        // Collapse consecutive blank lines to one
        if (line === '' && i > 0 && arr[i - 1] === '') return acc;
        acc.push(line);
        return acc;
      }, [])
      .join('\n');
  }
  // Normalize excessive whitespace
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
      // Remove backward progressions (keep only strictly ascending rank entries)
      .reduce((acc, entry) => {
        const maxIdx = acc.length > 0 ? RANK_ORDER.indexOf(acc[acc.length - 1].rank) : -1;
        if (RANK_ORDER.indexOf(entry.rank) > maxIdx) acc.push(entry);
        return acc;
      }, []);
  }

  // Normalize two-letter clearance codes (e.g. "SS" → "Secret")
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
    // SSN — hyphenated, spaced, and bare 9-digit forms
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b\d{3} \d{2} \d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b(SSN|Social Security)[:\s#]+\d{9}\b/gi, '[SSN REDACTED]')
    // DOD ID / EDIPI
    .replace(/\b(DODID|EDIPI|EDI-PI|DOD\s+ID)[:\s]+\d{10}\b/gi, '[DOD ID REDACTED]')
    // Date of birth when explicitly labeled
    .replace(/\b(DOB|Date\s+of\s+Birth|Birth\s+Date|Born)[:\s]+[\d\/\-\.]+/gi, '[DOB REDACTED]')
    // US phone numbers (various formats)
    .replace(/\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, '[PHONE REDACTED]')
    // Email addresses
    .replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[EMAIL REDACTED]')
    // IPv4 addresses
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP REDACTED]')
    // Credit / debit card numbers (13-19 digits, possibly spaced or hyphenated)
    .replace(/\b(?:\d{4}[-\s]?){3}\d{1,4}\b/g, '[CARD REDACTED]')
    // Bank routing/account patterns (ABA routing: 9-digit starting with 0-3)
    .replace(/\b(routing|account|acct|RTN)[:\s#]+\d{9,17}\b/gi, '[ACCOUNT REDACTED]')
    // Passport numbers (US format: letter(s) + 6-9 digits — but only when labeled)
    .replace(/\b(passport|PASSNO)[:\s#]+[A-Z]{0,2}\d{6,9}\b/gi, '[PASSPORT REDACTED]')
    // Home/personal addresses — street numbers followed by street keywords
    .replace(/\b\d{1,6}\s+[A-Za-z0-9\s]{3,30}\b(Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Circle|Cir)\b/gi, '[ADDRESS REDACTED]')
    // Zip codes when labeled
    .replace(/\b(ZIP|Zip Code|Postal Code)[:\s]+\d{5}(-\d{4})?\b/gi, '[ZIP REDACTED]');
}

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
    // MODE 1: DOCUMENT PARSING
    // =========================================================================
    if (action === 'parse-documents') {
      const { odc, osr, psr } = body;

      if (!odc && !osr && !psr) {
        return res.status(400).json({ error: 'At least one document is required' });
      }

      const sections = [];
      if (odc) sections.push('=== OFFICER DATA CARD (ODC) ===\n' + scrubPII(cleanDocumentText(odc, 'odc').substring(0, 12000)));
      if (osr) sections.push('=== OFFICER SUMMARY RECORD (OSR) ===\n' + scrubPII(cleanDocumentText(osr, 'osr').substring(0, 8000)));
      if (psr) sections.push('=== PERFORMANCE SUMMARY REPORT (PSR) ===\n' + scrubPII(cleanDocumentText(psr, 'psr').substring(0, 12000)));
      const docContext = sections.join('\n\n');

      const today = new Date().toISOString().split('T')[0];

      const parseSystemPrompt = [
        'You are a Navy personnel record parser for the Navy Medical Corps Career Development Board application.',
        'You receive raw text from PDF-extracted Navy documents (ODC, OSR, PSR). Text is often garbled. Cross-reference all available documents.',
        'RETURN ONLY a valid JSON object. No markdown, no code fences, no explanation.',
        `TODAY'S DATE: ${today}`,
        '',
        '=== RANK EXTRACTION — CONSERVATIVE, CRITICAL ===',
        'Navy rank order (O1→O6): ENS → LTJG → LT → LCDR → CDR → CAPT.',
        '',
        'KEY FACT: Most MC physicians commission as ENS (O-1) first, so ENS entries ARE expected in rankHistory.',
        'LTJG (O-2) is almost NEVER present — physicians either skip it entirely (direct commission to LT/LCDR',
        'after medical school/residency) or advance through it so quickly it has no DOR entry on the ODC.',
        'Do NOT add LTJG to rankHistory unless there is an EXPLICIT date labeled "LTJG" in the document.',
        'Never infer or fill in missing intermediate ranks.',
        '',
        'CONSERVATIVE EXTRACTION RULES (follow all four):',
        '1. Only add a rank to rankHistory if BOTH (a) the exact rank abbreviation appears in the document AND',
        '   (b) a 6-digit DOR date is directly adjacent to or clearly labeled for that exact rank.',
        '2. Do NOT infer ranks. If the document shows only LT and CDR with dates, rankHistory has only LT and CDR.',
        '3. The ODC contains dozens of 6-digit numbers: PEBD, PRD, EAOS, clearance dates, report numbers, UIC codes.',
        '   A number is NOT a DOR date unless it is clearly associated with a specific rank abbreviation.',
        '4. If you are uncertain whether a date belongs to a rank entry or another field, omit it.',
        '',
        'DATE FORMAT: DOR dates on the ODC are 6-digit MMDDYY. Convert to YYYY-MM-DD using 20YY.',
        '  "010924" → 2024-01-09  |  "090118" → 2018-09-01  |  "052808" → 2008-05-28',
        'PLAUSIBILITY: Valid commission/DOR years are 2000–2032. If the converted year falls outside this range,',
        'the digits you read are NOT a DOR — do not include that entry.',
        '',
        'CLEARANCE DATE: The ODC clearance date is in MMYY format (4 digits) → convert to YYYY-MM.',
        '  "0520" → 2020-05  |  "1118" → 2018-11  |  "0612" → 2012-06',
        '',
        `SET "rank" = current rank: find the most recent rankHistory entry whose date ≤ today (${today}).`,
        'Example: rankHistory has LCDR 2021-10-01 and CDR 2025-10-01; today is 2026-05-23 → rank = "CDR".',
        '',
        '=== AQD EXTRACTION (STRICT) ===',
        'ONLY extract AQD codes that appear in a dedicated AQD or "Additional Qualification Designator" section of the ODC (Block 72 or equivalent).',
        'Do NOT infer or guess AQDs from other text, station codes, duty titles, clearance codes, billet names, or specialty codes.',
        'IMPORTANT FALSE POSITIVES TO IGNORE:',
        '  - "SS" in clearance context means Secret/Secret clearance — NOT Submarine Warfare AQD',
        '  - "VV", "TT", "TS" are clearance codes — NOT AQDs',
        '  - Rank abbreviations (LT, LCDR, CDR, ENS, LTJG), report types (RG, CC, AT, TR), and station codes are NOT AQDs',
        '  - Designator codes (2100, 2300, etc.) are NOT AQDs',
        '  - Specialty codes like "16Q0K" are board certification codes, NOT AQDs',
        'VALID Medical Corps AQD codes (from NOOCS Manual Vol 1 Part D — Health Care Services 6-series):',
        '  Aviation medicine: 6AA (Aviation Medical Examiner), 6AB (General Flight Surgeon), 6AC (Naval Aviator/NFO Aeromedical), 6AE (Naval Aviator/Pilot Aeromedical), 6AG (Aerospace Medicine/Preventive Med)',
        '  Field/Operational (FMF/Surface): 6FA (Marine Corps Medical Dept Officer/FMF), 6FC (FMF Medical Logistics), 6FD (Surface Experienced Medical Officer), 6FE (Senior Marine Corps Medical Officer)',
        '  Contingency/Operational: 6OB (Shipboard Assignment), 6OC (Hospital Ship Assignment), 6OE (En-route Care/CCATT), 6OF (Forward Deployable Preventive Med Unit)',
        '  Contingency cont: 6OH (Humanitarian Assistance/Disaster Relief), 6OI (Professional Filler System), 6OJ (Associate Medical Officer), 6ON (Medical Regulator)',
        '  Contingency cont: 6OR (CATF/CLF Surgeon), 6OS (SERE Certified Medical Officer), 6OT (C4 Trained Plus), 6OU (Fleet Hospital Assignment), 6OW (Trauma Team Trained Officer)',
        '  Emergency Medicine: 6PD (Emergency Medicine General), 6PE (Emergency Medicine Subspecialty), 6PF (Pediatric Emergency Medicine), 6PG (Emergency Medicine Ultrasound), 6PH (Emergency Medicine Toxicology)',
        '  Family Practice: 6QF (Family Practice with Obstetrics)',
        '  Internal Medicine subspecialties: 6RF, 6RG, 6RH, 6RI, 6RK, 6RL, 6RM, 6RN, 6RO, 6RP, 6RQ, 6RR, 6RS, 6RT, 6RV, 6RW',
        '  Undersea/Dive Medicine: 6UD (Diver Medical Officer), 6UE (Undersea Medicine), 6UF, 6UG, 6UM',
        '  Preventive/Occupational Medicine: 6KE, 6KL, 6KM',
        '  Executive/Admin: 67A (Executive Medicine), 67B (Expeditionary Medicine), 67G (Managed Care Coordinator)',
        '  Academic/Faculty: 6ZA (Instructor), 6ZB (Assistant Professor), 6ZC (Associate Professor), 6ZD (Full Professor), 6ZE (Medical Ethicist), 6ZF (Researcher), 6ZG (Residency Program Director)',
        '  Graduate Education: 68I (Health Care Management Masters Degree)',
        '  Surgical subspecialties: 6BG, 6BH, 6BI, 6BJ, 6BK, 6BL (Anesthesia), 6CD-6CM (Surgery), 6DD-6DG (Neurology/Neurosurgery)',
        '  OB/GYN: 6EF-6EK, Ophthalmology: 6GA-6GK, Ortho: 6HD-6HL, ENT: 6ID-6II, Urology: 6JD-6JI',
        '  Pathology: 6MA-6MM, Dermatology: 6ND-6NH, Neurology: 6TD/6TF/6TG, Pediatrics: 6VF-6VW, Psychiatry: 6XD-6XN, Radiology: 6YD-6YK',
        'VALID non-Medical-Corps AQDs that MC officers may also hold (from Schofer Promo Prep, non-medical section):',
        '  Warfare qualifications: LA7 (Surface Warfare Medical Dept Officer), BX2 (Fleet Marine Force Warfare Officer)',
        '  Individual Augmentation — Intra-Service: U6O (Operations IA), U4M (Fleet/Division Staff Medical IA), U6M (Other Medical IA)',
        '  Individual Augmentation — Interservice/Coalition: J3M (Combatant Cmdr Medical IA), J4M (Fleet/Div Staff Medical IA), J5M (Joint Task Force Medical IA), J6M (Other Medical IA)',
        '  Special: BT1 (Static-Line Parachutist), QK1 (Naval Special Warfare Experience), DZQ (Joint Air Operations/Aviation Safety Officer)',
        '  Joint/JPME: JS7 (JPME Phase I), JS8 (JPME Phase II)',
        'If the document has no clear AQD section, return [].',
        '',
        '=== BOARD CERTIFICATION ===',
        'Look for a specialty code where the LAST character is K or J (e.g. "16Q0K" or "16Q0J").',
        'K = Board Certified (set boardCertified=true, certificationCode="K").',
        'J = Board Eligible / NOT Board Certified (set boardCertified=false, certificationCode="J").',
        'T = In Training (set boardCertified=false, certificationCode=null).',
        '',
        '=== OTHER ODC FIELDS ===',
        'designator: 4-digit code (e.g. 2100, 2300). yearGroup: 2-digit YG.',
        'clearanceLevel: the two-letter clearance eligibility/level code from the ODC — return it as-is (e.g., "SS", "TT", "VV"). Do NOT try to expand it here.',
        'clearanceDate: 4-digit MMYY → YYYY-MM (see format examples above).',
        '',
        'FROM OSR: education (hasUndergrad, hasMedicalSchool), courses.',
        '',
        '=== PSR PARSING (CRITICAL — NO HALLUCINATION) ===',
        'STRICT RULE: Every field you extract from the PSR must come VERBATIM from the document text. Do NOT infer, guess, or fill in missing values.',
        'Station/command names: copy EXACTLY as they appear in the document. Do NOT substitute, abbreviate, or invent command names. If a station name is garbled or unreadable, use the garbled text as-is or leave it blank — NEVER guess a real-world command name.',
        'Numbers (scores, averages, counts): copy EXACTLY from the document. Do NOT round, estimate, or calculate. If a number is unreadable, use 0.',
        'Dates: extract from/to dates as printed. If garbled, leave blank rather than guessing.',
        'From PSR: each FITREP has pay grade, from/to dates, station, reporting senior, 5 trait scores (1-5),',
        'individual average, RS cumulative average, RS count, promotion rec (EP/MP/P/PR/SP/NOB), report type (RG/CC/AT/TR/NOB).',
        '',
        'PSR ANALYSIS RULES:',
        'trend: compare recent 3 vs oldest 3 promo recs. Values: improving/declining/stable/insufficient_data',
        'psrIssues: flag leftward movement (EP to MP, MP to P, P to PR in consecutive graded reports),',
        'date gaps over 3 months between consecutive FITREPs, 2 or more consecutive P or below.',
        'belowRSAverageCount: count fitreps where individualAverage is less than rsAverage.',
        '',
        'Return this JSON (use null for unknown strings, 0 for unknown numbers, [] for unknown arrays, false for unknown booleans):',
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
        '  "hasUndergrad": false,',
        '  "hasMedicalSchool": false,',
        '  "fitrepAverage": 0,',
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
        '  "confidence": {"rankHistory":"medium","aqds":"medium","psrData":"medium","overall":"medium"}',
        '}'
      ].join('\n');

      const parseRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: parseSystemPrompt,
          messages: [{ role: 'user', content: 'Parse these Navy officer documents:\n\n' + docContext }]
        })
      });

      if (!parseRes.ok) {
        const errText = await parseRes.text();
        console.error('Claude parse error:', parseRes.status, errText);
        let msg = 'Claude API error ' + parseRes.status;
        if (parseRes.status === 401) msg = 'Invalid API key (401)';
        if (parseRes.status === 429) msg = 'Rate limit reached (429)';
        return res.status(500).json({ error: msg });
      }

      const parseData = await parseRes.json();
      const rawText = (parseData.content?.[0]?.text) || '';
      const stopReason = parseData.stop_reason || '';
      console.log('Parse raw response (first 600):', rawText.substring(0, 600));
      if (stopReason === 'max_tokens') {
        console.warn('Response truncated at max_tokens — JSON may be incomplete');
      }

      // Strip code fences, then find outermost { } to handle preamble/postamble text
      let jsonText = rawText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      }

      try {
        const parsed = validateParsed(JSON.parse(jsonText));
        return res.status(200).json(parsed);
      } catch (e) {
        console.error('JSON parse error:', e.message, '\nRaw (first 800):', rawText.substring(0, 800));
        return res.status(422).json({ error: 'AI returned invalid JSON' });
      }
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
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
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
      documentsSearched: documentCount || 0
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
