// src/app/utils/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://holxsmogeyupeeinlydy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvbHhzbW9nZXl1cGVlaW5seWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNDk5MjksImV4cCI6MjA4NTgyNTkyOX0.9i6PLOdpz-CND3Ve7VAmIx8ZsHFq43g__SqjtpV1mXc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface DocumentRecord {
  id: string;
  name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  extracted_text: string | null;
  created_at: string;
}

/** Extract document year from filename/path (FY26, FY2026, 2025-catalog, etc.) */
export function extractDocumentYear(doc: DocumentRecord): number {
  const text = `${doc.name} ${doc.file_path}`.toUpperCase();
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

/** Fetch all reference documents from Supabase and return as concatenated context string. */
export async function loadSupabaseDocuments(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return '';
    return sortDocumentsByRecency(data)
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
