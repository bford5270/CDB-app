'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, Edit2, Save, X, ChevronDown, ChevronUp, Shield, Award, FileText, TrendingUp } from 'lucide-react';
import type { RankDate } from './RankHistoryForm';

// Types
export interface ParsedOfficerData {
  // From ODC/OSR parsing
  rankHistory: RankDate[];
  currentRank: string;
  
  // From OSR
  clearanceLevel: 'Secret' | 'Top Secret' | 'None' | '';
  clearanceDate: string;
  
  // From ODC - Board Certification
  // Per Navy ODC standard (Schofer, The Wealthy Captain):
  //   K = Board Certified, J = Board Eligible (trained, not yet certified), T = In Training
  boardCertified: boolean | null;
  certificationCode: 'J' | 'K' | 'T' | null;
  
  // From ODC - AQDs
  aqds: string[];
  
  // From PSR
  fitrepAverage: number;
  fitrepCount: number;
  earlyPromotes: number;
  mustPromotes: number;
  promotables: number;
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

  // Education (parsed)
  hasUndergrad: boolean;
  hasMedicalSchool: boolean;
  
  // Manual entry required
  designator: string;
  currentBillet: string;
  deployments: number;
  operationalTours: number;
  jointDuty: boolean;
  commandTour: boolean;
  jpmeComplete: boolean;
  
  // Warnings from parsing
  warnings: string[];
}

interface VerifyParsedDataProps {
  parsedData: Partial<ParsedOfficerData>;
  onDataConfirmed: (data: ParsedOfficerData) => void;
  onBack: () => void;
}

const RANK_OPTIONS = ['ENS', 'LTJG', 'LT', 'LCDR', 'CDR', 'CAPT'];

const DESIGNATOR_OPTIONS = [
  { value: '2100', label: '2100 - Medical Corps (General)' },
  { value: '2105', label: '2105 - Flight Surgeon' },
  { value: '2300', label: '2300 - Family Medicine' },
  { value: '2305', label: '2305 - Internal Medicine' },
  { value: '2310', label: '2310 - Pediatrics' },
  { value: '2315', label: '2315 - Dermatology' },
  { value: '2320', label: '2320 - Neurology' },
  { value: '2325', label: '2325 - Psychiatry' },
  { value: '2330', label: '2330 - Physical Medicine' },
  { value: '2335', label: '2335 - Preventive Medicine' },
  { value: '2340', label: '2340 - Radiology' },
  { value: '2345', label: '2345 - Anesthesiology' },
  { value: '2350', label: '2350 - Pathology' },
  { value: '2355', label: '2355 - Emergency Medicine' },
  { value: '2500', label: '2500 - Operational Medicine' },
  { value: '2505', label: '2505 - Aerospace Medicine' },
  { value: '2510', label: '2510 - Undersea Medicine' },
];

// AQD codes sourced from Schofer (The Wealthy Captain, Ch. 3) and Navy ODC standard
const COMMON_AQDS = [
  { code: 'BX2', name: 'FMF Qualified MDO' },        // Fleet Marine Force
  { code: 'LA7', name: 'Surface Warfare MDO' },       // Surface Warfare Medical Dept Officer
  { code: 'AW',  name: 'Aviation Warfare' },
  { code: 'SS',  name: 'Submarine Warfare' },
  { code: 'EXW', name: 'Expeditionary Warfare' },
  { code: 'JS7', name: 'JPME Phase I' },
  { code: 'JS8', name: 'JPME Phase II' },
  { code: '67A', name: 'Executive Medicine' },
  { code: '67B', name: 'Expeditionary Medicine' },
  { code: '6OC', name: 'Clinical Investigator' },
];

export function VerifyParsedData({ parsedData, onDataConfirmed, onBack }: VerifyParsedDataProps) {
  const [data, setData] = useState<ParsedOfficerData>({
    rankHistory: parsedData.rankHistory || [],
    currentRank: parsedData.currentRank || '',
    clearanceLevel: parsedData.clearanceLevel || '',
    clearanceDate: parsedData.clearanceDate || '',
    boardCertified: parsedData.boardCertified ?? null,
    certificationCode: parsedData.certificationCode || null,
    aqds: parsedData.aqds || [],
    fitrepAverage: parsedData.fitrepAverage || 0,
    fitrepCount: parsedData.fitrepCount || 0,
    earlyPromotes: parsedData.earlyPromotes || 0,
    mustPromotes: parsedData.mustPromotes || 0,
    promotables: parsedData.promotables || 0,
    psrTrend: parsedData.psrTrend,
    belowRSAverageCount: parsedData.belowRSAverageCount,
    belowRSAveragePercentage: parsedData.belowRSAveragePercentage,
    fitreps: parsedData.fitreps,
    hasUndergrad: parsedData.hasUndergrad ?? true,
    hasMedicalSchool: parsedData.hasMedicalSchool ?? true,
    designator: parsedData.designator || '2300',
    currentBillet: parsedData.currentBillet || '',
    deployments: parsedData.deployments || 0,
    operationalTours: parsedData.operationalTours || 0,
    jointDuty: parsedData.jointDuty ?? false,
    commandTour: parsedData.commandTour ?? false,
    jpmeComplete: parsedData.jpmeComplete ?? false,
    warnings: parsedData.warnings || [],
  });

  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    rank: true,
    clearance: true,
    certification: true,
    aqds: true,
    fitrep: true,
    experience: true,
  });

  // Calculate current rank from rank history if not set
  useEffect(() => {
    if (!data.currentRank && data.rankHistory.length > 0) {
      const sortedRanks = [...data.rankHistory].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setData(prev => ({ ...prev, currentRank: sortedRanks[0].rank }));
    }
  }, [data.rankHistory, data.currentRank]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const updateField = <K extends keyof ParsedOfficerData>(field: K, value: ParsedOfficerData[K]) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const toggleAQD = (aqd: string) => {
    setData(prev => ({
      ...prev,
      aqds: prev.aqds.includes(aqd) 
        ? prev.aqds.filter(a => a !== aqd)
        : [...prev.aqds, aqd]
    }));
  };

  const canProceed = data.currentRank && data.fitrepAverage > 0;

  const SectionHeader = ({ 
    title, 
    icon: Icon, 
    section, 
    status 
  }: { 
    title: string; 
    icon: React.ElementType; 
    section: string;
    status: 'complete' | 'warning' | 'incomplete';
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${
          status === 'complete' ? 'text-green-600' :
          status === 'warning' ? 'text-yellow-600' :
          'text-gray-400'
        }`} />
        <span className="font-semibold text-gray-900">{title}</span>
        {status === 'complete' && <CheckCircle className="w-4 h-4 text-green-500" />}
        {status === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
      </div>
      {expandedSections[section] ? (
        <ChevronUp className="w-5 h-5 text-gray-400" />
      ) : (
        <ChevronDown className="w-5 h-5 text-gray-400" />
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Verify Your Record</h2>
        <p className="text-gray-600 mt-2">
          Review the data extracted from your documents. Edit any incorrect information before proceeding.
        </p>
      </div>

      {/* Warnings */}
      {data.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-800">Parsing Notes</h3>
              <ul className="mt-2 space-y-1">
                {data.warnings.map((warning, i) => (
                  <li key={i} className="text-sm text-yellow-700">• {warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Rank & Promotion Timeline */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader 
          title="Rank & Promotion Timeline" 
          icon={TrendingUp} 
          section="rank"
          status={data.currentRank ? 'complete' : 'incomplete'}
        />
        {expandedSections.rank && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Rank</label>
                <select
                  value={data.currentRank}
                  onChange={(e) => updateField('currentRank', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Rank</option>
                  {RANK_OPTIONS.map(rank => (
                    <option key={rank} value={rank}>{rank}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Designator</label>
                <select
                  value={data.designator}
                  onChange={(e) => updateField('designator', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {DESIGNATOR_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {data.rankHistory.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rank History (Parsed)</label>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  {data.rankHistory.map((rh, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{rh.rank}</span>
                      <span className="text-gray-600">{new Date(rh.date).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Security Clearance */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader 
          title="Security Clearance" 
          icon={Shield} 
          section="clearance"
          status={data.clearanceLevel ? 'complete' : 'warning'}
        />
        {expandedSections.clearance && (
          <div className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clearance Level</label>
                <select
                  value={data.clearanceLevel}
                  onChange={(e) => updateField('clearanceLevel', e.target.value as ParsedOfficerData['clearanceLevel'])}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Not Specified</option>
                  <option value="Secret">Secret</option>
                  <option value="Top Secret">Top Secret</option>
                  <option value="None">None</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clearance Date</label>
                <input
                  type="date"
                  value={data.clearanceDate}
                  onChange={(e) => updateField('clearanceDate', e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {!data.clearanceLevel && (
              <p className="mt-2 text-sm text-yellow-600">
                ⚠️ Clearance level not detected. Some senior billets require Top Secret clearance.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Board Certification */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader 
          title="Board Certification" 
          icon={Award} 
          section="certification"
          status={data.boardCertified !== null ? 'complete' : 'warning'}
        />
        {expandedSections.certification && (
          <div className="p-4">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Board Certification Status</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="boardCert"
                    checked={data.certificationCode === 'K'}
                    onChange={() => {
                      updateField('boardCertified', true);
                      updateField('certificationCode', 'K');
                    }}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm">
                    <span className="font-medium">K Code</span> - Board Certified
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="boardCert"
                    checked={data.certificationCode === 'J'}
                    onChange={() => {
                      updateField('boardCertified', false);
                      updateField('certificationCode', 'J');
                    }}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm">
                    <span className="font-medium">J Code</span> - Board Eligible (trained, not certified)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="boardCert"
                    checked={data.certificationCode === 'T'}
                    onChange={() => {
                      updateField('boardCertified', false);
                      updateField('certificationCode', 'T');
                    }}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm">
                    <span className="font-medium">T Code</span> - In Training (residency)
                  </span>
                </label>
              </div>
              {data.certificationCode && (
                <div className={`mt-2 p-3 rounded-lg ${
                  data.certificationCode === 'K' ? 'bg-green-50 text-green-800' :
                  data.certificationCode === 'T' ? 'bg-blue-50 text-blue-800' :
                  'bg-yellow-50 text-yellow-800'
                }`}>
                  <p className="text-sm">
                    {data.certificationCode === 'K'
                      ? '✓ Board certified (K code) — competitive for promotion boards.'
                      : data.certificationCode === 'T'
                      ? 'ℹ️ In training (T code) — completing residency. Pursue board certification (K code) as soon as eligible; expected by O-4.'
                      : '⚠️ Board eligible (J code) — trained but not yet certified. Board certification is expected by O-4. Schedule specialty board exam promptly.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* AQDs */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader 
          title="Additional Qualification Designators (AQDs)" 
          icon={Award} 
          section="aqds"
          status={data.aqds.length > 0 ? 'complete' : 'warning'}
        />
        {expandedSections.aqds && (
          <div className="p-4">
            <p className="text-sm text-gray-600 mb-3">Select all AQDs currently held:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {COMMON_AQDS.map(aqd => (
                <label
                  key={aqd.code}
                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    data.aqds.includes(aqd.code)
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={data.aqds.includes(aqd.code)}
                    onChange={() => toggleAQD(aqd.code)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <div>
                    <span className="font-medium text-sm">{aqd.code}</span>
                    <span className="text-xs text-gray-500 block">{aqd.name}</span>
                  </div>
                </label>
              ))}
            </div>
            {data.aqds.length === 0 && (
              <p className="mt-3 text-sm text-yellow-600">
                ⚠️ No AQDs detected. Warfare qualifications (FMF, SW, etc.) strengthen operational credibility.
              </p>
            )}
          </div>
        )}
      </div>

      {/* FITREP Analysis */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader 
          title="Fitness Report Summary" 
          icon={FileText} 
          section="fitrep"
          status={data.fitrepAverage > 0 ? 'complete' : 'incomplete'}
        />
        {expandedSections.fitrep && (
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trait Average</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max="5"
                  value={data.fitrepAverage || ''}
                  onChange={(e) => updateField('fitrepAverage', parseFloat(e.target.value) || 0)}
                  placeholder="e.g., 4.85"
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total FITREPs</label>
                <input
                  type="number"
                  min="0"
                  value={data.fitrepCount || ''}
                  onChange={(e) => updateField('fitrepCount', parseInt(e.target.value) || 0)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Early Promotes</label>
                <input
                  type="number"
                  min="0"
                  value={data.earlyPromotes || ''}
                  onChange={(e) => updateField('earlyPromotes', parseInt(e.target.value) || 0)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Must Promotes</label>
                <input
                  type="number"
                  min="0"
                  value={data.mustPromotes || ''}
                  onChange={(e) => updateField('mustPromotes', parseInt(e.target.value) || 0)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {data.fitrepAverage > 0 && (
              <div className={`mt-4 p-3 rounded-lg ${
                data.fitrepAverage >= 4.5 ? 'bg-green-50' : 
                data.fitrepAverage >= 4.0 ? 'bg-yellow-50' : 'bg-red-50'
              }`}>
                <p className={`text-sm ${
                  data.fitrepAverage >= 4.5 ? 'text-green-800' : 
                  data.fitrepAverage >= 4.0 ? 'text-yellow-800' : 'text-red-800'
                }`}>
                  {data.fitrepAverage >= 4.5 
                    ? '✓ Strong trait average - competitive for promotion.'
                    : data.fitrepAverage >= 4.0 
                    ? '⚠️ Solid trait average - consider ways to strengthen record.'
                    : '⚠️ Below typical competitive range - discuss with mentor.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Experience & Additional Info */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SectionHeader
          title="Experience & Qualifications"
          icon={Award}
          section="experience"
          status="complete"
        />
        {expandedSections.experience && (
          <div className="p-4 space-y-4">
            {/* Manual-entry notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <strong>These fields are not auto-populated from your documents.</strong> Enter them manually using your
                OSR or memory. They directly affect gap analysis — leaving them blank will trigger false warnings.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Billet</label>
              <input
                type="text"
                value={data.currentBillet}
                onChange={(e) => updateField('currentBillet', e.target.value)}
                placeholder="e.g., Department Head, Family Medicine"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deployments
                  <span className="ml-1 text-xs text-gray-400 font-normal">(any length, overseas)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={data.deployments}
                  onChange={(e) => updateField('deployments', parseInt(e.target.value) || 0)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Operational Tours
                  <span className="ml-1 text-xs text-gray-400 font-normal">(GMO, SMO, OMO, ship, MEU)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={data.operationalTours}
                  onChange={(e) => updateField('operationalTours', parseInt(e.target.value) || 0)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.jpmeComplete}
                  onChange={(e) => updateField('jpmeComplete', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm">JPME I Complete <span className="text-xs text-gray-400">(JS7 AQD or Joint Forces Staff College DL)</span></span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.jointDuty}
                  onChange={(e) => updateField('jointDuty', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm">Joint Duty Assignment <span className="text-xs text-gray-400">(Joint Staff, COCOM, inter-service MTF billet)</span></span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.commandTour}
                  onChange={(e) => updateField('commandTour', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm">Command / Dept Head Tour <span className="text-xs text-gray-400">(OIC, dept head, XO, director)</span></span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Proceed Button */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
        >
          Back to Upload
        </button>
        <button
          onClick={() => onDataConfirmed(data)}
          disabled={!canProceed}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          Continue to Analysis
          <CheckCircle className="w-5 h-5" />
        </button>
      </div>
      {!canProceed && (
        <p className="text-sm text-red-500 text-right">
          Please enter current rank and FITREP average to continue
        </p>
      )}
    </div>
  );
}
