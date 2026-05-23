import { useState, useEffect } from 'react';
import { ChevronRight, Upload, CheckCircle, TrendingUp, Sparkles } from 'lucide-react';
import { DocumentUpload, type UploadedDocuments } from './components/DocumentUpload';
import { DocumentParser } from './components/DocumentParser';
import { VerifyParsedData, type ParsedOfficerData } from './components/VerifyParsedData';
import { AnalysisResults } from './components/AnalysisResults';
import { PersonalizedActionPlan } from './components/PersonalizedActionPlan';
import { CDBChecklist } from './components/CDBChecklist';
import { lookupPromo, zoneStatus, NEXT_RANK } from './components/CDBChecklist';
import { DashboardPanel } from './components/DashboardPanel';
import ResourcesQA from './components/ResourcesQA';
import type { RankDate } from './components/RankHistoryForm';
import { calculateRankData } from './components/RankHistoryForm';
import type { OfficerData } from './components/OfficerDataForm';

function MCDevice({ size = 24, color = '#FFC72C' }: { size?: number; color?: string }) {
  const sw = size <= 18 ? 7 : size <= 28 ? 4 : 2.5;
  return (
    <svg width={Math.round(size * 0.625)} height={size} viewBox="0 0 100 160" fill="none">
      <path d="M50 30 C42 22 26 14 16 8 C14 16 18 24 28 28 Z" fill={color} stroke={color} strokeWidth={sw} strokeLinejoin="round"/>
      <path d="M50 30 C58 22 74 14 84 8 C86 16 82 24 72 28 Z" fill={color} stroke={color} strokeWidth={sw} strokeLinejoin="round"/>
      <circle cx="50" cy="38" r="10" fill="none" stroke={color} strokeWidth={sw}/>
      <line x1="50" y1="48" x2="50" y2="146" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
      <path d="M50 52 C30 64 70 76 50 88 C30 100 70 112 50 124" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round"/>
      <path d="M50 52 C70 64 30 76 50 88 C70 100 30 112 50 124" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round"/>
      <line x1="24" y1="120" x2="76" y2="120" stroke={color} strokeWidth={sw} strokeLinecap="round"/>
      <circle cx="24" cy="120" r="5.5" fill={color}/>
      <circle cx="76" cy="120" r="5.5" fill={color}/>
      <path d="M50 146 Q28 140 24 126" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round"/>
      <path d="M50 146 Q72 140 76 126" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round"/>
    </svg>
  );
}

export default function App() {
  const [step, setStep] = useState(1);
  const [analysisTab, setAnalysisTab] = useState<'checklist' | 'analysis'>('checklist');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [documents, setDocuments] = useState<UploadedDocuments>({
    odc: null,
    osr: null,
    psr: null,
  });
  const [showParser, setShowParser] = useState(false);
  const [parsedData, setParsedData] = useState<Partial<ParsedOfficerData>>({});
  const [confirmedData, setConfirmedData] = useState<ParsedOfficerData | null>(null);

  const canProceedFromUpload = documents.odc?.status === 'success' || documents.psr?.status === 'success' || documents.osr?.status === 'success';

  const handleDocumentsUploaded = (docs: UploadedDocuments) => {
    setDocuments(docs);
  };

  const handleParsedDataAccepted = (data: {
    rankHistory: RankDate[];
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
  }) => {
    let currentRank = '';
    if (data.rankHistory.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const validRanks = data.rankHistory
        .filter(entry => entry.date <= today)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (validRanks.length > 0) currentRank = validRanks[0].rank;
    }

    setParsedData({
      rankHistory: data.rankHistory,
      currentRank,
      clearanceLevel: data.clearanceLevel || '',
      clearanceDate: data.clearanceDate || '',
      boardCertified: data.boardCertified,
      certificationCode: data.certificationCode || (data.boardCertified === true ? 'K' : data.boardCertified === false ? 'J' : null),
      aqds: data.aqds,
      fitrepAverage: data.fitrepAverage || 0,
      fitrepCount: data.fitrepCount || 0,
      earlyPromotes: data.earlyPromotes || 0,
      mustPromotes: data.mustPromotes || 0,
      promotables: data.promotables || 0,
      hasUndergrad: data.hasUndergrad,
      hasMedicalSchool: data.hasMedicalSchool,
      warnings: [...data.warnings, ...data.psrIssues],
    });
    setStep(2);
  };

  const handleSkipParser = () => {
    setParsedData({});
    setStep(2);
  };

  const handleDataConfirmed = (data: ParsedOfficerData) => {
    setConfirmedData(data);
    setStep(3);
  };

  const getOfficerDataForAnalysis = (): OfficerData | null => {
    if (!confirmedData) return null;
    return {
      rankHistoryData: calculateRankData(confirmedData.rankHistory),
      designator: confirmedData.designator || '2300',
      currentBillet: confirmedData.currentBillet || '',
      educationLevel: confirmedData.hasMedicalSchool ? 'MD' : 'Undergrad',
      postGradEducation: '',
      deployments: confirmedData.deployments || 0,
      jointDuty: confirmedData.jointDuty || false,
      commandTour: confirmedData.commandTour || false,
      specialQualifications: [],
      selectedAQDs: confirmedData.aqds || [],
      fitnessReportAverage: confirmedData.fitrepAverage || 0,
      boardCertified: confirmedData.boardCertified ?? undefined,
      hasUndergrad: confirmedData.hasUndergrad,
      hasMedicalSchool: confirmedData.hasMedicalSchool,
    };
  };

  const steps = [
    { number: 1, name: 'Upload & Parse', description: 'ODC, OSR, PSR', icon: Upload },
    { number: 2, name: 'Verify Record', description: 'Confirm parsed data', icon: CheckCircle },
    { number: 3, name: 'Career Analysis', description: 'Board readiness', icon: TrendingUp },
    { number: 4, name: 'Action Plan', description: 'AI recommendations', icon: Sparkles },
  ];

  const epMpRate = confirmedData?.fitrepCount
    ? Math.round(((confirmedData.earlyPromotes || 0) + (confirmedData.mustPromotes || 0)) / confirmedData.fitrepCount * 100)
    : null;

  // Zone badge: find the DOR for current rank, compute zone status
  const zoneLabel = (() => {
    if (!confirmedData) return null;
    const rank = confirmedData.currentRank;
    const dorEntry = confirmedData.rankHistory?.find((r: RankDate) => r.rank === rank);
    if (!rank || !dorEntry) return null;
    const p = lookupPromo(rank, dorEntry.date);
    if (!p) return null;
    const zone = zoneStatus(rank, dorEntry.date);
    const nextRank = NEXT_RANK[rank.toUpperCase()] || '';
    if (zone === 'in-zone') return `In zone · FY${p.fy} ${nextRank}`;
    if (zone === 'below-zone') return `Below zone · FY${p.fy} ${nextRank}`;
    if (zone === 'above-zone') return `Above zone · ${nextRank}`;
    return null;
  })();

  const docStatus = {
    odc: documents.odc?.status === 'success',
    osr: documents.osr?.status === 'success',
    psr: documents.psr?.status === 'success',
  };

  return (
    <div className="min-h-screen" style={{ background: '#E8ECF1' }}>

      {/* ── Top navigation bar ── */}
      <div style={{ background: '#1B365D' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center h-14 gap-3">
            <div
              className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: '#0F2340' }}
            >
              <MCDevice size={20} />
            </div>
            <div>
              <div className="text-white font-medium text-sm leading-tight">Career Development Board</div>
              <div className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Navy Medical Corps
              </div>
            </div>
            <div className="flex-1" />
            {confirmedData && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{ background: '#FFC72C', color: '#1B365D' }}
                title={confirmedData.currentRank || 'MC'}
              >
                {confirmedData.currentRank?.substring(0, 2) || 'MC'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Profile strip (step 3+) ── */}
      {confirmedData && step >= 3 && (
        <div style={{ background: '#1B365D', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
            <div
              className="rounded flex-shrink-0"
              style={{ background: '#FFC72C', width: '4px', height: '52px' }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-white font-medium text-base leading-snug">
                {confirmedData.currentRank || 'MC Officer'}
                {confirmedData.designator ? ` · ${confirmedData.designator}` : ''}
              </div>
              <div className="text-sm truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {confirmedData.currentBillet || 'Medical Corps Officer'}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
              {zoneLabel && (
                <div
                  className="border text-xs font-medium px-3 py-1.5 rounded-sm whitespace-nowrap"
                  style={{ borderColor: '#FFC72C', background: 'rgba(255,199,44,0.15)', color: '#FFC72C' }}
                >
                  {zoneLabel}
                </div>
              )}
              {confirmedData.boardCertified !== null && confirmedData.boardCertified !== undefined && (
                <div
                  className="border text-xs font-medium px-3 py-1.5 rounded-sm whitespace-nowrap"
                  style={{ borderColor: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
                >
                  {confirmedData.boardCertified ? 'Board Certified' : 'Board Eligible'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Progress steps ── */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center h-14">
            {steps.map((s, index) => {
              const Icon = s.icon;
              const done = step > s.number;
              const active = step >= s.number;
              return (
                <div key={s.number} className="flex items-center flex-1">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 transition-all"
                      style={active
                        ? { background: '#1B365D', color: '#fff' }
                        : { background: '#F1F5F9', color: '#94A3B8' }
                      }
                    >
                      {done ? (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="hidden sm:block">
                      <div
                        className="text-sm font-semibold"
                        style={{ color: active ? '#1B365D' : '#94A3B8' }}
                      >
                        {s.name}
                      </div>
                      <div className="text-xs text-gray-400">{s.description}</div>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className="flex-1 h-px mx-4 rounded"
                      style={{ background: step > s.number ? '#1B365D' : '#E2E8F0' }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">

          {/* Metric summary strip — step 3 only */}
          {step === 3 && confirmedData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: '#E2E8F0' }}>
              <div className="bg-white px-5 py-4">
                <div className="text-2xl font-medium leading-tight" style={{ color: '#1B365D' }}>
                  {confirmedData.fitrepCount || 0}
                </div>
                <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide font-medium">FITREPs</div>
              </div>
              <div className="bg-white px-5 py-4">
                <div className="text-2xl font-medium leading-tight" style={{ color: '#1B365D' }}>
                  {epMpRate !== null ? `${epMpRate}%` : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide font-medium">EP + MP rate</div>
              </div>
              <div className="bg-white px-5 py-4">
                <div className="text-2xl font-medium leading-tight" style={{ color: '#FFC72C' }}>
                  {confirmedData.earlyPromotes || 0}
                </div>
                <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide font-medium">Early promotes</div>
              </div>
              <div className="bg-white px-5 py-4">
                <div className="text-2xl font-medium leading-tight" style={{ color: '#1B365D' }}>
                  {confirmedData.fitrepAverage ? confirmedData.fitrepAverage.toFixed(2) : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide font-medium">Trait avg</div>
              </div>
            </div>
          )}

          <div className="p-8">

            {/* Step 1: Upload & Parse */}
            {step === 1 && !showParser && (
              <>
                <DocumentUpload onDocumentsChange={handleDocumentsUploaded} />
                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => {
                      if (canProceedFromUpload) {
                        setShowParser(true);
                      } else {
                        setStep(2);
                      }
                    }}
                    disabled={!canProceedFromUpload}
                    className="px-6 py-3 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: canProceedFromUpload ? '#1B365D' : undefined }}
                  >
                    Continue
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                {!canProceedFromUpload && (
                  <p className="text-sm text-gray-500 text-right mt-2">
                    Upload at least one document to continue
                  </p>
                )}
              </>
            )}

            {step === 1 && showParser && (
              <DocumentParser
                uploadedDocuments={documents}
                onParsedDataAccepted={handleParsedDataAccepted}
                onSkip={handleSkipParser}
              />
            )}

            {/* Step 2: Verify Parsed Data */}
            {step === 2 && (
              <VerifyParsedData
                parsedData={parsedData}
                onDataConfirmed={handleDataConfirmed}
                onBack={() => {
                  setStep(1);
                  setShowParser(false);
                }}
              />
            )}

            {/* Step 3: Career Analysis */}
            {step === 3 && confirmedData && (
              <>
                <DashboardPanel
                  officerData={confirmedData}
                  docStatus={docStatus}
                  onSectionClick={(section) => {
                    if (section === 'checklist') setAnalysisTab('checklist');
                    if (section === 'analysis') setAnalysisTab('analysis');
                    // 'qa' — scroll down to ResourcesQA
                    if (section === 'qa') {
                      setTimeout(() => {
                        document.querySelector('[data-qa-section]')?.scrollIntoView({ behavior: 'smooth' });
                      }, 50);
                    }
                  }}
                />

                <div className="flex border-b border-gray-200 mb-6">
                  <button
                    onClick={() => setAnalysisTab('checklist')}
                    className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                      analysisTab === 'checklist'
                        ? 'border-b-2 text-[#1B365D]'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    style={analysisTab === 'checklist' ? { borderBottomColor: '#1B365D' } : {}}
                  >
                    CDB Checklist
                  </button>
                  <button
                    onClick={() => setAnalysisTab('analysis')}
                    className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                      analysisTab === 'analysis'
                        ? 'border-b-2 text-[#1B365D]'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    style={analysisTab === 'analysis' ? { borderBottomColor: '#1B365D' } : {}}
                  >
                    Record Analysis
                  </button>
                </div>

                {analysisTab === 'checklist' && <CDBChecklist officerData={confirmedData} />}
                {analysisTab === 'analysis' && <AnalysisResults officerData={getOfficerDataForAnalysis()!} />}

                <div className="mt-8 flex justify-between">
                  <button
                    onClick={() => setStep(2)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                  >
                    Back to Verify
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    className="px-6 py-3 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                    style={{ background: '#1B365D' }}
                  >
                    Generate AI Action Plan
                    <Sparkles className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}

            {/* Step 4: AI-Powered Action Plan */}
            {step === 4 && confirmedData && (
              <>
                <PersonalizedActionPlan officerData={confirmedData} />
                <div className="mt-8 flex justify-between">
                  <button
                    onClick={() => setStep(3)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                  >
                    Back to Analysis
                  </button>
                  <button
                    onClick={() => {
                      setStep(1);
                      setShowParser(false);
                      setParsedData({});
                      setConfirmedData(null);
                    }}
                    className="px-6 py-3 text-white rounded-lg font-semibold transition-colors"
                    style={{ background: '#1B365D' }}
                  >
                    Start New Analysis
                  </button>
                </div>
              </>
            )}

          </div>
        </div>

        {/* CDB Reference Q&A */}
        <div className="mt-6" data-qa-section>
          <ResourcesQA />
        </div>

        {/* Disclaimer */}
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Disclaimer:</strong> This tool provides general career development guidance
            based on typical Navy Medical Corps progression standards. AI recommendations are generated
            using uploaded reference documents. For official career counseling, consult with your
            detailer, commanding officer, or BUMED Career Development Division. Always verify course
            dates and requirements with official sources before registering.
          </p>
        </div>
      </div>
    </div>
  );
}
