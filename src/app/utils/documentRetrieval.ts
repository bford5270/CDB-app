// Keyword retrieval for the CDB reference library.
//
// The Q&A path used to concatenate every reference document into one prompt.
// The eight built-in guideline PDFs alone extract to ~520,000 characters
// (~184,000 tokens), which overflows the Q&A model's context window and makes
// every question fail. This module chunks the library, scores chunks against
// the question with BM25 plus a Navy Medical Corps synonym layer, and returns
// only the best chunks that fit a character budget.

import { NotionDocument, extractDocumentYear } from './notionClient';

export interface RetrievalOptions {
  /** Hard ceiling on the assembled context. Default 180,000 chars (~50k tokens). */
  maxChars?: number;
  /** Target size of a single chunk. Default 1,400 chars. */
  chunkSize?: number;
  /** Characters of trailing overlap carried into the next chunk. Default 200. */
  chunkOverlap?: number;
  /** Cap on chunks drawn from any one document, so one big PDF cannot crowd out the rest. */
  maxChunksPerDoc?: number;
  /**
   * Drop chunks scoring below this fraction of the best chunk's score, so the
   * budget is a ceiling rather than a target and weak matches stay out of the
   * prompt. Default 0.15.
   */
  minScoreRatio?: number;
}

export interface RetrievalStats {
  chunksSelected: number;
  chunksAvailable: number;
  documentsRepresented: number;
  documentNames: string[];
  chars: number;
  expandedTerms: string[];
  /** True when nothing matched and the most recent documents were used as a fallback. */
  usedFallback: boolean;
}

export interface RetrievalResult {
  context: string;
  stats: RetrievalStats;
}

interface Chunk {
  docId: string;
  docName: string;
  year: number;
  /** Position of the chunk within its document, used to restore reading order. */
  order: number;
  text: string;
  terms: string[];
  termFreq: Map<string, number>;
}

// ============================================================================
// TOKENIZATION
// ============================================================================

const STOPWORDS = new Set([
  'a', 'about', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been',
  'being', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'for', 'from',
  'get', 'give', 'had', 'has', 'have', 'having', 'he', 'her', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my', 'need', 'of', 'on', 'or',
  'our', 'out', 'over', 'please', 'she', 'should', 'so', 'some', 'tell', 'than',
  'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'to', 'up', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'why', 'will', 'with', 'would', 'you', 'your',
]);

// Light suffix stripping. Deliberately conservative: it must not mangle the
// acronyms and course codes that carry most of the signal in these documents.
function stem(token: string): string {
  if (/\d/.test(token)) return token;          // 67A, FY26, O4 — leave alone
  if (token.length <= 4) return token;
  if (token.endsWith('ies') && token.length > 5) return token.slice(0, -3) + 'y';
  if (token.endsWith('sses')) return token.slice(0, -2);
  if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

// ============================================================================
// DOMAIN SYNONYMS
// ============================================================================

// Each group is a set of mutually interchangeable terms. A query hit on any
// member expands the query with every other member at reduced weight.
// Multi-word entries are matched as phrases against the normalized question.
const SYNONYM_GROUPS: string[][] = [
  ['cdb', 'career development board', 'career board'],
  ['odc', 'officer data card'],
  ['osr', 'officer summary record'],
  ['psr', 'performance summary record'],
  ['fitrep', 'fitness report', 'eval', 'evaluation', 'performance evaluation'],
  ['rsca', 'reporting senior cumulative average', 'reporting senior'],
  ['ep', 'early promote'],
  ['mp', 'must promote'],
  ['aqd', 'additional qualification designator', 'qualification designator'],
  ['nobc', 'navy officer billet classification'],
  ['subspecialty', 'subspecialty code', 'ssp'],
  ['promotion', 'promote', 'selection board', 'promotion board', 'advancement', 'select'],
  ['zone', 'in zone', 'above zone', 'below zone', 'due course'],
  ['jpme', 'joint professional military education', 'war college', 'naval war college'],
  ['jpme i', 'jpme 1', 'fleet seminar'],
  ['broc', 'basic reserve officer course', 'basic officer course'],
  ['aroc', 'advanced officer course'],
  ['ilc', 'intermediate leadership course'],
  ['slc', 'senior leadership course'],
  ['sllc', 'senior leader'],
  ['medxellence', 'medical excellence course'],
  ['swmdoic', 'surface warfare medical'],
  ['iesc', 'executive skills'],
  ['course', 'training', 'catalog', 'class', 'curriculum'],
  ['board certification', 'board certified', 'abms', 'certification', 'recertification'],
  ['gme', 'graduate medical education', 'residency', 'fellowship', 'training program'],
  ['detailer', 'orders', 'billet', 'assignment', 'pcs', 'duty station', 'tour'],
  ['operational', 'deployment', 'deploy', 'operational experience', 'operational tour'],
  ['fmf', 'fleet marine force', 'warfare qualification', 'warfare device', 'warfare pin'],
  ['department head', 'dept head', 'division officer', 'leadership position'],
  ['xo', 'executive officer'],
  ['co', 'commanding officer', 'command'],
  ['oic', 'officer in charge'],
  ['milestone', 'career milestone', 'career progression', 'career path', 'career timeline'],
  ['mentor', 'mentorship', 'mentoring'],
  ['navadmin', 'instruction', 'bumedinst', 'opnavinst', 'policy'],
  ['specialty', 'specialty leader', 'specialty code'],
  ['clearance', 'security clearance', 'ts sci'],
  ['degree', 'masters', 'mph', 'mba', 'graduate degree', 'advanced degree'],
  ['bonus', 'incentive pay', 'retention bonus', 'special pay', 'isp', 'msp'],
  ['prt', 'physical readiness', 'pfa', 'body composition'],
  ['o4', 'lcdr', 'lieutenant commander'],
  ['o5', 'cdr', 'commander'],
  ['o6', 'capt', 'captain'],
  ['o3', 'lt', 'lieutenant'],
];

// token -> related terms, for single-word group members.
const TOKEN_SYNONYMS = new Map<string, Set<string>>();
// normalized phrase -> related terms, for multi-word group members.
const PHRASE_SYNONYMS = new Map<string, Set<string>>();

for (const group of SYNONYM_GROUPS) {
  for (const entry of group) {
    const key = normalize(entry);
    if (!key) continue;
    const related = new Set<string>();
    for (const other of group) {
      if (normalize(other) === key) continue;
      for (const t of tokenize(other)) related.add(t);
    }
    const target = key.includes(' ') ? PHRASE_SYNONYMS : TOKEN_SYNONYMS;
    const existing = target.get(key);
    if (existing) related.forEach(r => existing.add(r));
    else target.set(key, related);
  }
}

/**
 * Expand a question into weighted search terms. Terms typed by the user carry
 * full weight; synonyms pulled in from the domain map carry half weight.
 */
export function expandQuery(question: string): Map<string, number> {
  const weights = new Map<string, number>();
  const add = (term: string, weight: number) => {
    if (!term) return;
    weights.set(term, Math.max(weights.get(term) ?? 0, weight));
  };

  for (const token of tokenize(question)) add(token, 1);

  const normalized = normalize(question);
  const rawTokens = normalized.split(' ').filter(Boolean);

  for (const raw of rawTokens) {
    const related = TOKEN_SYNONYMS.get(raw);
    if (related) related.forEach(r => add(r, 0.5));
  }
  for (const [phrase, related] of PHRASE_SYNONYMS) {
    if (normalized.includes(phrase)) related.forEach(r => add(r, 0.5));
  }

  return weights;
}

// ============================================================================
// CHUNKING
// ============================================================================

function chunkDocument(doc: NotionDocument, chunkSize: number, overlap: number): Chunk[] {
  const year = extractDocumentYear(doc);
  const lines = doc.text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && l !== '--- PAGE BREAK ---');

  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufferLen = 0;
  let order = 0;

  const flush = () => {
    if (!buffer.length) return;
    const text = buffer.join('\n');
    if (text.trim()) {
      const terms = tokenize(text);
      const termFreq = new Map<string, number>();
      for (const t of terms) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
      chunks.push({ docId: doc.id, docName: doc.name, year, order: order++, text, terms, termFreq });
    }
    // Carry the tail of this chunk into the next so a fact split across the
    // boundary is still retrievable from at least one chunk.
    const tail: string[] = [];
    let tailLen = 0;
    for (let i = buffer.length - 1; i >= 0 && tailLen < overlap; i--) {
      tail.unshift(buffer[i]);
      tailLen += buffer[i].length + 1;
    }
    buffer = tail;
    bufferLen = tailLen;
  };

  for (const line of lines) {
    // A single line longer than the chunk size becomes its own chunk.
    if (line.length >= chunkSize) {
      flush();
      buffer = [line];
      bufferLen = line.length;
      flush();
      buffer = [];
      bufferLen = 0;
      continue;
    }
    buffer.push(line);
    bufferLen += line.length + 1;
    if (bufferLen >= chunkSize) flush();
  }
  if (buffer.length) {
    const text = buffer.join('\n');
    if (text.trim()) {
      const terms = tokenize(text);
      const termFreq = new Map<string, number>();
      for (const t of terms) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
      chunks.push({ docId: doc.id, docName: doc.name, year, order: order++, text, terms, termFreq });
    }
  }

  return chunks;
}

// ============================================================================
// SCORING + SELECTION
// ============================================================================

const BM25_K1 = 1.2;
const BM25_B = 0.75;

function scoreChunks(chunks: Chunk[], queryWeights: Map<string, number>, newestYear: number): Map<Chunk, number> {
  const docFreq = new Map<string, number>();
  for (const chunk of chunks) {
    for (const term of chunk.termFreq.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const N = chunks.length;
  const avgLen = chunks.reduce((s, c) => s + c.terms.length, 0) / Math.max(N, 1);
  const scores = new Map<Chunk, number>();

  for (const chunk of chunks) {
    let score = 0;
    const len = chunk.terms.length || 1;
    for (const [term, weight] of queryWeights) {
      const tf = chunk.termFreq.get(term);
      if (!tf) continue;
      const df = docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const norm = tf * (BM25_K1 + 1) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (len / avgLen)));
      score += weight * idf * norm;
    }
    if (score > 0) {
      // Prefer the newest catalog when two documents say similar things.
      const age = Math.max(0, newestYear - chunk.year);
      score *= 1 / (1 + 0.08 * age);
      scores.set(chunk, score);
    }
  }

  return scores;
}

function renderContext(chunks: Chunk[]): string {
  // Group by document, newest first, chunks in original reading order.
  const byDoc = new Map<string, Chunk[]>();
  for (const chunk of chunks) {
    const list = byDoc.get(chunk.docId);
    if (list) list.push(chunk);
    else byDoc.set(chunk.docId, [chunk]);
  }

  const groups = [...byDoc.values()].sort((a, b) => b[0].year - a[0].year);
  const parts: string[] = [];

  for (const group of groups) {
    group.sort((a, b) => a.order - b.order);
    const { docName, year } = group[0];
    const body: string[] = [];
    let previousOrder: number | null = null;
    for (const chunk of group) {
      if (previousOrder !== null && chunk.order !== previousOrder + 1) body.push('[...]');
      body.push(chunk.text);
      previousOrder = chunk.order;
    }
    parts.push(`--- Document: ${docName} [Year: ${year}] ---\n${body.join('\n')}`);
  }

  return parts.join('\n\n');
}

/**
 * Select the passages of the reference library most relevant to `question`,
 * capped at `maxChars`. Returns the assembled context plus stats for the UI.
 */
export function buildRetrievalContext(
  documents: NotionDocument[],
  question: string,
  options: RetrievalOptions = {}
): RetrievalResult {
  const maxChars = options.maxChars ?? 180_000;
  const chunkSize = options.chunkSize ?? 1_400;
  const chunkOverlap = options.chunkOverlap ?? 200;
  const maxChunksPerDoc = options.maxChunksPerDoc ?? 40;
  const minScoreRatio = options.minScoreRatio ?? 0.15;

  const withText = documents.filter(d => d.text && d.text.trim());
  const emptyStats: RetrievalStats = {
    chunksSelected: 0,
    chunksAvailable: 0,
    documentsRepresented: 0,
    documentNames: [],
    chars: 0,
    expandedTerms: [],
    usedFallback: false,
  };
  if (!withText.length) return { context: '', stats: emptyStats };

  const chunks = withText.flatMap(doc => chunkDocument(doc, chunkSize, chunkOverlap));
  if (!chunks.length) return { context: '', stats: emptyStats };

  const newestYear = Math.max(...chunks.map(c => c.year));
  const queryWeights = expandQuery(question);
  const scores = scoreChunks(chunks, queryWeights, newestYear);

  const ordered = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const topScore = ordered.length ? ordered[0][1] : 0;
  let ranked = ordered
    .filter(([, score]) => score >= topScore * minScoreRatio)
    .map(([chunk]) => chunk);
  let usedFallback = false;

  if (!ranked.length) {
    // Nothing matched — fall back to the opening passages of the newest
    // documents so the model still has the most current guidance to work with.
    usedFallback = true;
    ranked = [...chunks].sort((a, b) => (b.year - a.year) || (a.order - b.order));
  }

  const selected: Chunk[] = [];
  const perDoc = new Map<string, number>();
  let chars = 0;

  for (const chunk of ranked) {
    const taken = perDoc.get(chunk.docId) ?? 0;
    if (taken >= maxChunksPerDoc) continue;
    const cost = chunk.text.length + 1;
    if (chars + cost > maxChars) continue;
    selected.push(chunk);
    perDoc.set(chunk.docId, taken + 1);
    chars += cost;
  }

  const context = renderContext(selected);

  return {
    context,
    stats: {
      chunksSelected: selected.length,
      chunksAvailable: chunks.length,
      documentsRepresented: perDoc.size,
      documentNames: [...new Set(selected.map(c => c.docName))],
      chars: context.length,
      expandedTerms: [...queryWeights.keys()],
      usedFallback,
    },
  };
}
