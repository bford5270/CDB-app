// api/parse-psr.js - Vercel Serverless Function for PSR parsing via Claude
// Replaces brittle regex parsing with AI extraction of FITREP data from raw PDF text

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

  const { text } = req.body;

  if (!text || text.trim().length < 50) {
    return res.status(400).json({ error: 'No PSR text provided' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const systemPrompt = `You are a Navy personnel record parser specializing in Performance Summary Reports (PSRs).
You will receive raw text extracted from a PDF PSR — it is often garbled, with columns merged, whitespace stripped, and fields scrambled. Do your best to reconstruct the data.

A Navy PSR lists individual FITREP (Fitness Report) entries. Each entry contains:
- Pay grade: O1, O2, O3, O4, O5, or O6
- Reporting period: from date and to date (YYYYMMDD or MM/YY or similar formats — convert to YYYY-MM-DD)
- Station / duty assignment
- Reporting Senior: name, pay grade, title
- Five individual trait scores (each 1.0–5.0 scale)
- Individual average score (average of the 5 traits)
- Reporting Senior's cumulative average
- Reporting Senior's cumulative report count
- Promotion recommendation: EP (Early Promote), MP (Must Promote), P (Promotable), PR (Progressing), SP (Significant Problems), NOB (Not Observed)
- Promotion rec counts for that RS period: how many EP / MP / P / PR / SP they assigned
- Report type: RG (Regular), CC (Concurrent), AT (Administratively Taken), TR (Transfer), NOB (Not Observed)

RETURN ONLY a valid JSON object — no markdown, no code fences, no explanation. Use this exact structure:

{
  "totalFitreps": <number>,
  "gradedFitreps": <number — exclude NOB and AT>,
  "averageIndividual": <number — average of individualAverage across graded fitreps, 2 decimal places>,
  "epCount": <number>,
  "mpCount": <number>,
  "pCount": <number>,
  "prCount": <number>,
  "spCount": <number>,
  "trend": <"improving" | "stable" | "declining" | "insufficient_data">,
  "issues": [<string — describe any leftward movement, date gaps >3 months, consecutive low marks, etc.>],
  "belowRSAverageCount": <number — how many fitreps where individualAverage < rsAverage>,
  "belowRSAveragePercentage": <number — percentage as integer, e.g. 25>,
  "fitreps": [
    {
      "payGrade": <"O1"|"O2"|"O3"|"O4"|"O5"|"O6">,
      "station": <string>,
      "duty": <string>,
      "startDate": <"YYYY-MM-DD" or "">,
      "endDate": <"YYYY-MM-DD" or "">,
      "months": <number>,
      "reportingSenior": {
        "name": <string>,
        "payGrade": <string>,
        "title": <string>
      },
      "traits": [<number>, <number>, <number>, <number>, <number>],
      "individualAverage": <number>,
      "rsAverage": <number>,
      "rsCumCount": <number>,
      "promotionRec": <"EP"|"MP"|"P"|"PR"|"SP"|"NOB">,
      "promotionRecCounts": {
        "ep": <number>,
        "mp": <number>,
        "p": <number>,
        "pr": <number>,
        "sp": <number>
      },
      "prt": <string>,
      "reportType": <"RG"|"CC"|"AT"|"TR"|"NOB">
    }
  ]
}

Rules for "trend":
- "improving": most recent 3 reports have higher or equal promo recs than oldest 3 (EP > MP > P > PR > SP)
- "declining": most recent 3 are lower
- "stable": no clear direction
- "insufficient_data": fewer than 2 graded reports

Rules for "issues":
- Leftward movement: any EP→MP, MP→P, or P→PR transition in consecutive reports
- Date gap: any gap > 3 months between consecutive report end and next start
- Consecutive low: 2 or more consecutive P or below
- If none, return []

If a field cannot be determined from the text, use reasonable defaults (0 for numbers, "" for strings).`;

  const userMessage = `Parse this Navy PSR text and return the JSON structure described. The text is raw PDF extraction and may be garbled:

${text.substring(0, 15000)}`; // Cap at ~15k chars to stay within token limits

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return res.status(500).json({ error: 'AI parsing failed' });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // Strip any accidental markdown fences
    const jsonText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Raw text:', rawText.substring(0, 500));
      return res.status(422).json({ error: 'AI returned invalid JSON', raw: rawText.substring(0, 500) });
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('parse-psr error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
