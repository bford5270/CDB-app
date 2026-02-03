// Vercel Serverless Function for CDB Q&A

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
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const { allowed, remaining } = checkRateLimit(ip);
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    
    if (!allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }
    
    const { question, context, isActionPlan } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Debug: Check what env vars are available
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const hasKey = !!apiKey;
    const keyLength = apiKey ? apiKey.length : 0;
    const keyPrefix = apiKey ? apiKey.substring(0, 7) : 'none';
    
    console.log(`API Key check - exists: ${hasKey}, length: ${keyLength}, prefix: ${keyPrefix}`);
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'API key not configured',
        debug: {
          hasKey,
          envKeys: Object.keys(process.env).filter(k => k.includes('ANTHROPIC') || k.includes('API'))
        }
      });
    }
    
    const systemPrompt = context || 'You are a helpful Navy Medical Corps career advisor.';
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: isActionPlan ? 2048 : 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText)cat > api/ask.js << 'EOF'
// Vercel Serverless Function for CDB Q&A

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
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const { allowed, remaining } = checkRateLimit(ip);
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    
    if (!allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }
    
    const { question, context, isActionPlan } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Debug: Check what env vars are available
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const hasKey = !!apiKey;
    const keyLength = apiKey ? apiKey.length : 0;
    const keyPrefix = apiKey ? apiKey.substring(0, 7) : 'none';
    
    console.log(`API Key check - exists: ${hasKey}, length: ${keyLength}, prefix: ${keyPrefix}`);
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'API key not configured',
        debug: {
          hasKey,
          envKeys: Object.keys(process.env).filter(k => k.includes('ANTHROPIC') || k.includes('API'))
        }
      });
    }
    
    const systemPrompt = context || 'You are a helpful Navy Medical Corps career advisor.';
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: isActionPlan ? 2048 : 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return res.status(500).json({ 
        error: `Claude API error: ${response.status}`,
        details: errorText.substring(0, 200)
      });
    }
    
    const data = await response.json();
    const answer = data.content?.[0]?.text || 'No response generated';
    
    return res.status(200).json({ answer });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
