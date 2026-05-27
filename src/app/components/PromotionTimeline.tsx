import { Calendar, Clock, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';
import { calculatePromotionTimeline, formatDateForDisplay, type PromotionTimeline as TimelineData } from '../utils/parsingUtils';

interface PromotionTimelineProps {
  currentRank: string;
  dateOfRank: string;
  className?: string;
}

export function PromotionTimeline({ currentRank, dateOfRank, className = '' }: PromotionTimelineProps) {
  const timeline = calculatePromotionTimeline(currentRank, dateOfRank);

  if (!timeline.isInZone || !timeline.nextRank) {
    return (
      <div className={`bg-gray-50 border border-gray-200 rounded-lg p-6 ${className}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Promotion Timeline Not Available</h3>
            <p className="text-sm text-gray-600">
              {!timeline.isInZone
                ? `Date of Rank (${formatDateForDisplay(dateOfRank)}) is outside the computed in-zone windows. Verify your current rank and DOR in the Verify step — the parser may have captured an older date.`
                : 'Already at maximum rank in progression.'
              }
            </p>
          </div>
        </div>
      </div>
    );
  }

  const fitrepUrgent = timeline.daysUntilFitrepDeadline !== null && timeline.daysUntilFitrepDeadline < 90;
  const boardSoon = timeline.daysUntilBoard !== null && timeline.daysUntilBoard < 180;

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          Promotion Timeline
        </h2>
        <p className="text-gray-600">
          Selection board schedule and milestones for advancement to {timeline.nextRank}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        {/* Current Status */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Current Rank</div>
          <div className="text-2xl font-bold text-blue-600">{timeline.currentRank}</div>
          <div className="text-xs text-gray-500 mt-1">
            {timeline.currentPayGrade} • DOR: {formatDateForDisplay(dateOfRank)}
          </div>
        </div>

        {/* In-Zone Status */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm text-green-700 mb-1">Primary Zone</div>
          <div className="text-2xl font-bold text-green-600">FY{timeline.inZoneFY}</div>
          <div className="text-xs text-green-600 mt-1">
            To {timeline.nextRank} ({timeline.nextPayGrade})
          </div>
        </div>

        {/* Below-Zone Board */}
        {timeline.belowZoneFY && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="text-sm text-amber-700 mb-1">Below Zone Opportunity</div>
            <div className="text-2xl font-bold text-amber-600">FY{timeline.belowZoneFY}</div>
            <div className="text-xs text-amber-600 mt-1">
              Board: {timeline.belowZoneBoardConvenes ? formatDateForDisplay(timeline.belowZoneBoardConvenes) : 'TBD'}
            </div>
          </div>
        )}

        {/* Primary Board Date */}
        <div className={`border rounded-lg p-4 ${boardSoon ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200'}`}>
          <div className={`text-sm mb-1 ${boardSoon ? 'text-yellow-700' : 'text-gray-600'}`}>Primary Board Convenes</div>
          <div className={`text-2xl font-bold ${boardSoon ? 'text-yellow-600' : 'text-blue-600'}`}>
            {timeline.boardConvenes ? formatDateForDisplay(timeline.boardConvenes) : 'TBD'}
          </div>
          {timeline.daysUntilBoard !== null && (
            <div className={`text-xs mt-1 ${boardSoon ? 'text-yellow-600 font-medium' : 'text-gray-500'}`}>
              {timeline.daysUntilBoard > 0
                ? `${timeline.daysUntilBoard} days away${boardSoon ? ' ⚠️' : ''}`
                : `${Math.abs(timeline.daysUntilBoard)} days ago`
              }
            </div>
          )}
        </div>
      </div>

      {/* FITREP Deadline Alert */}
      {timeline.fitrepDeadline && (
        <div className={`rounded-lg p-4 ${
          fitrepUrgent
            ? 'bg-red-50 border-2 border-red-300'
            : 'bg-blue-50 border border-blue-200'
        }`}>
          <div className="flex items-start gap-3">
            {fitrepUrgent ? (
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            ) : (
              <Calendar className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h3 className={`font-semibold mb-1 ${fitrepUrgent ? 'text-red-900' : 'text-blue-900'}`}>
                Last Periodic FITREP Deadline
              </h3>
              <p className={`text-sm mb-2 ${fitrepUrgent ? 'text-red-800' : 'text-blue-800'}`}>
                Your last periodic FITREP that will be considered by the board must be submitted by{' '}
                <span className="font-bold">{formatDateForDisplay(timeline.fitrepDeadline)}</span>
              </p>
              {timeline.daysUntilFitrepDeadline !== null && (
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${fitrepUrgent ? 'text-red-600' : 'text-blue-600'}`} />
                  <span className={`text-sm font-medium ${fitrepUrgent ? 'text-red-700' : 'text-blue-700'}`}>
                    {timeline.daysUntilFitrepDeadline > 0
                      ? `${timeline.daysUntilFitrepDeadline} days remaining${fitrepUrgent ? ' - ACTION REQUIRED' : ''}`
                      : `Deadline passed ${Math.abs(timeline.daysUntilFitrepDeadline)} days ago`
                    }
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Timeline Visualization */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Key Milestones</h3>
        <div className="space-y-4">
          {/* In-Zone Period */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-900">In-Zone Period</div>
              <div className="text-sm text-gray-600">
                Fiscal Year {timeline.inZoneFY} (DOR between{' '}
                {timeline.inZoneStart ? formatDateForDisplay(timeline.inZoneStart) : '—'} and{' '}
                {timeline.inZoneEnd ? formatDateForDisplay(timeline.inZoneEnd) : '—'})
              </div>
            </div>
          </div>

          {/* FITREP Deadline */}
          {timeline.fitrepDeadline && (
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                fitrepUrgent ? 'bg-red-100' : 'bg-blue-100'
              }`}>
                <Calendar className={`w-5 h-5 ${fitrepUrgent ? 'text-red-600' : 'text-blue-600'}`} />
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900">FITREP Submission Deadline</div>
                <div className="text-sm text-gray-600">
                  {formatDateForDisplay(timeline.fitrepDeadline)} - Last periodic FITREP must be submitted
                </div>
              </div>
            </div>
          )}

          {/* Below Zone Board */}
          {timeline.belowZoneBoardConvenes && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900">Below-Zone Board (FY{timeline.belowZoneFY})</div>
                <div className="text-sm text-gray-600">
                  {formatDateForDisplay(timeline.belowZoneBoardConvenes)} — early selection opportunity one year before primary zone
                  {timeline.daysUntilBelowZoneBoard !== null && (
                    <span className="ml-2 text-amber-600 font-medium">
                      ({timeline.daysUntilBelowZoneBoard > 0
                        ? `${timeline.daysUntilBelowZoneBoard} days away`
                        : `${Math.abs(timeline.daysUntilBelowZoneBoard)} days ago`})
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Primary Board Convenes */}
          {timeline.boardConvenes && (
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                boardSoon ? 'bg-yellow-100' : 'bg-blue-100'
              }`}>
                <TrendingUp className={`w-5 h-5 ${boardSoon ? 'text-yellow-600' : 'text-blue-600'}`} />
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900">Primary Zone Board Convenes (FY{timeline.inZoneFY})</div>
                <div className="text-sm text-gray-600">
                  {formatDateForDisplay(timeline.boardConvenes)} - {timeline.nextPayGrade} promotion board meets
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Recommendations</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          {fitrepUrgent && (
            <li className="flex items-start gap-2">
              <span className="text-red-600 font-bold">•</span>
              <span className="font-medium text-red-700">
                URGENT: Coordinate with reporting senior to ensure FITREP is submitted before {formatDateForDisplay(timeline.fitrepDeadline!)}
              </span>
            </li>
          )}
          {!fitrepUrgent && timeline.daysUntilFitrepDeadline && timeline.daysUntilFitrepDeadline < 180 && (
            <li className="flex items-start gap-2">
              <span className="text-yellow-600 font-bold">•</span>
              <span>
                Begin coordinating FITREP submission with your reporting senior
              </span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <span className="text-blue-600">•</span>
            <span>
              Review your PSR for any gaps or issues that need to be addressed before the board
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600">•</span>
            <span>
              Ensure all required AQDs and certifications for {timeline.nextRank} are complete
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600">•</span>
            <span>
              Schedule a career counseling session with your mentor or detailer
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
