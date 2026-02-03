import { useState, useEffect } from 'react';
import { FileSearch, CheckCircle, AlertTriangle, Edit2, ChevronDown, ChevronUp, Award, BookOpen, Shield, FileText } from 'lucide-react';
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
  // PSR summary fields for VerifyParsedData
  fitrepAverage: number;
  fitrepCount: number;
  earlyPromotes: number;
  mustPromotes: number;
  promotables: number;
  clearanceLevel: 'Secret' | 'Top Secret' | 'None' | '';
  clearanceDate: string;
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
  const [showPSRDetails, setShowPSRDetails] = useState(true); // Default to expanded

  useEffect(() => {
    const parseDocuments = async () => {
      console.log('=== Starting document parsing ===');
      
      const odcText = uploadedDocuments.odc?.status === 'success' ? uploadedDocuments.odc.text : '';
      const osrText = uploadedDocuments.osr?.status === 'success' ? uploadedDocuments.osr.text : '';
      const psrText = uploadedDocuments.psr?.status === 'success' ? uploadedDocuments.psr.text : '';

      console.log('ODC text length:', odcText.length);
      console.log('OSR text length:', osrText.length);
      console.log('PSR text length:', psrText.length);

      if (!odcText && !osrText && !psrText) {
        console.log('No documents to parse');
        return;
      }

      // Parse each document
      const odcData = odcText ? parseODC(odcText) : null;
      const osrData = osrText ? parseOSR(osrText) : null;
      const psrAnalysis = psrText ? parsePSR(psrText) : null;

      console.log('ODC parsed:', odcData);
      console.log('OSR parsed:', osrData);
      console.log('PSR parsed:', psrAnalysis);

      // Merge ODC and OSR data
      const merged = mergeOfficerData(odcData, osrData);
      const warnings: string[] = [...merged.warnings];

      if (merged.rankHistory.length === 0) {
        warnings.push('Could not extract rank history - please enter manually');
      }
      if (merged.boardCertified === null) {
        warnings.push('Board certification status not detected');
      }
      if (!merged.securityClearance) {
        warnings.push('Security clearance not detected from blocks 92/93');
      }

      const psrIssues: string[] = psrAnalysis?.issues || [];

      // Calculate PSR summary values
      const psrSummary = psrAnalysis?.summary;

      // Determine clearance level
      let clearanceLevel: 'Secret' | 'Top Secret' | 'None' | '' = '';
      if (merged.securityClearance?.level) {
        if (merged.securityClearance.level.includes('Top Secret')) {
          clearanceLevel = 'Top Secret';
        } else if (merged.securityClearance.level.includes('Secret')) {
          clearanceLevel = 'Secret';
        }
      }

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
        // PSR summary for VerifyParsedData
        fitrepAverage: psrSummary?.averageIndividual || 0,
        fitrepCount: psrSummary?.totalFitreps || 0,
        earlyPromotes: psrSummary?.epCount || 0,
        mustPromotes: psrSummary?.mpCount || 0,
        promotables: psrSummary?.pCount || 0,
        clearanceLevel,
        clearanceDate: merged.securityClearance?.grantedDate || merged.securityClearance?.investigationDate || '',
      };

      console.log('Final parsed data:', data);
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
        <p className="text-sm text-gray-600 mt-1">Extracting rank history, AQDs, FITREPs, and career data</p>
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
      <div className="grid md:grid-cols-5 gap-4">
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
            {parsedData.boardCertified === true ? 'Yes (K)' : parsedData.boardCertified === false ? 'No (J)' : 'Unknown'}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">AQDs Found</div>
          <div className="text-2xl font-bold text-blue-600">{parsedData.aqdEntries.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">FITREPs</div>
          <div className="text-2xl font-bold text-blue-600">{parsedData.fitrepCount}</div>
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
              const isValidDate = entry.dateOfRank && !isNaN(new Date(entry.dateOfRank).getTime());
              const displayDate = isValidDate 
                ? new Date(entry.dateOfRank).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : 'Invalid date';
              const isCurrentRank = entry.rank === parsedData.currentRank;
              
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between py-2 px-3 rounded-md ${isCurrentRank ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}
                >
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-gray-900 w-16">{entry.rank}</span>
                    <span className="text-gray-600">→</span>
                    <span className={`text-gray-700 ${!isValidDate ? 'text-red-500' : ''}`}>
                      {displayDate}
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

      {/* PSR Analysis Summary */}
      <div className="bg-white rounded-lg border border-gray-200">
        <button
          onClick={() => setShowPSRDetails(!showPSRDetails)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
        >
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            FITREP Summary {parsedData.fitrepCount > 0 ? `(${parsedData.fitrepCount} reports)` : '(No data)'}
          </h3>
          {showPSRDetails ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {showPSRDetails && (
          <div className="px-4 pb-4 space-y-4">
            {parsedData.fitrepCount > 0 ? (
              <>
                <div className="grid grid-cols-5 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{parsedData.fitrepCount}</div>
                    <div className="text-xs text-gray-600">Total FITREPs</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{parsedData.earlyPromotes}</div>
                    <div className="text-xs text-gray-600">Early Promote</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{parsedData.mustPromotes}</div>
                    <div className="text-xs text-gray-600">Must Promote</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">{parsedData.promotables}</div>
                    <div className="text-xs text-gray-600">Promotable</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-600">
                      {parsedData.fitrepAverage > 0 ? parsedData.fitrepAverage.toFixed(2) : 'N/A'}
                    </div>
                    <div className="text-xs text-gray-600">Avg Score</div>
                  </div>
                </div>
                {parsedData.psrAnalysis?.summary?.trend && (
                  <div className={`text-sm px-3 py-2 rounded-md ${
                    parsedData.psrAnalysis.summary.trend === 'improving' ? 'bg-green-50 text-green-800' :
                    parsedData.psrAnalysis.summary.trend === 'declining' ? 'bg-red-50 text-red-800' :
                    'bg-gray-50 text-gray-800'
                  }`}>
                    Performance Trend: {parsedData.psrAnalysis.summary.trend.charAt(0).toUpperCase() + parsedData.psrAnalysis.summary.trend.slice(1)}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p>No FITREP data extracted from PSR.</p>
                <p className="text-xs mt-1">You can enter this information manually in the next step.</p>
              </div>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500">Eligibility</div>
              <div className="font-medium">{parsedData.securityClearance.eligibility}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Current Level</div>
              <div className={`font-medium ${
                parsedData.securityClearance.level.includes('Top Secret') ? 'text-purple-700' : 'text-green-700'
              }`}>
                {parsedData.securityClearance.level}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Investigation Date</div>
              <div className="font-medium">{parsedData.securityClearance.investigationDate || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Granted Date</div>
              <div className="font-medium">{parsedData.securityClearance.grantedDate || 'N/A'}</div>
            </div>
          </div>
          {parsedData.securityClearance.expirationDate && (
            <div className="mt-3 text-sm">
              <span className="text-gray-600">Expires: </span>
              <span className="font-medium">{parsedData.securityClearance.expirationDate}</span>
              {new Date(parsedData.securityClearance.expirationDate) < new Date(new Date().setFullYear(new Date().getFullYear() + 1)) && (
                <span className="ml-2 text-yellow-600">⚠️ Expiring within 1 year</span>
              )}
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
                <h4 className="font-semibold text-sm text-gray-700 mb-2">ODC Text (first 3000 chars):</h4>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded max-h-64 overflow-auto">
                  {uploadedDocuments.odc.text.substring(0, 3000)}
                </pre>
              </div>
            )}
            {uploadedDocuments.osr?.status === 'success' && (
              <div className="bg-white rounded p-3 border">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">OSR Text (first 3000 chars):</h4>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded max-h-64 overflow-auto">
                  {uploadedDocuments.osr.text.substring(0, 3000)}
                </pre>
              </div>
            )}
            {uploadedDocuments.psr?.status === 'success' && (
              <div className="bg-white rounded p-3 border">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">PSR Text (first 3000 chars):</h4>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded max-h-64 overflow-auto">
                  {uploadedDocuments.psr.text.substring(0, 3000)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
