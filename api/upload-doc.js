// api/upload-doc.js
// Accepts { name, text, fileType, fileSize }, scrubs PII, creates a Notion page.

function scrubPII(text) {
  if (!text) return '';
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b\d{3} \d{2} \d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b(DODID|EDIPI|EDI-PI)[:\s]+\d{10}\b/gi, '[DOD ID REDACTED]');
}

function chunkText(text, size = 1800) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function toBlocks(chunks) {
  return chunks.map(chunk => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] }
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!apiKey || !dbId) return res.status(500).json({ error: 'Notion not configured' });

  const { name, text: rawText, fileType, fileSize } = req.body || {};
  if (!name || !rawText) return res.status(400).json({ error: 'name and text are required' });

  const text = scrubPII(rawText);
  const chunks = chunkText(text);

  // First 98 blocks go into the create call; remainder appended in batches of 100.
  const createRes = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        Name: { title: [{ text: { content: name } }] },
        'File Type': { rich_text: [{ text: { content: fileType || '' } }] },
        'File Size': { number: fileSize || 0 }
      },
      children: toBlocks(chunks.slice(0, 98))
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error('Notion create page error:', createRes.status, errText);
    return res.status(500).json({ error: 'Failed to create Notion page' });
  }

  const page = await createRes.json();

  // Append remaining chunks
  for (let i = 98; i < chunks.length; i += 100) {
    const appendRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({ children: toBlocks(chunks.slice(i, i + 100)) })
    });
    if (!appendRes.ok) {
      console.error('Notion append blocks error:', appendRes.status, await appendRes.text());
    }
  }

  return res.status(200).json({
    id: page.id,
    name,
    charCount: text.length
  });
}
