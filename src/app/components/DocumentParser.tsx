import { useState, useEffect } from 'react';
import { FileSearch, CheckCircle, AlertTriangle, Edit2, ChevronDown, ChevronUp, Award, BookOpen, Shield } from 'lucide-react';
import type { UploadedDocuments } from './DocumentUpload';
import { 
  parseODC, 
  parseOSR, 
  parsePSR,
  mergeOfficerData,
  determineCurrentRank,
  type ParsedOfficerData,
  type RankDate,
  type AQDEntry,
  type PSRAnalysisResult
} from '../utils/parsingUtils';

export interface ParsedData {
  rankHistory: RankDate[];
  boardCertified: boolean | null;
  hasUndergrad: boolean;
  hasMedicalSchool: boolean;
  aqds: string[];
  warnings: string[];
  psrIssues: string[];
  currentRank: string;
  yearGroup: string;
  designator: string;
  subspecialtyCode: string;
  education: ParsedOfficerData['education'];
  courses: ParsedOfficerData['courses'];
  aqdEntries: AQDEntry[];
  securityClearance: ParsedOfficerData['securityClearance'];
  currentStation: string;
  currentBillet: string;
  psrAnalysis: PSRAnalysisResult | null;
}

interface DocumentParserProps {
  uploadedDocuments: UploadedDocuments;
  onParsedDataAccepted: (data: ParsedData) => void;
  onSkip: () => void;
}

export function DocumentParser({ uploadedDocuments, onParsedDataAccepted, onSkip }: DocumentParserProps) {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editableRanks, setEditableRanks] = useState<RankDate[]>([]);
  const [parsingComplete, setParsingComplete] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [showAQDs, setShowAQDs] = useState(false);
  const [showPSRDetails, setShowPSRDetails] = useState(false);

  useEffect(() => {
    const parseDocuments = async () => {
      console.log('=== Starting document parsing ===');
      
      const odcText = uploadedDocuments.odc?.status === 'success' ? uploadedDocuments.odc.text : '';
      const osrText = uploadedDocuments.osr?.status === 'success' ? uploadedDocuments.osr.text : '';
      const psrText = uploadedDocuments.psr?.status === 'success' ? uploadedDocuments.psr.text : '';

      if (!odcText && !osrText && !psrText) {
        console.log('No documents to parse');
        return;
      }

      const odcData = odcText ? parseODC(odcText) : null;
      const osrData = osrText ? parseOSR(osrText) : null;
      const psrAnalysis = psrText ? parsePSR(psrText) : null;

      const merged = mergeOfficerData(odcData, osrData);
      const warnings: string[] = [...merged.warnings];

      if (merged.rankHistory.length === 0) {
        warnings.push('Could not extract rank history - please enter manually');
      }
      if (merged.boardCertified === null) {
        warnings.push('Board certification status not detected');
      }

      const psrIssues: string[] = psrAnalysis?.issues || [];

      const data: ParsedData = {
        rankHistory: merged.rankHistory,
        boardCertified: merged.boardCertified,
        hasUndergrad: !!merged.education.undergrad,
        hasMedicalSchool: !!merged.education.medical,
        aqds: merged.aqds.map(a => a.code),
        warnings,
        psrIssues,
        currentRank: merged.currentRank,
        yearGroup: merged.yearGroup,
        designator: merged.designator,
        subspecialtyCode: merged.subspecialtyCode,
        education: merged.education,
        courses: merged.courses,
        aqdEntries: merged.aqds,
        securityClearance: merged.securityClearance,
        currentStation: merged.currentStation,
        currentBillet: merged.currentBillet,
        psrAnalysis,
      };

      console.log('Parsed data:', data);
      setParsedData(data);
      setEditableRanks(data.rankHistory.length > 0 ? [...data.rankHistory] : [{ rank: '', dateOfRank: '' }]);
      setParsingComplete(true);
    };

    parseDocuments();
  }, [uploadedDocuments]);

  const handleAccept = () => {
    if (parsedData) {
      const finalData = {
        ...parsedData,
        rankHistory: editableRanks.filter(r => r.rank && r.dateOfRank),
        currentRank: determineCurrentRank(editableRanks.filter(r => r.rank && r.dateOfRank)),
      };
      onParsedDataAccepted(finalData);
    }
  };

  const handleRankChange = (index: number, field: 'rank' | 'dateOfRank', value: string) => {
    const updated = [...editableRanks];
    updated[index] = { ...updated[index], [field]: value };
    setEditableRanks(updated);
  };

  const addRankEntry = () => {
    setEditableRanks([...editableRanks, { rank: '', dateOfRank: '' }]);
  };

  const removeRankEntry = (index: number) => {
    if (editableRanks.length > 1) {
      setEditableRanks(editableRanks.filter((_, i) => i !== index));
    }
  };

  const hasDocuments = Object.values(uploadedDocuments).some(d => d?.status === 'success');

  if (!hasDocuments) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-yellow-900 mb-2">No Documents Uploaded</h3>
            <p className="text-sm text-yellow-800">
              Please upload at least one document (ODC, OSR, or PSR) in the previous step, or skip to enter information manually.
            </p>
            <button
              onClick={onSkip}
              className="mt-3 px-4 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
            >
              Enter Manually
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!parsingComplete || !parsedData) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <FileSearch className="w-12 h-12 text-blue-600 animate-pulse mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">Analyzing Documents...</h3>
        <p className="text-sm text-gray-600 mt-1">Extracting rank history, AQDs, and career data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Document Analysis Results</h2>
        <p className="text-gray-600">
          Review the extracted data below. You can edit any information that needs correction.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Current Rank</div>
          <div className="text-2xl font-bold text-blue-600">{parsedData.currentRank || 'Unknown'}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Year Group</div>
          <div className="text-2xl font-bold text-blue-600">{parsedData.yearGroup || 'N/A'}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Board Certified</div>
          <div className={`text-2xl font-bold ${parsedData.boardCertified ? 'text-green-600' : parsedData.boardCertified === false ? 'text-red-600' : 'text-gray-400'}`}>
            {parsedData.boardCertified === true ? 'Yes' : parsedData.boardCertified === false ? 'No' : 'Unknown'}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">AQDs Found</div>
          <div className="text-2xl font-bold text-blue-600">{parsedData.aqdEntries.length}</div>
        </div>
      </div>

      {/* Warnings */}
      {parsedData.warnings.length > 0 && (
        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
          <h4 className="text-sm font-semibold text-yellow-900 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Please Review
          </h4>
          <ul className="space-y-1">
            {parsedData.warnings.map((warning, idx) => (
              <li key={idx} className="text-xs text-yellow-800">• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* PSR Issues */}
      {parsedData.psrIssues.length > 0 && (
        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
          <h4 className="text-sm font-semibold text-red-900 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            FITREP Analysis Issues
          </h4>
          <ul className="space-y-1">
            {parsedData.psrIssues.map((issue, idx) => (
              <li key={idx} className="text-xs text-red-800">{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Rank History Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-blue-600" />
            Rank Progression
          </h3>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
          >
            <Edit2 className="w-4 h-4" />
            {isEditing ? 'Done Editing' : 'Edit Ranks'}
          </button>
        </div>

        {isEditing ? (
          <div className="space-y-3">
            {editableRanks.map((entry, index) => (
              <div key={index} className="flex gap-3 items-center">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rank</label>
                    <select
                      value={entry.rank}
                      onChange={(e) => handleRankChange(index, 'rank', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Rank</option>
                      <option value="ENS">ENS</option>
                      <option value="LTJG">LTJG</option>
                      <option value="LT">LT</option>
                      <option value="LCDR">LCDR</option>
                      <option value="CDR">CDR</option>
                      <option value="CAPT">CAPT</option>
                      <option value="RDML">RDML</option>
                      <option value="RADM">RADM</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of Rank</label>
                    <input
                      type="date"
                      value={entry.dateOfRank}
                      onChange={(e) => handleRankChange(index, 'dateOfRank', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {editableRanks.length > 1 && (
                  <button
                    onClick={() => removeRankEntry(index)}
                    className="mt-6 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button onClick={addRankEntry} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              + Add Another Rank
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {editableRanks.filter(r => r.rank && r.dateOfRank).map((entry, index) => {
              const [year, month, day] = entry.dateOfRank.split('-');
              const displayDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              const isCurrentRank = entry.rank === parsedData.currentRank;
              
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between py-2 px-3 rounded-md ${isCurrentRank ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}
                >
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-gray-900 w-16">{entry.rank}</span>
                    <span className="text-gray-600">→</span>
                    <span className="text-gray-700">
                      {displayDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                  {isCurrentRank && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                      Current
                    </span>
                  )}
                </div>
              );
            })}
            {editableRanks.filter(r => r.rank && r.dateOfRank).length === 0 && (
              <p className="text-sm text-gray-500 italic">No rank history detected. Click "Edit Ranks" to add.</p>
            )}
          </div>
        )}
      </div>

      {/* AQDs Section */}
      {parsedData.aqdEntries.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <button
            onClick={() => setShowAQDs(!showAQDs)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
          >
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              Additional Qualification Designators ({parsedData.aqdEntries.length})
            </h3>
            {showAQDs ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          {showAQDs && (
            <div className="px-4 pb-4">
              <div className="grid gap-2">
                {parsedData.aqdEntries.map((aqd, idx) => (
                  <div key={idx} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-md">
                    <span className="font-mono font-semibold text-blue-600 w-12">{aqd.code}</span>
                    <span className="text-gray-700">{aqd.title}</span>
                    {aqd.year && <span className="text-sm text-gray-500">({aqd.year})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Security Clearance */}
      {parsedData.securityClearance && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-blue-600" />
            Security Clearance
          </h3>
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              parsedData.securityClearance.level === 'TOP SECRET' 
                ? 'bg-purple-100 text-purple-800' 
                : 'bg-green-100 text-green-800'
            }`}>
              {parsedData.securityClearance.level}
            </span>
            <span className="text-sm text-gray-600">
              Investigation Year: {parsedData.securityClearance.investigationYear}
            </span>
          </div>
        </div>
      )}

      {/* PSR Analysis Summary */}
      {parsedData.psrAnalysis && parsedData.psrAnalysis.fitreps.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <button
            onClick={() => setShowPSRDetails(!showPSRDetails)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
          >
            <h3 className="font-semibold text-gray-900">
              FITREP Analysis ({parsedData.psrAnalysis.summary.totalFitreps} reports)
            </h3>
            {showPSRDetails ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          {showPSRDetails && (
            <div className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{parsedData.psrAnalysis.summary.epCount}</div>
                  <div className="text-xs text-gray-600">Early Promote</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{parsedData.psrAnalysis.summary.mpCount}</div>
                  <div className="text-xs text-gray-600">Must Promote</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{parsedData.psrAnalysis.summary.pCount}</div>
                  <div className="text-xs text-gray-600">Promotable</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">
                    {parsedData.psrAnalysis.summary.averageIndividual.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-600">Avg Score</div>
                </div>
              </div>
              <div className={`text-sm px-3 py-2 rounded-md ${
                parsedData.psrAnalysis.summary.trend === 'improving' ? 'bg-green-50 text-green-800' :
                parsedData.psrAnalysis.summary.trend === 'declining' ? 'bg-red-50 text-red-800' :
                'bg-gray-50 text-gray-800'
              }`}>
                Trend: {parsedData.psrAnalysis.summary.trend.charAt(0).toUpperCase() + parsedData.psrAnalysis.summary.trend.slice(1)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleAccept}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          Accept and Continue
        </button>
        <button
          onClick={onSkip}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50"
        >
          Enter Manually
        </button>
      </div>

      {/* Debug Panel */}
      <div className="bg-gray-100 border border-gray-300 rounded-lg">
        <button
          onClick={() => setShowDebugInfo(!showDebugInfo)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-200 rounded-lg"
        >
          <span className="text-sm font-semibold text-gray-700">🔍 Debug Info</span>
          <span className="text-gray-500 text-sm">{showDebugInfo ? '▼' : '▶'}</span>
        </button>
        
        {showDebugInfo && (
          <div className="px-4 pb-4 space-y-3">
            {uploadedDocuments.odc?.status === 'success' && (
              <div className="bg-white rounded p-3 border">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">ODC Text (first 2000 chars):</h4>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded max-h-64 overflow-auto">
                  {uploadedDocuments.odc.text.substring(0, 2000)}
                </pre>
              </div>
            )}
            {uploadedDocuments.osr?.status === 'success' && (
              <div className="bg-white rounded p-3 border">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">OSR Text (first 2000 chars):</h4>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded max-h-64 overflow-auto">
                  {uploadedDocuments.osr.text.substring(0, 2000)}
                </pre>
              </div>
            )}
            {uploadedDocuments.psr?.status === 'success' && (
              <div className="bg-white rounded p-3 border">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">PSR Text (first 2000 chars):</h4>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded max-h-64 overflow-auto">
                  {uploadedDocuments.psr.text.substring(0, 2000)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
