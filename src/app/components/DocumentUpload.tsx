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

    const NAVY = '#1B365D';
    const GOLD = '#FFC72C';

    return (
      <div
        className="rounded transition-all"
        style={{
          border: `1px solid ${
            doc?.status === 'success' ? '#86EFAC'
            : doc?.status === 'error' ? '#FCA5A5'
            : doc?.status === 'processing' ? NAVY
            : '#CBD5E1'
          }`,
          background: doc?.status === 'success' ? '#F0FDF4'
            : doc?.status === 'error' ? '#FEF2F2'
            : '#fff',
        }}
        onDrop={(e) => handleDrop(type, e)}
        onDragOver={handleDragOver}
      >
        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
          <div className="flex items-center gap-2.5">
            {doc?.status === 'success' ? (
              <CheckCircle style={{ width: 16, height: 16, color: '#16A34A', flexShrink: 0 }} />
            ) : doc?.status === 'error' ? (
              <AlertCircle style={{ width: 16, height: 16, color: '#DC2626', flexShrink: 0 }} />
            ) : doc?.status === 'processing' ? (
              <Loader2 style={{ width: 16, height: 16, color: NAVY, flexShrink: 0 }} className="animate-spin" />
            ) : (
              <FileText style={{ width: 16, height: 16, color: '#94A3B8', flexShrink: 0 }} />
            )}
            <span className="text-sm font-semibold text-gray-800">{title}</span>
            {required && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(27,54,93,0.08)', color: NAVY }}>
                Recommended
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{description}</span>
            {doc && (
              <button onClick={() => handleClear(type)} className="text-gray-300 hover:text-red-500 transition-colors" title="Remove">
                <X style={{ width: 14, height: 14 }} />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          {doc?.status === 'success' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs" style={{ color: '#16A34A' }}>
                <CheckCircle style={{ width: 13, height: 13 }} />
                <span className="font-medium">{doc.file.name}</span>
                <span className="text-gray-400 ml-auto">{(doc.file.size / 1024).toFixed(1)} KB · {doc.text.length.toLocaleString()} chars</span>
              </div>
              <div className="overflow-y-auto rounded" style={{ maxHeight: 64, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '6px 8px' }}>
                <pre className="text-xs text-gray-500 whitespace-pre-wrap font-mono leading-relaxed">
                  {doc.text.substring(0, 200)}{doc.text.length > 200 ? '…' : ''}
                </pre>
              </div>
            </div>
          ) : doc?.status === 'error' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-red-600">
                <AlertCircle style={{ width: 13, height: 13 }} />
                <span>{doc.error}</span>
              </div>
              <label htmlFor={inputId} className="text-xs cursor-pointer" style={{ color: NAVY }}>Try again →</label>
              <input id={inputId} type="file" accept=".pdf,.txt" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(type, f); }} />
            </div>
          ) : doc?.status === 'processing' ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: NAVY }}>
              <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
              <span>Processing {doc.file.name}…</span>
            </div>
          ) : (
            <>
              <label
                htmlFor={inputId}
                className="flex flex-col items-center justify-center rounded cursor-pointer transition-colors"
                style={{ padding: '20px 0', border: '1.5px dashed #CBD5E1' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = NAVY; (e.currentTarget as HTMLElement).style.background = 'rgba(27,54,93,0.03)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#CBD5E1'; (e.currentTarget as HTMLElement).style.background = ''; }}
              >
                <Upload style={{ width: 20, height: 20, color: '#94A3B8', marginBottom: 6 }} />
                <span className="text-sm font-medium text-gray-600">Click to upload or drag and drop</span>
                <span className="text-xs text-gray-400 mt-1">PDF or TXT</span>
              </label>
              <input id={inputId} type="file" accept=".pdf,.txt" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(type, f); }} />
            </>
          )}
        </div>
      </div>
    );
  };

  const uploadedCount = Object.values(documents).filter(d => d?.status === 'success').length;

  return (
    <div className="space-y-4">

      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Documents uploaded</span>
        <div className="flex-1 h-1.5 rounded-full" style={{ background: '#E2E8F0' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(uploadedCount / 3) * 100}%`, background: '#1B365D' }}
          />
        </div>
        <span className="text-xs font-semibold" style={{ color: '#1B365D' }}>{uploadedCount} / 3</span>
      </div>

      {/* PII warning — navy/gold themed */}
      <div style={{ background: '#1B365D', borderRadius: 6, borderLeft: '4px solid #FFC72C', padding: '14px 16px' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: '#FFC72C' }}>
          Review documents before uploading — extracted text is sent to the AI parser
        </p>
        <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
          The following are <strong style={{ color: 'rgba(255,255,255,0.85)' }}>automatically redacted</strong> before transmission:
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mb-3">
          {['SSN', 'DOD ID / EDIPI', 'Phone numbers', 'Email addresses',
            'Dates of birth', 'Credit card numbers', 'Home addresses', 'IP addresses'
          ].map(item => (
            <div key={item} className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
              <span style={{ color: '#4ADE80', fontWeight: 700 }}>✓</span>{item}
            </div>
          ))}
        </div>
        <p className="text-xs font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>Manually verify and remove:</p>
        <ul className="text-xs ml-3 list-disc space-y-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <li>Classified or FOUO material beyond your own record</li>
          <li>Third-party personnel information</li>
          <li>Medical diagnoses unrelated to career records</li>
          <li>Financial account numbers</li>
        </ul>
        <p className="text-xs mt-3 pt-2" style={{ color: 'rgba(255,255,255,0.4)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          PDFs are parsed locally in your browser. Extracted text is sent over HTTPS then discarded. Nothing is stored.
        </p>
      </div>

      {/* Tips — compact, navy-tinted */}
      <div className="rounded px-4 py-3" style={{ background: 'rgba(27,54,93,0.05)', border: '1px solid rgba(27,54,93,0.12)' }}>
        <p className="text-xs font-semibold mb-1.5" style={{ color: '#1B365D' }}>Tips for best results</p>
        <ul className="text-xs text-gray-500 space-y-0.5 ml-3 list-disc">
          <li><strong className="text-gray-700">ODC</strong> — rank dates, AQDs, clearance, designator</li>
          <li><strong className="text-gray-700">OSR</strong> — education and special qualifications</li>
          <li><strong className="text-gray-700">PSR</strong> — FITREP history and trend analysis</li>
        </ul>
      </div>

      {/* Upload boxes */}
      <div className="grid gap-2">
        <FileUploadBox type="odc" title="Officer Data Card (ODC)"
          description="Rank, AQDs, clearance, designator" required />
        <FileUploadBox type="osr" title="Officer Summary Record (OSR)"
          description="Education, quals, duty history" />
        <FileUploadBox type="psr" title="Performance Summary Report (PSR)"
          description="FITREP history and trends" />
      </div>

    </div>
  );
}