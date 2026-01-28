import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { extractTextFromPDF, isPDF } from '../utils/pdfUtils';

export interface UploadedDocument {
  file: File;
  text: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

export interface UploadedDocuments {
  odc: UploadedDocument | null;
  osr: UploadedDocument | null;
  psr: UploadedDocument | null;
}

interface DocumentUploadProps {
  onDocumentsChange: (docs: UploadedDocuments) => void;
}

export function DocumentUpload({ onDocumentsChange }: DocumentUploadProps) {
  const [documents, setDocuments] = useState<UploadedDocuments>({
    odc: null,
    osr: null,
    psr: null,
  });

  const processFile = useCallback(async (file: File, type: keyof UploadedDocuments) => {
    // Set processing state
    const processingState: UploadedDocuments = {
      ...documents,
      [type]: {
        file,
        text: '',
        status: 'processing' as const,
      },
    };
    setDocuments(processingState);

    try {
      let text: string;

      if (isPDF(file)) {
        // Extract text from PDF
        text = await extractTextFromPDF(file);
      } else {
        // For text files, read directly
        text = await file.text();
      }

      console.log(`Extracted ${text.length} characters from ${type.toUpperCase()}`);
      console.log(`${type.toUpperCase()} text sample:`, text.substring(0, 500));

      const updated: UploadedDocuments = {
        ...processingState,
        [type]: {
          file,
          text,
          status: 'success' as const,
        },
      };

      setDocuments(updated);
      onDocumentsChange(updated);
    } catch (error) {
      console.error(`Error processing ${type}:`, error);
      
      const updated: UploadedDocuments = {
        ...processingState,
        [type]: {
          file,
          text: '',
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Failed to process file',
        },
      };

      setDocuments(updated);
      onDocumentsChange(updated);
    }
  }, [documents, onDocumentsChange]);

  const handleFileSelect = useCallback((type: keyof UploadedDocuments, file: File) => {
    processFile(file, type);
  }, [processFile]);

  const handleClear = useCallback((type: keyof UploadedDocuments) => {
    const updated = { ...documents, [type]: null };
    setDocuments(updated);
    onDocumentsChange(updated);
  }, [documents, onDocumentsChange]);

  const handleDrop = useCallback((type: keyof UploadedDocuments, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(type, file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const FileUploadBox = ({
    type,
    title,
    description,
    required = false,
  }: {
    type: keyof UploadedDocuments;
    title: string;
    description: string;
    required?: boolean;
  }) => {
    const doc = documents[type];
    const inputId = `file-upload-${type}`;

    return (
      <div
        className={`border-2 rounded-lg p-5 transition-all ${
          doc?.status === 'success'
            ? 'border-green-400 bg-green-50'
            : doc?.status === 'error'
            ? 'border-red-400 bg-red-50'
            : doc?.status === 'processing'
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-white hover:border-blue-500'
        }`}
        onDrop={(e) => handleDrop(type, e)}
        onDragOver={handleDragOver}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            {doc?.status === 'success' ? (
              <CheckCircle className="w-6 h-6 flex-shrink-0 mt-1 text-green-600" />
            ) : doc?.status === 'error' ? (
              <AlertCircle className="w-6 h-6 flex-shrink-0 mt-1 text-red-600" />
            ) : doc?.status === 'processing' ? (
              <Loader2 className="w-6 h-6 flex-shrink-0 mt-1 text-blue-600 animate-spin" />
            ) : (
              <FileText className="w-6 h-6 flex-shrink-0 mt-1 text-gray-400" />
            )}
            <div>
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                {title}
                {required && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-500">{description}</p>
            </div>
          </div>
          {doc && (
            <button
              onClick={() => handleClear(type)}
              className="text-gray-400 hover:text-red-600 transition-colors p-1"
              title="Remove file"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {doc?.status === 'success' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-100 px-3 py-2 rounded-md">
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">{doc.file.name}</span>
              <span className="text-green-600">
                ({(doc.file.size / 1024).toFixed(1)} KB • {doc.text.length.toLocaleString()} chars extracted)
              </span>
            </div>
            <div className="max-h-24 overflow-y-auto bg-white p-3 rounded-md border border-green-200">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">
                {doc.text.substring(0, 300)}{doc.text.length > 300 ? '...' : ''}
              </pre>
            </div>
          </div>
        ) : doc?.status === 'error' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-100 px-3 py-2 rounded-md">
              <AlertCircle className="w-4 h-4" />
              <span>Failed to process: {doc.error}</span>
            </div>
            <label
              htmlFor={inputId}
              className="block text-center py-2 text-sm text-red-600 hover:text-red-700 cursor-pointer"
            >
              Try uploading again
            </label>
            <input
              id={inputId}
              type="file"
              accept=".pdf,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(type, file);
              }}
            />
          </div>
        ) : doc?.status === 'processing' ? (
          <div className="flex items-center gap-3 text-sm text-blue-700 bg-blue-100 px-3 py-3 rounded-md">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Processing {doc.file.name}...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <label
              htmlFor={inputId}
              className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-sm font-medium text-gray-700">
                Click to upload or drag and drop
              </span>
              <span className="text-xs text-gray-500 mt-1">PDF files supported</span>
            </label>
            <input
              id={inputId}
              type="file"
              accept=".pdf,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(type, file);
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const uploadedCount = Object.values(documents).filter(d => d?.status === 'success').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Officer Records</h2>
        <p className="text-gray-600">
          Upload your official Navy personnel documents (PDF format). The system will automatically
          extract rank history, AQDs, education, and FITREP data for career analysis.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="bg-gray-100 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Documents uploaded</span>
          <span className="text-sm font-semibold text-blue-600">{uploadedCount} of 3</span>
        </div>
        <div className="w-full bg-gray-300 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(uploadedCount / 3) * 100}%` }}
          />
        </div>
      </div>

      {/* Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900 font-medium mb-2">📋 Tips for best results:</p>
        <ul className="text-xs text-blue-800 space-y-1 ml-4 list-disc">
          <li>
            <strong>ODC (Officer Data Card)</strong> is most important for rank dates and AQDs
          </li>
          <li>
            <strong>OSR (Officer Summary Record)</strong> provides education and special qualifications
          </li>
          <li>
            <strong>PSR (Performance Summary Report)</strong> enables FITREP trend analysis
          </li>
          <li>You can upload any combination - the system works with whatever you provide</li>
          <li>Files are processed locally in your browser - no data is sent to external servers</li>
        </ul>
      </div>

      {/* Upload boxes */}
      <div className="grid gap-4">
        <FileUploadBox
          type="odc"
          title="Officer Data Card (ODC)"
          description="Contains promotion history, AQDs, and designator information"
          required
        />
        <FileUploadBox
          type="osr"
          title="Officer Summary Record (OSR)"
          description="Contains education, special qualifications, and duty history"
        />
        <FileUploadBox
          type="psr"
          title="Performance Summary Report (PSR)"
          description="Contains FITREP history for performance trend analysis"
        />
      </div>

      {/* Privacy notice */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-xs text-gray-600">
          <strong>🔒 Privacy:</strong> All document processing happens locally in your browser.
          Your files are never uploaded to any server. Personal identifying information (SSN, name)
          is not stored or transmitted.
        </p>
      </div>
    </div>
  );
}