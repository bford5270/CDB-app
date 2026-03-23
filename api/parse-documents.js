// api/parse-documents.js
// Unified AI extraction of Navy officer record data from ODC, OSR, and PSR documents.
// Replaces brittle per-document regex parsing with a single Claude call that sees
// all three documents together and can cross-reference them.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { odc, osr, psr } = req.body || {};

  if (!odc && !osr && !psr) {
    return res.status(400).json({ error: 'At least one document text is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  // ============================================================================
  // BUILD DOCUMENT CONTEXT
  // ============================================================================

  const docSections = [];
  if (odc) docSections.push(`=== OFFICER DATA CARD (ODC) ===\n${odc.substring(0, 8000)}`);
  if (osr) docSections.push(`=== OFFICER SUMMARY RECORD (OSR) ===\n${osr.substring(0, 6000)}`);
  if (psr) docSections.push(`=== PERFORMANCE SUMMARY REPORT (PSR) ===\n${psr.substring(0, 10000)}`);

  const docContext = docSections.join('\n\n');

  // ============================================================================
  // SYSTEM PROMPT
  // ============================================================================

  const systemPrompt = `You are a Navy personnel record parser for the Navy Medical Corps Career Development Board application.

You will receive raw text extracted from one or more Navy personnel documents (ODC, OSR, PSR). The text is often garbled from PDF extraction — columns merged, whitespace stripped, fields scrambled. Cross-reference all available documents when they appear together.

RETURN ONLY a valid JSON object. No markdown, no code fences, no explanation.

=== EXTRACTION RULES ===

FROM ODC (Officer Data Card):
- Name: full name, typically near top of document
- Rank / Pay Grade: current rank (ENS/LTJG/LT/LCDR/CDR/CAPT)
- Designator: 4-digit medical corps designator (e.g., 2300, 2100, 2355). Medical Corps officers have designators starting with 21xx or 23xx.
- Year Group: 4-digit year group (YG)
- DOR (Dates of Rank): Look for lines labeled "DOR". Dates are in MMDDYY format (e.g., 090124 = Sep 1, 2024). Medical Corps officers commission as LT (O3) and progress: LT → LCDR → CDR → CAPT. Assign ranks in that order from oldest to newest DOR date.
- AQDs: 2-3 character codes with 2-digit year and title. Common examples: FMF, SW, AW, SS, EXW, 62D, JS7, 67A, 67B, 6OC, FMF, SCW
- Board Certification: K = Board Certified, J = Not Board Certified. Appears as last character in specialty code like "16Q0K" or "16Q0J"
- Security Clearance: Look for 2-letter codes (SS=Secret/Secret, VV=TS/TS, TV=TS/Secret, ST=Secret/TS). Investigation date in MMYY format.

FROM OSR (Officer Summary Record):
- Education: degrees, institutions, graduation years
- Courses completed: service schools, certifications
- Additional AQDs or qualifications

FROM PSR (Performance Summary Report):
- Each FITREP entry contains: pay grade, from/to dates, station, reporting senior info, 5 trait scores (1.0-5.0), individual average, RS cumulative average, RS count, promotion recommendation
- Promotion recommendations: EP (Early Promote), MP (Must Promote), P (Promotable), PR (Progressing), SP (Significant Problems), NOB (Not Observed/Blank)

=== PSR ANALYSIS RULES (apply these explicitly) ===

TREND: Compare promotion recommendations chronologically.
- "improving": recent 3 recs are higher or equal on average vs oldest 3 (EP > MP > P > PR > SP)
- "declining": recent 3 are lower
- "stable": no clear direction
- "insufficient_data": fewer than 2 graded reports (exclude NOB)

LEFTWARD MOVEMENT: Flag any of these as an issue string:
- EP → MP transition between consecutive graded reports
- MP → P transition
- P → PR transition
- Format: "Leftward movement: [grade1] [rec1] → [grade2] [rec2] ([dates])"

DATE GAPS: If gap between end of one FITREP and start of next exceeds 3 months, flag:
- "Date gap: [N] months between [date1] and [date2]"

CONSECUTIVE LOW MARKS: If 2+ consecutive reports are P or below:
- "Consecutive low marks: [N] consecutive P or below reports"

BELOW RS AVERAGE: Count how many graded FITREPs have individualAverage < rsAverage.

=== OUTPUT FORMAT ===

{
  "name": string or null,
  "rank": "LT"|"LCDR"|"CDR"|"CAPT"|"ENS"|"LTJG" or null,
  "designator": string or null,
  "yearGroup": string or null,

  "rankHistory": [
    { "rank": "LT"|"LCDR"|"CDR"|"CAPT"|"ENS"|"LTJG", "date": "YYYY-MM-DD" }
  ],

  "boardCertified": true|false|null,
  "certificationCode": "J"|"K"|null,

  "clearanceLevel": "Secret"|"Top Secret"|"None"|"",
  "clearanceDate": "YYYY-MM" or "",

  "aqds": ["FMF", "SW", ...],

  "hasUndergrad": true|false,
  "hasMedicalSchool": true|false,

  "fitrepAverage": number (0 if not available),
  "fitrepCount": number,
  "earlyPromotes": number,
  "mustPromotes": number,
  "promotables": number,
  "progressings": number,

  "psrTrend": "improving"|"stable"|"declining"|"insufficient_data",
  "psrIssues": [string],
  "belowRSAverageCount": number,
  "belowRSAveragePercentage": number,

  "fitreps": [
    {
      "payGrade": string,
      "station": string,
      "startDate": "YYYY-MM-DD" or "",
      "endDate": "YYYY-MM-DD" or "",
      "individualAverage": number,
      "rsAverage": number,
      "promotionRec": "EP"|"MP"|"P"|"PR"|"SP"|"NOB",
      "reportType": "RG"|"CC"|"AT"|"TR"|"NOB"
    }
  ],

  "warnings": [string],

  "confidence": {
    "rankHistory": "high"|"medium"|"low",
    "aqds": "high"|"medium"|"low",
    "psrData": "high"|"medium"|"low",
    "overall": "high"|"medium"|"low"
  }
}

Use "warnings" to note anything uncertain, missing, or defaulted (e.g., "Designator not detected in ODC text").
Use "confidence" to indicate how reliable each extracted section is.
If a field cannot be determined, use null (strings), 0 (numbers), [] (arrays), or "" (empty strings).`;

  // ============================================================================
  // CALL CLAUDE
  // ============================================================================

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Parse these Navy officer documents and return the JSON structure:\n\n${docContext}`
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', response.status, errText);
      let detail = `Claude API returned ${response.status}`;
      if (response.status === 401) detail = 'Invalid or missing API key (401)';
      if (response.status === 429) detail = 'Rate limit or credit limit reached (429)';
      if (response.status === 400) detail = 'Bad request to Claude API (400)';
      return res.status(500).json({ error: detail });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // Strip any accidental markdown fences
    const jsonText = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error('JSON parse error. Raw response:', rawText.substring(0, 1000));
      return res.status(422).json({
        error: 'AI returned invalid JSON',
        raw: rawText.substring(0, 500)
      });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('parse-documents error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
