'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase, DocumentRecord } from '../utils/supabaseClient';
import { extractTextFromPDF as extractPDFText, isPDF } from '../utils/pdfUtils';

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface FitrepRecord {
  payGrade: string;
  station: string;
  startDate: string;
  endDate: string;
  individualAverage: number;
  rsAverage: number;
  promotionRec: string;
  reportType: string;
}

interface OfficerData {
  fitrepAverage?: number;
  fitrepCount?: number;
  earlyPromotes?: number;
  mustPromotes?: number;
  promotables?: number;
  psrTrend?: string;
  belowRSAverageCount?: number;
  belowRSAveragePercentage?: number;
  fitreps?: FitrepRecord[];
  currentRank?: string;
  aqds?: string[];
  boardCertified?: boolean | null;
}

interface ResourcesQAProps {
  className?: string;
  officerData?: Partial<OfficerData> | null;
}

// ============================================================================
// YEAR DETECTION UTILITIES
// ============================================================================

/**
 * Extract a document year from the filename or file path.
 * Recognizes patterns like: FY26, FY2026, 2025-catalog, fy25, etc.
 * Falls back to the upload date year if nothing is found.
 */
function extractDocumentYear(doc: DocumentRecord): number {
  const text = `${doc.name} ${doc.file_path}`.toUpperCase();

  // FY26, FY25, FY2026, FY2025
  const fyTwoDigit = text.match(/FY(\d{2})\b/);
  if (fyTwoDigit) return 2000 + parseInt(fyTwoDigit[1]);

  const fyFourDigit = text.match(/FY(20\d{2})\b/);
  if (fyFourDigit) return parseInt(fyFourDigit[1]);

  // Standalone 4-digit year: 2024, 2025, 2026, 2027
  const fullYear = text.match(/\b(202[4-9]|203\d)\b/);
  if (fullYear) return parseInt(fullYear[1]);

  // Fall back to upload date
  return new Date(doc.created_at).getFullYear();
}

/**
 * Sort documents so the most recent year is first.
 * Within the same year, most recently uploaded is first.
 */
function sortDocumentsByRecency(docs: DocumentRecord[]): DocumentRecord[] {
  return [...docs].sort((a, b) => {
    const yearDiff = extractDocumentYear(b) - extractDocumentYear(a);
    if (yearDiff !== 0) return yearDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ============================================================================
// TEXT EXTRACTION UTILITIES
// ============================================================================

async function extractTextFromFile(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();

  // PDF files
  if (isPDF(file)) {
    try {
      return await extractPDFText(file);
    } catch (error) {
      console.error('PDF extraction error:', error);
      return '';
    }
  }

  // Text files
  if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    return file.text();
  }

  // For DOC/DOCX/PPT/PPTX - we'll store them but note extraction is limited
  // In production, you'd use a server-side converter
  if (fileName.endsWith('.doc') || fileName.endsWith('.docx') ||
      fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) {
    // Return placeholder - full extraction would need server-side processing
    return `[Document: ${file.name}] - Content stored but text extraction requires server-side processing for Office formats.`;
  }

  return '';
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ResourcesQA({ className = '', officerData }: ResourcesQAProps) {
  // State
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'qa' | 'documents'>('qa');
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ============================================================================
  // LOAD DOCUMENTS ON MOUNT
  // ============================================================================
  
  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadDocuments() {
    setIsLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Give actionable guidance for the most common Supabase configuration issues
        if (error.code === '42P01') {
          throw new Error('The "documents" table does not exist in Supabase. Run the setup SQL in your Supabase dashboard.');
        }
        if (error.code === 'PGRST301' || error.message?.includes('row-level security')) {
          throw new Error('Supabase Row Level Security is blocking access. Add an anon read policy on the "documents" table.');
        }
        throw error;
      }
      setDocuments(data || []);
    } catch (err) {
      console.error('Error loading documents:', err);
      setError(err instanceof Error ? err.message : 'Failed to load documents from Supabase');
    } finally {
      setIsLoadingDocs(false);
    }
  }

  // ============================================================================
  // FILE UPLOAD
  // ============================================================================

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Uploading ${file.name} (${i + 1}/${files.length})...`);

        // 1. Extract text from file
        setUploadProgress(`Extracting text from ${file.name}...`);
        const extractedText = await extractTextFromFile(file);

        // 2. Upload file to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `uploads/${fileName}`;

        setUploadProgress(`Uploading ${file.name} to storage...`);
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          if (uploadError.message?.includes('bucket') || uploadError.statusCode === 404) {
            throw new Error(`Storage bucket "documents" not found. Create it in your Supabase dashboard under Storage.`);
          }
          throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
        }

        // 3. Save document record to database
        setUploadProgress(`Saving ${file.name} to database...`);
        const { error: dbError } = await supabase
          .from('documents')
          .insert({
            name: file.name,
            file_path: filePath,
            file_type: file.type || fileExt,
            file_size: file.size,
            extracted_text: extractedText || null
          });

        if (dbError) {
          console.error('Database error:', dbError);
          throw new Error(`Failed to save ${file.name}: ${dbError.message}`);
        }
      }

      setUploadProgress('Upload complete!');
      await loadDocuments();
      
      // Clear after delay
      setTimeout(() => setUploadProgress(''), 2000);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  // ============================================================================
  // DELETE DOCUMENT
  // ============================================================================

  async function handleDeleteDocument(doc: DocumentRecord) {
    if (!confirm(`Delete "${doc.name}"?`)) return;

    try {
      // Delete from storage
      await supabase.storage.from('documents').remove([doc.file_path]);
      
      // Delete from database
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id);
      
      if (error) throw error;
      
      await loadDocuments();
    } catch (err) {
      console.error('Delete error:', err);
      setError('Failed to delete document');
    }
  }

  // ============================================================================
  // ASK QUESTION
  // ============================================================================

  async function handleAskQuestion() {
    if (!question.trim() || isAsking) return;

    const userMessage = question.trim();
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsAsking(true);
    setError(null);

    try {
      // Sort most-recent-year first so the AI sees (and preferentially cites) newer docs
      const sortedDocs = sortDocumentsByRecency(documents);

      const docsContext = sortedDocs
        .filter(doc => doc.extracted_text)
        .map(doc => {
          const year = extractDocumentYear(doc);
          const uploadedDate = new Date(doc.created_at).toLocaleDateString();
          return `--- Document: ${doc.name} [Year: ${year}] (Uploaded: ${uploadedDate}) ---\n${doc.extracted_text}`;
        })
        .join('\n\n');

      // Build structured officer record context if available
      let officerRecord: string | null = null;
      if (officerData && (officerData.fitrepCount || officerData.fitreps?.length)) {
        const lines: string[] = ['=== OFFICER FITREP RECORD (VERIFIED FROM PSR) ==='];
        if (officerData.currentRank) lines.push(`Current Rank: ${officerData.currentRank}`);
        if (officerData.fitrepCount) lines.push(`Total FITREPs: ${officerData.fitrepCount}`);
        if (officerData.fitrepAverage) lines.push(`Overall Average Score: ${officerData.fitrepAverage.toFixed(2)}`);
        if (officerData.earlyPromotes !== undefined) lines.push(`Early Promote (EP) marks: ${officerData.earlyPromotes}`);
        if (officerData.mustPromotes !== undefined) lines.push(`Must Promote (MP) marks: ${officerData.mustPromotes}`);
        if (officerData.promotables !== undefined) lines.push(`Promotable (P) marks: ${officerData.promotables}`);
        if (officerData.psrTrend) lines.push(`Performance Trend: ${officerData.psrTrend}`);
        if (officerData.belowRSAverageCount !== undefined) {
          lines.push(`FITREPs below Reporting Senior average: ${officerData.belowRSAverageCount} (${officerData.belowRSAveragePercentage ?? 0}%)`);
        }
        if (officerData.aqds?.length) lines.push(`AQDs: ${officerData.aqds.join(', ')}`);
        if (officerData.boardCertified !== null && officerData.boardCertified !== undefined) {
          lines.push(`Board Certified: ${officerData.boardCertified ? 'Yes' : 'No'}`);
        }

        if (officerData.fitreps?.length) {
          lines.push('');
          lines.push('Individual FITREP Records (chronological):');
          officerData.fitreps.forEach((f, i) => {
            const start = f.startDate ? new Date(f.startDate).toLocaleDateString('en-US', { year: '2-digit', month: 'short' }) : '?';
            const end = f.endDate ? new Date(f.endDate).toLocaleDateString('en-US', { year: '2-digit', month: 'short' }) : '?';
            lines.push(
              `  [${i + 1}] ${f.payGrade} | ${start}–${end} | ${f.station || 'Unknown Station'} | Score: ${f.individualAverage.toFixed(2)} | RS Avg: ${f.rsAverage.toFixed(2)} | Rec: ${f.promotionRec} | Type: ${f.reportType}`
            );
          });
        }
        officerRecord = lines.join('\n');
      }

      // Call the API
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          context: docsContext,
          documentCount: documents.length,
          officerRecord,
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (err) {
      console.error('Ask error:', err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error processing your question. Please try again.' 
      }]);
    } finally {
      setIsAsking(false);
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>
      {/* Header with Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('qa')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'qa'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            💬 Q&A Assistant
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'documents'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📁 Documents ({documents.length})
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">×</button>
        </div>
      )}

      {/* Q&A Tab */}
      {activeTab === 'qa' && (
        <div className="flex flex-col h-[500px]">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <div className="text-4xl mb-3">🎓</div>
                <p className="font-medium">CDB Reference Q&A</p>
                <p className="text-sm mt-1">
                  Ask questions about your uploaded documents
                  {documents.length > 0 && ` (${documents.length} docs loaded)`}
                </p>
                {documents.length === 0 && (
                  <p className="text-xs mt-2 text-amber-600">
                    No documents uploaded yet. Go to Documents tab to add reference materials.
                  </p>
                )}
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            {isAsking && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                    <span className="text-sm text-gray-600">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAskQuestion()}
                placeholder="Ask a question about your documents..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                disabled={isAsking}
              />
              <button
                onClick={handleAskQuestion}
                disabled={isAsking || !question.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Send
              </button>
            </div>
            {documents.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Searching {documents.length} document{documents.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="p-4 space-y-4">
          {/* Upload Area */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              accept=".pdf,.txt,.doc,.docx,.ppt,.pptx,.md"
              multiple
              className="hidden"
              disabled={isUploading}
            />
            
            {isUploading ? (
              <div className="space-y-2">
                <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-sm text-blue-600">{uploadProgress}</p>
              </div>
            ) : (
              <>
                <div className="text-4xl mb-2">📤</div>
                <p className="text-gray-600 font-medium">Upload Reference Documents</p>
                <p className="text-sm text-gray-500 mb-3">PDF, TXT, DOC, DOCX, PPT, PPTX</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  Select Files
                </button>
              </>
            )}
          </div>

          {/* Documents List */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">
              Uploaded Documents ({documents.length})
            </h3>
            
            {isLoadingDocs ? (
              <div className="text-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Loading documents...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No documents uploaded yet.</p>
                <p className="text-sm mt-1">Upload PDFs, docs, or presentations to get started.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {sortDocumentsByRecency(documents).map((doc) => {
                  const year = extractDocumentYear(doc);
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className="text-2xl">
                          {doc.file_type?.includes('pdf') ? '📕' :
                           doc.file_type?.includes('doc') ? '📘' :
                           doc.file_type?.includes('ppt') ? '📙' :
                           '📄'}
                        </span>
                        <div className="overflow-hidden">
                          <p className="font-medium text-sm text-gray-900 truncate">{doc.name}</p>
                          <p className="text-xs text-gray-500">
                            <span className="font-medium text-blue-600">FY{String(year).slice(-2)}</span>
                            {' • '}
                            {(doc.file_size / 1024).toFixed(1)} KB
                            {' • '}
                            {new Date(doc.created_at).toLocaleDateString()}
                            {doc.extracted_text ? ' • ✓ Indexed' : ' • ⏳ Not indexed'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteDocument(doc)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Delete document"
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="font-medium text-blue-900">💡 How it works</p>
            <ul className="text-blue-800 mt-1 space-y-1 text-xs">
              <li>• Upload reference documents (manuals, instructions, catalogs)</li>
              <li>• Text is extracted and indexed for search</li>
              <li>• Ask questions in the Q&A tab - AI searches all your docs</li>
              <li>• PDF text extraction works best; Office docs may need manual text</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResourcesQA;
