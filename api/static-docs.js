// api/static-docs.js
// Lists PDF files bundled in public/guidelines/ so the frontend can auto-load them.

import { readdirSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const dir = join(process.cwd(), 'public', 'guidelines');
    const files = readdirSync(dir)
      .filter(f => /\.pdf$/i.test(f))
      .map(name => ({
        name: name.replace(/\.pdf$/i, ''),
        url: `/guidelines/${encodeURIComponent(name)}`,
      }));
    return res.status(200).json({ files });
  } catch (err) {
    console.error('static-docs error:', err);
    return res.status(500).json({ error: 'Failed to list static docs' });
  }
}
