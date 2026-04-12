/**
 * pii-scrubber.js
 * Scrubs common PII patterns from raw document text before sending to
 * external AI APIs. Applied server-side so no PII leaves in identifiable form.
 *
 * What it scrubs:
 *   - SSNs  (123-45-6789 / 123456789 / 123 45 6789)
 *   - DoD ID numbers (10-digit)
 *   - Phone numbers (US formats)
 *   - Email addresses
 *   - IPv4 addresses (sometimes in system-generated docs)
 *
 * What it intentionally keeps:
 *   - Names  (needed for cross-referencing across ODC/OSR/PSR)
 *   - Stations / commands (needed for FITREP context)
 *   - Dates (needed for rank history and fitrep timeline)
 *   - Scores / grades (the whole point of parsing)
 *
 * Names cannot be reliably scrubbed with regex on military PDFs without
 * knowing them in advance — they are needed for the parser to work and
 * are already covered by the PII consent banner shown to users before upload.
 */

const PATTERNS = [
  // SSN: 123-45-6789 | 123 45 6789 | 123456789
  { re: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,   tag: '[SSN]' },
  { re: /\b(?<!\d)\d{9}(?!\d)\b/g,            tag: '[SSN]' },

  // DoD ID (10-digit, distinct from SSN)
  { re: /\b\d{10}\b/g,                         tag: '[DODID]' },

  // Phone numbers (US): (123) 456-7890 | 123-456-7890 | 123.456.7890 | +1...
  { re: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, tag: '[PHONE]' },

  // Email addresses
  { re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, tag: '[EMAIL]' },

  // IPv4 addresses
  { re: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, tag: '[IP]' },
];

/**
 * Scrub a single string.
 * @param {string} text
 * @returns {string}
 */
export function scrubPII(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text;
  for (const { re, tag } of PATTERNS) {
    out = out.replace(re, tag);
  }
  return out;
}

/**
 * Scrub an object whose values may be strings (e.g. { odc, osr, psr }).
 * Returns a new object with all string values scrubbed.
 * @param {Record<string, string|undefined>} obj
 * @returns {Record<string, string|undefined>}
 */
export function scrubObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string' ? scrubPII(v) : v;
  }
  return out;
}
