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

    // Build the system prompt
    const systemPrompt = `You are a helpful assistant for Navy Medical Corps officers preparing for Career Development Boards (CDB). 

You have access to reference documents that have been uploaded by the user. Use these documents to answer questions accurately and specifically.

Guidelines:
- Answer questions based on the provided document context when available
- If the answer is found in the documents, cite which document it came from
- If you cannot find the answer in the provided documents, say so clearly
- Be concise but thorough
- For career advice, be specific to Navy Medical Corps when possible
- If asked about specific instructions, courses, or requirements, quote relevant sections

${documentCount > 0 ? `You currently have access to ${documentCount} reference document(s).` : 'No reference documents have been uploaded yet.'}`;

    // Build the user message with context
    let userMessage = question;
    
    if (context && context.trim()) {
      userMessage = `Here are the reference documents to search:

${context}

---

Question: ${question}

Please answer based on the documents above. If the answer isn't in the documents, let me know.`;
    } else {
      userMessage = `Question: ${question}

Note: No reference documents have been uploaded yet. I'll answer based on my general knowledge, but for specific Navy Medical Corps policies or procedures, please upload relevant documents.`;
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
        max_tokens: 2048,
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
