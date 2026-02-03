const rateLimits = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60 * 60 * 1000;

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

  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const { allowed, remaining } = checkRateLimit(ip);
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    
    if (!allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }
    
    const { question, context, isActionPlan } = req.body;
    
    console.log('Request received:', { question: question?.substring(0, 50), hasContext: !!context });
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log('API key check:', { exists: !!apiKey, length: apiKey?.length });
    
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    const systemPrompt = context || 'You are a helpful Navy Medical Corps career advisor.';
    
    const requestBody = {
      model: 'claude-3-haiku-20240307',
      max_tokens: isActionPlan ? 2048 : 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    };
    
    console.log('Calling Anthropic API...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });
    
    console.log('Anthropic response status:', response.status);
    
    const responseText = await response.text();
    console.log('Anthropic response:', responseText.substring(0, 500));
    
    if (!response.ok) {
      return res.status(500).json({ 
        error: 'AI service error', 
        status: response.status,
        details: responseText.substring(0, 200)
      });
    }
    
    const data = JSON.parse(responseText);
    const answer = data.content?.[0]?.text || 'No response generated';
    
    return res.status(200).json({ answer });
    
  } catch (error) {
    console.error('Function error:', error.message, error.stack);
    return res.status(500).json({ error: error.message });
  }
}
