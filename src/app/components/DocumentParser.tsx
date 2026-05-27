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
  clinicalSpecialty: string | null;
  selectedForNextRank: { rank: string; date: string } | null;

  rankHistory: Array<{ rank: string; date: string }>;

  boardCertified: boolean | null;
  certificationCode: 'J' | 'K' | null;

  clearanceLevel: 'Secret' | 'Top Secret' | 'None' | '';
  clearanceDate: string;

  aqds: string[];

  hasUndergrad: boolean;
  hasMedicalSchool: boolean;

  fitrepAverage: number;
  rscaAverage: number;
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
    name?: string;
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
    rscaAverage?: number;
    fitrepCount?: number;
    earlyPromotes?: number;
    mustPromotes?: number;
    promotables?: number;
    fitreps?: Array<{ payGrade?: string; station?: string; startDate: string; endDate: string; individualAverage?: number; rsAverage?: number; promotionRec?: string; reportType?: string }>;
    psrTrend?: string;
  }) => void;
  onSkip?: () => void;
  // Legacy props kept for compatibility
  onDataParsed?: (data: any) => void;
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const NAVY = '#1B365D';
const GOLD = '#FFC72C';

function confidenceBadge(level: 'high' | 'medium' | 'low') {
  if (level === 'high') return (
    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: '#DCFCE7', color: '#166534' }}>High confidence</span>
  );
  if (level === 'medium') return (
    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(27,54,93,0.08)', color: NAVY }}>Review recommended</span>
  );
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: '#FEE2E2', color: '#991B1B' }}>Low confidence</span>
  );
}


const AQD_TITLES: Record<string, string> = {
  // Warfare / joint qualifications
  LA7: 'Surface Warfare Medical Dept Officer (SWMDO)',
  BX2: 'Fleet Marine Force Warfare Officer (FMFWO)',
  AW5: 'Aviation Warfare Medical Dept Officer',
  IW5: 'Information Warfare Medical Dept Officer',
  SW5: 'Surface Warfare Medical Dept Officer (alt)',
  JS7: 'JPME Phase I',
  JS8: 'JPME Phase II',
  JP1: 'Joint Qualified Officer (JQO)',
  JP2: 'Joint Specialty Officer (JSO)',
  // Individual Augmentation
  U6O: 'Operations Individual Augmentee',
  U4M: 'Fleet/Division Staff Medical IA',
  U6M: 'Other Medical IA',
  J3M: 'Combatant Commander Medical IA',
  J4M: 'Fleet/Division Staff Medical IA (Joint)',
  J5M: 'Joint Task Force Medical IA',
  J6M: 'Other Medical IA (Joint)',
  // Special
  BT1: 'Static-Line Parachutist',
  QK1: 'Naval Special Warfare Experience',
  DZQ: 'Joint Air Operations / Aviation Safety Officer',
  // Aviation medicine (6A series)
  '6AA': 'Aviation Medical Examiner',
  '6AB': 'General Flight Surgeon',
  '6AC': 'Naval Aviator/NFO Aeromedical Officer',
  '6AE': 'Naval Aviator/Pilot Aeromedical Officer',
  '6AG': 'Aerospace Medicine / Preventive Medicine',
  // Field / FMF / Surface (6F series)
  '6FA': 'Marine Corps Medical Dept Officer (FMF)',
  '6FC': 'FMF Medical Logistics Officer',
  '6FD': 'Surface Experienced Medical Officer',
  '6FE': 'Senior Marine Corps Medical Officer',
  // Contingency / Operational (6O series)
  '6OB': 'Shipboard Assignment',
  '6OC': 'Hospital Ship Assignment',
  '6OE': 'En-route Care / CCATT',
  '6OF': 'Forward Deployable Preventive Medicine Unit',
  '6OH': 'Humanitarian Assistance / Disaster Relief',
  '6OI': 'Professional Filler System',
  '6OJ': 'Associate Medical Officer',
  '6ON': 'Medical Regulator',
  '6OR': 'CATF/CLF Surgeon',
  '6OS': 'SERE Certified Medical Officer',
  '6OT': 'C4 Trained Plus',
  '6OU': 'Fleet Hospital Assignment',
  '6OW': 'Trauma Team Trained Officer',
  // Emergency Medicine (6P series)
  '6PD': 'Emergency Medicine',
  '6PE': 'Emergency Medicine Subspecialty',
  '6PF': 'Pediatric Emergency Medicine',
  '6PG': 'Emergency Medicine Ultrasound',
  '6PH': 'Emergency Medicine Toxicology',
  // Family Practice
  '6QF': 'Family Practice with Obstetrics',
  // Internal Medicine subspecialties (6R series)
  '6RF': 'Rheumatology',
  '6RG': 'Hematology/Oncology',
  '6RH': 'Endocrinology/Metabolism',
  '6RI': 'Nephrology',
  '6RK': 'Gastroenterology',
  '6RL': 'Pulmonary/Critical Care Medicine',
  '6RM': 'Cardiology',
  '6RN': 'Infectious Diseases',
  '6RO': 'Allergy/Immunology',
  '6RP': 'Geriatric Medicine',
  '6RQ': 'General Internal Medicine',
  '6RR': 'Clinical Pharmacology',
  '6RS': 'Medical Oncology',
  '6RT': 'Critical Care Medicine',
  '6RV': 'Sleep Medicine',
  '6RW': 'Hospitalist',
  // Undersea / Dive Medicine (6U series)
  '6UD': 'Diver Medical Officer',
  '6UE': 'Undersea Medicine',
  '6UF': 'Undersea/Dive Medicine — Subspecialty',
  '6UG': 'Undersea Medicine — Senior',
  '6UM': 'Undersea Medical Officer (UMO)',
  // Preventive / Occupational Medicine (6K series)
  '6KE': 'Preventive Medicine',
  '6KL': 'Occupational Medicine',
  '6KM': 'Environmental Medicine',
  // Executive / Admin (67 series)
  '67A': 'Executive Medicine',
  '67B': 'Expeditionary Medicine',
  '67G': 'Managed Care Coordinator',
  // Academic / Faculty (6Z series)
  '6ZA': 'Instructor',
  '6ZB': 'Assistant Professor',
  '6ZC': 'Associate Professor',
  '6ZD': 'Full Professor',
  '6ZE': 'Medical Ethicist',
  '6ZF': 'Researcher',
  '6ZG': 'Residency Program Director',
  // Graduate education
  '68I': 'Health Care Management Master\'s Degree',
  // Faculty / milestone
  '62D': 'Faculty Development Fellowship',
  '680': 'Milestone Eligible',
  // Surgical (6B/6C series)
  '6BG': 'General Surgery',
  '6BH': 'Colorectal Surgery',
  '6BI': 'Vascular Surgery',
  '6BJ': 'Thoracic Surgery',
  '6BK': 'Pediatric Surgery',
  '6BL': 'Anesthesiology',
  '6BM': 'Pain Management / Regional Anesthesia',
  '6BN': 'Critical Care Anesthesia',
  '6CD': 'Plastic/Reconstructive Surgery',
  '6CE': 'Burn Surgery',
  '6CF': 'Hand Surgery',
  '6CG': 'Surgical Oncology',
  '6CH': 'Transplant Surgery',
  '6CM': 'Trauma Surgery / Acute Care Surgery',
  // Neurology / Neurosurgery (6D series)
  '6DD': 'Neurology',
  '6DE': 'Child Neurology',
  '6DF': 'Neurodevelopmental Disabilities',
  '6DG': 'Neurosurgery',
  // OB/GYN (6E series)
  '6EF': 'Obstetrics and Gynecology',
  '6EG': 'Maternal-Fetal Medicine',
  '6EH': 'Reproductive Endocrinology/Infertility',
  '6EI': 'Gynecologic Oncology',
  '6EJ': 'Female Pelvic Medicine',
  '6EK': 'Urogynecology',
  // Ophthalmology (6G series)
  '6GA': 'Ophthalmology',
  '6GB': 'Oculoplastics/Orbit Surgery',
  '6GC': 'Cornea/External Disease',
  '6GD': 'Glaucoma',
  '6GE': 'Retina/Vitreous',
  '6GF': 'Neuro-Ophthalmology',
  '6GG': 'Pediatric Ophthalmology',
  // Orthopaedics (6H series)
  '6HD': 'Orthopedic Surgery',
  '6HE': 'Orthopedic Trauma',
  '6HF': 'Spine Surgery',
  '6HG': 'Total Joint Replacement',
  '6HH': 'Sports Medicine Orthopaedics',
  '6HI': 'Pediatric Orthopaedics',
  '6HJ': 'Hand/Upper Extremity',
  '6HK': 'Foot/Ankle Surgery',
  '6HL': 'Orthopedic Oncology',
  // ENT (6I series)
  '6ID': 'Otolaryngology (ENT)',
  '6IE': 'Head and Neck Surgery',
  '6IF': 'Facial Plastic Surgery',
  '6IG': 'Rhinology',
  '6IH': 'Laryngology',
  '6II': 'Audiology/Cochlear Implants',
  // Urology (6J series)
  '6JD': 'Urology',
  '6JE': 'Urologic Oncology',
  '6JF': 'Endourology/Stone Disease',
  '6JG': 'Female Urology',
  '6JH': 'Pediatric Urology',
  '6JI': 'Andrology/Male Infertility',
  // Pathology (6M series)
  '6MA': 'Anatomic Pathology',
  '6MB': 'Clinical Pathology',
  '6MC': 'Forensic Pathology',
  '6MD': 'Neuropathology',
  '6ME': 'Hematopathology',
  '6MF': 'Cytopathology',
  '6MG': 'Surgical Pathology',
  '6MH': 'Molecular Genetic Pathology',
  '6MI': 'Transfusion Medicine',
  '6MJ': 'Medical Microbiology',
  '6MK': 'Chemical Pathology',
  '6ML': 'Dermatopathology',
  '6MM': 'Pediatric Pathology',
  // Dermatology (6N series)
  '6ND': 'Dermatology',
  '6NE': 'Dermatopathology',
  '6NF': 'Procedural Dermatology',
  '6NG': 'Pediatric Dermatology',
  '6NH': 'Cosmetic Dermatology',
  // Neurology clinical (6T series)
  '6TD': 'Neurology (Clinical)',
  '6TF': 'Epilepsy',
  '6TG': 'Vascular Neurology',
  // Pediatrics (6V series)
  '6VF': 'Pediatrics',
  '6VG': 'Pediatric Critical Care',
  '6VH': 'Neonatology',
  '6VI': 'Pediatric Cardiology',
  '6VJ': 'Pediatric Hematology/Oncology',
  '6VK': 'Pediatric Infectious Diseases',
  '6VL': 'Pediatric Endocrinology',
  '6VM': 'Pediatric Gastroenterology',
  '6VN': 'Pediatric Nephrology',
  '6VO': 'Pediatric Neurology',
  '6VP': 'Pediatric Pulmonology',
  '6VQ': 'Pediatric Rheumatology',
  '6VR': 'Adolescent Medicine',
  '6VS': 'Developmental/Behavioral Pediatrics',
  '6VT': 'Pediatric Emergency Medicine',
  '6VW': 'Pediatric Hospital Medicine',
  // Psychiatry (6X series)
  '6XD': 'Psychiatry',
  '6XE': 'Child/Adolescent Psychiatry',
  '6XF': 'Geriatric Psychiatry',
  '6XG': 'Addiction Psychiatry',
  '6XH': 'Forensic Psychiatry',
  '6XI': 'Consultation-Liaison Psychiatry',
  '6XJ': 'Sleep Medicine (Psychiatry)',
  '6XK': 'Neuropsychiatry',
  '6XL': 'Emergency Psychiatry',
  '6XM': 'Pain Medicine (Psychiatry)',
  '6XN': 'Community Psychiatry',
  // Radiology (6Y series)
  '6YD': 'Diagnostic Radiology',
  '6YE': 'Neuroradiology',
  '6YF': 'Interventional Radiology',
  '6YG': 'Pediatric Radiology',
  '6YH': 'Musculoskeletal Radiology',
  '6YI': 'Breast Imaging',
  '6YJ': 'Nuclear Medicine',
  '6YK': 'Radiation Oncology',
  // Leadership / academic (2-series)
  '2D1': 'Medical Department Head',
  '2D2': 'Medical Officer in Charge (OIC)',
  '2P3': 'Assistant Professor (2-series)',
  '2P4': 'Associate Professor (2-series)',
  '2P5': 'Professor (2-series)',
  G1A: 'GME Program Director',
  // Research / operational / other
  '6XP': 'Principal Investigator',
  '6XR': 'Researcher',
  BM1: 'Operational Medicine',
  BM2: 'Combat Casualty Care',
  PH1: 'Public Health Officer',
  D7A: 'Flight Surgeon (Basic)',
  D7B: 'Senior Flight Surgeon',
  D6A: 'Undersea Medical Officer (UMO)',
  D6B: 'Dive Medical Officer (DMO)',
  BC1: 'Board Certified (Clinical Specialty)',
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
    const parts = iso.split('-');
    if (parts.length < 2) return iso;
    const [y, m, d] = parts;
    const monthIdx = parseInt(m, 10) - 1;
    if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return iso;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d ? `${months[monthIdx]} ${d}, ${y}` : `${months[monthIdx]} ${y}`;
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
  const [status, setStatus] = useState<'confirm' | 'parsing' | 'done' | 'error'>('confirm');
  const [extracted, setExtracted] = useState<ExtractedOfficerData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [docsAnalyzed, setDocsAnalyzed] = useState<string[]>([]);

  async function parseAllDocuments() {
    setStatus('parsing');

    const analyzed: string[] = [];
    const body: {
      odc?: string; osr?: string; psr?: string;
      odcBase64?: string; osrBase64?: string; psrBase64?: string;
    } = {};

    if (uploadedDocuments.odc?.status === 'success' && uploadedDocuments.odc.text) {
      body.odc = uploadedDocuments.odc.text;
      if (uploadedDocuments.odc.base64) body.odcBase64 = uploadedDocuments.odc.base64;
      analyzed.push('ODC');
    }
    if (uploadedDocuments.osr?.status === 'success' && uploadedDocuments.osr.text) {
      body.osr = uploadedDocuments.osr.text;
      if (uploadedDocuments.osr.base64) body.osrBase64 = uploadedDocuments.osr.base64;
      analyzed.push('OSR');
    }
    if (uploadedDocuments.psr?.status === 'success' && uploadedDocuments.psr.text) {
      body.psr = uploadedDocuments.psr.text;
      if (uploadedDocuments.psr.base64) body.psrBase64 = uploadedDocuments.psr.base64;
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

      // Override rank with date-computed value from rankHistory.
      // Claude reads the rank label off the document which may be stale if the
      // officer promoted after the ODC was printed.
      const todayStr = new Date().toISOString().split('T')[0];
      const computedRank = data.rankHistory
        .filter(rh => rh.date <= todayStr)
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.rank;
      if (computedRank) data.rank = computedRank;

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
      name: extracted.name ?? undefined,
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
      rscaAverage: extracted.rscaAverage,
      fitrepCount: extracted.fitrepCount,
      earlyPromotes: extracted.earlyPromotes,
      mustPromotes: extracted.mustPromotes,
      promotables: extracted.promotables,
      fitreps: extracted.fitreps,
      psrTrend: extracted.psrTrend,
    });
  }

  // ============================================================================
  // CONFIRM SCREEN — PII acknowledgment before sending to AI
  // ============================================================================

  if (status === 'confirm') {
    const readyDocs: Array<{ key: 'odc' | 'osr' | 'psr'; label: string }> = [
      { key: 'odc', label: 'Officer Data Card (ODC)' },
      { key: 'osr', label: 'Officer Summary Record (OSR)' },
      { key: 'psr', label: 'Performance Summary Record (PSR)' },
    ].filter(d => uploadedDocuments[d.key]?.status === 'success') as Array<{ key: 'odc' | 'osr' | 'psr'; label: string }>;

    return (
      <div className="space-y-4 max-w-2xl mx-auto">

        {/* Documents queued */}
        <div className="rounded" style={{ border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div className="px-4 py-2.5" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Queued for analysis</span>
          </div>
          <div className="divide-y divide-gray-50">
            {readyDocs.map(d => (
              <div key={d.key} className="flex items-center gap-2 px-4 py-2.5">
                <CheckCircle style={{ width: 14, height: 14, color: '#16A34A', flexShrink: 0 }} />
                <span className="text-sm font-medium text-gray-800">{d.label}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {(uploadedDocuments[d.key]?.text?.length ?? 0).toLocaleString()} chars
                </span>
              </div>
            ))}
            {readyDocs.length === 0 && (
              <p className="px-4 py-3 text-sm text-gray-400">No documents uploaded.</p>
            )}
          </div>
        </div>

        {/* PII warning — navy/gold */}
        <div style={{ background: NAVY, borderRadius: 6, borderLeft: `4px solid ${GOLD}`, padding: '14px 16px' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: GOLD }}>
            Confirm you've reviewed these documents before proceeding
          </p>
          <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Extracted text is sent to an AI model over HTTPS. <strong style={{ color: 'rgba(255,255,255,0.85)' }}>Automatically redacted:</strong>
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
          <p className="text-xs font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>Your responsibility to remove:</p>
          <ul className="text-xs ml-3 list-disc space-y-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
            <li>Classified or FOUO material beyond your own record</li>
            <li>Third-party personnel information</li>
            <li>Medical diagnoses unrelated to career records</li>
            <li>Financial account numbers</li>
          </ul>
          <p className="text-xs mt-3 pt-2" style={{ color: 'rgba(255,255,255,0.35)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            PDFs parsed locally · text sent over HTTPS then discarded · nothing stored
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex justify-between items-center pt-1">
          {onSkip && (
            <button onClick={onSkip} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
              <SkipForward className="w-4 h-4" />
              Enter Manually
            </button>
          )}
          <button
            onClick={parseAllDocuments}
            disabled={readyDocs.length === 0}
            className="ml-auto flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: NAVY, borderRadius: 4, boxShadow: readyDocs.length > 0 ? '0 2px 8px rgba(27,54,93,0.35)' : 'none' }}
          >
            I've reviewed my documents — Analyze Now
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    );
  }

  // ============================================================================
  // LOADING SCREEN
  // ============================================================================

  if (status === 'parsing') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-5">
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(27,54,93,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 style={{ width: 28, height: 28, color: NAVY }} className="animate-spin" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Analyzing Your Records</h2>
          <p className="text-sm text-gray-500 mt-1.5 max-w-md">
            AI is extracting rank history, AQDs, and FITREP data. This takes about 15–20 seconds.
          </p>
        </div>
        <div className="flex gap-2">
          {['ODC', 'OSR', 'PSR'].map(type => {
            const isPresent = docsAnalyzed.includes(type);
            return (
              <span
                key={type}
                className="px-3 py-1 rounded text-xs font-semibold"
                style={isPresent
                  ? { background: NAVY, color: '#fff' }
                  : { background: '#F1F5F9', color: '#CBD5E1' }}
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
      <div className="space-y-4">
        <div className="rounded-lg p-5 text-center" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <AlertTriangle style={{ width: 32, height: 32, color: '#DC2626', margin: '0 auto 10px' }} />
          <h2 className="text-base font-semibold text-red-900 mb-1">AI Parsing Failed</h2>
          <p className="text-sm text-red-700 mb-4">{errorMessage}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={parseAllDocuments}
              className="px-4 py-2 text-sm font-medium text-white"
              style={{ background: NAVY, borderRadius: 4 }}
            >
              Try Again
            </button>
            {onSkip && (
              <button
                onClick={onSkip}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300"
                style={{ borderRadius: 4 }}
              >
                Enter Manually
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
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle style={{ width: 15, height: 15, color: '#16A34A' }} />
            <span className="text-xs font-medium text-gray-500">
              AI extraction complete — {docsAnalyzed.join(', ')} analyzed
            </span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Extracted Record Summary</h2>
          <p className="text-sm text-gray-400 mt-0.5">Review, then continue to verify and edit every field.</p>
        </div>
        {extracted.confidence && (
          <div className="flex-shrink-0">{confidenceBadge(extracted.confidence.overall)}</div>
        )}
      </div>

      {/* PSR Issues */}
      {hasIssues && (
        <div className="rounded p-3" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <h3 className="text-sm font-semibold text-red-800 flex items-center gap-1.5 mb-1.5">
            <AlertTriangle style={{ width: 14, height: 14 }} />
            PSR Issues Detected
          </h3>
          <ul className="space-y-0.5">
            {extracted.psrIssues.map((issue, i) => (
              <li key={i} className="text-xs text-red-700">• {issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Extraction warnings */}
      {hasWarnings && (
        <div className="rounded p-3" style={{ background: 'rgba(27,54,93,0.04)', border: '1px solid rgba(27,54,93,0.12)' }}>
          <h3 className="text-xs font-semibold flex items-center gap-1.5 mb-1.5" style={{ color: NAVY }}>
            <AlertTriangle style={{ width: 13, height: 13 }} />
            Extraction Notes
          </h3>
          <ul className="space-y-0.5">
            {extracted.warnings.map((w, i) => (
              <li key={i} className="text-xs text-gray-600">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary grid */}
      <div className="grid md:grid-cols-2 gap-3">

        {/* Officer Identity */}
        <div className="rounded" style={{ border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <User style={{ width: 13, height: 13, color: NAVY }} />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Officer Identity</span>
            {extracted.confidence && <span className="ml-auto">{confidenceBadge(extracted.confidence.rankHistory)}</span>}
          </div>
          <div className="px-4 py-3">
            <dl className="space-y-1.5 text-sm">
              {extracted.name && (
                <div className="flex justify-between">
                  <dt className="text-gray-400 text-xs">Name</dt>
                  <dd className="font-medium text-gray-800 text-xs">{extracted.name}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-400 text-xs">Current Rank</dt>
                <dd className="font-semibold text-xs" style={{ color: NAVY }}>{extracted.rank || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400 text-xs">Designator</dt>
                <dd className="font-medium text-gray-800 text-xs">{extracted.designator || 'Not detected'}</dd>
              </div>
              {extracted.clinicalSpecialty && (
                <div className="flex justify-between">
                  <dt className="text-gray-400 text-xs">Clinical Specialty</dt>
                  <dd className="font-medium text-gray-800 text-xs">{extracted.clinicalSpecialty}</dd>
                </div>
              )}
              {extracted.yearGroup && (
                <div className="flex justify-between">
                  <dt className="text-gray-400 text-xs">Year Group</dt>
                  <dd className="font-medium text-gray-800 text-xs">YG-{extracted.yearGroup}</dd>
                </div>
              )}
            </dl>
            {extracted.rankHistory.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">Promotion Timeline</p>
                <div className="flex flex-wrap gap-2 items-center">
                  {extracted.rankHistory.map((rh, i) => (
                    <React.Fragment key={i}>
                      <div className="text-center">
                        <div className="text-xs font-bold" style={{ color: NAVY }}>{rh.rank}</div>
                        <div className="text-xs text-gray-400">{formatDate(rh.date)}</div>
                      </div>
                      {i < extracted.rankHistory.length - 1 && (
                        <ChevronRight style={{ width: 12, height: 12, color: '#CBD5E1', flexShrink: 0 }} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
                {extracted.selectedForNextRank && (
                  <div className="mt-2 px-2 py-1.5 rounded text-xs font-medium"
                    style={{ background: 'rgba(255,199,44,0.15)', color: '#92400E', border: '1px solid rgba(255,199,44,0.4)' }}>
                    Selected for {extracted.selectedForNextRank.rank} — effective {formatDate(extracted.selectedForNextRank.date)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Certification & Clearance */}
        <div className="rounded" style={{ border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <Shield style={{ width: 13, height: 13, color: NAVY }} />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Certification & Clearance</span>
          </div>
          <div className="px-4 py-3">
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-gray-400">Board Certification</dt>
                <dd>
                  {extracted.boardCertified === true && <span className="font-semibold text-green-700">✓ Board Certified (K)</span>}
                  {extracted.boardCertified === false && <span className="font-medium text-gray-600">Board Eligible (J)</span>}
                  {extracted.boardCertified === null && <span className="text-gray-400">Not detected</span>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Clearance</dt>
                <dd className="font-medium text-gray-800">{extracted.clearanceLevel || 'Not detected'}</dd>
              </div>
              {extracted.clearanceDate && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Investigation Date</dt>
                  <dd className="font-medium text-gray-800">{extracted.clearanceDate}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-400">Education</dt>
                <dd className="font-medium text-gray-800">
                  {extracted.hasMedicalSchool ? 'MD/DO' : extracted.hasUndergrad ? 'Undergraduate' : 'Not detected'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* AQDs */}
        <div className="rounded" style={{ border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <Award style={{ width: 13, height: 13, color: NAVY }} />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">AQDs Detected</span>
            {extracted.confidence && <span className="ml-auto">{confidenceBadge(extracted.confidence.aqds)}</span>}
          </div>
          <div className="px-4 py-3">
            {extracted.aqds.length > 0 ? (
              <div className="space-y-1.5">
                {extracted.aqds.map(aqd => (
                  <div key={aqd} className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: NAVY, color: '#fff', minWidth: 44, textAlign: 'center' }}>
                      {aqd}
                    </span>
                    <span className="text-xs text-gray-600">{AQD_TITLES[aqd] || 'Unknown qualification'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No AQDs detected in documents.</p>
            )}
          </div>
        </div>

      </div>

      {/* Fitness Reports — collapsible */}
      {hasPSR && extracted.fitrepCount > 0 && (
        <details className="rounded overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500" style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', listStyle: 'none' }}>
            <BarChart3 style={{ width: 13, height: 13, color: NAVY }} />
            {extracted.fitrepCount} Fitness Reports
            {extracted.confidence && <span className="ml-1">{confidenceBadge(extracted.confidence.psrData)}</span>}
            <span className="ml-auto text-xs font-normal text-gray-400 normal-case tracking-normal">click to expand</span>
          </summary>
          <div className="px-4 pb-4 space-y-3 pt-3">

            {/* Promotion rec breakdown */}
            <div className="flex gap-1.5 flex-wrap pt-1">
              {extracted.earlyPromotes > 0 && (
                <span className="px-2 py-1 text-xs font-semibold rounded" style={{ background: NAVY, color: '#fff' }}>
                  EP: {extracted.earlyPromotes}
                </span>
              )}
              {extracted.mustPromotes > 0 && (
                <span className="px-2 py-1 text-xs font-semibold rounded" style={{ background: 'rgba(27,54,93,0.15)', color: NAVY }}>
                  MP: {extracted.mustPromotes}
                </span>
              )}
              {extracted.promotables > 0 && (
                <span className="px-2 py-1 text-xs font-semibold rounded" style={{ background: '#F1F5F9', color: '#64748B' }}>
                  P: {extracted.promotables}
                </span>
              )}
              {extracted.progressings > 0 && (
                <span className="px-2 py-1 text-xs font-semibold rounded" style={{ background: '#FFF7ED', color: '#9A3412' }}>
                  PR: {extracted.progressings}
                </span>
              )}
            </div>

            {/* RS average comparison */}
            {extracted.fitrepCount > 0 && (() => {
              const aboveCount = extracted.fitrepCount - extracted.belowRSAverageCount;
              const abovePct = Math.round((aboveCount / extracted.fitrepCount) * 100);
              const bad = extracted.belowRSAveragePercentage > 50;
              return (
                <div className="text-xs rounded p-2.5" style={{
                  background: bad ? '#FEF2F2' : 'rgba(27,54,93,0.04)',
                  border: `1px solid ${bad ? '#FECACA' : 'rgba(27,54,93,0.12)'}`,
                  color: bad ? '#991B1B' : '#374151',
                }}>
                  <span className="font-semibold">At/above RS avg</span> in {aboveCount} of {extracted.fitrepCount} reports ({abovePct}%)
                  {extracted.belowRSAverageCount > 0 && (
                    <span className="ml-2 opacity-60">· below in {extracted.belowRSAverageCount}</span>
                  )}
                </div>
              );
            })()}

            {/* FITREP table */}
            {extracted.fitreps.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs divide-y divide-gray-100">
                  <thead style={{ background: '#F8FAFC' }}>
                    <tr>
                      {['Grade', 'Period', 'Station', 'Ind', 'RS', 'Rec'].map(h => (
                        <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {extracted.fitreps.map((f, i) => {
                      const aboveRS = f.individualAverage > 0 && f.rsAverage > 0 && f.individualAverage >= f.rsAverage;
                      const recStyle = f.promotionRec === 'EP'
                        ? { background: NAVY, color: '#fff' }
                        : f.promotionRec === 'MP'
                        ? { background: 'rgba(27,54,93,0.12)', color: NAVY }
                        : f.promotionRec === 'P'
                        ? { background: '#F1F5F9', color: '#64748B' }
                        : f.promotionRec === 'PR'
                        ? { background: '#FFF7ED', color: '#9A3412' }
                        : f.promotionRec === 'SP'
                        ? { background: '#FEF2F2', color: '#991B1B' }
                        : { background: '#F1F5F9', color: '#94A3B8' };
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td className="px-2 py-1.5 font-semibold" style={{ color: NAVY }}>{f.payGrade}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">
                            {f.startDate ? formatDate(f.startDate) : '?'} – {f.endDate ? formatDate(f.endDate) : '?'}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600">{f.station || '—'}</td>
                          <td className="px-2 py-1.5 text-center font-medium">
                            {f.individualAverage > 0 ? (
                              <span style={{ color: aboveRS ? '#16A34A' : '#DC2626' }}>
                                {f.individualAverage.toFixed(2)}{aboveRS ? ' ▲' : ' ▼'}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-center font-medium text-gray-500">
                            {f.rsAverage > 0 ? f.rsAverage.toFixed(2) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <span className="px-1.5 py-0.5 rounded font-bold" style={recStyle}>
                              {f.promotionRec || '—'}
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
      <div className="flex justify-between items-center pt-4" style={{ borderTop: '1px solid #F1F5F9' }}>
        {onSkip && (
          <button onClick={onSkip} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
            <SkipForward className="w-4 h-4" />
            Enter Manually
          </button>
        )}
        <button
          onClick={handleAccept}
          className="ml-auto flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white transition-all"
          style={{ background: NAVY, borderRadius: 4, boxShadow: '0 2px 8px rgba(27,54,93,0.35)' }}
        >
          Looks good — Continue to Verify
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
};

export { DocumentParser };
export default DocumentParser;
