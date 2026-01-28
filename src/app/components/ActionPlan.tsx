import { Calendar, Target, TrendingUp, BookOpen } from 'lucide-react';
import type { OfficerData } from './OfficerDataForm';
import { CoursesRecommendations } from './CoursesRecommendations';
import { AQDRecommendations } from './AQDRecommendations';

interface ActionPlanProps {
  officerData: OfficerData;
}

interface TimelineItem {
  timeframe: string;
  priority: 'high' | 'medium' | 'low';
  action: string;
  goal: string;
}

export function ActionPlan({ officerData }: ActionPlanProps) {
  const generateActionPlan = (): TimelineItem[] => {
    const plan: TimelineItem[] = [];
    const rankData = officerData.rankHistoryData;
    const currentRank = rankData?.currentRank || '';
    const boardEligibility = rankData?.boardEligibility || 'not-eligible';
    const timeInGrade = rankData?.timeInGrade || 0;
    const inZoneDate = rankData?.inZoneDate ? new Date(rankData.inZoneDate) : null;
    const today = new Date();
    
    // Calculate months until in-zone
    const monthsUntilInZone = inZoneDate 
      ? Math.max(0, Math.floor((inZoneDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
      : 0;

    // Immediate actions (0-6 months)
    if (officerData.fitnessReportAverage < 4.0) {
      plan.push({
        timeframe: 'Immediate (0-6 months)',
        priority: 'high',
        action: 'Meet with department head to discuss performance improvement plan',
        goal: 'Identify specific areas for improvement and create action items to boost next FITREP',
      });
    }

    if (boardEligibility === 'in-zone' || monthsUntilInZone <= 12) {
      plan.push({
        timeframe: 'Immediate (0-6 months)',
        priority: 'high',
        action: 'Review service record and ensure all qualifications are documented',
        goal: 'Verify accuracy of official record before board convenes - correct any discrepancies',
      });
    }

    if (!officerData.postGradEducation && boardEligibility !== 'in-zone') {
      plan.push({
        timeframe: 'Immediate (0-6 months)',
        priority: 'medium',
        action: 'Research post-graduate education programs',
        goal: 'Identify MPH, MBA, or specialty residency programs compatible with Navy service',
      });
    }

    // Short-term actions (6-12 months)
    if (officerData.specialQualifications.length < 2) {
      plan.push({
        timeframe: 'Short-term (6-12 months)',
        priority: 'medium',
        action: 'Obtain relevant certifications (ATLS, ACLS, specialty board certification)',
        goal: 'Demonstrate continued professional development and clinical competency',
      });
    }

    plan.push({
      timeframe: 'Short-term (6-12 months)',
      priority: 'high',
      action: 'Update professional biography and service record',
      goal: 'Ensure all qualifications, awards, and accomplishments are properly documented',
    });

    if (boardEligibility === 'above-zone') {
      plan.push({
        timeframe: 'Short-term (6-12 months)',
        priority: 'high',
        action: 'Seek career counseling from detailer and senior mentor',
        goal: 'Develop strategy for above-zone selection or transition planning',
      });
    }

    // Mid-term actions (1-2 years)
    if (!officerData.jointDuty && monthsUntilInZone > 24) {
      plan.push({
        timeframe: 'Mid-term (1-2 years)',
        priority: 'high',
        action: 'Apply for joint duty assignment or JPME program',
        goal: 'Gain joint experience critical for senior leadership positions',
      });
    }

    if (officerData.deployments === 0 && monthsUntilInZone > 12) {
      plan.push({
        timeframe: 'Mid-term (1-2 years)',
        priority: 'high',
        action: 'Volunteer for deployment or operational assignment',
        goal: 'Demonstrate operational commitment and gain fleet experience',
      });
    }

    if (!officerData.commandTour && currentRank >= 'LCDR' && monthsUntilInZone > 18) {
      plan.push({
        timeframe: 'Mid-term (1-2 years)',
        priority: 'high',
        action: 'Seek department head or command billet',
        goal: 'Gain leadership experience managing people and resources',
      });
    }

    // Long-term actions (2+ years)
    if (monthsUntilInZone > 24) {
      plan.push({
        timeframe: 'Long-term (2+ years)',
        priority: 'medium',
        action: 'Build network with senior Medical Corps leadership',
        goal: 'Establish mentorship relationships and increase visibility for future opportunities',
      });

      plan.push({
        timeframe: 'Long-term (2+ years)',
        priority: 'medium',
        action: 'Pursue advanced leadership roles and challenging assignments',
        goal: 'Position yourself as a leader in Medical Corps specialty or operational medicine',
      });
    }

    // Ongoing actions
    plan.push({
      timeframe: 'Ongoing',
      priority: 'high',
      action: 'Maintain exceptional performance in current billet',
      goal: 'Continue earning top-tier fitness reports and visible accomplishments',
    });

    plan.push({
      timeframe: 'Ongoing',
      priority: 'medium',
      action: 'Engage in professional organizations and medical corps community',
      goal: 'Stay connected with peers and contribute to Navy Medicine mission',
    });

    return plan;
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

  const getMonthsUntilBoard = (): number => {
    const rankData = officerData.rankHistoryData;
    const inZoneDate = rankData?.inZoneDate ? new Date(rankData.inZoneDate) : null;
    const today = new Date();
    
    if (!inZoneDate) return 0;
    
    return Math.max(0, Math.floor((inZoneDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityIcon = (priority: string) => {
    return priority === 'high' ? '!' : priority === 'medium' ? '●' : '○';
  };

  const actionPlan = generateActionPlan();
  const yearsToBoard = getMonthsUntilBoard() / 12;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Career Development Action Plan</h2>
        <p className="text-gray-600">
          Strategic roadmap for {getNextRank(officerData.rankHistoryData?.currentRank || '')} board preparation (
          {getMonthsUntilBoard() > 0
            ? `~${Math.ceil(yearsToBoard)} years until eligible`
            : 'currently board eligible'}
          )
        </p>
      </div>

      {/* Timeline Overview */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Development Timeline</h3>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 border border-blue-100">
            <div className="text-2xl font-bold text-blue-600">
              {actionPlan.filter((item) => item.priority === 'high').length}
            </div>
            <div className="text-sm text-gray-600">High Priority</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-blue-100">
            <div className="text-2xl font-bold text-blue-600">
              {actionPlan.filter((item) => item.priority === 'medium').length}
            </div>
            <div className="text-sm text-gray-600">Medium Priority</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-blue-100">
            <div className="text-2xl font-bold text-blue-600">{Math.max(0, Math.ceil(yearsToBoard))}</div>
            <div className="text-sm text-gray-600">Years to Board</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-blue-100">
            <div className="text-2xl font-bold text-blue-600">{actionPlan.length}</div>
            <div className="text-sm text-gray-600">Total Actions</div>
          </div>
        </div>
      </div>

      {/* Action Items */}
      <div className="space-y-4">
        {['Immediate (0-6 months)', 'Short-term (6-12 months)', 'Mid-term (1-2 years)', 'Long-term (2+ years)', 'Ongoing'].map(
          (timeframe) => {
            const items = actionPlan.filter((item) => item.timeframe === timeframe);
            if (items.length === 0) return null;

            return (
              <div key={timeframe}>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">{timeframe}</h3>
                </div>
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div
                      key={index}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border ${getPriorityColor(
                              item.priority
                            )}`}
                          >
                            {getPriorityIcon(item.priority)}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="w-4 h-4 text-blue-600" />
                            <h4 className="font-semibold text-gray-900">{item.action}</h4>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{item.goal}</p>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium uppercase ${getPriorityColor(
                                item.priority
                              )}`}
                            >
                              {item.priority} priority
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
        )}
      </div>

      {/* Professional Development Courses */}
      <div className="border-t pt-6">
        <CoursesRecommendations officerData={officerData} />
      </div>

      {/* AQD Recommendations */}
      <div className="border-t pt-6">
        <AQDRecommendations 
          officerData={officerData} 
          selectedAQDs={officerData.selectedAQDs}
        />
      </div>

      {/* Additional Resources */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Career Planning Resources</h3>
        </div>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>NAVMED P-117 (MANMED):</strong> Manual of the Medical Department - Official
              career guidance and policy
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>BUMED Career Development:</strong> Contact your Medical Corps detailer for
              personalized career counseling and assignment planning
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Medical Corps Professional Association (MCPA):</strong> Network with peers
              and senior Medical Corps mentors
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>MyNavy Portal:</strong> Official record review, course enrollment, and career
              management tools
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Navy Medicine Professional Development Center (NMPDC):</strong> Comprehensive
              training catalog and enrollment information
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>
              <strong>Selection Board Information:</strong> Review previous board results,
              precepts, and statistics via BUPERS website
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}