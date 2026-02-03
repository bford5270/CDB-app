'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Loader2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

export default function ResourcesQA() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [courseData, setCourseData] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load FY26 course catalog on mount
  useEffect(() => {
    async function loadCourses() {
      try {
        const response = await fetch('/fy26-courses.json');
        if (response.ok) {
          const data = await response.json();
          setCourseData(data);
          console.log('Loaded FY26 course catalog:', data);
        }
      } catch (e) {
        console.error('Could not load course catalog:', e);
      }
    }
    loadCourses();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Build context from course catalog
      let context = '';
      
      if (courseData) {
        context = `FY26 NAVY MEDICAL CORPS COURSE CATALOG:\n${JSON.stringify(courseData, null, 2)}`;
      }

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          context: context,
          strictMode: true, // Tell API to only answer from provided context
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.answer,
        sources: data.sources,
      }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error connecting to the AI service. Please try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const exampleQuestions = [
    "When is the next ILC course?",
    "What courses are available for JPME?",
    "What leadership courses should an O4 take?",
    "What are the FY26 executive medicine courses?",
  ];

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
            <p className="text-sm text-gray-600">
              Ask about FY26 courses, training requirements, and career development
            </p>
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
          {/* Info banner */}
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
            <p className="text-xs text-blue-700 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Answers are based on the FY26 NAVMED Course Catalog. The AI will indicate when information is not available.
            </p>
          </div>

          {/* Chat messages */}
          <div className="h-80 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="mb-4">Ask questions about Navy Medical Corps training and courses.</p>
                <div className="space-y-2">
                  {exampleQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(q)}
                      className="block w-full text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      "{q}"
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.sources && msg.sources.length > 0 && (
                      <p className="mt-2 text-xs opacity-75">
                        Source: {msg.sources.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
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
                placeholder="Ask about courses, training, or requirements..."
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
