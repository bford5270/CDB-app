'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { NotionDocument, extractDocumentYear, sortDocumentsByRecency } from '../utils/notionClient';
import { extractTextFromPDF, isPDF } from '../utils/pdfUtils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type UploadStatus = 'idle' | 'extracting' | 'saving' | 'done' | 'error';

interface ResourcesQAProps {
  className?: string;
}

export function ResourcesQA({ className = '' }: ResourcesQAProps) {
  const [notionDocs, setNotionDocs] = useState<NotionDocument[]>([]);
  const [staticDocs, setStaticDocs] = useState<NotionDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);

  const documents = useMemo(() => [...staticDocs, ...notionDocs], [staticDocs, notionDocs]);

  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAsking, setIsAsking] = useState(false);

  const [activeTab, setActiveTab] = useState<'qa' | 'documents'>('qa');

  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsLoadingDocs(true);
    Promise.all([loadNotionDocs(), loadStaticDocs()]).finally(() => setIsLoadingDocs(false));
  }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function loadNotionDocs() {
    setDocsError(null);
    try {
      const res = await fetch('/api/docs');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load documents');
      setNotionDocs(data.documents || []);
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : 'Failed to load documents');
    }
  }

  async function loadStaticDocs() {
    try {
      const res = await fetch('/api/static-docs');
      if (!res.ok) return;
      const { files } = await res.json() as { files: { name: string; url: string }[] };
      if (!files?.length) return;

      const results = await Promise.allSettled(
        files.map(async ({ name, url }) => {
          const fileRes = await fetch(url);
          if (!fileRes.ok) throw new Error(`Failed to fetch ${name}`);
          const blob = await fileRes.blob();
          const file = new File([blob], `${name}.pdf`, { type: 'application/pdf' });
          const text = await extractTextFromPDF(file);
          return { id: `static-${name}`, name, text, updatedAt: new Date().toISOString() } as NotionDocument;
        })
      );

      setStaticDocs(
        results
          .filter((r): r is PromiseFulfilledResult<NotionDocument> => r.status === 'fulfilled')
          .map(r => r.value)
      );
    } catch {
      // static docs are best-effort — fail silently
    }
  }

  async function loadDocuments() {
    await loadNotionDocs();
  }

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadFileName(file.name);
    setUploadError(null);
    setUploadStatus('extracting');

    try {
      let text: string;
      if (isPDF(file)) {
        text = await extractTextFromPDF(file);
      } else {
        text = await file.text();
      }

      setUploadStatus('saving');

      const res = await fetch('/api/upload-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name.replace(/\.[^.]+$/, ''),
          text,
          fileType: file.type || (isPDF(file) ? 'application/pdf' : 'text/plain'),
          fileSize: file.size,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setUploadStatus('done');
      await loadDocuments();

      setTimeout(() => {
        setUploadStatus('idle');
        setUploadFileName(null);
      }, 2500);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setUploadStatus('error');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  async function handleAskQuestion() {
    if (!question.trim() || isAsking) return;

    const userMessage = question.trim();
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsAsking(true);

    try {
      const sorted = sortDocumentsByRecency(documents);
      const docsContext = sorted
        .filter(doc => doc.text)
        .map(doc => {
          const year = extractDocumentYear(doc);
          return `--- Document: ${doc.name} [Year: ${year}] ---\n${doc.text}`;
        })
        .join('\n\n');

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          context: docsContext,
          documentCount: documents.length,
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      }]);
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>
      {/* Tabs */}
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
            📁 Reference Library ({documents.length})
          </button>
        </div>
      </div>

      {/* Q&A Tab */}
      {activeTab === 'qa' && (
        <div className="flex flex-col h-[500px]">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <div className="text-4xl mb-3">🎓</div>
                <p className="font-medium">CDB Reference Q&A</p>
                <p className="text-sm mt-1">
                  {documents.length > 0
                    ? `Ask questions — ${documents.length} reference doc${documents.length !== 1 ? 's' : ''} loaded`
                    : 'Upload reference documents in the library tab to get started.'}
                </p>
                {docsError && (
                  <p className="text-xs mt-2 text-amber-600">{docsError}</p>
                )}
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
                  }`}>
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            {isAsking && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                    <span className="text-sm text-gray-600">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-200 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAskQuestion()}
                placeholder="Ask a question about your reference documents..."
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

          {/* Upload zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => uploadStatus === 'idle' && fileInputRef.current?.click()}
            className={`border-2 rounded-lg p-5 text-center transition-all cursor-pointer ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : uploadStatus === 'done'
                ? 'border-green-400 bg-green-50 cursor-default'
                : uploadStatus === 'error'
                ? 'border-red-400 bg-red-50 cursor-default'
                : uploadStatus !== 'idle'
                ? 'border-blue-400 bg-blue-50 cursor-default'
                : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'
            }`}
          >
            {uploadStatus === 'idle' && (
              <>
                <Upload className="w-7 h-7 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Click or drag a PDF to add to the library</p>
                <p className="text-xs text-gray-500 mt-1">PDF and text files supported</p>
              </>
            )}
            {uploadStatus === 'extracting' && (
              <div className="flex items-center justify-center gap-2 text-blue-700">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Extracting text from {uploadFileName}…</span>
              </div>
            )}
            {uploadStatus === 'saving' && (
              <div className="flex items-center justify-center gap-2 text-blue-700">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Saving to Notion library…</span>
              </div>
            )}
            {uploadStatus === 'done' && (
              <div className="flex items-center justify-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">{uploadFileName} added to library</span>
              </div>
            )}
            {uploadStatus === 'error' && (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">{uploadError || 'Upload failed'}</span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setUploadStatus('idle'); setUploadError(null); }}
                  className="text-xs text-red-600 underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) { handleFileUpload(file); e.target.value = ''; }
            }}
          />

          {/* Error state */}
          {docsError && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              {docsError}
            </div>
          )}

          {/* Document list */}
          {isLoadingDocs ? (
            <div className="text-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-gray-500 mt-2">Loading documents…</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p className="font-medium">No documents yet</p>
              <p className="text-sm mt-1">Upload a PDF above to get started.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {sortDocumentsByRecency(documents).map(doc => {
                const year = extractDocumentYear(doc);
                return (
                  <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-xl">📄</span>
                    <div className="overflow-hidden flex-1">
                      <p className="font-medium text-sm text-gray-900 truncate">{doc.name}</p>
                      <p className="text-xs text-gray-500">
                        <span className="font-medium text-blue-600">FY{String(year).slice(-2)}</span>
                        {' • '}
                        {doc.text.length.toLocaleString()} chars
                        {' • Updated '}
                        {new Date(doc.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    {doc.id.startsWith('static-')
                      ? <span className="text-xs text-indigo-600 font-medium flex-shrink-0">📎 Built-in</span>
                      : <span className="text-xs text-green-600 font-medium flex-shrink-0">✓ Indexed</span>
                    }
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-400">
              Built-in docs load from GitHub. Uploaded docs are stored in Notion.
            </p>
            <button
              onClick={loadDocuments}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResourcesQA;
