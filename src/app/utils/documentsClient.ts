// src/app/utils/documentsClient.ts
// Talks to the /api/documents serverless endpoint, which is backed by Notion.
// The Notion token is server-side only, so the browser never touches Notion
// directly.

export interface DocumentRecord {
  id: string;
  name: string;
  file_type: string;
  file_size: number;
  extracted_text: string | null;
  created_at: string;
}

async function postDocuments<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const { documents } = await postDocuments<{ documents: DocumentRecord[] }>({ action: 'list' });
  return documents;
}

export async function createDocument(input: {
  name: string;
  fileType: string;
  fileSize: number;
  text: string;
}): Promise<{ id: string }> {
  return postDocuments<{ id: string }>({ action: 'create', ...input });
}

export async function deleteDocument(id: string): Promise<void> {
  await postDocuments<{ ok: true }>({ action: 'delete', id });
}

/** Extract document year from the filename (FY26, FY2026, 2025-catalog, etc.) */
export function extractDocumentYear(doc: DocumentRecord): number {
  const text = doc.name.toUpperCase();
  const fyTwo = text.match(/FY(\d{2})\b/);
  if (fyTwo) return 2000 + parseInt(fyTwo[1]);
  const fyFour = text.match(/FY(20\d{2})\b/);
  if (fyFour) return parseInt(fyFour[1]);
  const fullYear = text.match(/\b(202[4-9]|203\d)\b/);
  if (fullYear) return parseInt(fullYear[1]);
  return new Date(doc.created_at).getFullYear();
}

/** Sort documents most-recent-year first; within same year, most recently uploaded first. */
export function sortDocumentsByRecency(docs: DocumentRecord[]): DocumentRecord[] {
  return [...docs].sort((a, b) => {
    const yearDiff = extractDocumentYear(b) - extractDocumentYear(a);
    if (yearDiff !== 0) return yearDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/** Fetch all reference documents and return them as one concatenated context string. */
export async function loadReferenceDocuments(): Promise<string> {
  try {
    const docs = await listDocuments();
    return sortDocumentsByRecency(docs)
      .filter(doc => doc.extracted_text)
      .map(doc => {
        const year = extractDocumentYear(doc);
        return `--- Document: ${doc.name} [Year: ${year}] ---\n${doc.extracted_text}`;
      })
      .join('\n\n');
  } catch {
    return '';
  }
}
