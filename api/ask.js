// api/ask.js - Vercel Serverless Function for CDB Q&A
// Searches uploaded documents and answers questions using Claude Haiku

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, question, context, documentCount, odc, osr, psr } = req.body;

    // Get API key from environment (shared by both modes)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not configured');
      return res.status(500).json({ error: 'API key not configured' });
    }

    // =========================================================================
    // DOCUMENT PARSING MODE
    // Called by DocumentParser with action: 'parse-documents'
    // =========================================================================
    if (action === 'parse-documents') {
      if (!odc && !osr && !psr) {
        return res.status(400).json({ error: 'At least one document is required' });
      }

      const docSections = [];
      if (odc) docSections.push(`=== OFFICER DATA CARD (ODC) ===\n${odc.substring(0, 8000)}`);
      if (osr) docSections.push(`=== OFFICER SUMMARY RECORD (OSR) ===\n${osr.substring(0, 6000)}`);
      if (psr) docSections.push(`=== PERFORMANCE SUMMARY REPORT (PSR) ===\n${psr.substring(0, 10000)}`);
      const docContext = docSections.join('\n\n');

      const parseSystemPrompt = `You are a Navy personnel record parser for the Navy Medical Corps Career Development Board application.
You will receive raw text extracted from Navy personnel documents (ODC, OSR, PSR). The text is often garbled from PDF extraction. Cross-reference all documents when available.
RETURN ONLY a valid JSON object. No markdown, no code fences, no explanation.

FROM ODC: name, rank (ENS/LTJG/LT/LCDR/CDR/CAPT), designator (4-digit, e.g. 2300), yearGroup, rankHistory (DOR dates in MMDDYY→YYYY-MM-DD, Medical Corps progression: LT→LCDR→CDR→CAPT), AQDs (2-3 char codes), board certification (K=certified/J=not, last char of specialty code like 16Q0K), security clearance (SS/VV/TT codes, MMYY date).
FROM OSR: education (hasUndergrad, hasMedicalSchool), courses.
FROM PSR: each FITREP has pay grade, dates, station, reporting senior, 5 trait scores, individual average, RS average, RS count, promotion rec (EP/MP/P/PR/SP/NOB), report type (RG/CC/AT/TR/NOB).

PSR RULES TO APPLY:
- trend: compare recent 3 vs oldest 3 promo recs (EP>MP>P>PR>SP). "improving"/"declining"/"stable"/"insufficient_data"
- psrIssues: flag leftward movement (EP→MP, MP→P, P→PR between consecutive graded reports), date gaps >3 months, 2+ consecutive P or below
- belowRSAverageCount/Percentage: count fitreps where individualAverage < rsAverage

Return this exact JSON structure:
{
  "name": string|null, "rank": string|null, "designator": string|null, "yearGroup": string|null,
  "rankHistory": [{"rank": string, "date": "YYYY-MM-DD"}],
  "boardCertified": boolean|null, "certificationCode": "J"|"K"|null,
  "clearanceLevel": "Secret"|"Top Secret"|"None"|"", "clearanceDate": string,
  "aqds": [string],
  "hasUndergrad": boolean, "hasMedicalSchool": boolean,
  "fitrepAverage": number, "fitrepCount": number,
  "earlyPromotes": number, "mustPromotes": number, "promotables": number, "progressings": number,
  "psrTrend": "improving"|"stable"|"declining"|"insufficient_data",
  "psrIssues": [string],
  "belowRSAverageCount": number, "belowRSAveragePercentage": number,
  "fitreps": [{"payGrade": string, "station": string, "startDate": string, "endDate": string, "individualAverage": number, "rsAverage": number, "promotionRec": string, "reportType": string}],
  "warnings": [string],
  "confidence": {"rankHistory": "high"|"medium"|"low", "aqds": "high"|"medium"|"low", "psrData": "high"|"medium"|"low", "overall": "high"|"medium"|"low"}
}`;

      const parseResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 6000,
          system: parseSystemPrompt,
          messages: [{ role: 'user', content: `Parse these Navy officer documents:\n\n${docContext}` }]
        })
      });

      if (!parseResponse.ok) {
        const errText = await parseResponse.text();
        console.error('Claude parse error:', parseResponse.status, errText);
        let detail = `Claude API error ${parseResponse.status}`;
        if (parseResponse.status === 401) detail = 'Invalid API key (401)';
        if (parseResponse.status === 429) detail = 'Rate limit reached (429)';
        return res.status(500).json({ error: detail });
      }

      const parseData = await parseResponse.json();
      const rawText = parseData.content?.[0]?.text || '';
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
    // Q&A MODE (default)
    // =========================================================================
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Build the system prompt with citation instructions
    const systemPrompt = `You are a pragmatic, detail-oriented assistant for Navy Medical Corps officers preparing for Career Development Boards (CDB).

Your ONLY job is to extract and present information from the uploaded reference documents. You are NOT a general advisor - you are a document search and citation tool.

## ABSOLUTE REQUIREMENTS:

**NEVER GIVE GENERIC ADVICE.** Examples of what NOT to say:
- ❌ "Make sure to keep your record updated"
- ❌ "It's important to maintain professional development"
- ❌ "Consider taking relevant courses"
- ❌ "Stay current with requirements"

**ALWAYS ANSWER FROM THE DOCUMENTS.** Examples of what TO say:
- ✅ "According to Schofer Promo Prep PDF, page 12: 'Officers should complete JPME Phase I before O-4 board...'"
- ✅ "The FY26 catalog lists these specific courses: [exact list from document]"
- ✅ "NAVADMIN 123/24 states the deadline is [exact date]"

## DOCUMENT SEARCH PRIORITY:

1. **Medical Corps CDB Slide Presentation** - CHECK THIS FIRST (most current guidance)
2. **Schofer Promo Prep PDF** - CHECK THIS SECOND (comprehensive prep guide)
3. CDB guidance documents (O'Sullivan, etc.)
4. Course catalogs and training materials — **USE THE MOST RECENT YEAR AVAILABLE**
5. NAVADMINs and official instructions
6. Other reference materials

## YEAR-AWARE CITATION RULES (CRITICAL):

Documents are labeled with their year (e.g., [Year: 2026] or [Year: 2025]).

**When multiple years of the same document type exist:**
- Make course recommendations based on the MOST RECENT year's catalog
- Always state which year you are citing: "According to the FY26 catalog..."
- If a course only appears in an older catalog, explicitly flag it: "This course appeared in the FY25 catalog — verify it is still offered in the current year"
- Never silently cite an older document when a newer version is available
- If the newest catalog is missing something that was in an older one, note the discrepancy

**Why this matters:** Course catalogs change yearly. Officers need current offerings, not outdated ones.

## HOW TO ANSWER QUESTIONS:

**STEP 1: SEARCH THE DOCUMENTS**
- Check the most recent year of each document type first
- Look for specific facts: dates, course names, requirements, procedures, templates, examples

**STEP 2: EXTRACT SPECIFIC INFORMATION**
- Pull exact text, requirements, lists, deadlines, procedures
- Include document name, year, and page/section if visible
- Quote verbatim when precision matters

**STEP 3: FORMAT FOR ACTION**
Be practical and actionable:
- List specific courses to take (with course codes/names from catalog, and which year's catalog)
- Provide exact deadlines and requirements (from instructions)
- Share actual procedures or checklists (from guidance docs)
- Quote example language or templates (from prep materials)
- Give specific milestones or timelines (from authoritative sources)

**STEP 4: CITE YOUR SOURCES**
Always format as: "According to [Document Name] [Year]: '[quoted text or specific fact]'"

**IF INFORMATION NOT FOUND:**
Say: "I searched [list documents checked] and could not find information about [topic]. This may require checking [suggest specific doc type]."

DO NOT say: "Generally you should..." or "It's a good idea to..." or other platitudes.

## RESPONSE STYLE:

- **Concrete, not abstract**: Give specifics (course codes, dates, procedures), not principles
- **Quoted, not paraphrased**: Use exact language from docs when it matters
- **Detailed, not brief**: Include all relevant details from the source
- **Practical, not theoretical**: Focus on what to DO, with actionable guidance
- **Suggestive, not directive**: Use phrases like "consider", "you may want to", "it's valued" rather than "you must", "you should", or "it's required" (unless the document explicitly states something is a hard requirement)

${documentCount > 0 ? `\nYou have access to ${documentCount} document(s), ordered most-recent-year first. Prefer the newest year when making recommendations. Extract specific, actionable information from them. If you can't find something concrete to share, say so - don't fill space with generic advice.` : '\nNo documents uploaded yet. Cannot answer without source materials.'}`;

    // Build the user message with context
    let userMessage = question;

    if (context && context.trim()) {
      userMessage = `## REFERENCE DOCUMENTS TO SEARCH:

${context}

---

## QUESTION: ${question}

## YOUR TASK:
1. Search Medical Corps CDB Slide Presentation FIRST, then Schofer Promo Prep PDF (prefer .pdf over .docx)
2. Find SPECIFIC information: exact requirements, course names, dates, procedures, examples
3. QUOTE the relevant text and CITE the document name
4. Be DETAILED and PRACTICAL - include all relevant specifics
5. NO GENERIC ADVICE - only facts from the documents
6. If not found in docs, say "I could not find..." and stop - don't guess or improvise`;
    } else {
      userMessage = `## QUESTION: ${question}

## PROBLEM:
No reference documents have been uploaded yet. I cannot answer your question without source materials.

Please upload documents to the Documents tab:
- Schofer Promo Prep guide (PDF preferred)
- Course catalogs (NAVMED, etc.)
- NAVADMINs and instructions
- CDB guidance materials

I will NOT provide generic advice without documents to cite.`;
    }

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return res.status(500).json({ error: 'Failed to get AI response' });
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text || 'Sorry, I could not generate a response.';

    return res.status(200).json({ 
      answer,
      documentsSearched: documentCount || 0
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

