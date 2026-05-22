'use client';

import React, { useState, useEffect, useRef } from 'react';
import { NotionDocument, extractDocumentYear, sortDocumentsByRecency } from '../utils/notionClient';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ResourcesQAProps {
  className?: string;
}

export function ResourcesQA({ className = '' }: ResourcesQAProps) {
  const [documents, setDocuments] = useState<NotionDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);

  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAsking, setIsAsking] = useState(false);

  const [activeTab, setActiveTab] = useState<'qa' | 'documents'>('qa');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadDocuments(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function loadDocuments() {
    setIsLoadingDocs(true);
    setDocsError(null);
    try {
      const res = await fetch('/api/docs');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load documents');
      setDocuments(data.documents || []);
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoadingDocs(false);
    }
  }

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
                    : 'Reference library is loading or not yet configured.'}
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
          {/* Notion info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <div className="text-2xl">📓</div>
            <div>
              <p className="font-medium text-blue-900 text-sm">Reference Library via Notion</p>
              <p className="text-xs text-blue-700 mt-1">
                Documents are managed in your Notion database. Add, edit, or remove pages there
                — they will appear here automatically on next load.
              </p>
              <button
                onClick={loadDocuments}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium underline"
              >
                Refresh library
              </button>
            </div>
          </div>

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
              <p className="text-sm text-gray-500 mt-2">Loading from Notion...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="font-medium">No documents found</p>
              <p className="text-sm mt-1">Add pages to your Notion reference database to get started.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto">
              {sortDocumentsByRecency(documents).map(doc => {
                const year = extractDocumentYear(doc);
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
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
                    <span className="text-xs text-green-600 font-medium flex-shrink-0">✓ Indexed</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ResourcesQA;
