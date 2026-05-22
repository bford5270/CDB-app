// api/ask.js - Vercel Serverless Function
// Handles two modes:
//   1. action: 'parse-documents' — AI extraction of ODC/OSR/PSR
//   2. (default) Q&A against uploaded reference documents

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
        'Extract the full rankHistory (DOR dates in MMDDYY format → YYYY-MM-DD, MC progression LT→LCDR→CDR→CAPT).',
        `Then set "rank" to the CURRENT rank: find the most recent rankHistory entry whose date is ON OR BEFORE today (${today}).`,
        'Do NOT copy the rank label from the document header — the ODC may have been printed before a recent promotion.',
        'Example: if rankHistory shows LCDR DOR 2020-10-01 and CDR DOR 2026-01-01, and today is 2026-05-22, rank = "CDR".',
        '',
        '=== AQD EXTRACTION (STRICT) ===',
        'ONLY extract AQD codes that appear in a dedicated AQD or "Additional Qualification Designator" section of the ODC.',
        'Do NOT infer or guess AQDs from other text, station codes, duty titles, or clearance codes.',
        'IMPORTANT FALSE POSITIVES TO IGNORE:',
        '  - "SS" in clearance context means Secret/Secret clearance — NOT Submarine Warfare AQD',
        '  - "VV", "TT", "TS" are clearance codes — NOT AQDs',
        '  - Rank abbreviations (LT, CDR), report types (RG, CC), and station codes are NOT AQDs',
        'Valid MC AQD codes include: FMF, SW, AW, JS7, JS8, JS9, 62D, 6ZB, 6ZC, 6ZF, 6OC, 6OD, 6OE,',
        '67A, 67B, 67G, 67H, 68M, 68N, GMO, FS1, FS2, FS3, 2P1, 2P2, 2PA, 7ZE, 7ZF, 7ZG, 7ZH.',
        'If the document has no clear AQD section, return [].',
        '',
        '=== BOARD CERTIFICATION ===',
        'Look for a specialty code where the LAST character is K or J (e.g. "16Q0K" or "16Q0J").',
        'K = Board Certified (set boardCertified=true, certificationCode="K").',
        'J = NOT Board Certified (set boardCertified=false, certificationCode="J").',
        '',
        '=== OTHER ODC FIELDS ===',
        'designator: 4-digit code (e.g. 2100, 2300). yearGroup: 2-digit YG.',
        'security clearance: two-letter code like SS/VV/TT where first letter = eligibility, second = level.',
        '  S=Secret, T=Top Secret, V=TS/SCI. clearanceDate in MMYY format → YYYY-MM.',
        '',
        'FROM OSR: education (hasUndergrad, hasMedicalSchool), courses.',
        '',
        'FROM PSR: each FITREP has pay grade, from/to dates, station, reporting senior, 5 trait scores (1-5),',
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

    const systemPrompt = 'You are a pragmatic, detail-oriented assistant for Navy Medical Corps officers preparing for Career Development Boards (CDB).\n\n'
      + 'Your ONLY job is to extract and present information from the uploaded reference documents. You are NOT a general advisor.\n\n'
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
        : 'No documents uploaded yet. Cannot answer without source materials.');

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
