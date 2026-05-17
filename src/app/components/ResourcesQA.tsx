'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  DocumentRecord,
  extractDocumentYear,
  sortDocumentsByRecency,
  listDocuments,
  createDocument,
  deleteDocument
} from '../utils/documentsClient';
import { extractTextFromPDF as extractPDFText, isPDF } from '../utils/pdfUtils';

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ResourcesQAProps {
  className?: string;
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

export function ResourcesQA({ className = '' }: ResourcesQAProps) {
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
      const data = await listDocuments();
      setDocuments(data);
    } catch (err) {
      console.error('Error loading documents:', err);
      setError(err instanceof Error ? err.message : 'Failed to load documents');
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

        // 1. Extract text from file (only the text is stored, not the raw file)
        setUploadProgress(`Extracting text from ${file.name}...`);
        const extractedText = await extractTextFromFile(file);

        // 2. Save the document to Notion via the API
        setUploadProgress(`Saving ${file.name}...`);
        const fileExt = file.name.split('.').pop();
        await createDocument({
          name: file.name,
          fileType: file.type || fileExt || '',
          fileSize: file.size,
          text: extractedText || ''
        });
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
      await deleteDocument(doc.id);
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

      // Call the API
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          context: docsContext,
          documentCount: documents.length
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
