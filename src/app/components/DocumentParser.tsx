'use client';

import React, { useState, useCallback, useRef } from 'react';
import { extractTextFromPDF as extractPDFText, isPDF } from '../utils/pdfUtils';
import {
  parseODC,
  parseOSR,
  parsePSR,
  mergeOfficerData,
  formatDateForDisplay,
  OfficerData,
  PSRSummary,
  FitrepEntry
} from '../utils/parsingUtils';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ParsedDocument {
  id: string;
  name: string;
  type: 'ODC' | 'OSR' | 'PSR' | 'UNKNOWN';
  rawText: string;
  parsedData: OfficerData | null;
  uploadedAt: Date;
}

interface DocumentParserProps {
  onDataParsed?: (data: OfficerData) => void;
  className?: string;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const StatusBadge: React.FC<{ status: 'success' | 'warning' | 'error' | 'info'; children: React.ReactNode }> = ({ status, children }) => {
  const colors = {
    success: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    info: 'bg-blue-100 text-blue-800 border-blue-200'
  };
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status]}`}>
      {children}
    </span>
  );
};

const DataCard: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
    <div className="px-4 py-3 border-b border-gray-200">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    </div>
    <div className="p-4">
      {children}
    </div>
  </div>
);

// ============================================================================
// FITREP TABLE COMPONENT
// ============================================================================

const FitrepTable: React.FC<{ fitreps: FitrepEntry[] }> = ({ fitreps }) => {
  if (!fitreps || fitreps.length === 0) {
    return <p className="text-gray-500 text-sm">No FITREP data available</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-2 text-left font-medium text-gray-500">Grade</th>
            <th className="px-2 py-2 text-left font-medium text-gray-500">Station</th>
            <th className="px-2 py-2 text-left font-medium text-gray-500">Period</th>
            <th className="px-2 py-2 text-center font-medium text-gray-500">Ind Avg</th>
            <th className="px-2 py-2 text-center font-medium text-gray-500">Promo Rec</th>
            <th className="px-2 py-2 text-center font-medium text-gray-500">Type</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {fitreps.map((fitrep, index) => (
            <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-2 py-2 whitespace-nowrap font-medium">{fitrep.payGrade}</td>
              <td className="px-2 py-2 whitespace-nowrap">{fitrep.station || '-'}</td>
              <td className="px-2 py-2 whitespace-nowrap">
                {fitrep.startDate && fitrep.endDate 
                  ? `${formatDateForDisplay(fitrep.startDate)} - ${formatDateForDisplay(fitrep.endDate)}`
                  : fitrep.endDate 
                    ? formatDateForDisplay(fitrep.endDate)
                    : '-'
                }
              </td>
              <td className="px-2 py-2 text-center">
                {fitrep.individualAverage > 0 ? (
                  <span className={`font-medium ${
                    fitrep.individualAverage >= 4.0 ? 'text-green-600' :
                    fitrep.individualAverage >= 3.5 ? 'text-blue-600' :
                    fitrep.individualAverage >= 3.0 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {fitrep.individualAverage.toFixed(2)}
                  </span>
                ) : '-'}
              </td>
              <td className="px-2 py-2 text-center">
                {fitrep.promotionRec ? (
                  <StatusBadge status={
                    fitrep.promotionRec === 'EP' ? 'success' :
                    fitrep.promotionRec === 'MP' ? 'info' :
                    fitrep.promotionRec === 'P' ? 'warning' :
                    fitrep.promotionRec === 'NOB' ? 'info' :
                    'error'
                  }>
                    {fitrep.promotionRec}
                  </StatusBadge>
                ) : '-'}
              </td>
              <td className="px-2 py-2 text-center text-gray-500">{fitrep.reportType || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ============================================================================
// PSR SUMMARY COMPONENT
// ============================================================================

const PSRSummaryDisplay: React.FC<{ summary: PSRSummary }> = ({ summary }) => {
  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{summary.totalFitreps}</div>
          <div className="text-xs text-gray-500">Total FITREPs</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{summary.averageIndividual.toFixed(2)}</div>
          <div className="text-xs text-gray-500">Avg Individual</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{summary.epCount}</div>
          <div className="text-xs text-gray-500">Early Promote</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{summary.mpCount}</div>
          <div className="text-xs text-gray-500">Must Promote</div>
        </div>
      </div>

      {/* Promotion Rec Breakdown */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-600">Promotion Recs:</span>
        <StatusBadge status="success">EP: {summary.epCount}</StatusBadge>
        <StatusBadge status="info">MP: {summary.mpCount}</StatusBadge>
        <StatusBadge status="warning">P: {summary.pCount}</StatusBadge>
        {summary.prCount > 0 && <StatusBadge status="error">PR: {summary.prCount}</StatusBadge>}
        {summary.spCount > 0 && <StatusBadge status="error">SP: {summary.spCount}</StatusBadge>}
      </div>

      {/* Trend Indicator */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Trend:</span>
        <StatusBadge status={
          summary.trend === 'improving' ? 'success' :
          summary.trend === 'stable' ? 'info' :
          summary.trend === 'declining' ? 'error' :
          'warning'
        }>
          {summary.trend === 'improving' ? '📈 Improving' :
           summary.trend === 'stable' ? '➡️ Stable' :
           summary.trend === 'declining' ? '📉 Declining' :
           '❓ Insufficient Data'}
        </StatusBadge>
      </div>

      {/* Issues */}
      {summary.issues.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-red-600 mb-2">⚠️ Potential Issues</h4>
          <ul className="space-y-1">
            {summary.issues.map((issue, index) => (
              <li key={index} className="text-xs text-red-700 bg-red-50 rounded px-2 py-1">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* FITREP Table */}
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">FITREP History</h4>
        <FitrepTable fitreps={summary.fitreps} />
      </div>
    </div>
  );
};

// ============================================================================
// OFFICER DATA DISPLAY COMPONENT
// ============================================================================

const OfficerDataDisplay: React.FC<{ data: OfficerData }> = ({ data }) => {
  return (
    <div className="space-y-4">
      {/* Basic Info */}
      <DataCard title="Officer Information">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {data.name && (
            <div>
              <label className="text-xs text-gray-500">Name</label>
              <p className="font-medium">{data.name}</p>
            </div>
          )}
          {data.rank && (
            <div>
              <label className="text-xs text-gray-500">Current Rank</label>
              <p className="font-medium">{data.rank}</p>
            </div>
          )}
          {data.designator && (
            <div>
              <label className="text-xs text-gray-500">Designator</label>
              <p className="font-medium">{data.designator}</p>
            </div>
          )}
          {data.yearGroup && (
            <div>
              <label className="text-xs text-gray-500">Year Group</label>
              <p className="font-medium">YG-{data.yearGroup}</p>
            </div>
          )}
          {/* Board Certification - K=Certified, J=Not Certified */}
          <div>
            <label className="text-xs text-gray-500">Board Certification</label>
            <p className="font-medium">
              {data.boardCertified === true ? (
                <StatusBadge status="success">✓ Board Certified (K)</StatusBadge>
              ) : data.boardCertified === false ? (
                <StatusBadge status="warning">Not Board Certified (J)</StatusBadge>
              ) : (
                <span className="text-gray-400">Unknown</span>
              )}
            </p>
          </div>
        </div>
      </DataCard>

      {/* Promotion History */}
      {data.promotionHistory.length > 0 && (
        <DataCard title="Promotion History">
          <div className="space-y-2">
            {data.promotionHistory.map((entry, index) => (
              <div key={index} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                <span className="font-medium">{entry.rank}</span>
                <span className="text-sm text-gray-600">{formatDateForDisplay(entry.dateOfRank)}</span>
              </div>
            ))}
          </div>
        </DataCard>
      )}

      {/* Security Clearance */}
      {data.securityClearance && (
        <DataCard title="Security Clearance">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500">Eligibility</label>
              <p className="font-medium">
                <StatusBadge status={
                  data.securityClearance.eligibility === 'V' ? 'success' :
                  data.securityClearance.eligibility === 'T' ? 'success' :
                  data.securityClearance.eligibility === 'S' ? 'info' :
                  'warning'
                }>
                  {data.securityClearance.eligibilityDescription}
                </StatusBadge>
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-500">Access Level</label>
              <p className="font-medium">
                <StatusBadge status={
                  data.securityClearance.level === 'V' ? 'success' :
                  data.securityClearance.level === 'T' ? 'success' :
                  data.securityClearance.level === 'S' ? 'info' :
                  'warning'
                }>
                  {data.securityClearance.levelDescription}
                </StatusBadge>
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-500">Investigation Date</label>
              <p className="font-medium">{formatDateForDisplay(data.securityClearance.investigationDate)}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500">Expiration Date</label>
              <p className="font-medium">
                {(() => {
                  const expDate = new Date(data.securityClearance.expirationDate + '-01');
                  const now = new Date();
                  const monthsUntilExp = (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
                  
                  return (
                    <span className={monthsUntilExp < 12 ? 'text-red-600' : monthsUntilExp < 24 ? 'text-yellow-600' : ''}>
                      {formatDateForDisplay(data.securityClearance.expirationDate)}
                      {monthsUntilExp < 12 && ' ⚠️ Expiring Soon'}
                    </span>
                  );
                })()}
              </p>
            </div>
          </div>
        </DataCard>
      )}

      {/* AQDs */}
      {data.aqds.length > 0 && (
        <DataCard title="Additional Qualification Designations (AQDs)">
          <div className="flex flex-wrap gap-2">
            {data.aqds.map((aqd, index) => (
              <div key={index} className="bg-gray-100 rounded-lg px-3 py-2">
                <span className="font-mono font-bold text-blue-600">{aqd.code}</span>
                <span className="text-gray-600 text-sm ml-2">{aqd.title}</span>
                <span className="text-gray-400 text-xs ml-1">({aqd.year})</span>
              </div>
            ))}
          </div>
        </DataCard>
      )}

      {/* PSR Summary */}
      {data.psrSummary && (
        <DataCard title="Performance Summary Record (PSR)">
          <PSRSummaryDisplay summary={data.psrSummary} />
        </DataCard>
      )}
    </div>
  );
};

// ============================================================================
// MAIN DOCUMENT PARSER COMPONENT
// ============================================================================

const DocumentParser: React.FC<DocumentParserProps> = ({ onDataParsed, className = '' }) => {
  const [documents, setDocuments] = useState<ParsedDocument[]>([]);
  const [mergedData, setMergedData] = useState<OfficerData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'parsed' | 'raw'>('parsed');
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detect document type from text content
  const detectDocumentType = (text: string, filename: string): 'ODC' | 'OSR' | 'PSR' | 'UNKNOWN' => {
    const upperText = text.toUpperCase();
    const upperFilename = filename.toUpperCase();
    
    // Check filename first
    if (upperFilename.includes('PSR') || upperFilename.includes('PERFORMANCE SUMMARY')) {
      return 'PSR';
    }
    if (upperFilename.includes('ODC') || upperFilename.includes('OFFICER DATA')) {
      return 'ODC';
    }
    if (upperFilename.includes('OSR') || upperFilename.includes('OFFICER SERVICE')) {
      return 'OSR';
    }
    
    // Check content
    if (upperText.includes('PERFORMANCE SUMMARY') || upperText.includes('FITREP') || 
        /\bO[1-6]\s+[A-Z]{3,}/m.test(upperText)) {
      return 'PSR';
    }
    if (upperText.includes('OFFICER DATA CARD') || upperText.includes('ODC')) {
      return 'ODC';
    }
    if (upperText.includes('OFFICER SERVICE RECORD') || upperText.includes('OSR')) {
      return 'OSR';
    }
    
    // Default to ODC if it looks like officer data
    if (/\b(LCDR|CDR|CAPT|LT|ENS)\b/.test(upperText) && /\d{6}/.test(text)) {
      return 'ODC';
    }
    
    return 'UNKNOWN';
  };

  // Extract text from PDF using the utility function
  const extractTextFromPDF = extractPDFText;

  // Process uploaded files
  const processFiles = async (files: FileList | File[]) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const newDocuments: ParsedDocument[] = [];
      const fileArray = Array.from(files);
      
      for (const file of fileArray) {
        // Check file type
        const isPDFFile = isPDF(file);
        const isText = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');

        if (!isPDFFile && !isText) {
          console.warn(`Unsupported file type: ${file.type} (${file.name})`);
          continue;
        }

        let text = '';

        if (isPDFFile) {
          text = await extractTextFromPDF(file);
        } else {
          text = await file.text();
        }
        
        const docType = detectDocumentType(text, file.name);
        let parsedData: OfficerData | null = null;
        
        switch (docType) {
          case 'ODC':
            parsedData = parseODC(text);
            break;
          case 'OSR':
            parsedData = parseOSR(text);
            break;
          case 'PSR':
            parsedData = { 
              promotionHistory: [], 
              aqds: [], 
              courses: [], 
              education: [],
              psrSummary: parsePSR(text)
            };
            break;
          default:
            // Try to parse as ODC anyway
            parsedData = parseODC(text);
        }
        
        newDocuments.push({
          id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
          name: file.name,
          type: docType,
          rawText: text,
          parsedData,
          uploadedAt: new Date()
        });
      }
      
      setDocuments(prev => [...prev, ...newDocuments]);
      
      // Merge all parsed data
      const allParsedData = [...documents, ...newDocuments]
        .filter(doc => doc.parsedData)
        .map(doc => doc.parsedData as OfficerData);
      
      if (allParsedData.length > 0) {
        const merged = mergeOfficerData(...allParsedData);
        setMergedData(merged);
        onDataParsed?.(merged);
      }
    } catch (err) {
      console.error('Error processing files:', err);
      setError(err instanceof Error ? err.message : 'Failed to process files');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  // Handle drag events
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Click to open file dialog
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  // Remove a document
  const removeDocument = (id: string) => {
    setDocuments(prev => {
      const updated = prev.filter(doc => doc.id !== id);
      
      // Recalculate merged data
      const allParsedData = updated
        .filter(doc => doc.parsedData)
        .map(doc => doc.parsedData as OfficerData);
      
      if (allParsedData.length > 0) {
        const merged = mergeOfficerData(...allParsedData);
        setMergedData(merged);
        onDataParsed?.(merged);
      } else {
        setMergedData(null);
      }
      
      return updated;
    });
  };

  // Clear all documents
  const clearAll = () => {
    setDocuments([]);
    setMergedData(null);
    setError(null);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        accept=".pdf,.txt,application/pdf,text/plain"
        multiple
        className="hidden"
      />

      {/* Upload Area */}
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
      >
        <div className="space-y-2">
          <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-gray-600">
            {isDragActive ? 'Drop files here...' : 'Drag & drop ODC, OSR, or PSR files here'}
          </p>
          <p className="text-sm text-gray-500">or click to select files (PDF or TXT)</p>
        </div>
      </div>

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="flex items-center justify-center p-4 bg-blue-50 rounded-lg">
          <svg className="animate-spin h-5 w-5 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-blue-600">Processing documents...</span>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Uploaded Documents List */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Uploaded Documents ({documents.length})</h3>
            <button
              onClick={clearAll}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Clear All
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {documents.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1"
              >
                <StatusBadge status={
                  doc.type === 'ODC' ? 'info' :
                  doc.type === 'OSR' ? 'success' :
                  doc.type === 'PSR' ? 'warning' :
                  'error'
                }>
                  {doc.type}
                </StatusBadge>
                <span className="text-sm text-gray-700">{doc.name}</span>
                <button
                  onClick={() => removeDocument(doc.id)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      {mergedData && (
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('parsed')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'parsed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Parsed Data
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'raw'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Raw Text
            </button>
          </nav>
        </div>
      )}

      {/* Content Display */}
      {mergedData && activeTab === 'parsed' && (
        <OfficerDataDisplay data={mergedData} />
      )}

      {documents.length > 0 && activeTab === 'raw' && (
        <div className="space-y-4">
          {documents.map(doc => (
            <DataCard key={doc.id} title={`${doc.name} (${doc.type})`}>
              <pre className="text-xs font-mono whitespace-pre-wrap bg-gray-50 p-3 rounded max-h-96 overflow-auto">
                {doc.rawText}
              </pre>
            </DataCard>
          ))}
        </div>
      )}
    </div>
  );
};

export { DocumentParser };
