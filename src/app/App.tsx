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
  const [showDocSwap, setShowDocSwap] = useState(false);
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
                Navy Medical Corps{confirmedData?.designator ? ` · ${confirmedData.designator}` : ''}
              </div>
            </div>
            <div className="flex-1" />
            {step >= 3 && (
              <button
                onClick={() => setShowDocSwap(true)}
                className="text-xs font-semibold px-3 py-1.5 rounded mr-3 flex-shrink-0 transition-opacity hover:opacity-80"
                style={{ background: '#FFC72C', color: '#1B365D' }}
              >
                Upload docs
              </button>
            )}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
              style={{ background: '#FFC72C', color: '#1B365D' }}
              title={confirmedData?.currentRank || 'MC'}
            >
              {confirmedData?.currentRank?.substring(0, 2) || 'MC'}
            </div>
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

      {/* ── Progress stepper ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center" style={{ height: 52 }}>
            {steps.map((s, index) => {
              const Icon = s.icon;
              const done = step > s.number;
              const active = step === s.number;
              const past = step > s.number;
              return (
                <div key={s.number} className="flex items-center flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Step indicator */}
                    <div
                      className="flex items-center justify-center flex-shrink-0 transition-all"
                      style={{
                        width: 26, height: 26,
                        borderRadius: 4,
                        background: past || active ? '#1B365D' : '#F1F5F9',
                        color: past || active ? '#fff' : '#CBD5E1',
                        boxShadow: active ? '0 0 0 3px rgba(27,54,93,0.15)' : 'none',
                      }}
                    >
                      {done ? (
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <polyline points="1.5,5.5 4.5,8.5 9.5,2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <Icon style={{ width: 13, height: 13 }} />
                      )}
                    </div>
                    {/* Labels */}
                    <div className="hidden sm:block min-w-0">
                      <div
                        className="text-xs font-semibold truncate"
                        style={{ color: active ? '#1B365D' : past ? '#64748B' : '#CBD5E1' }}
                      >
                        {s.name}
                      </div>
                      <div className="text-xs truncate" style={{ color: active ? '#64748B' : '#CBD5E1', fontSize: 10 }}>
                        {s.description}
                      </div>
                    </div>
                  </div>
                  {/* Connector */}
                  {index < steps.length - 1 && (
                    <div
                      className="flex-1 mx-3"
                      style={{ height: 1, background: step > s.number ? '#1B365D' : '#E2E8F0', minWidth: 8 }}
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
        <div
          className="overflow-hidden"
          style={{
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 2px 16px rgba(0,0,0,.10), 0 0 0 1px rgba(0,0,0,.06)',
          }}
        >

          {/* ── Dark metric strip (step 3) ── */}
          {step === 3 && confirmedData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ background: '#1B365D' }}>
              {[
                { val: confirmedData.fitrepCount || 0, label: 'FITREPs', color: '#E8ECF3' },
                { val: epMpRate !== null ? `${epMpRate}%` : '—', label: 'EP + MP Rate', color: '#E8ECF3' },
                { val: confirmedData.earlyPromotes || 0, label: 'Early Promotes', color: '#FFC72C' },
                { val: confirmedData.fitrepAverage ? confirmedData.fitrepAverage.toFixed(2) : '—', label: 'Trait Avg', color: '#E8ECF3' },
              ].map(({ val, label, color }) => (
                <div key={label} className="px-5 py-5" style={{ background: '#122745', borderLeft: '3px solid #FFC72C' }}>
                  <div style={{ fontSize: 28, fontWeight: 500, color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                    {val}
                  </div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 500 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Step 1a: Upload (hero + form) ── */}
          {step === 1 && !showParser && (
            <>
              {/* Navy hero */}
              <div style={{ background: '#1B365D', padding: '36px 40px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{
                    width: 68, height: 68, borderRadius: '50%',
                    background: 'rgba(15,35,64,0.55)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <MCDevice size={38} />
                  </div>
                  <div>
                    <div style={{ color: '#fff', fontSize: 22, fontWeight: 500, lineHeight: 1.3 }}>
                      Career Development Board
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: 4 }}>
                      Navy Medical Corps
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,199,44,0.25)', paddingTop: 16 }}>
                  <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.65, maxWidth: 560 }}>
                    Upload your ODC, OSR, and PSR to receive AI-assisted career analysis,
                    promotion board readiness scoring, and a personalized action plan.
                  </p>
                </div>
              </div>

              {/* Upload form */}
              <div className="p-6">
                <DocumentUpload onDocumentsChange={handleDocumentsUploaded} />
                <div className="mt-8 flex items-center justify-between">
                  {!canProceedFromUpload && (
                    <p className="text-sm text-gray-400">Upload at least one document to continue</p>
                  )}
                  <div className="ml-auto">
                    <button
                      onClick={() => { if (canProceedFromUpload) setShowParser(true); else setStep(2); }}
                      disabled={!canProceedFromUpload}
                      className="flex items-center gap-2 px-7 py-3 text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: '#1B365D',
                        borderRadius: 4,
                        boxShadow: canProceedFromUpload ? '0 2px 8px rgba(27,54,93,0.35)' : 'none',
                      }}
                    >
                      Continue
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Step 1b: Parser ── */}
          {step === 1 && showParser && (
            <div className="p-6">
              <DocumentParser
                uploadedDocuments={documents}
                onParsedDataAccepted={handleParsedDataAccepted}
                onSkip={handleSkipParser}
              />
            </div>
          )}

          {/* ── Steps 2–4 ── */}
          {step >= 2 && (
            <div className="p-6">

              {/* Step 2: Verify Parsed Data */}
              {step === 2 && (
                <VerifyParsedData
                  parsedData={parsedData}
                  onDataConfirmed={handleDataConfirmed}
                  onBack={() => { setStep(1); setShowParser(false); }}
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
                      if (section === 'qa') {
                        setTimeout(() => {
                          document.querySelector('[data-qa-section]')?.scrollIntoView({ behavior: 'smooth' });
                        }, 50);
                      }
                    }}
                  />

                  {/* Tab bar */}
                  <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
                    {(['checklist', 'analysis'] as const).map((tab) => {
                      const label = tab === 'checklist' ? 'CDB Checklist' : 'Record Analysis';
                      const active = analysisTab === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => setAnalysisTab(tab)}
                          className="relative px-5 py-3 text-sm font-medium transition-colors"
                          style={{ color: active ? '#1B365D' : '#94A3B8' }}
                        >
                          {label}
                          {active && (
                            <span
                              className="absolute bottom-0 left-0 right-0 h-0.5"
                              style={{ background: '#FFC72C' }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {analysisTab === 'checklist' && <CDBChecklist officerData={confirmedData} />}
                  {analysisTab === 'analysis' && <AnalysisResults officerData={getOfficerDataForAnalysis()!} />}

                  <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between">
                    <button
                      onClick={() => setStep(2)}
                      className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
                      style={{ borderRadius: 4 }}
                    >
                      ← Back to Verify
                    </button>
                    <button
                      onClick={() => setStep(4)}
                      className="flex items-center gap-2 px-7 py-2.5 text-sm font-semibold text-white transition-all"
                      style={{ background: '#1B365D', borderRadius: 4, boxShadow: '0 2px 8px rgba(27,54,93,0.35)' }}
                    >
                      Generate AI Action Plan
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}

              {/* Step 4: AI-Powered Action Plan */}
              {step === 4 && confirmedData && (
                <>
                  <PersonalizedActionPlan officerData={confirmedData} />
                  <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between">
                    <button
                      onClick={() => setStep(3)}
                      className="px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
                      style={{ borderRadius: 4 }}
                    >
                      ← Back to Analysis
                    </button>
                    <button
                      onClick={() => { setStep(1); setShowParser(false); setParsedData({}); setConfirmedData(null); }}
                      className="px-7 py-2.5 text-sm font-semibold text-white transition-all"
                      style={{ background: '#1B365D', borderRadius: 4, boxShadow: '0 2px 8px rgba(27,54,93,0.35)' }}
                    >
                      Start New Analysis
                    </button>
                  </div>
                </>
              )}

            </div>
          )}
        </div>

        {/* CDB Reference Q&A */}
        <div className="mt-6" data-qa-section>
          <ResourcesQA />
        </div>

        {/* Disclaimer */}
        <div className="mt-6 px-5 py-4" style={{ borderRadius: 6, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>Advisory use only.</span>{' '}
            This tool provides career development guidance based on Navy Medical Corps progression standards and uploaded
            reference documents. It is not an official Navy system. For authoritative counseling, consult your detailer,
            commanding officer, or BUMED Career Development Division. Verify all course dates and requirements with
            official sources before registering.
          </p>
        </div>
      </div>
    </div>
  );
}
