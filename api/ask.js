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

function scrubPII(text) {
  if (!text) return '';
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b\d{3} \d{2} \d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b(DODID|EDIPI|EDI-PI)[:\s]+\d{10}\b/gi, '[DOD ID REDACTED]');
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
      if (odc) sections.push('=== OFFICER DATA CARD (ODC) ===\n' + scrubPII(odc.substring(0, 8000)));
      if (osr) sections.push('=== OFFICER SUMMARY RECORD (OSR) ===\n' + scrubPII(osr.substring(0, 6000)));
      if (psr) sections.push('=== PERFORMANCE SUMMARY REPORT (PSR) ===\n' + scrubPII(psr.substring(0, 10000)));
      const docContext = sections.join('\n\n');

      const today = new Date().toISOString().split('T')[0];

      const parseSystemPrompt = [
        'You are a Navy personnel record parser for the Navy Medical Corps Career Development Board application.',
        'You receive raw text from PDF-extracted Navy documents (ODC, OSR, PSR). Text is often garbled. Cross-reference all available documents.',
        'RETURN ONLY a valid JSON object. No markdown, no code fences, no explanation.',
        `TODAY'S DATE: ${today}`,
        '',
        '=== RANK DETERMINATION (CRITICAL) ===',
        'Navy officer rank order (low to high): ENS(O1) → LTJG(O2) → LT(O3) → LCDR(O4) → CDR(O5) → CAPT(O6).',
        'Medical Corps officers almost always progress ENS→LTJG→LT→LCDR→CDR→CAPT in that order. Backwards progression is EXTREMELY RARE and only happens during inter-corps transfers or early-career training anomalies. If you see apparent backwards progression in the document, it is almost certainly a parsing error — do NOT include it.',
        'Extract the full rankHistory. DOR dates appear in MMDDYY format on the ODC — convert to YYYY-MM-DD.',
        `Then set "rank" to the CURRENT rank: find the most recent rankHistory entry whose date is ON OR BEFORE today (${today}).`,
        'Do NOT copy the rank label from the document header — the ODC may have been printed before a recent promotion.',
        'Example: if rankHistory shows LCDR DOR 2020-10-01 and CDR DOR 2026-01-01, and today is 2026-05-22, rank = "CDR".',
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
        'security clearance: two-letter code like SS/VV/TT where first letter = eligibility, second = level.',
        '  S=Secret, T=Top Secret, V=TS/SCI. clearanceDate in MMYY format → YYYY-MM.',
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
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 6000,
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
      const rawText = (parseData.content && parseData.content[0] && parseData.content[0].text) || '';
      const jsonText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();

      try {
        const parsed = JSON.parse(jsonText);
        return res.status(200).json(parsed);
      } catch (e) {
        console.error('JSON parse error:', e, rawText.substring(0, 300));
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
