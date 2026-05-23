import { AlertCircle, CheckCircle, TrendingUp, Award, BookOpen, Anchor, Users, Target, Clock } from 'lucide-react';
import type { OfficerData } from './OfficerDataForm';
import { PromotionTimeline } from './PromotionTimeline';

const NAVY = '#1B365D';
const GOLD = '#FFC72C';

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

    if (officerData.boardCertified === false && currentRank >= 'LCDR') {
      gaps.push({
        category: 'Board Certification',
        severity: 'critical',
        description: 'Not board certified in specialty',
        recommendation: 'Board certification is vital for O-5 selection according to MC CDB career progression guidance. Consider prioritizing completion of specialty board certification requirements. This demonstrates clinical expertise and is highly valued by promotion boards.',
        icon: Award,
      });
      score -= 20;
    } else if (officerData.boardCertified === true) {
      strengths.push({
        category: 'Board Certification',
        description: 'Board certified — demonstrates clinical excellence and is vital for O-5 promotion',
        icon: Award,
      });
    }

    if (!officerData.postGradEducation) {
      gaps.push({
        category: 'Advanced Education',
        severity: 'recommended',
        description: 'No advanced degree beyond medical training',
        recommendation: 'Consider pursuing graduate education through Navy programs: MPH via Uniformed Services University (USU), MBA through Naval Postgraduate School (NPS), or MHA programs. Advanced leadership/business degrees are increasingly valued for senior Medical Corps positions, particularly for Executive OMO and Flag billets.',
        icon: BookOpen,
      });
      score -= 10;
    } else {
      strengths.push({
        category: 'Advanced Education',
        description: 'Advanced degree enhances leadership credentials and is valued for senior positions',
        icon: BookOpen,
      });
    }

    if (!officerData.jointDuty && currentRank >= 'LCDR') {
      const severity = currentRank === 'CDR' || boardEligibility === 'in-zone' ? 'critical' : 'important';
      gaps.push({
        category: 'Joint Experience',
        severity: severity,
        description: 'No joint duty assignment completed',
        recommendation: 'Consider seeking joint duty assignment with Joint Staff, COCOM, or inter-service medical facilities. JPME Phase I (available through Joint Forces Staff College distance learning) demonstrates joint qualification and is increasingly valued for O-5 and above positions.',
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

    if (currentRank === 'LCDR' && boardEligibility === 'in-zone') {
      gaps.push({
        category: 'Operational Medical Officer (OMO) Tour',
        severity: 'important',
        description: 'No documented OMO tour approaching CDR board',
        recommendation: 'Consider completing at least one OMO tour before the CDR board. According to MC CDB career progression guidance, OMO tours (such as small deck SMO, CVN staff, USMC Battalion Surgeon, or Fleet Surgeon assignments) are highly valued for developing operational competency. These tours typically occur around the 6-12 year mark and demonstrate your ability to support operational Navy Medicine.',
        icon: Anchor,
      });
      score -= 10;
    } else if (currentRank === 'CDR' && boardEligibility === 'in-zone') {
      gaps.push({
        category: 'Senior/Executive OMO Tour',
        severity: 'important',
        description: 'Consider senior operational experience for CAPT board',
        recommendation: 'For competitive CAPT selection, consider completing a Senior or Executive OMO tour. Examples include: CVN/LHA/LHD SMO, Group UMO, CATF Surgeon, Regimental Surgeon, or Senior GHE billets. These positions (typically around 12-18 years) demonstrate your capability to serve in increasingly responsible operational leadership roles.',
        icon: Anchor,
      });
      score -= 10;
    }

    if (officerData.deployments === 0 && (rankData?.timeInService || 0) > 60) {
      gaps.push({
        category: 'Operational Experience',
        severity: 'important',
        description: 'No deployment experience',
        recommendation: 'Consider pursuing operational assignments including ship duty, expeditionary medicine, or forward-deployed hospitals. Deployment experience is highly valued and demonstrates commitment to operational Navy Medicine.',
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

    if (!officerData.commandTour && currentRank === 'CDR') {
      gaps.push({
        category: 'Leadership',
        severity: 'critical',
        description: 'No command tour for CDR-level officer',
        recommendation: 'Command at sea or major medical department head is highly valued for CAPT selection. Per MC CDB career progression guidance, officers competitive for promotion will have accrued operational and clinical experience necessary to serve in billets commensurate with the next rank. Consider seeking: Division/Department Head at major MTF, SMO/Medical Director positions, or DIO/GME Director roles.',
        icon: Target,
      });
      score -= 15;
    } else if (!officerData.commandTour && currentRank === 'LCDR' && boardEligibility === 'in-zone') {
      gaps.push({
        category: 'Leadership',
        severity: 'important',
        description: 'No department head or command experience approaching CDR board',
        recommendation: 'Consider pursuing department head positions at medical treatment facilities. The MC career path deliberately develops clinical, operational, and leadership skillsets. Leadership roles managing people and resources demonstrate readiness for increased responsibility at the CDR level.',
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

    if (officerData.specialQualifications.length === 0) {
      gaps.push({
        category: 'Professional Development',
        severity: 'recommended',
        description: 'Limited special qualifications or service schools documented',
        recommendation: 'Consider completing relevant service schools and certifications. Per CDB guidance, ensure your record reflects how awesome you are - document all training completed. Key service schools for Medical Corps: Combat Casualty Care (C4), AMDOC, MedXcellence, FMSO Training, Tropical Medicine. Clinical certifications: ATLS, ACLS, PALS, Dive Medical Officer, Flight Surgeon. All completions should be added to your OSR via askmncc@navy.mil.',
        icon: BookOpen,
      });
      score -= 5;
    } else if (officerData.specialQualifications.length >= 3) {
      strengths.push({
        category: 'Professional Development',
        description: 'Multiple special qualifications demonstrate commitment to excellence and professional growth',
        icon: BookOpen,
      });
    }

    if (timeInGrade > 96 && currentRank !== 'CAPT') {
      gaps.push({
        category: 'Career Progression',
        severity: 'important',
        description: `Extended time in grade (${Math.floor(timeInGrade / 12)} years) - slower than typical progression`,
        recommendation: 'Review past fitness reports for areas of improvement. Ensure visibility with senior leadership. Consider seeking mentorship from senior Medical Corps officers who have successfully navigated promotion boards. Per CDB slides: typical promotion flow points are 5 FYs after promotion to last rank.',
        icon: TrendingUp,
      });
      score -= 10;
    }

    if (boardEligibility === 'in-zone' || boardEligibility === 'above-zone') {
      gaps.push({
        category: 'Record Review',
        severity: 'important',
        description: 'Approaching promotion board - time to review your record',
        recommendation: 'CDB guidance emphasizes: "Ensure your record reflects how awesome you are." Review your OSR, PSR, and ODC now. Check for: (1) No gaps in PSR - especially last 5 years of FITREPs, (2) All service schools documented, (3) Awards updated (NAM or higher), (4) Education degrees listed, (5) AQDs current, (6) Security clearance up to date, (7) Official photo on file in current rank. Review annually to have time to fix issues. If corrections needed, submit via askmncc@navy.mil or via Letter to the Board (10 days before board convenes).',
        icon: AlertCircle,
      });
    }

    return { gaps, strengths, overallScore: Math.max(0, score) };
  };

  const getNextRank = (currentRank: string): string => {
    const progression: Record<string, string> = {
      ENS: 'LTJG', LTJG: 'LT', LT: 'LCDR', LCDR: 'CDR', CDR: 'CAPT', CAPT: 'RADM',
    };
    return progression[currentRank] || 'Next Rank';
  };

  const { gaps, strengths, overallScore } = analyzeRecord();
  const nextRank = getNextRank(officerData.rankHistoryData?.currentRank || '');

  const getSeverityStyle = (severity: string): React.CSSProperties => {
    switch (severity) {
      case 'critical':   return { border: '1px solid #FECACA', background: '#FEF2F2' };
      case 'important':  return { border: `1px solid rgba(255,199,44,0.4)`, background: `rgba(255,199,44,0.07)` };
      case 'recommended': return { border: '1px solid #E2E8F0', background: '#F8FAFC' };
      default:           return { border: '1px solid #E2E8F0', background: '#F8FAFC' };
    }
  };

  const getSeverityBadgeStyle = (severity: string): React.CSSProperties => {
    switch (severity) {
      case 'critical':   return { background: '#FEE2E2', color: '#991B1B' };
      case 'important':  return { background: `rgba(255,199,44,0.2)`, color: '#92620A' };
      case 'recommended': return { background: '#F1F5F9', color: '#64748B' };
      default:           return { background: '#F1F5F9', color: '#64748B' };
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return '#16A34A';
    if (score >= 70) return '#D97706';
    return '#DC2626';
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
        <p className="text-gray-600">Based on Navy Medical Corps career progression standards</p>
      </div>

      {officerData.rankHistoryData?.currentRank && officerData.rankHistoryData?.dateOfRank && (
        <PromotionTimeline
          currentRank={officerData.rankHistoryData.currentRank}
          dateOfRank={officerData.rankHistoryData.dateOfRank}
        />
      )}

      {/* Overall Score */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 24 }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Overall Record Assessment</h3>
            <p className="text-gray-600">Competitiveness for {nextRank} promotion board</p>
          </div>
          <div className="text-center">
            <div className="text-5xl font-bold" style={{ color: getScoreColor(overallScore) }}>
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
            <CheckCircle className="w-6 h-6" style={{ color: '#16A34A' }} />
            <h3 className="text-xl font-bold text-gray-900">Record Strengths</h3>
          </div>
          <div className="grid gap-3">
            {strengths.map((strength, index) => {
              const Icon = strength.icon;
              return (
                <div key={index} className="flex items-start gap-3 rounded-lg p-4"
                  style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                  <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#16A34A' }} />
                  <div>
                    <h4 className="font-semibold" style={{ color: '#166534' }}>{strength.category}</h4>
                    <p className="text-sm mt-1" style={{ color: '#166534', opacity: 0.85 }}>{strength.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gaps */}
      {gaps.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-6 h-6" style={{ color: '#D97706' }} />
            <h3 className="text-xl font-bold text-gray-900">Identified Gaps & Recommendations</h3>
          </div>
          <div className="grid gap-3">
            {gaps.map((gap, index) => {
              const Icon = gap.icon;
              return (
                <div key={index} className="rounded-lg p-5" style={getSeverityStyle(gap.severity)}>
                  <div className="flex items-start gap-3">
                    <Icon className="w-5 h-5 text-gray-700 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold text-gray-900">{gap.category}</h4>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium uppercase"
                          style={getSeverityBadgeStyle(gap.severity)}>
                          {gap.severity}
                        </span>
                      </div>
                      <p className="text-gray-800 text-sm mb-3">{gap.description}</p>
                      <div className="rounded-md p-3" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(0,0,0,0.06)' }}>
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

      {gaps.length === 0 && strengths.length > 0 && (
        <div className="rounded-lg p-6 text-center" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#16A34A' }} />
          <h3 className="text-lg font-semibold mb-2" style={{ color: '#166534' }}>Exceptional Record</h3>
          <p style={{ color: '#166534', opacity: 0.85 }}>
            No significant gaps identified. Continue maintaining high performance and seek
            increasingly challenging assignments to remain competitive.
          </p>
        </div>
      )}
    </div>
  );
}
