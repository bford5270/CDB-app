// api/docs.js - Vercel Serverless Function
// Fetches reference documents from a Notion database.
// PII (SSNs, DODIDs) is scrubbed from all content before returning.
//
// Required env vars:
//   NOTION_API_KEY      — Notion internal integration token
//   NOTION_DATABASE_ID  — ID of the Notion database containing reference docs

const NOTION_VERSION = '2022-06-28';

// ============================================================================
// PII SCRUBBER
// ============================================================================

function scrubPII(text) {
  if (!text) return '';
  return text
    // SSN: 123-45-6789
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]')
    // SSN with spaces: 123 45 6789
    .replace(/\b\d{3} \d{2} \d{4}\b/g, '[SSN REDACTED]')
    // DOD ID (10-digit number labeled as DODID/EDI-PI/EDIPI near the number)
    .replace(/\b(DODID|EDIPI|EDI-PI)[:\s]+\d{10}\b/gi, '[DOD ID REDACTED]');
}

// ============================================================================
// NOTION API HELPERS
// ============================================================================

async function notionRequest(path, body, apiKey) {
  const opts = {
    method: body ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.notion.com/v1${path}`, opts);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Notion API ${res.status}: ${errText.substring(0, 200)}`);
  }
  return res.json();
}

function extractTextFromBlocks(blocks) {
  const lines = [];
  for (const block of blocks) {
    const type = block.type;
    const data = block[type];
    if (!data) continue;
    const richText = data.rich_text;
    if (!Array.isArray(richText)) continue;
    const text = richText.map(rt => rt.plain_text || '').join('');
    if (!text.trim()) continue;
    if (type === 'heading_1') lines.push(`\n# ${text}`);
    else if (type === 'heading_2') lines.push(`\n## ${text}`);
    else if (type === 'heading_3') lines.push(`\n### ${text}`);
    else if (type === 'bulleted_list_item') lines.push(`• ${text}`);
    else if (type === 'numbered_list_item') lines.push(`- ${text}`);
    else lines.push(text);
  }
  return lines.join('\n');
}

async function fetchPageText(pageId, apiKey) {
  let text = '';
  let cursor;
  do {
    const params = cursor ? `?start_cursor=${cursor}` : '';
    const data = await notionRequest(`/blocks/${pageId}/children${params}`, null, apiKey);
    text += extractTextFromBlocks(data.results) + '\n';
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return text.trim();
}

// ============================================================================
// HANDLER
// ============================================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    return res.status(503).json({
      error: 'Reference library not configured. Set NOTION_API_KEY and NOTION_DATABASE_ID in your Vercel environment variables.',
    });
  }

  try {
    // 1. Page all results from the database
    const pages = [];
    let cursor;
    do {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const data = await notionRequest(`/databases/${databaseId}/query`, body, apiKey);
      pages.push(...data.results);
      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);

    // 2. Fetch block content for each page concurrently
    const documents = await Promise.all(
      pages.map(async (page) => {
        const titleProp =
          page.properties?.Name?.title ||
          page.properties?.Title?.title ||
          page.properties?.title?.title ||
          [];
        const name = titleProp[0]?.plain_text || 'Untitled';

        const rawText = await fetchPageText(page.id, apiKey);
        const text = scrubPII(rawText);

        return {
          id: page.id,
          name,
          text,
          updatedAt: page.last_edited_time,
        };
      })
    );

    // 3. Only return pages that have content
    const validDocs = documents.filter(d => d.text.length > 0);

    return res.status(200).json({ documents: validDocs });
  } catch (err) {
    console.error('Notion fetch error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load reference documents' });
  }
}
