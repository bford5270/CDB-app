import { useState } from 'react';
import { Anchor, ChevronRight, Library } from 'lucide-react';
import { DocumentUpload, type UploadedDocuments } from './components/DocumentUpload';
import { DocumentParser } from './components/DocumentParser';
import { RankHistoryForm, type RankHistoryData, type RankDate } from './components/RankHistoryForm';
import { ClearanceAndCertification, type ClearanceAndCertData } from './components/ClearanceAndCertification';
import { PSRAnalysis, type PSRData } from './components/PSRAnalysis';
import { AQDSelector } from './components/AQDSelector';
import { OfficerDataForm, type OfficerData } from './components/OfficerDataForm';
import { AnalysisResults } from './components/AnalysisResults';
import { ActionPlan } from './components/ActionPlan';
import { ReferenceDocumentManager } from './components/ReferenceDocumentManager';

export default function App() {
  const [step, setStep] = useState(1);
  const [showReferenceLibrary, setShowReferenceLibrary] = useState(false);
  const [documents, setDocuments] = useState<UploadedDocuments>({
    odc: null,
    osr: null,
    psr: null,
  });
  const [showParser, setShowParser] = useState(false);
  const [parsedRanks, setParsedRanks] = useState<RankDate[] | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [rankHistoryData, setRankHistoryData] = useState<RankHistoryData | null>(null);
  const [clearanceCertData, setClearanceCertData] = useState<ClearanceAndCertData | null>(null);
  const [psrData, setPsrData] = useState<PSRData | null>(null);
  const [selectedAQDs, setSelectedAQDs] = useState<string[]>([]);
  const [officerData, setOfficerData] = useState<OfficerData>({
    rankHistoryData: null,
    designator: '2300',
    currentBillet: '',
    educationLevel: 'MD',
    postGradEducation: '',
    deployments: 0,
    jointDuty: false,
    commandTour: false,
    specialQualifications: [],
    selectedAQDs: [],
    fitnessReportAverage: 0,
  });

  const canProceedToStep2 = documents.odc?.status === 'success' || documents.psr?.status === 'success' || documents.osr?.status === 'success';
  const canProceedToStep3 = rankHistoryData?.currentRank;
  const canProceedToStep4 = clearanceCertData?.clearanceLevel;
  const canProceedToStep6 = selectedAQDs.length >= 0; // AQDs are optional
  const canProceedToStep7 =
    officerData.rankHistoryData?.currentRank &&
    officerData.fitnessReportAverage > 0;

  const handleDocumentsUploaded = (docs: UploadedDocuments) => {
    setDocuments(docs);
    // Don't automatically show parser - wait for user to click Continue
  };

  const handleParsedDataAccepted = (data: {
    rankHistory: RankDate[];
    boardCertified: boolean | null;
    hasUndergrad: boolean;
    hasMedicalSchool: boolean;
    aqds: string[];
    warnings: string[];
    psrIssues: string[];
  }) => {
    setParsedRanks(data.rankHistory);
    setParseWarnings([...data.warnings, ...data.psrIssues]); // Combine warnings and PSR issues
    
    // Pre-populate officer data with parsed information
    setOfficerData(prev => ({
      ...prev,
      boardCertified: data.boardCertified ?? prev.boardCertified,
      hasUndergrad: data.hasUndergrad,
      hasMedicalSchool: data.hasMedicalSchool,
    }));
    
    // Pre-populate AQDs
    if (data.aqds.length > 0) {
      setSelectedAQDs(data.aqds);
    }
    
    setStep(2);
  };

  const handleSkipParser = () => {
    setParsedRanks(null);
    setParseWarnings([]);
    setStep(2);
  };

  const handleAQDsSelected = (aqds: string[]) => {
    setSelectedAQDs(aqds);
  };

  const steps = [
    { number: 1, name: 'Upload Documents', description: 'ODC, OSR, PSR' },
    { number: 2, name: 'Rank & Board Eligibility', description: 'Promotion timeline' },
    { number: 3, name: 'Clearance & Certification', description: 'Security & Board Cert (J/K)' },
    { number: 4, name: 'PSR Review', description: 'Fitness report analysis' },
    { number: 5, name: 'Current AQDs', description: 'Qualifications held' },
    { number: 6, name: 'Additional Data', description: 'Experience & education' },
    { number: 7, name: 'Analysis', description: 'Career assessment' },
    { number: 8, name: 'Action Plan', description: 'Courses & AQD recommendations' },
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

      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between overflow-x-auto">
            {steps.map((s, index) => (
              <div key={s.number} className="flex items-center flex-1 min-w-max">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                      step >= s.number
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {s.number}
                  </div>
                  <div>
                    <div
                      className={`font-semibold text-sm ${
                        step >= s.number ? 'text-blue-900' : 'text-gray-500'
                      }`}
                    >
                      {s.name}
                    </div>
                    <div className="text-xs text-gray-500">{s.description}</div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <ChevronRight className="w-5 h-5 text-gray-400 mx-2 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {step === 1 && !showParser && (
            <>
              <DocumentUpload onDocumentsChange={handleDocumentsUploaded} />
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => {
                    if (documents.odc?.status === 'success' || documents.osr?.status === 'success') {
                      setShowParser(true);
                    } else {
                      setStep(2);
                    }
                  }}
                  disabled={!canProceedToStep2}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  Continue
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              {!canProceedToStep2 && (
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

          {step === 2 && (
            <>
              <RankHistoryForm 
                onDataChange={setRankHistoryData} 
                initialRanks={parsedRanks || undefined}
              />
              {parseWarnings.length > 0 && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-yellow-900 mb-2">⚠️ Document Parsing Notes:</h4>
                  <ul className="space-y-1">
                    {parseWarnings.map((warning, idx) => (
                      <li key={idx} className="text-xs text-yellow-800">
                        • {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => {
                    setShowParser(false);
                    setStep(1);
                  }}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!canProceedToStep3}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  Continue to Clearance & Certification
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              {!canProceedToStep3 && (
                <p className="text-sm text-gray-500 text-right mt-2">
                  Enter at least one rank with date to continue
                </p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <ClearanceAndCertification onDataChange={setClearanceCertData} />
              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={!canProceedToStep4}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  Continue to PSR Review
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <PSRAnalysis psrFile={documents.psr} onAnalysisComplete={setPsrData} />
              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setStep(3)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  Continue to AQDs
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <AQDSelector onAQDsChange={handleAQDsSelected} />
              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setStep(4)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(6)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  Continue to Additional Data
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <OfficerDataForm 
                onDataChange={(data) => setOfficerData({ ...data, selectedAQDs })} 
                rankHistoryData={rankHistoryData} 
              />
              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setStep(5)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(7)}
                  disabled={!canProceedToStep7}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  Analyze Record
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              {!canProceedToStep7 && (
                <p className="text-sm text-gray-500 text-right mt-2">
                  Complete all required fields to continue
                </p>
              )}
            </>
          )}

          {step === 7 && (
            <>
              <AnalysisResults officerData={officerData} />
              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setStep(6)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(8)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  View Action Plan
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </>
          )}

          {step === 8 && (
            <>
              <ActionPlan officerData={officerData} />
              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setStep(7)}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Back to Analysis
                </button>
                <button
                  onClick={() => {
                    setStep(1);
                    setShowParser(false);
                    setParsedRanks(null);
                  }}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Start New Analysis
                </button>
              </div>
            </>
          )}
        </div>

        {/* Reference Library */}
        <div className="mt-6 bg-white border border-gray-200 rounded-lg shadow-md">
          <button
            onClick={() => setShowReferenceLibrary(!showReferenceLibrary)}
            className="w-full px-6 py-4 text-left font-semibold text-gray-900 hover:bg-gray-50 transition-colors flex items-center justify-between rounded-lg"
          >
            <div className="flex items-center gap-3">
              <Library className="w-6 h-6 text-blue-600" />
              <div>
                <h3 className="text-lg font-bold">Reference Document Library</h3>
                <p className="text-sm text-gray-600 font-normal">Upload and manage career guidance documents (MILPERSMAN, AQD guides, etc.)</p>
              </div>
            </div>
            <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${showReferenceLibrary ? 'rotate-90' : ''}`} />
          </button>
          {showReferenceLibrary && (
            <div className="px-6 py-6 border-t border-gray-200">
              <ReferenceDocumentManager />
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Disclaimer:</strong> This tool provides general career development guidance
            based on typical Navy Medical Corps progression standards. For official career
            counseling, consult with your detailer, commanding officer, or BUMED Career Development
            Division. This analysis is for informational purposes only and does not guarantee
            promotion or selection board outcomes.
          </p>
        </div>
      </div>
    </div>
  );
}