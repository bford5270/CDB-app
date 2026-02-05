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
