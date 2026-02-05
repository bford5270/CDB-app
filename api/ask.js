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

## CRITICAL INSTRUCTIONS FOR ANSWERING:

1. **SEARCH THE DOCUMENTS FIRST**: Before answering, thoroughly search through all provided document content.

2. **CITE YOUR SOURCES**: When you find relevant information:
   - State which document it came from (use the document name in the "--- Document: NAME ---" header)
   - Quote the relevant passage directly when possible
   - Format citations like: "According to [Document Name]: '[quoted text]'"

3. **BE SPECIFIC**: 
   - Include page numbers, section names, or other identifiers if visible in the text
   - Quote exact requirements, dates, prerequisites when available
   - Don't paraphrase when the exact wording matters

4. **IF NOT FOUND**:
   - Clearly state "I could not find information about [topic] in the uploaded documents"
   - Suggest what type of document might contain this information
   - Do NOT make up information or guess

5. **FORMAT FOR READABILITY**:
   - Use bullet points for lists
   - Bold key terms or requirements
   - Organize multi-part answers with headers

${documentCount > 0 ? `\nYou currently have access to ${documentCount} reference document(s). Search them thoroughly.` : '\nNo reference documents have been uploaded yet.'}`;

    // Build the user message with context
    let userMessage = question;
    
    if (context && context.trim()) {
      userMessage = `## REFERENCE DOCUMENTS TO SEARCH:

${context}

---

## QUESTION: ${question}

Instructions: Search the documents above thoroughly. Quote relevant passages and cite which document they came from. If you cannot find the answer, say so clearly.`;
    } else {
      userMessage = `## QUESTION: ${question}

**Note:** No reference documents have been uploaded yet. Please upload relevant documents (course catalogs, instructions, NAVADMINs, etc.) to the Documents tab so I can search them and provide accurate, cited answers.

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
