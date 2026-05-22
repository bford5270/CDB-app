export interface NotionDocument {
  id: string;
  name: string;
  text: string;
  updatedAt: string;
}

export function extractDocumentYear(doc: NotionDocument): number {
  const s = doc.name.toUpperCase();
  const fyTwo = s.match(/FY(\d{2})\b/);
  if (fyTwo) return 2000 + parseInt(fyTwo[1]);
  const fyFour = s.match(/FY(20\d{2})\b/);
  if (fyFour) return parseInt(fyFour[1]);
  const fullYear = s.match(/\b(202[4-9]|203\d)\b/);
  if (fullYear) return parseInt(fullYear[1]);
  return new Date(doc.updatedAt).getFullYear();
}

export function sortDocumentsByRecency(docs: NotionDocument[]): NotionDocument[] {
  return [...docs].sort((a, b) => {
    const yearDiff = extractDocumentYear(b) - extractDocumentYear(a);
    if (yearDiff !== 0) return yearDiff;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function loadNotionDocuments(): Promise<string> {
  try {
    const res = await fetch('/api/docs');
    if (!res.ok) return '';
    const { documents } = await res.json() as { documents: NotionDocument[] };
    if (!documents?.length) return '';
    return sortDocumentsByRecency(documents)
      .map(doc => {
        const year = extractDocumentYear(doc);
        return `--- Document: ${doc.name} [Year: ${year}] ---\n${doc.text}`;
      })
      .join('\n\n');
  } catch {
    return '';
  }
}
