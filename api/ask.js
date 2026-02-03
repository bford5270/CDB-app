import Anthropic from '@anthropic-ai/sdk';

// Rate limiting - simple in-memory store
const rateLimitMap = new Map();
const RATE_LIMIT = 20; // requests per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

function checkRateLimit(ip) {
  const now = Date.now();
  const userLimit = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_WINDOW };
  
  if (now > userLimit.resetTime) {
    userLimit.count = 0;
    userLimit.resetTime = now + RATE_WINDOW;
  }
  
  if (userLimit.count >= RATE_LIMIT) {
    return false;
  }
  
  userLimit.count++;
  rateLimitMap.set(ip, userLimit);
  return true;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }
  
  try {
    const { question, context, isActionPlan, strictMode } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not configured');
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    const client = new Anthropic({ apiKey });
    
    // Build system prompt based on mode
    let systemPrompt;
    
    if (isActionPlan) {
      // For personalized action plans - more flexible
      systemPrompt = `You are a Navy Medical Corps career advisor helping officers prepare for Career Development Boards.

Based on the officer's data provided, create a personalized action plan with specific recommendations.

Use the FY26 course catalog data to recommend specific courses with actual dates when available.

Be specific and actionable. Include timelines when possible.`;
    } else if (strictMode) {
      // Strict mode - only answer from provided context, cite sources
      systemPrompt = `You are a Navy Medical Corps reference assistant. You MUST follow these rules strictly:

1. ONLY answer based on the information provided in the context below.
2. If the answer is not found in the provided context, say "I don't have information about that in my reference documents. Please consult your detailer or official Navy sources."
3. When you do provide information, cite the specific source (e.g., "According to the FY26 Course Catalog...").
4. DO NOT make up information, guess, or use general knowledge.
5. Keep answers concise and factual.

REFERENCE DOCUMENTS:
${context || 'No reference documents provided.'}

Remember: If the information isn't in the context above, say you don't have it.`;
    } else {
      // Default mode - general Q&A
      systemPrompt = `You are a helpful Navy Medical Corps career advisor. Answer questions about career development, courses, and requirements.

Reference the provided context when available:
${context || 'No additional context provided.'}

If you're not certain about something, acknowledge the uncertainty and suggest consulting official sources.`;
    }
    
    console.log('Calling Claude API...');
    console.log('Question:', question);
    console.log('Context length:', context?.length || 0);
    console.log('Strict mode:', strictMode);
    
    const message = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: isActionPlan ? 2048 : 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: question,
        },
      ],
    });
    
    console.log('Claude response received');
    
    const answer = message.content[0].type === 'text' 
      ? message.content[0].text 
      : 'Unable to generate response';
    
    // Determine sources based on what was referenced
    const sources = [];
    if (context?.includes('FY26') || context?.includes('Course Catalog')) {
      sources.push('FY26 NAVMED Course Catalog');
    }
    
    return res.status(200).json({ 
      answer,
      sources,
    });
    
  } catch (error) {
    console.error('API Error:', error);
    console.error('Error details:', error.message);
    
    if (error.status === 401) {
      return res.status(500).json({ error: 'API authentication failed' });
    }
    
    return res.status(500).json({ 
      error: 'Failed to process request',
      details: error.message,
    });
  }
}