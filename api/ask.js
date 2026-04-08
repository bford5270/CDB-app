// api/ask.js - Vercel Serverless Function
// Handles two modes:
//   1. action: 'parse-documents' — AI extraction of ODC/OSR/PSR
//   2. (default) Q&A against uploaded reference documents

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
      if (odc) sections.push('=== OFFICER DATA CARD (ODC) ===\n' + odc.substring(0, 8000));
      if (osr) sections.push('=== OFFICER SUMMARY RECORD (OSR) ===\n' + osr.substring(0, 6000));
      if (psr) sections.push('=== PERFORMANCE SUMMARY REPORT (PSR) ===\n' + psr.substring(0, 10000));
      const docContext = sections.join('\n\n');

      const parseSystemPrompt = [
        'You are a Navy personnel record parser for the Navy Medical Corps Career Development Board application.',
        'You receive raw text from PDF-extracted Navy documents (ODC, OSR, PSR). Text is often garbled. Cross-reference all available documents.',
        'RETURN ONLY a valid JSON object. No markdown, no code fences, no explanation.',
        '',
        'FROM ODC: name, rank (ENS/LTJG/LT/LCDR/CDR/CAPT), designator (4-digit e.g. 2300), yearGroup,',
        'rankHistory (DOR dates in MMDDYY format converted to YYYY-MM-DD, MC progression LT->LCDR->CDR->CAPT),',
        'AQDs (2-3 char codes like FMF/SW/AW/SS/62D/JS7/67A), board certification (K=certified J=not, last char of code like 16Q0K),',
        'security clearance (SS/VV/TT codes, investigation date in MMYY format).',
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
    const { question, context, documentCount, officerRecord } = body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const hasOfficerRecord = officerRecord && officerRecord.trim().length > 0;
    const hasDocuments = context && context.trim().length > 0;

    const systemPrompt = [
      'You are a precise, grounded assistant for Navy Medical Corps officers preparing for Career Development Boards (CDB).',
      '',
      '## CRITICAL ANTI-HALLUCINATION RULES:',
      'You have access to two data sources below. NEVER answer from memory or training data.',
      '1. OFFICER RECORD — structured data extracted directly from the officer\'s PSR. This is ground truth for all fitrep questions.',
      '2. REFERENCE DOCUMENTS — uploaded PDFs/docs about CDB guidance, courses, and policy.',
      '',
      '## WHICH SOURCE TO USE:',
      '- Questions about the officer\'s OWN fitreps, scores, marks, trends, or record → answer ONLY from OFFICER RECORD.',
      '  If no OFFICER RECORD is provided, say: "No PSR data has been parsed yet. Please complete Step 1 to upload and parse your PSR."',
      '- Questions about CDB policy, courses, requirements, procedures, promotions → answer ONLY from REFERENCE DOCUMENTS.',
      '  If not found in documents, say exactly: "I could not find this information in the uploaded documents."',
      '- NEVER blend sources or fabricate details. If a specific fitrep date, score, or station is not in the OFFICER RECORD, say so.',
      '',
      '## CITATION FORMAT:',
      '- Officer record facts: "[From Officer Record]: ..."',
      '- Document facts: "According to [Document Name] [Year]: \'[exact quote]\'"',
      '- If citing older catalog: flag it — "This was in the FY25 catalog — verify it is still offered."',
      '',
      '## FITREP ANALYSIS RULES (when officer record is available):',
      'When analyzing the officer\'s fitrep record, you MUST:',
      '- Count and report ALL fitreps by type (EP/MP/P/PR/SP)',
      '- Identify the trend direction (improving/stable/declining) based on the actual sequence of promotion recommendations',
      '- Flag any leftward movement (e.g., EP→MP, MP→P) in consecutive graded reports',
      '- Note when individual average is below the Reporting Senior\'s average',
      '- Provide specific dates, stations, and scores from the record — do not generalize',
      '',
      '## DOCUMENT SEARCH PRIORITY:',
      '1. Medical Corps CDB Slide Presentation (most current guidance)',
      '2. Schofer Promo Prep PDF (comprehensive prep guide)',
      '3. CDB guidance documents',
      '4. Course catalogs — USE MOST RECENT YEAR',
      '5. NAVADMINs and official instructions',
      '',
      '## RESPONSE STYLE:',
      '- Lead with the answer, not the preamble',
      '- Use specific numbers, dates, and names from the sources',
      '- Quote exact language from documents when it matters',
      hasOfficerRecord
        ? 'Officer PSR data IS available — use it to answer record-specific questions.'
        : 'No officer PSR data available yet — redirect record questions to Step 1.',
      documentCount > 0
        ? `${documentCount} reference document(s) loaded, ordered most-recent-year first.`
        : 'No reference documents uploaded yet — direct users to the Documents tab.',
    ].join('\n');

    const sections = [];

    if (hasOfficerRecord) {
      sections.push(officerRecord);
    }

    if (hasDocuments) {
      sections.push('=== REFERENCE DOCUMENTS (for policy, course, and guidance questions) ===\n\n' + context);
    }

    let userMessage;
    if (sections.length > 0) {
      userMessage = sections.join('\n\n---\n\n')
        + '\n\n---\n\n'
        + '## QUESTION: ' + question + '\n\n'
        + '## YOUR TASK:\n'
        + (hasOfficerRecord ? '1. If this is about the officer\'s own record: answer from OFFICER RECORD only, cite specific fitreps by date/station/score.\n' : '')
        + (hasDocuments ? (hasOfficerRecord ? '2' : '1') + '. If this is about policy/courses/requirements: search reference documents, quote and cite.\n' : '')
        + (hasOfficerRecord ? (hasDocuments ? '3' : '2') : '2') + '. If the answer is not in the provided data, say so explicitly — do NOT guess.';
    } else {
      userMessage = '## QUESTION: ' + question + '\n\n'
        + 'No officer record or reference documents are available yet.\n'
        + 'Please complete Step 1 to upload and parse your PSR, and upload documents to the Documents tab.';
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
