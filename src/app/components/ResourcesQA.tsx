'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Upload, X, FileText, Loader2, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface StoredDocument {
  id: string;
  name: string;
  text: string;
  uploadedAt: number;
}

// Initialize IndexedDB
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cdb-references', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }
    };
  });
}

async function getStoredDocuments(): Promise<StoredDocument[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['documents'], 'readonly');
    const store = transaction.objectStore('documents');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

async function storeDocument(doc: StoredDocument): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['documents'], 'readwrite');
    const store = transaction.objectStore('documents');
    const request = store.put(doc);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function deleteDocument(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['documents'], 'readwrite');
    const store = transaction.objectStore('documents');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Extract text from PDF
async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: { str?: string }) => item.str || '')
      .join(' ');
    fullText += pageText + '\n';
  }
  
  return fullText;
}

// Check for PII patterns
function containsPII(text: string): boolean {
  const piiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b\d{9}\b/, // SSN without dashes
    /DOB[:\s]+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/i, // Date of birth
    /DESIGNATOR[:\s]+\d{4}/i, // Navy designator on official docs
    /PRD[:\s]+\d{2}[\/\-]\d{2,4}/i, // Projected rotation date
  ];
  
  return piiPatterns.some(pattern => pattern.test(text));
}

export default function ResourcesQA() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [defaultRefsLoaded, setDefaultRefsLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load stored documents and default references on mount
  useEffect(() => {
    loadDocuments();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadDocuments = async () => {
    try {
      const stored = await getStoredDocuments();
      setDocuments(stored);
      
      // Load default references if no documents stored
      if (stored.length === 0 && !defaultRefsLoaded) {
        await loadDefaultReferences();
        setDefaultRefsLoaded(true);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const loadDefaultReferences = async () => {
    try {
      const response = await fetch('/default-references.json');
      if (response.ok) {
        const defaults = await response.json();
        for (const doc of defaults.documents) {
          await storeDocument({
            id: doc.id,
            name: doc.name,
            text: doc.text,
            uploadedAt: Date.now(),
          });
        }
        await loadDocuments();
      }
    } catch (error) {
      console.error('Error loading default references:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pdf')) {
      alert('Please upload a PDF file');
      return;
    }

    setIsUploading(true);
    try {
      const text = await extractTextFromPDF(file);
      
      // Check for PII
      if (containsPII(text)) {
        const proceed = confirm(
          'Warning: This document appears to contain personal information (SSN, DOB, etc.). ' +
          'This Q&A feature is for general reference documents only.\n\n' +
          'For personal documents like ODC/OSR/PSR, use the main upload area above.\n\n' +
          'Do you want to continue anyway?'
        );
        if (!proceed) {
          setIsUploading(false);
          return;
        }
      }

      const doc: StoredDocument = {
        id: `doc-${Date.now()}`,
        name: file.name,
        text: text.substring(0, 50000), // Limit text size
        uploadedAt: Date.now(),
      };

      await storeDocument(doc);
      await loadDocuments();
    } catch (error) {
      console.error('Error processing PDF:', error);
      alert('Error processing PDF. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      await deleteDocument(id);
      await loadDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Build context from stored documents
      const context = documents.map(d => `--- ${d.name} ---\n${d.text}`).join('\n\n');
      
      const systemPrompt = `You are a helpful Navy Medical Corps career advisor assistant. Answer questions about career development, promotion requirements, training courses, and professional development based on the reference documents provided.

Be concise and accurate. If you don't know something or it's not in the provided context, say so.

REFERENCE DOCUMENTS:
${context}`;

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          context: systemPrompt,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please make sure the API is configured correctly.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <MessageCircle className="w-6 h-6 text-blue-600" />
          <div className="text-left">
            <h3 className="text-lg font-bold text-gray-900">CDB Reference Q&A</h3>
            <p className="text-sm text-gray-600">Ask questions about career development, courses, and requirements</p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          {/* Document management */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowDocuments(!showDocuments)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <FileText className="w-4 h-4" />
                {documents.length} reference document{documents.length !== 1 ? 's' : ''} loaded
                {showDocuments ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="ref-upload"
                />
                <label
                  htmlFor="ref-upload"
                  className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded-lg cursor-pointer transition-colors ${
                    isUploading
                      ? 'bg-gray-200 text-gray-500'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Add Reference PDF
                    </>
                  )}
                </label>
              </div>
            </div>
            
            {/* Document list */}
            {showDocuments && documents.length > 0 && (
              <div className="mt-3 space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{doc.name}</span>
                      <span className="text-xs text-gray-400">
                        ({Math.round(doc.text.length / 1000)}k chars)
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Remove document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chat messages */}
          <div className="h-80 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Ask questions about Navy Medical Corps career development.</p>
                <p className="text-sm mt-2">Examples:</p>
                <ul className="text-sm mt-1 space-y-1">
                  <li>"What courses should an O4 complete?"</li>
                  <li>"How do I apply for JPME?"</li>
                  <li>"What are the requirements for 67A AQD?"</li>
                </ul>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 p-3 rounded-lg">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input form */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about career development..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
