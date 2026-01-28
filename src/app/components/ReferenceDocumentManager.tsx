import { useState, useEffect } from 'react';
import { FileText, Trash2, Eye, Type, Plus } from 'lucide-react';

export interface ReferenceDocument {
  id: string;
  name: string;
  category: string;
  uploadDate: string;
  content: string;
  size: number;
}

interface ReferenceDocumentManagerProps {
  onDocumentsChange?: (documents: ReferenceDocument[]) => void;
}

const STORAGE_KEY = 'navy_cdb_reference_documents';

const DOCUMENT_CATEGORIES = [
  'MILPERSMAN Instructions',
  'AQD Requirements',
  'Board Precepts',
  'Career Progression Guidelines',
  'Medical Corps Requirements',
  'Training Requirements',
  'Other',
];

export function ReferenceDocumentManager({ onDocumentsChange }: ReferenceDocumentManagerProps) {
  const [documents, setDocuments] = useState<ReferenceDocument[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('MILPERSMAN Instructions');
  const [viewingDocument, setViewingDocument] = useState<ReferenceDocument | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [documentName, setDocumentName] = useState('');

  // Load documents from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setDocuments(parsed);
        onDocumentsChange?.(parsed);
      } catch (error) {
        console.error('Error loading reference documents:', error);
      }
    }
  }, []);

  // Save documents to localStorage whenever they change
  useEffect(() => {
    if (documents.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
      onDocumentsChange?.(documents);
    }
  }, [documents, onDocumentsChange]);

  const handleTextSubmit = () => {
    if (!textInput.trim() || !documentName.trim()) {
      alert('Please provide both document name and content');
      return;
    }

    const newDoc: ReferenceDocument = {
      id: `ref_${Date.now()}`,
      name: documentName,
      category: selectedCategory,
      uploadDate: new Date().toISOString(),
      content: textInput,
      size: new Blob([textInput]).size,
    };

    setDocuments((prev) => [...prev, newDoc]);
    setTextInput('');
    setDocumentName('');
    setShowTextInput(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this reference document?')) {
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (isoString: string): string => {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const groupedDocuments = documents.reduce((acc, doc) => {
    if (!acc[doc.category]) {
      acc[doc.category] = [];
    }
    acc[doc.category].push(doc);
    return acc;
  }, {} as Record<string, ReferenceDocument[]>);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Reference Document Library</h2>
        <p className="text-gray-600">
          Add reference documents (MILPERSMAN, AQD guides, board precepts, etc.) to enhance career analysis
        </p>
      </div>

      {/* Upload Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Add Reference Document</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DOCUMENT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              onClick={() => setShowTextInput(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors border-blue-300 bg-blue-50 hover:bg-blue-100"
            >
              <Type className="w-5 h-5 text-blue-600" />
              <span className="text-blue-700 font-medium">
                Paste Document Text
              </span>
            </button>
            <p className="text-xs text-gray-500 mt-2">
              Copy text from your PDF using "Select All" and "Copy", then paste it here
            </p>
          </div>
        </div>
      </div>

      {/* Documents List */}
      {documents.length > 0 ? (
        <div className="space-y-4">
          {Object.entries(groupedDocuments).map(([category, docs]) => (
            <div key={category} className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                {category} ({docs.length})
              </h3>
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-gray-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {doc.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDate(doc.uploadDate)} • {formatFileSize(doc.size)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => setViewingDocument(doc)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="View document"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">No reference documents added yet</p>
          <p className="text-sm text-gray-500">
            Add documents to build your reference library for enhanced career analysis
          </p>
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewingDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {viewingDocument.name}
                </h3>
                <p className="text-sm text-gray-500">{viewingDocument.category}</p>
              </div>
              <button
                onClick={() => setViewingDocument(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                {viewingDocument.content}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Text Input Modal */}
      {showTextInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Add Document
                </h3>
                <p className="text-sm text-gray-500">{selectedCategory}</p>
              </div>
              <button
                onClick={() => {
                  setShowTextInput(false);
                  setTextInput('');
                  setDocumentName('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document Name
                  </label>
                  <input
                    type="text"
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                    placeholder="e.g., MILPERSMAN 1301-600"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document Content (paste text here)
                  </label>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Paste the text content from your PDF here..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    rows={15}
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowTextInput(false);
                      setTextInput('');
                      setDocumentName('');
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTextSubmit}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Add Document
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Export function to get all reference documents (for use by analysis components)
export function getReferenceDocuments(): ReferenceDocument[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Error loading reference documents:', error);
      return [];
    }
  }
  return [];
}

// Export function to search reference documents
export function searchReferenceDocuments(query: string): ReferenceDocument[] {
  const docs = getReferenceDocuments();
  const lowerQuery = query.toLowerCase();
  return docs.filter(
    (doc) =>
      doc.content.toLowerCase().includes(lowerQuery) ||
      doc.name.toLowerCase().includes(lowerQuery) ||
      doc.category.toLowerCase().includes(lowerQuery)
  );
}
