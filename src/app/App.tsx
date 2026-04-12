import { useState, useEffect } from 'react';
import { Anchor, ChevronRight, Upload, CheckCircle, TrendingUp, Sparkles, ShieldAlert, Printer } from 'lucide-react';
import { DocumentUpload, type UploadedDocuments } from './components/DocumentUpload';
import { DocumentParser } from './components/DocumentParser';
import { VerifyParsedData, type ParsedOfficerData } from './components/VerifyParsedData';
import { AnalysisResults } from './components/AnalysisResults';
import { PersonalizedActionPlan } from './components/PersonalizedActionPlan';
import { PrintableSummary } from './components/PrintableSummary';
import ResourcesQA from './components/ResourcesQA';
import type { RankDate } from './components/RankHistoryForm';

export default function App() {
  const [step, setStep] = useState(1);
  const [showPrintSummary, setShowPrintSummary] = useState(false);
  const [piiConsented, setPiiConsented] = useState(() =>
    sessionStorage.getItem('pii-consent') === 'true'
  );

  // Scroll to top on initial load
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
    certificationCode?: 'J' | 'K' | 'T' | null;
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
  }) => {
    // Determine current rank from rank history
    // Only consider promotions where the date of rank is on or before today
    let currentRank = '';
    if (data.rankHistory.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const validRanks = data.rankHistory
        .filter(entry => entry.date <= today)
        .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first

      if (validRanks.length > 0) {
        currentRank = validRanks[0].rank;
      }
    }

    // Convert parsed data to unified format
    setParsedData({
      rankHistory: data.rankHistory,
      currentRank,
      clearanceLevel: data.clearanceLevel || '',
      clearanceDate: data.clearanceDate || '',
      boardCertified: data.boardCertified,
      certificationCode: data.certificationCode || (data.boardCertified === true ? 'K' : data.boardCertified === false ? 'J' : null) as 'J' | 'K' | 'T' | null,
      aqds: data.aqds,
      fitrepAverage: data.fitrepAverage || 0,
      fitrepCount: data.fitrepCount || 0,
      earlyPromotes: data.earlyPromotes || 0,
      mustPromotes: data.mustPromotes || 0,
      promotables: data.promotables || 0,
      psrTrend: data.psrTrend,
      belowRSAverageCount: data.belowRSAverageCount,
      belowRSAveragePercentage: data.belowRSAveragePercentage,
      fitreps: data.fitreps,
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

  const steps = [
    { number: 1, name: 'Upload & Parse', description: 'ODC, OSR, PSR', icon: Upload },
    { number: 2, name: 'Verify Record', description: 'Confirm parsed data', icon: CheckCircle },
    { number: 3, name: 'Career Analysis', description: 'Board readiness', icon: TrendingUp },
    { number: 4, name: 'Action Plan', description: 'AI recommendations', icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <Anchor className="w-8 h-8" />
            <div>
              <h1 className="text-3xl font-bold">Navy Medical Corps Career Development Board</h1>
              <p className="text-blue-100 mt-1">
                Virtual Career Assessment & Development Planning System
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps - Consolidated 4 steps */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {steps.map((s, index) => {
              const Icon = s.icon;
              return (
                <div key={s.number} className="flex items-center flex-1">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                        step >= s.number
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div
                        className={`font-semibold ${
                          step >= s.number ? 'text-blue-900' : 'text-gray-400'
                        }`}
                      >
                        {s.name}
                      </div>
                      <div className="text-xs text-gray-500">{s.description}</div>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-1 mx-4 rounded ${
                      step > s.number ? 'bg-blue-600' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* PII Consent Banner */}
      {!piiConsented && (
        <div className="bg-amber-50 border-b-2 border-amber-400">
          <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <ShieldAlert className="w-8 h-8 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900">Data Privacy Notice — Please Read Before Uploading</p>
              <p className="text-sm text-amber-800 mt-1">
                Documents you upload (ODC, OSR, PSR) contain <strong>Personally Identifiable Information (PII)</strong> including your
                name, performance scores, station assignments, and reporting senior details. This data is sent to{' '}
                <strong>Anthropic's Claude API</strong> for AI processing. Anthropic does not use API data for model training,
                but data does leave this environment and transit Anthropic's servers.{' '}
                <strong>Do not upload classified materials.</strong> By proceeding you acknowledge this.
              </p>
            </div>
            <button
              onClick={() => {
                sessionStorage.setItem('pii-consent', 'true');
                setPiiConsented(true);
              }}
              className="flex-shrink-0 px-5 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 text-sm"
            >
              I Understand, Proceed
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Step 1: Upload & Parse */}
          {step === 1 && !showParser && (
            <>
              <DocumentUpload onDocumentsChange={handleDocumentsUploaded} />
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => {
                    // Show AI parser for any uploaded document
                    if (canProceedFromUpload) {
                      setShowParser(true);
                    } else {
                      setStep(2);
                    }
                  }}
                  disabled={!canProceedFromUpload}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
              <AnalysisResults officerData={confirmedData} />
              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Back to Verify
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowPrintSummary(true)}
                    className="px-5 py-3 border border-blue-300 text-blue-700 rounded-lg font-semibold hover:bg-blue-50 transition-colors flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Print CDB Sheet
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    Generate AI Action Plan
                    <Sparkles className="w-5 h-5" />
                  </button>
                </div>
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
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowPrintSummary(true)}
                    className="px-5 py-3 border border-blue-300 text-blue-700 rounded-lg font-semibold hover:bg-blue-50 transition-colors flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Print CDB Sheet
                  </button>
                  <button
                    onClick={() => {
                      setStep(1);
                      setShowParser(false);
                      setParsedData({});
                      setConfirmedData(null);
                    }}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                  >
                    Start New Analysis
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* CDB Reference Q&A - Always visible */}
        <div className="mt-6">
          <ResourcesQA officerData={confirmedData ?? parsedData} />
        </div>

        {/* Print Summary Modal */}
        {showPrintSummary && confirmedData && (
          <PrintableSummary
            officerData={confirmedData}
            onClose={() => setShowPrintSummary(false)}
          />
        )}

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
