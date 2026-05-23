import { X, FileText, CheckCircle, AlertCircle, Loader2, Upload, RefreshCw } from 'lucide-react';
import { useRef } from 'react';
import type { UploadedDocuments, UploadedDocument } from './DocumentUpload';
import { extractTextFromPDF, isPDF } from '../utils/pdfUtils';

const NAVY = '#1B365D';
const GOLD = '#FFC72C';

interface DocSwapPanelProps {
  documents: UploadedDocuments;
  onDocumentsChange: (docs: UploadedDocuments) => void;
  onClose: () => void;
}

const DOC_SLOTS: { key: keyof UploadedDocuments; title: string; description: string }[] = [
  { key: 'odc', title: 'Officer Data Card (ODC)', description: 'Rank, AQDs, clearance, designator' },
  { key: 'osr', title: 'Officer Summary Record (OSR)', description: 'Education, quals, duty history' },
  { key: 'psr', title: 'Performance Summary Report (PSR)', description: 'FITREP history and trends' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function DocSwapPanel({ documents, onDocumentsChange, onClose }: DocSwapPanelProps) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFileSelect = async (key: keyof UploadedDocuments, file: File) => {
    const processing: UploadedDocument = { file, text: '', status: 'processing' };
    onDocumentsChange({ ...documents, [key]: processing });

    try {
      const text = isPDF(file) ? await extractTextFromPDF(file) : await file.text();
      const updated: UploadedDocument = {
        file, text, status: 'success', uploadedAt: new Date().toISOString(),
      };
      onDocumentsChange({ ...documents, [key]: updated });
    } catch (err) {
      const updated: UploadedDocument = {
        file, text: '', status: 'error',
        error: err instanceof Error ? err.message : 'Failed to process file',
      };
      onDocumentsChange({ ...documents, [key]: updated });
    }
  };

  const uploadedCount = [documents.odc, documents.osr, documents.psr].filter(d => d?.status === 'success').length;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
          background: '#fff', zIndex: 50,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ background: NAVY, padding: '16px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Swap Documents</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>
                Replace a file without losing parsed data
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>
          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }}>
              <div style={{ height: '100%', borderRadius: 2, background: GOLD, width: `${(uploadedCount / 3) * 100}%`, transition: 'width 0.3s' }} />
            </div>
            <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 600 }}>{uploadedCount}/3</span>
          </div>
        </div>

        {/* Slots */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {DOC_SLOTS.map(({ key, title, description }) => {
              const doc = documents[key];
              const inputId = `swap-input-${key}`;

              return (
                <div
                  key={key}
                  style={{
                    borderRadius: 6,
                    border: `1px solid ${
                      doc?.status === 'success' ? '#86EFAC'
                      : doc?.status === 'error' ? '#FCA5A5'
                      : doc?.status === 'processing' ? NAVY
                      : '#CBD5E1'
                    }`,
                    background: doc?.status === 'success' ? '#F0FDF4'
                      : doc?.status === 'error' ? '#FEF2F2'
                      : '#fff',
                    overflow: 'hidden',
                  }}
                >
                  {/* Row header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #F1F5F9' }}>
                    {doc?.status === 'success' ? (
                      <CheckCircle style={{ width: 15, height: 15, color: '#16A34A', flexShrink: 0 }} />
                    ) : doc?.status === 'error' ? (
                      <AlertCircle style={{ width: 15, height: 15, color: '#DC2626', flexShrink: 0 }} />
                    ) : doc?.status === 'processing' ? (
                      <Loader2 style={{ width: 15, height: 15, color: NAVY, flexShrink: 0 }} className="animate-spin" />
                    ) : (
                      <FileText style={{ width: 15, height: 15, color: '#94A3B8', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1E293B' }}>{title}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{description}</div>
                    </div>
                    {/* Re-upload button */}
                    <button
                      onClick={() => inputRefs.current[key]?.click()}
                      title={doc ? 'Replace file' : 'Upload'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 600,
                        color: NAVY, background: 'rgba(27,54,93,0.07)',
                        border: 'none', borderRadius: 4, padding: '4px 8px',
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      {doc ? <RefreshCw style={{ width: 11, height: 11 }} /> : <Upload style={{ width: 11, height: 11 }} />}
                      {doc ? 'Replace' : 'Upload'}
                    </button>
                    <input
                      id={inputId}
                      ref={el => { inputRefs.current[key] = el; }}
                      type="file"
                      accept=".pdf,.txt"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { handleFileSelect(key, f); e.target.value = ''; }
                      }}
                    />
                  </div>

                  {/* Body */}
                  <div style={{ padding: '8px 12px' }}>
                    {doc?.status === 'success' ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#16A34A' }}>
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{doc.file.name}</span>
                          <span style={{ color: '#94A3B8', marginLeft: 'auto', flexShrink: 0 }}>
                            {formatBytes(doc.file.size)}
                          </span>
                        </div>
                        {doc.uploadedAt && (
                          <div style={{ fontSize: 10, color: '#CBD5E1', marginTop: 2 }}>
                            Loaded {formatDate(doc.uploadedAt)} · {doc.text.length.toLocaleString()} chars
                          </div>
                        )}
                      </div>
                    ) : doc?.status === 'error' ? (
                      <div style={{ fontSize: 11, color: '#DC2626' }}>{doc.error}</div>
                    ) : doc?.status === 'processing' ? (
                      <div style={{ fontSize: 11, color: NAVY }}>Processing {doc.file.name}…</div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#CBD5E1', fontStyle: 'italic' }}>No file uploaded</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Note */}
          <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 6, background: 'rgba(27,54,93,0.05)', border: '1px solid rgba(27,54,93,0.12)' }}>
            <p style={{ fontSize: 11, color: NAVY, fontWeight: 600, marginBottom: 4 }}>Replacing a document</p>
            <p style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5 }}>
              Swapping a file updates the source text used for future AI queries. Your verified profile data is preserved — re-run the parser if you want to update extracted fields.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 4,
              background: NAVY, color: '#fff', fontWeight: 600, fontSize: 13,
              border: 'none', cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
