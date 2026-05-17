// api/documents.js - Vercel Serverless Function
// Reference-document store backed by a Notion database.
//
// Each document is one page in the Notion database:
//   - Name (title), File Type, File Size are page properties
//   - The extracted text is stored in the page body as paragraph blocks
//     (Notion caps a single text block at 2000 chars, so long text is chunked)
//
// Actions (POST body):
//   { action: 'list' }                                        -> DocumentRecord[]
//   { action: 'create', name, fileType, fileSize, text }       -> { id }
//   { action: 'delete', id }                                   -> { ok: true }

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// The database id is not a secret; default to the app's database so the only
// value an operator must configure is the integration token.
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '1ca10ce3b8434dd691a569b02acc6557';

// Notion limits: 2000 chars per text block, 100 child blocks per append call.
const MAX_BLOCK_CHARS = 1900;
const MAX_BLOCKS_PER_REQUEST = 100;

function notionFetch(token, path, init = {}) {
  return fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
}

function chunkText(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_BLOCK_CHARS) {
    chunks.push(text.slice(i, i + MAX_BLOCK_CHARS));
  }
  return chunks;
}

function textToBlocks(text) {
  return chunkText(text).map(content => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content } }] }
  }));
}

function readProp(properties, name) {
  const prop = properties[name];
  if (!prop) return null;
  if (prop.type === 'title') return prop.title.map(t => t.plain_text).join('');
  if (prop.type === 'rich_text') return prop.rich_text.map(t => t.plain_text).join('');
  if (prop.type === 'number') return prop.number;
  return null;
}

async function readPageText(token, pageId) {
  let text = '';
  let cursor;
  do {
    const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : '?page_size=100';
    const res = await notionFetch(token, `/blocks/${pageId}/children${qs}`);
    if (!res.ok) break;
    const data = await res.json();
    for (const block of data.results || []) {
      if (block.type === 'paragraph') {
        text += block.paragraph.rich_text.map(t => t.plain_text).join('') + '\n';
      }
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return text.trim();
}

async function listDocuments(token) {
  const documents = [];
  let cursor;
  do {
    const res = await notionFetch(token, `/databases/${DATABASE_ID}/query`, {
      method: 'POST',
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
        sorts: [{ timestamp: 'created_time', direction: 'descending' }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(`Notion query failed (${res.status})`);
      err.status = res.status;
      err.detail = errText;
      throw err;
    }

    const data = await res.json();
    for (const page of data.results || []) {
      const extracted = await readPageText(token, page.id);
      documents.push({
        id: page.id,
        name: readProp(page.properties, 'Name') || 'Untitled',
        file_type: readProp(page.properties, 'File Type') || '',
        file_size: readProp(page.properties, 'File Size') || 0,
        extracted_text: extracted || null,
        created_at: page.created_time
      });
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return documents;
}

async function createDocument(token, { name, fileType, fileSize, text }) {
  const createRes = await notionFetch(token, '/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: DATABASE_ID },
      properties: {
        Name: { title: [{ text: { content: String(name).slice(0, 2000) } }] },
        'File Type': { rich_text: [{ text: { content: String(fileType || '').slice(0, 2000) } }] },
        'File Size': { number: Number(fileSize) || 0 }
      }
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    const err = new Error(`Notion page create failed (${createRes.status})`);
    err.status = createRes.status;
    err.detail = errText;
    throw err;
  }

  const page = await createRes.json();

  if (text && text.trim()) {
    const blocks = textToBlocks(text);
    for (let i = 0; i < blocks.length; i += MAX_BLOCKS_PER_REQUEST) {
      const batch = blocks.slice(i, i + MAX_BLOCKS_PER_REQUEST);
      const appendRes = await notionFetch(token, `/blocks/${page.id}/children`, {
        method: 'PATCH',
        body: JSON.stringify({ children: batch })
      });
      if (!appendRes.ok) {
        const errText = await appendRes.text();
        const err = new Error(`Notion block append failed (${appendRes.status})`);
        err.status = appendRes.status;
        err.detail = errText;
        throw err;
      }
    }
  }

  return { id: page.id };
}

async function deleteDocument(token, id) {
  const res = await notionFetch(token, `/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ archived: true })
  });
  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`Notion archive failed (${res.status})`);
    err.status = res.status;
    err.detail = errText;
    throw err;
  }
  return { ok: true };
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

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN not configured');
    return res.status(500).json({
      error: 'Notion is not configured. Set the NOTION_TOKEN environment variable and share the database with the integration.'
    });
  }

  try {
    const body = req.body || {};
    const { action } = body;

    if (action === 'list') {
      const documents = await listDocuments(token);
      return res.status(200).json({ documents });
    }

    if (action === 'create') {
      const { name, fileType, fileSize, text } = body;
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }
      const result = await createDocument(token, { name, fileType, fileSize, text });
      return res.status(200).json(result);
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }
      const result = await deleteDocument(token, id);
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('Documents API error:', error.message, error.detail || '');
    const status = error.status === 401 ? 401 : 500;
    const message =
      error.status === 401
        ? 'Notion rejected the token (401). Check NOTION_TOKEN and that the database is shared with the integration.'
        : error.status === 404
          ? 'Notion database not found (404). Check NOTION_DATABASE_ID and that the database is shared with the integration.'
          : 'Failed to reach the document store';
    return res.status(status).json({ error: message });
  }
}
