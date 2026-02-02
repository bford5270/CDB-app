// Vercel Serverless Function for CDB Q&A
// This proxies requests to Claude API with rate limiting

// Simple in-memory rate limiting
const rateLimits = new Map();
const RATE_LIMIT = 20; // requests per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimits.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimits.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }
  
  if (record.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT - record.count };
}

// Clean up old entries periodically
let cleanupCounter = 0;
function cleanupRateLimits() {
  cleanupCounter++;
  if (cleanupCounter % 100 === 0) {
    const now = Date.now();
    for (const [ip, record] of rateLimits.entries()) {
      if (now > record.resetTime) {
        rateLimits.delete(ip);
      }
    }
  }
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get client IP for rate limiting
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
               req.headers['x-real-ip'] || 
               'unknown';
    
    // Check rate limit
    cleanupRateLimits();
    const { allowed, remaining } = checkRateLimit(ip);
    
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    
    if (!allowed) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again in an hour.' 
      });
    }
    
    // Parse request body
    const { question, context, referenceNames } = req.body;
    
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    if (!context || typeof context !== 'string') {
      return res.status(400).json({ error: 'Reference context is required' });
    }
    
    // Check for API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not configured');
      return res.status(500).json({ 
        error: 'Service not configured. Please contact administrator.' 
      });
    }
    
    // Build system prompt
    const systemPrompt = `You are a helpful assistant that answers questions about Navy Medical Corps Career Development Boards (CDBs) and promotion preparation.

IMPORTANT RULES:
1. ONLY answer based on the reference documents provided below
2. If the information is not in the references, say "I don't see that information in the loaded references"
3. Be concise and practical - give actionable answers
4. When citing information, mention which document it came from
5. Never make up information or procedures
6. Focus on "how to" practical guidance

The user has loaded these reference documents:
${referenceNames?.join(', ') || 'Unknown documents'}

=== REFERENCE DOCUMENTS ===
${context}
=== END REFERENCES ===`;

    // Call Claude API (using Haiku for cost efficiency)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: question,
          },
        ],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      
      if (response.status === 401) {
        return res.status(500).json({ 
          error: 'API authentication failed. Please contact administrator.' 
        });
      }
      
      if (response.status === 429) {
        return res.status(429).json({ 
          error: 'API rate limit reached. Please try again later.' 
        });
      }
      
      return res.status(500).json({ 
        error: 'Failed to get response from AI service' 
      });
    }
    
    const data = await response.json();
    
    // Extract answer from response
    const answer = data.content?.[0]?.text || 'No response generated';
    
    // Try to identify which sources were used (simple heuristic)
    const usedSources = referenceNames?.filter((name) => 
      answer.toLowerCase().includes(name.toLowerCase().split(' ')[0])
    ) || [];
    
    return res.status(200).json({ 
      answer,
      sources: usedSources.length > 0 ? usedSources : undefined,
    });
    
  } catch (error) {
    console.error('API route error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
