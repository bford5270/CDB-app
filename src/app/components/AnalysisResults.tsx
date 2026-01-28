import { AlertCircle, CheckCircle, TrendingUp, Award, BookOpen, Anchor, Users, Target, Clock } from 'lucide-react';
import type { OfficerData } from './OfficerDataForm';

interface AnalysisResultsProps {
  officerData: OfficerData;
}

interface Gap {
  category: string;
  severity: 'critical' | 'important' | 'recommended';
  description: string;
  recommendation: string;
  icon: any;
}

interface Strength {
  category: string;
  description: string;
  icon: any;
}

export function AnalysisResults({ officerData }: AnalysisResultsProps) {
  const analyzeRecord = (): { gaps: Gap[]; strengths: Strength[]; overallScore: number } => {
    const gaps: Gap[] = [];
    const strengths: Strength[] = [];
    let score = 100;

    const rankData = officerData.rankHistoryData;
    const currentRank = rankData?.currentRank || '';
    const timeInGrade = rankData?.timeInGrade || 0;
    const boardEligibility = rankData?.boardEligibility || 'not-eligible';

    // Board Eligibility Analysis
    if (boardEligibility === 'above-zone') {
      gaps.push({
        category: 'Promotion Timing',
        severity: 'critical',
        description: 'Above zone for next rank - past primary promotion window',
        recommendation: 'Above-zone selection requires exceptional record. Ensure all recent FITREPs are top-tier. Consider requesting board reconsideration if previously passed over. Seek mentorship from senior officers who can provide career guidance.',
        icon: Clock,
      });
      score -= 15;
    } else if (boardEligibility === 'in-zone') {
      strengths.push({
        category: 'Promotion Timing',
        description: 'Currently in-zone for promotion board - prime selection window',
        icon: Clock,
      });
    }

    // Fitness Report Analysis
    if (officerData.fitnessReportAverage < 4.0) {
      gaps.push({
        category: 'Performance',
        severity: 'critical',
        description: 'Fitness report average below competitive threshold',
        recommendation: 'Focus on exceeding expectations in current billet. Seek high-visibility assignments and document exceptional performance. Target 4.5+ average for CDR board competitiveness.',
        icon: Award,
      });
      score -= 20;
    } else if (officerData.fitnessReportAverage >= 4.5) {
      strengths.push({
        category: 'Performance',
        description: 'Exceptional fitness report average demonstrates consistent high performance',
        icon: Award,
      });
    }

    // Post-Graduate Education
    if (!officerData.postGradEducation) {
      gaps.push({
        category: 'Education',
        severity: 'important',
        description: 'No post-graduate education beyond medical degree',
        recommendation: 'Consider pursuing graduate education through Navy programs: MPH via Uniformed Services University (USU), MBA through Naval Postgraduate School (NPS), or specialty residency through Navy GME programs. Advanced education is increasingly important for senior Medical Corps leadership positions.',
        icon: GraduationCap,
      });
      score -= 15;
    } else {
      strengths.push({
        category: 'Education',
        description: 'Post-graduate education enhances medical expertise and leadership credentials',
        icon: BookOpen,
      });
    }

    // Joint Duty - adjusted for rank and timing
    if (!officerData.jointDuty && currentRank >= 'LCDR') {
      const severity = currentRank === 'CDR' || boardEligibility === 'in-zone' ? 'critical' : 'important';
      gaps.push({
        category: 'Joint Experience',
        severity: severity,
        description: 'No joint duty assignment completed',
        recommendation: 'Seek joint duty assignment with Joint Staff, COCOM, or inter-service medical facilities. Complete JPME Phase I (available through Joint Forces Staff College distance learning) to demonstrate joint qualification. JPME is increasingly required for O-5 and above positions.',
        icon: Users,
      });
      score -= severity === 'critical' ? 15 : 10;
    } else if (officerData.jointDuty) {
      strengths.push({
        category: 'Joint Experience',
        description: 'Joint duty assignment demonstrates versatility and broadens perspective',
        icon: Users,
      });
    }

    // Deployments
    if (officerData.deployments === 0 && (rankData?.timeInService || 0) > 60) {
      gaps.push({
        category: 'Operational Experience',
        severity: 'important',
        description: 'No deployment experience',
        recommendation: 'Seek operational assignments including ship duty, expeditionary medicine, or forward-deployed hospitals. Deployment experience is highly valued and demonstrates commitment to operational Navy.',
        icon: Anchor,
      });
      score -= 10;
    } else if (officerData.deployments >= 2) {
      strengths.push({
        category: 'Operational Experience',
        description: 'Multiple deployments demonstrate strong operational experience',
        icon: Anchor,
      });
    }

    // Command Experience - adjusted for rank
    if (!officerData.commandTour && currentRank === 'CDR') {
      gaps.push({
        category: 'Leadership',
        severity: 'critical',
        description: 'No command tour for CDR-level officer',
        recommendation: 'Command at sea or major medical department head is critical for CAPT selection. Actively seek department head positions at major medical centers or command opportunities.',
        icon: Target,
      });
      score -= 15;
    } else if (!officerData.commandTour && currentRank === 'LCDR' && boardEligibility === 'in-zone') {
      gaps.push({
        category: 'Leadership',
        severity: 'important',
        description: 'No department head or command experience approaching CDR board',
        recommendation: 'Seek department head positions at medical treatment facilities. Leadership experience managing people and resources is increasingly important for CDR and above.',
        icon: Target,
      });
      score -= 10;
    } else if (officerData.commandTour) {
      strengths.push({
        category: 'Leadership',
        description: 'Command/department head experience demonstrates proven leadership capability',
        icon: Target,
      });
    }

    // Special Qualifications
    if (officerData.specialQualifications.length === 0) {
      gaps.push({
        category: 'Professional Development',
        severity: 'recommended',
        description: 'Limited special qualifications documented',
        recommendation: 'Pursue relevant certifications: Board certification in specialty, ATLS, ACLS, PALS, Dive Medical Officer, Flight Surgeon, etc. Certifications demonstrate continued professional development.',
        icon: BookOpen,
      });
      score -= 5;
    } else if (officerData.specialQualifications.length >= 3) {
      strengths.push({
        category: 'Professional Development',
        description: 'Multiple special qualifications demonstrate commitment to excellence',
        icon: BookOpen,
      });
    }

    // Time in Grade analysis
    if (timeInGrade > 96 && currentRank !== 'CAPT') {
      gaps.push({
        category: 'Career Progression',
        severity: 'important',
        description: `Extended time in grade (${Math.floor(timeInGrade / 12)} years) - slower than typical progression`,
        recommendation: 'Review past fitness reports for areas of improvement. Ensure visibility with senior leadership. Consider seeking mentorship from senior Medical Corps officers who have successfully navigated promotion boards.',
        icon: TrendingUp,
      });
      score -= 10;
    }

    return { gaps, strengths, overallScore: Math.max(0, score) };
  };

  const getNextRank = (currentRank: string): string => {
    const progression: Record<string, string> = {
      ENS: 'LTJG',
      LTJG: 'LT',
      LT: 'LCDR',
      LCDR: 'CDR',
      CDR: 'CAPT',
      CAPT: 'RADM',
    };
    return progression[currentRank] || 'Next Rank';
  };

  const { gaps, strengths, overallScore } = analyzeRecord();
  const nextRank = getNextRank(officerData.rankHistoryData?.currentRank || '');

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-red-200 bg-red-50';
      case 'important':
        return 'border-orange-200 bg-orange-50';
      case 'recommended':
        return 'border-yellow-200 bg-yellow-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'important':
        return 'bg-orange-100 text-orange-800';
      case 'recommended':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 85) return 'Highly Competitive';
    if (score >= 70) return 'Competitive';
    if (score >= 50) return 'Needs Improvement';
    return 'Significant Gaps';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Career Development Analysis</h2>
        <p className="text-gray-600">
          Based on Navy Medical Corps career progression standards
        </p>
      </div>

      {/* Overall Score */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Overall Record Assessment
            </h3>
            <p className="text-gray-600">
              Competitiveness for {nextRank} promotion board
            </p>
          </div>
          <div className="text-center">
            <div className={`text-5xl font-bold ${getScoreColor(overallScore)}`}>
              {overallScore}
            </div>
            <div className="text-sm font-medium text-gray-600">{getScoreLabel(overallScore)}</div>
          </div>
        </div>
      </div>

      {/* Strengths */}
      {strengths.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <h3 className="text-xl font-bold text-gray-900">Record Strengths</h3>
          </div>
          <div className="grid gap-4">
            {strengths.map((strength, index) => {
              const Icon = strength.icon;
              return (
                <div
                  key={index}
                  className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3"
                >
                  <Icon className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-green-900">{strength.category}</h4>
                    <p className="text-green-800 text-sm mt-1">{strength.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gaps and Recommendations */}
      {gaps.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-6 h-6 text-orange-600" />
            <h3 className="text-xl font-bold text-gray-900">Identified Gaps & Recommendations</h3>
          </div>
          <div className="grid gap-4">
            {gaps.map((gap, index) => {
              const Icon = gap.icon;
              return (
                <div
                  key={index}
                  className={`border rounded-lg p-5 ${getSeverityColor(gap.severity)}`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className="w-5 h-5 text-gray-700 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold text-gray-900">{gap.category}</h4>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium uppercase ${getSeverityBadgeColor(
                            gap.severity
                          )}`}
                        >
                          {gap.severity}
                        </span>
                      </div>
                      <p className="text-gray-800 text-sm mb-3">{gap.description}</p>
                      <div className="bg-white/50 rounded-md p-3 border border-gray-200">
                        <p className="text-xs font-medium text-gray-700 mb-1">RECOMMENDATION:</p>
                        <p className="text-sm text-gray-800">{gap.recommendation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No gaps message */}
      {gaps.length === 0 && strengths.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-green-900 mb-2">Exceptional Record</h3>
          <p className="text-green-800">
            No significant gaps identified. Continue maintaining high performance and seek
            increasingly challenging assignments to remain competitive.
          </p>
        </div>
      )}
    </div>
  );
}