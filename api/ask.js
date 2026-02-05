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
    const { question, context, documentCount } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not configured');
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Build the system prompt with citation instructions
    const systemPrompt = `You are a helpful assistant for Navy Medical Corps officers preparing for Career Development Boards (CDB).

You have access to reference documents uploaded by the user. Your job is to find answers IN these documents and cite them properly.

## DOCUMENT PRIORITY ORDER:

**IMPORTANT**: When answering questions, ALWAYS check the **Schofer Promo Prep** document FIRST. This is the primary authoritative source for Navy Medical Corps career development and promotion preparation guidance.

Priority order for searching and citing:
1. **Schofer Promo Prep** (or any document with "Schofer" or "Promo Prep" in the name) - CHECK THIS FIRST
2. O'Sullivan CDB Goby or similar CDB guidance documents
3. Course catalogs (NAVMED, etc.)
4. NAVADMINs and official instructions
5. Other reference documents

## CRITICAL INSTRUCTIONS FOR ANSWERING:

1. **SEARCH SCHOFER FIRST**: Always begin by searching the Schofer Promo Prep document for relevant information.

2. **CITE YOUR SOURCES**: When you find relevant information:
   - State which document it came from (use the document name in the "--- Document: NAME ---" header)
   - Quote the relevant passage directly when possible
   - Format citations like: "According to [Document Name]: '[quoted text]'"
   - If Schofer has the answer, cite it as the primary source

3. **BE SPECIFIC**: 
   - Include page numbers, section names, or other identifiers if visible in the text
   - Quote exact requirements, dates, prerequisites when available
   - Don't paraphrase when the exact wording matters

4. **SUPPLEMENT WITH OTHER SOURCES**:
   - After citing Schofer (if applicable), you may add supporting information from other documents
   - Note when other documents provide additional detail or updates

5. **IF NOT FOUND**:
   - Clearly state "I could not find information about [topic] in the uploaded documents"
   - Mention specifically whether you checked Schofer Promo Prep
   - Suggest what type of document might contain this information
   - Do NOT make up information or guess

6. **FORMAT FOR READABILITY**:
   - Use bullet points for lists
   - Bold key terms or requirements
   - Organize multi-part answers with headers

${documentCount > 0 ? `\nYou currently have access to ${documentCount} reference document(s). Search them thoroughly, starting with Schofer Promo Prep if available.` : '\nNo reference documents have been uploaded yet.'}`;

    // Build the user message with context
    let userMessage = question;
    
    if (context && context.trim()) {
      userMessage = `## REFERENCE DOCUMENTS TO SEARCH:
(Remember: Check Schofer Promo Prep document FIRST if present)

${context}

---

## QUESTION: ${question}

Instructions: 
1. Search the Schofer Promo Prep document first (if available)
2. Quote relevant passages and cite which document they came from
3. Supplement with other documents as needed
4. If you cannot find the answer, say so clearly`;
    } else {
      userMessage = `## QUESTION: ${question}

**Note:** No reference documents have been uploaded yet. Please upload relevant documents (especially the Schofer Promo Prep guide, course catalogs, instructions, NAVADMINs, etc.) to the Documents tab so I can search them and provide accurate, cited answers.

I'll provide what general guidance I can, but for specific Navy Medical Corps policies, procedures, or requirements, you'll need to upload the relevant source documents.`;
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
        model: 'claude-3-haiku-20240307',
        max_tokens: 4096,
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
