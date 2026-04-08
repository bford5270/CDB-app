'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckCircle, AlertTriangle,
  Award, Shield, Loader2, ChevronRight, SkipForward,
  User, BarChart3
} from 'lucide-react';
import type { UploadedDocuments } from './DocumentUpload';

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedOfficerData {
  name: string | null;
  rank: string | null;
  designator: string | null;
  yearGroup: string | null;

  rankHistory: Array<{ rank: string; date: string }>;

  boardCertified: boolean | null;
  certificationCode: 'J' | 'K' | null;

  clearanceLevel: 'Secret' | 'Top Secret' | 'None' | '';
  clearanceDate: string;

  aqds: string[];

  hasUndergrad: boolean;
  hasMedicalSchool: boolean;

  fitrepAverage: number;
  fitrepCount: number;
  earlyPromotes: number;
  mustPromotes: number;
  promotables: number;
  progressings: number;

  psrTrend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  psrIssues: string[];
  belowRSAverageCount: number;
  belowRSAveragePercentage: number;

  fitreps: Array<{
    payGrade: string;
    station: string;
    startDate: string;
    endDate: string;
    individualAverage: number;
    rsAverage: number;
    promotionRec: string;
    reportType: string;
  }>;

  warnings: string[];
  confidence: {
    rankHistory: 'high' | 'medium' | 'low';
    aqds: 'high' | 'medium' | 'low';
    psrData: 'high' | 'medium' | 'low';
    overall: 'high' | 'medium' | 'low';
  };
}

interface DocumentParserProps {
  uploadedDocuments: UploadedDocuments;
  onParsedDataAccepted: (data: {
    rankHistory: Array<{ rank: string; date: string }>;
    boardCertified: boolean | null;
    hasUndergrad: boolean;
    hasMedicalSchool: boolean;
    aqds: string[];
    warnings: string[];
    psrIssues: string[];
    clearanceLevel?: 'Secret' | 'Top Secret' | 'None' | '';
    clearanceDate?: string;
    certificationCode?: 'J' | 'K' | null;
    fitrepAverage?: number;
    fitrepCount?: number;
    earlyPromotes?: number;
    mustPromotes?: number;
    promotables?: number;
    psrTrend?: 'improving' | 'stable' | 'declining' | 'insufficient_data';
    belowRSAverageCount?: number;
    belowRSAveragePercentage?: number;
    fitreps?: Array<{
      payGrade: string;
      station: string;
      startDate: string;
      endDate: string;
      individualAverage: number;
      rsAverage: number;
      promotionRec: string;
      reportType: string;
    }>;
  }) => void;
  onSkip?: () => void;
  // Legacy props kept for compatibility
  onDataParsed?: (data: any) => void;
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function confidenceBadge(level: 'high' | 'medium' | 'low') {
  if (level === 'high') return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">High confidence</span>;
  if (level === 'medium') return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Review recommended</span>;
  return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Low confidence</span>;
}


const AQD_TITLES: Record<string, string> = {
  // Warfare qualifications
  FMF: 'Fleet Marine Force',
  SW: 'Surface Warfare',
  AW: 'Aviation Warfare',
  SS: 'Submarine Warfare',
  EXW: 'Explosive Ordnance Disposal',
  SCW: 'Special Warfare Combatant-Craft',
  CW: 'Coastal Warfare',
  // Administrative / joint
  JS7: 'Joint Staff',
  // Medical subspecialties (common MC codes)
  '62D': 'Internal Medicine',
  '62G': 'General Internal Medicine',
  '62H': 'Physical Medicine & Rehab',
  '62K': 'Anesthesiology',
  '62L': 'Radiology',
  '62M': 'Pathology',
  '62N': 'Neurology',
  '62P': 'Psychiatry',
  '62R': 'Urology',
  '62S': 'Orthopedic Surgery',
  '62T': 'Otolaryngology',
  '62U': 'Ophthalmology',
  '62V': 'Dermatology',
  '62W': 'OB/GYN',
  '62X': 'Pediatrics',
  '67A': 'General Surgery',
  '67B': 'Thoracic Surgery',
  '67C': 'Neurosurgery',
  '67D': 'Plastic Surgery',
  '6OC': 'Operational Medicine',
  '6OD': 'Diving Medicine',
  '6OE': 'Hyperbaric Medicine',
  '6OF': 'Undersea Medicine',
  '6OG': 'Flight Surgery',
  '6OH': 'Emergency Medicine',
};

const PROMO_REC_LABELS: Record<string, string> = {
  EP: 'Early Promote',
  MP: 'Must Promote',
  P: 'Promotable',
  PR: 'Progressing',
  SP: 'Significant Problems',
  NOB: 'Not Observed',
};

function formatDate(iso: string) {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m) - 1]} ${d ? d + ', ' : ''}${y}`;
  } catch {
    return iso;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const DocumentParser: React.FC<DocumentParserProps> = ({
  uploadedDocuments,
  onParsedDataAccepted,
  onSkip,
}) => {
  const [status, setStatus] = useState<'parsing' | 'done' | 'error'>('parsing');
  const [extracted, setExtracted] = useState<ExtractedOfficerData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [docsAnalyzed, setDocsAnalyzed] = useState<string[]>([]);

  // ============================================================================
  // AUTO-PARSE ON MOUNT
  // ============================================================================

  useEffect(() => {
    parseAllDocuments();
  }, []);

  async function parseAllDocuments() {
    setStatus('parsing');

    const analyzed: string[] = [];
    const body: { odc?: string; osr?: string; psr?: string } = {};

    if (uploadedDocuments.odc?.status === 'success' && uploadedDocuments.odc.text) {
      body.odc = uploadedDocuments.odc.text;
      analyzed.push('ODC');
    }
    if (uploadedDocuments.osr?.status === 'success' && uploadedDocuments.osr.text) {
      body.osr = uploadedDocuments.osr.text;
      analyzed.push('OSR');
    }
    if (uploadedDocuments.psr?.status === 'success' && uploadedDocuments.psr.text) {
      body.psr = uploadedDocuments.psr.text;
      analyzed.push('PSR');
    }

    setDocsAnalyzed(analyzed);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse-documents', ...body }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${response.status}`);
      }

      const data: ExtractedOfficerData = await response.json();
      setExtracted(data);
      setStatus('done');
    } catch (err) {
      console.error('parse-documents failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  function handleAccept() {
    if (!extracted) return;
    onParsedDataAccepted({
      rankHistory: extracted.rankHistory,
      boardCertified: extracted.boardCertified,
      hasUndergrad: extracted.hasUndergrad,
      hasMedicalSchool: extracted.hasMedicalSchool,
      aqds: extracted.aqds,
      warnings: extracted.warnings,
      psrIssues: extracted.psrIssues,
      clearanceLevel: extracted.clearanceLevel,
      clearanceDate: extracted.clearanceDate,
      certificationCode: extracted.certificationCode,
      fitrepAverage: extracted.fitrepAverage,
      fitrepCount: extracted.fitrepCount,
      earlyPromotes: extracted.earlyPromotes,
      mustPromotes: extracted.mustPromotes,
      promotables: extracted.promotables,
      psrTrend: extracted.psrTrend,
      belowRSAverageCount: extracted.belowRSAverageCount,
      belowRSAveragePercentage: extracted.belowRSAveragePercentage,
      fitreps: extracted.fitreps,
    });
  }

  // ============================================================================
  // LOADING SCREEN
  // ============================================================================

  if (status === 'parsing') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Analyzing Your Records</h2>
          <p className="text-gray-500 mt-2 max-w-md">
            AI is reading your documents and extracting rank history, AQDs, FITREP data,
            and checking for PSR issues. This takes about 15–20 seconds.
          </p>
        </div>
        <div className="flex gap-2 mt-2">
          {['ODC', 'OSR', 'PSR'].map(type => {
            const isPresent = docsAnalyzed.includes(type);
            return (
              <span
                key={type}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isPresent ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {type}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // ============================================================================
  // ERROR SCREEN
  // ============================================================================

  if (status === 'error') {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-red-900 mb-2">AI Parsing Failed</h2>
          <p className="text-red-700 text-sm mb-4">{errorMessage}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={parseAllDocuments}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Try Again
            </button>
            {onSkip && (
              <button
                onClick={onSkip}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
              >
                Skip — Enter Manually
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SUMMARY SCREEN
  // ============================================================================

  if (!extracted) return null;

  const hasPSR = docsAnalyzed.includes('PSR');
  const hasIssues = extracted.psrIssues.length > 0;
  const hasWarnings = extracted.warnings.length > 0;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium mb-4">
          <CheckCircle className="w-4 h-4" />
          AI Extraction Complete — {docsAnalyzed.join(', ')} analyzed
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Extracted Record Summary</h2>
        <p className="text-gray-500 mt-1">
          Review what was found. You'll be able to edit every field on the next screen.
        </p>
      </div>

      {/* Overall confidence */}
      {extracted.confidence && (
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm text-gray-600">Overall extraction confidence:</span>
          {confidenceBadge(extracted.confidence.overall)}
        </div>
      )}

      {/* PSR Issues — shown prominently if present */}
      {hasIssues && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-900 flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5" />
            PSR Issues Detected
          </h3>
          <ul className="space-y-1">
            {extracted.psrIssues.map((issue, i) => (
              <li key={i} className="text-sm text-red-800">• {issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Extraction warnings */}
      {hasWarnings && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-semibold text-yellow-900 flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5" />
            Extraction Notes
          </h3>
          <ul className="space-y-1">
            {extracted.warnings.map((w, i) => (
              <li key={i} className="text-sm text-yellow-800">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Two-column summary grid */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Officer Identity */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-blue-600" />
            Officer Identity
            {extracted.confidence && <span className="ml-auto">{confidenceBadge(extracted.confidence.rankHistory)}</span>}
          </h3>
          <dl className="space-y-2 text-sm">
            {extracted.name && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Name</dt>
                <dd className="font-medium text-gray-900">{extracted.name}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Current Rank</dt>
              <dd className="font-medium text-gray-900">{extracted.rank || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Designator</dt>
              <dd className="font-medium text-gray-900">{extracted.designator || 'Not detected'}</dd>
            </div>
            {extracted.yearGroup && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Year Group</dt>
                <dd className="font-medium text-gray-900">YG-{extracted.yearGroup}</dd>
              </div>
            )}
          </dl>

          {/* Rank timeline */}
          {extracted.rankHistory.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Promotion Timeline</p>
              <div className="flex flex-wrap gap-2 items-center">
                {extracted.rankHistory.map((rh, i) => (
                  <React.Fragment key={i}>
                    <div className="text-center">
                      <div className="text-sm font-bold text-blue-700">{rh.rank}</div>
                      <div className="text-xs text-gray-500">{formatDate(rh.date)}</div>
                    </div>
                    {i < extracted.rankHistory.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Certifications & Clearance */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-blue-600" />
            Certification & Clearance
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Board Certification</dt>
              <dd>
                {extracted.boardCertified === true && (
                  <span className="text-green-700 font-medium">✓ Certified (J Code)</span>
                )}
                {extracted.boardCertified === false && (
                  <span className="text-yellow-700 font-medium">Not Certified (K Code)</span>
                )}
                {extracted.boardCertified === null && (
                  <span className="text-gray-400">Not detected</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Clearance Level</dt>
              <dd className="font-medium text-gray-900">{extracted.clearanceLevel || 'Not detected'}</dd>
            </div>
            {extracted.clearanceDate && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Investigation Date</dt>
                <dd className="font-medium text-gray-900">{extracted.clearanceDate}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Education</dt>
              <dd className="font-medium text-gray-900">
                {extracted.hasMedicalSchool ? 'MD/DO' : extracted.hasUndergrad ? 'Undergrad' : 'Not detected'}
              </dd>
            </div>
          </dl>
        </div>

        {/* AQDs */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-blue-600" />
            AQDs Detected
            {extracted.confidence && <span className="ml-auto">{confidenceBadge(extracted.confidence.aqds)}</span>}
          </h3>
          {extracted.aqds.length > 0 ? (
            <div className="space-y-1">
              {extracted.aqds.map(aqd => (
                <div key={aqd} className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded w-14 text-center flex-shrink-0">
                    {aqd}
                  </span>
                  <span className="text-gray-700">{AQD_TITLES[aqd] || 'Unknown qualification'}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No AQDs detected in documents.</p>
          )}
        </div>

      </div>

      {/* Fitness Reports — collapsible */}
      {hasPSR && extracted.fitrepCount > 0 && (
        <details className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <summary className="px-5 py-4 font-semibold text-gray-900 cursor-pointer hover:bg-gray-50 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            {extracted.fitrepCount} Fitness Reports
            {extracted.confidence && <span className="ml-2">{confidenceBadge(extracted.confidence.psrData)}</span>}
            <span className="text-xs text-gray-400 ml-auto">click to expand</span>
          </summary>
          <div className="px-5 pb-5 space-y-4">

            {/* Promotion rec breakdown */}
            <div className="flex gap-2 flex-wrap pt-1">
              {extracted.earlyPromotes > 0 && (
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded text-sm font-semibold">
                  Early Promote (EP): {extracted.earlyPromotes}
                </span>
              )}
              {extracted.mustPromotes > 0 && (
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm font-semibold">
                  Must Promote (MP): {extracted.mustPromotes}
                </span>
              )}
              {extracted.promotables > 0 && (
                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-semibold">
                  Promotable (P): {extracted.promotables}
                </span>
              )}
              {extracted.progressings > 0 && (
                <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded text-sm font-semibold">
                  Progressing (PR): {extracted.progressings}
                </span>
              )}
            </div>

            {/* RS average comparison */}
            {extracted.fitrepCount > 0 && (() => {
              const aboveCount = extracted.fitrepCount - extracted.belowRSAverageCount;
              const abovePct = Math.round((aboveCount / extracted.fitrepCount) * 100);
              return (
                <div className={`text-sm rounded p-3 ${
                  extracted.belowRSAveragePercentage > 50 ? 'bg-red-50 text-red-800 border border-red-200' :
                  extracted.belowRSAveragePercentage > 25 ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                  'bg-green-50 text-green-800 border border-green-200'
                }`}>
                  <span className="font-semibold">At or above RS cumulative average</span> in {aboveCount} of {extracted.fitrepCount} reports ({abovePct}%)
                  {extracted.belowRSAverageCount > 0 && (
                    <span className="ml-2 text-xs opacity-75">
                      · Below RS average in {extracted.belowRSAverageCount} ({extracted.belowRSAveragePercentage}%)
                    </span>
                  )}
                </div>
              );
            })()}

            {/* FITREP table */}
            {extracted.fitreps.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-gray-500">Grade</th>
                      <th className="px-2 py-2 text-left text-gray-500">Period</th>
                      <th className="px-2 py-2 text-left text-gray-500">Station</th>
                      <th className="px-2 py-2 text-center text-gray-500">Ind Avg</th>
                      <th className="px-2 py-2 text-center text-gray-500">RS Avg</th>
                      <th className="px-2 py-2 text-center text-gray-500">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {extracted.fitreps.map((f, i) => {
                      const aboveRS = f.individualAverage > 0 && f.rsAverage > 0 && f.individualAverage >= f.rsAverage;
                      return (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-2 py-2 font-medium">{f.payGrade}</td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {f.startDate ? formatDate(f.startDate) : '?'} — {f.endDate ? formatDate(f.endDate) : '?'}
                          </td>
                          <td className="px-2 py-2">{f.station || '—'}</td>
                          <td className="px-2 py-2 text-center font-medium">
                            {f.individualAverage > 0 ? f.individualAverage.toFixed(2) : '—'}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {f.rsAverage > 0 ? (
                              <span className={aboveRS ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                                {f.rsAverage.toFixed(2)}
                                {aboveRS ? ' ▲' : ' ▼'}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              f.promotionRec === 'EP' ? 'bg-green-100 text-green-800' :
                              f.promotionRec === 'MP' ? 'bg-blue-100 text-blue-800' :
                              f.promotionRec === 'P'  ? 'bg-yellow-100 text-yellow-800' :
                              f.promotionRec === 'PR' ? 'bg-orange-100 text-orange-800' :
                              f.promotionRec === 'SP' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {f.promotionRec ? `${f.promotionRec} — ${PROMO_REC_LABELS[f.promotionRec] ?? f.promotionRec}` : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Action buttons */}
      <div className="flex justify-between items-center pt-4 border-t border-gray-200">
        {onSkip && (
          <button
            onClick={onSkip}
            className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-gray-700 text-sm"
          >
            <SkipForward className="w-4 h-4" />
            Skip — Enter Manually
          </button>
        )}
        <button
          onClick={handleAccept}
          className="ml-auto flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Looks good — Continue to Verify
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
};

export { DocumentParser };
export default DocumentParser;
