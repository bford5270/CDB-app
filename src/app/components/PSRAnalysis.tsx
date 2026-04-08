import { FileText, TrendingUp, AlertTriangle, CheckCircle, BarChart3, TrendingDown, Minus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { parsePSR, type PSRSummary } from '../utils/parsingUtils';
import type { UploadedDocument } from './DocumentUpload';

async function parsePSRWithAI(text: string): Promise<PSRSummary> {
  const response = await fetch('/api/parse-psr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error(`parse-psr API error ${response.status}`);
  }
  return response.json();
}

interface PSRAnalysisProps {
  psrFile: UploadedDocument | null;
  onAnalysisComplete: (data: PSRData) => void;
}

export interface PSRData {
  fitnessReportCount: number;
  averageScore: number;
  promotionRecommendation: string;
  reportingPeriods: Array<{
    from: string;
    to: string;
    score: number;
    payGrade: string;
    station: string;
    reportingSenior: string;
    promotionRec: string;
  }>;
  trends: {
    improving: boolean;
    stable: boolean;
    declining: boolean;
  };
  hasEarlyPromote: boolean;
  hasMustPromote: boolean;
  analysis: string;
  issues: string[];
}

export function PSRAnalysis({ psrFile, onAnalysisComplete }: PSRAnalysisProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [psrData, setPsrData] = useState<PSRData | null>(null);
  const [rawAnalysis, setRawAnalysis] = useState<PSRSummary | null>(null);

  useEffect(() => {
    if (psrFile?.status === 'success' && psrFile.text && !analyzing && !analyzed) {
      analyzePSR();
    }
  }, [psrFile]);

  const analyzePSR = async () => {
    if (!psrFile?.text) return;

    setAnalyzing(true);

    try {
      // Try AI-powered parsing first; fall back to regex if it fails
      let analysis: PSRSummary;
      try {
        analysis = await parsePSRWithAI(psrFile.text);
      } catch (aiErr) {
        console.warn('AI PSR parsing failed, falling back to regex:', aiErr);
        analysis = parsePSR(psrFile.text);
      }
      setRawAnalysis(analysis);

      // Convert to PSRData format
      const reportingPeriods = analysis.fitreps
        .filter(f => f.startDate && f.endDate)
        .map(f => ({
          from: f.startDate,
          to: f.endDate,
          score: f.individualAverage,
          payGrade: f.payGrade,
          station: f.station || '',
          reportingSenior: f.reportingSenior?.name || 'Unknown',
          promotionRec: f.promotionRec || 'N/A',
        }));

      const avgScore = analysis.averageIndividual;

      const data: PSRData = {
        fitnessReportCount: analysis.totalFitreps,
        averageScore: avgScore,
        promotionRecommendation:
          analysis.epCount > analysis.mpCount ? 'Early Promote' :
          analysis.mpCount > analysis.pCount ? 'Must Promote' :
          'Promotable',
        reportingPeriods,
        trends: {
          improving: analysis.trend === 'improving',
          stable: analysis.trend === 'stable',
          declining: analysis.trend === 'declining',
        },
        hasEarlyPromote: analysis.epCount > 0,
        hasMustPromote: analysis.mpCount > 0,
        analysis: generateAnalysis(analysis),
        issues: analysis.issues,
      };

      setPsrData(data);
      onAnalysisComplete(data);
      setAnalyzed(true);
    } catch (error) {
      console.error('Error analyzing PSR:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const generateAnalysis = (analysis: PSRSummary): string => {
    let text = '';

    if (analysis.epCount > 0) {
      text = `Strong record with ${analysis.epCount} Early Promote recommendation(s). `;
    } else if (analysis.mpCount > 0) {
      text = `Solid record with ${analysis.mpCount} Must Promote recommendation(s). `;
    } else {
      text = 'Record shows consistent Promotable recommendations. ';
    }

    if (analysis.trend === 'improving') {
      text += 'Positive trend: Performance is improving over time. ';
    } else if (analysis.trend === 'declining') {
      text += '⚠️ Caution: Recent reports show declining performance. ';
    }

    if (analysis.issues.length > 0) {
      text += `Note: ${analysis.issues.length} issue(s) detected that may require attention.`;
    }

    return text;
  };

  const getScoreColor = (score: number) => {
    if (score >= 4.5) return 'text-green-700 bg-green-50 border-green-300';
    if (score >= 4.0) return 'text-blue-700 bg-blue-50 border-blue-300';
    if (score >= 3.5) return 'text-yellow-700 bg-yellow-50 border-yellow-300';
    return 'text-red-700 bg-red-50 border-red-300';
  };

  const getPromotionRecColor = (rec: string) => {
    switch (rec) {
      case 'EP': return 'bg-green-100 text-green-800';
      case 'MP': return 'bg-blue-100 text-blue-800';
      case 'P': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTrendIcon = () => {
    if (psrData?.trends.improving) {
      return <TrendingUp className="w-5 h-5 text-green-600" />;
    } else if (psrData?.trends.declining) {
      return <TrendingDown className="w-5 h-5 text-red-600" />;
    } else {
      return <Minus className="w-5 h-5 text-blue-600" />;
    }
  };

  if (!psrFile || psrFile.status !== 'success') {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-yellow-900 mb-2">No PSR Uploaded</h3>
            <p className="text-sm text-yellow-800">
              Performance Summary Report not uploaded. PSR analysis provides critical insights into
              fitness report trends and promotion competitiveness. You can continue without PSR analysis,
              but we recommend uploading your PSR for a complete career assessment.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (analyzing) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <FileText className="w-12 h-12 text-blue-600 animate-pulse" />
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">Analyzing Performance Summary Report...</h3>
            <p className="text-sm text-gray-600 mt-1">
              Extracting fitness report data and analyzing promotion recommendations
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!psrData) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <p className="text-gray-600">Unable to analyze PSR. The document may not contain recognizable FITREP data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Performance Summary Report Analysis
        </h2>
        <p className="text-gray-600">
          Fitness report trends and promotion competitiveness assessment
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Fitness Reports</div>
          <div className="text-2xl font-bold text-blue-600">{psrData.fitnessReportCount}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Average Score</div>
          <div className={`text-2xl font-bold ${psrData.averageScore >= 4.0 ? 'text-green-600' : 'text-yellow-600'}`}>
            {psrData.averageScore > 0 ? psrData.averageScore.toFixed(2) : 'N/A'}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Trend</div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            {getTrendIcon()}
            <span>
              {psrData.trends.improving ? 'Improving' : psrData.trends.declining ? 'Declining' : 'Stable'}
            </span>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Early/Must Promote</div>
          <div className="text-2xl font-bold text-blue-600">
            {rawAnalysis ? `${rawAnalysis.epCount}/${rawAnalysis.mpCount}` : '0/0'}
          </div>
        </div>
      </div>

      {/* RS Average Comparison */}
      {rawAnalysis && rawAnalysis.belowRSAveragePercentage !== undefined && (
        <div className={`border rounded-lg p-4 ${
          rawAnalysis.belowRSAveragePercentage > 50
            ? 'bg-red-50 border-red-200'
            : rawAnalysis.belowRSAveragePercentage > 30
            ? 'bg-yellow-50 border-yellow-200'
            : 'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-start gap-3">
            <BarChart3 className={`w-6 h-6 flex-shrink-0 mt-0.5 ${
              rawAnalysis.belowRSAveragePercentage > 50
                ? 'text-red-600'
                : rawAnalysis.belowRSAveragePercentage > 30
                ? 'text-yellow-600'
                : 'text-green-600'
            }`} />
            <div className="flex-1">
              <h3 className={`font-semibold mb-1 ${
                rawAnalysis.belowRSAveragePercentage > 50
                  ? 'text-red-900'
                  : rawAnalysis.belowRSAveragePercentage > 30
                  ? 'text-yellow-900'
                  : 'text-green-900'
              }`}>
                Reporting Senior Average Comparison
              </h3>
              <p className={`text-sm ${
                rawAnalysis.belowRSAveragePercentage > 50
                  ? 'text-red-800'
                  : rawAnalysis.belowRSAveragePercentage > 30
                  ? 'text-yellow-800'
                  : 'text-green-800'
              }`}>
                You scored <span className="font-bold">below your Reporting Senior's average</span> in{' '}
                <span className="font-bold">{rawAnalysis.belowRSAverageCount}</span> of your graded FITREPs{' '}
                (<span className="font-bold">{rawAnalysis.belowRSAveragePercentage}%</span>).
                {rawAnalysis.belowRSAveragePercentage > 50 ? (
                  <span className="block mt-2 font-medium">
                    ⚠️ This indicates you are frequently ranked below the RS's typical officer. Seek mentorship and focus on high-impact performance areas.
                  </span>
                ) : rawAnalysis.belowRSAveragePercentage > 30 ? (
                  <span className="block mt-2">
                    Consider identifying patterns and working to consistently exceed RS expectations.
                  </span>
                ) : (
                  <span className="block mt-2 font-medium">
                    ✓ Excellent - You consistently perform at or above your Reporting Senior's expectations.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Issues/Warnings */}
      {psrData.issues.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Issues Detected
          </h4>
          <ul className="space-y-1">
            {psrData.issues.map((issue, idx) => (
              <li key={idx} className="text-sm text-red-800">{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Fitness Report Timeline */}
      {psrData.reportingPeriods.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <h3 className="text-xl font-semibold text-gray-900">Fitness Report Timeline</h3>
          </div>
          <div className="space-y-3">
            {psrData.reportingPeriods.slice().reverse().map((period, index) => (
              <div key={index} className="flex items-center gap-4 py-2 px-3 bg-gray-50 rounded-lg">
                <div className="w-12 text-center">
                  <span className="font-semibold text-gray-700">{period.payGrade}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">
                      {period.from && new Date(period.from).toLocaleDateString('en-US', { year: '2-digit', month: 'short' })} - {' '}
                      {period.to && new Date(period.to).toLocaleDateString('en-US', { year: '2-digit', month: 'short' })}
                    </span>
                    <div className="flex items-center gap-2">
                      {period.score > 0 && (
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getScoreColor(period.score)}`}>
                          {period.score.toFixed(2)}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${getPromotionRecColor(period.promotionRec)}`}>
                        {period.promotionRec}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {period.station} • RS: {period.reportingSenior}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          PSR Analysis
        </h3>
        <p className="text-sm text-blue-800">{psrData.analysis}</p>
      </div>

      {/* Recommendations based on analysis */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Recommendations</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          {psrData.trends.declining && (
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-0.5">⚠️</span>
              <span className="text-red-700 font-medium">
                Address declining performance trend. Schedule counseling with reporting senior.
              </span>
            </li>
          )}
          {psrData.issues.some(i => i.includes('LEFTWARD')) && (
            <li className="flex items-start gap-2">
              <span className="text-red-600 mt-0.5">🔴</span>
              <span className="text-red-700">
                Leftward movement detected. Review with mentor and develop recovery strategy.
              </span>
            </li>
          )}
          {psrData.issues.some(i => i.includes('GAP')) && (
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 mt-0.5">⚠️</span>
              <span>
                Date gaps detected in FITREP history. Ensure all reports are properly filed.
              </span>
            </li>
          )}
          {psrData.hasEarlyPromote && (
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">✓</span>
              <span>
                Early Promote marks indicate strong performance. Continue seeking challenging assignments.
              </span>
            </li>
          )}
          {!psrData.hasEarlyPromote && !psrData.trends.declining && (
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>
                Seek increased responsibility and visible accomplishments to improve promotion competitiveness.
              </span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
