import { useState, useEffect } from 'react';
import { Calendar, Plus, Trash2, TrendingUp } from 'lucide-react';

export interface RankDate {
  rank: string;
  dateOfRank: string;
}

export interface RankHistoryData {
  rankHistory: RankDate[];
  currentRank: string;
  timeInGrade: number;
  timeInService: number;
  inZoneDate: string | null;
  boardEligibility: 'below-zone' | 'in-zone' | 'above-zone' | 'not-eligible';
}

interface RankHistoryFormProps {
  onDataChange: (data: RankHistoryData) => void;
  initialRanks?: RankDate[];
}

export function RankHistoryForm({ onDataChange, initialRanks }: RankHistoryFormProps) {
  const [rankHistory, setRankHistory] = useState<RankDate[]>(
    initialRanks && initialRanks.length > 0
      ? initialRanks
      : [{ rank: '', dateOfRank: '' }]
  );

  // When initialRanks are provided or component mounts, calculate and send data
  useEffect(() => {
    if (initialRanks && initialRanks.length > 0) {
      const calculatedData = calculateRankData(initialRanks);
      onDataChange(calculatedData);
    }
  }, [initialRanks]); // Only run when initialRanks changes

  const calculateRankData = (history: RankDate[]): RankHistoryData => {
    const validHistory = history
      .filter((r) => r.rank && r.dateOfRank)
      .sort((a, b) => new Date(a.dateOfRank).getTime() - new Date(b.dateOfRank).getTime());

    if (validHistory.length === 0) {
      return {
        rankHistory: history,
        currentRank: '',
        timeInGrade: 0,
        timeInService: 0,
        inZoneDate: null,
        boardEligibility: 'not-eligible',
      };
    }

    const currentRank = validHistory[validHistory.length - 1].rank;
    const currentRankDate = new Date(validHistory[validHistory.length - 1].dateOfRank);
    const firstRankDate = new Date(validHistory[0].dateOfRank);
    const today = new Date();

    // Calculate time in grade (months)
    const timeInGrade = Math.floor(
      (today.getTime() - currentRankDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    );

    // Calculate time in service (months)
    const timeInService = Math.floor(
      (today.getTime() - firstRankDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    );

    // Calculate in-zone date based on rank
    const inZoneInfo = calculateInZone(currentRank, currentRankDate);

    return {
      rankHistory: validHistory,
      currentRank,
      timeInGrade,
      timeInService,
      inZoneDate: inZoneInfo.inZoneDate,
      boardEligibility: inZoneInfo.eligibility,
    };
  };

  const calculateInZone = (
    rank: string,
    rankDate: Date
  ): { inZoneDate: string | null; eligibility: 'below-zone' | 'in-zone' | 'above-zone' | 'not-eligible' } => {
    const today = new Date();
    
    // Helper function to determine FY based on date of rank
    const calculateInZoneFY = (dor: Date): number => {
      const dorYear = dor.getFullYear();
      const dorMonth = dor.getMonth(); // 0-indexed
      
      // Determine which FY the DOR falls into
      let dorFY: number;
      if (dorMonth >= 9) { // October (9) or later - next FY
        dorFY = dorYear - 2024 + 25;
      } else { // January (0) through September (8) - current FY
        dorFY = dorYear - 2024 + 24;
      }
      
      // In-Zone = DOR FY + 5 years
      return dorFY + 5;
    };

    // Calculate in-zone FY based on rank
    let inZoneFY = 0;
    
    if (rank === 'LT') {
      inZoneFY = calculateInZoneFY(rankDate);
    } else if (rank === 'LCDR') {
      inZoneFY = calculateInZoneFY(rankDate);
    } else if (rank === 'CDR') {
      inZoneFY = calculateInZoneFY(rankDate);
    } else {
      // ENS, LTJG, CAPT not applicable for this calculation
      return { inZoneDate: null, eligibility: 'not-eligible' };
    }

    // In-zone period starts Oct 1 of (FY - 1) and ends Sep 30 of FY
    const inZoneStartDate = new Date(2024 + (inZoneFY - 24) - 1, 9, 1); // Oct 1 of year before FY
    const inZoneEndDate = new Date(2024 + (inZoneFY - 24), 8, 30); // Sep 30 of FY year

    // Determine current FY
    const currentFY = today.getMonth() >= 9 
      ? today.getFullYear() - 2024 + 25 
      : today.getFullYear() - 2024 + 24;

    let eligibility: 'below-zone' | 'in-zone' | 'above-zone' | 'not-eligible';
    
    if (currentFY < inZoneFY) {
      eligibility = 'below-zone';
    } else if (currentFY === inZoneFY) {
      eligibility = 'in-zone';
    } else {
      eligibility = 'above-zone';
    }

    return {
      inZoneDate: inZoneStartDate.toISOString().split('T')[0],
      eligibility,
    };
  };

  const handleRankChange = (index: number, field: keyof RankDate, value: string) => {
    const updated = [...rankHistory];
    updated[index] = { ...updated[index], [field]: value };
    setRankHistory(updated);
    onDataChange(calculateRankData(updated));
  };

  const addRankEntry = () => {
    const updated = [...rankHistory, { rank: '', dateOfRank: '' }];
    setRankHistory(updated);
  };

  const removeRankEntry = (index: number) => {
    const updated = rankHistory.filter((_, i) => i !== index);
    setRankHistory(updated);
    onDataChange(calculateRankData(updated));
  };

  const rankData = calculateRankData(rankHistory);

  const getEligibilityColor = (eligibility: string) => {
    switch (eligibility) {
      case 'in-zone':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'below-zone':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'above-zone':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getEligibilityLabel = (eligibility: string) => {
    switch (eligibility) {
      case 'in-zone':
        return 'Currently In-Zone';
      case 'below-zone':
        return 'Below Zone (Not Yet Eligible)';
      case 'above-zone':
        return 'Above Zone (Past Primary Window)';
      default:
        return 'Not Eligible';
    }
  };

  // Calculate promotion board eligibility
  const calculateBoardEligibility = () => {
    if (!rankData.currentRank) return null;

    const currentRank = rankData.currentRank;
    const dorDate = new Date(rankData.rankHistory[rankData.rankHistory.length - 1].dateOfRank);
    const now = new Date();
    
    // Helper function to determine FY based on date of rank
    // FY24 in-zone: DOR 10/1/17 - 9/30/18
    // FY25 in-zone: DOR 10/1/18 - 9/30/19
    // FY26 in-zone: DOR 10/1/19 - 9/30/20, etc.
    const calculateInZoneFY = (dor: Date, targetRank: string): number => {
      const dorYear = dor.getFullYear();
      const dorMonth = dor.getMonth(); // 0-indexed
      
      // Determine which FY the DOR falls into
      // FY ends on 9/30, so if DOR is Oct-Dec, it's in the next FY
      // If DOR is Jan-Sep, it's in the current FY
      let dorFY: number;
      if (dorMonth >= 9) { // October (9) or later - next FY
        dorFY = dorYear - 2024 + 25; // e.g., Oct 2024 = FY25
      } else { // January (0) through September (8) - current FY
        dorFY = dorYear - 2024 + 24; // e.g., Sep 2024 = FY24
      }
      
      // Standard Navy board timing:
      // In-Zone = DOR FY + 5 years
      return dorFY + 5;
    };

    // Determine next rank and board timing
    let nextRank = '';
    let boardMonth = '';
    let lastFitrepMonth = '';
    let lastFitrepYear = 0;
    let inZoneFY = 0;
    
    if (currentRank === 'LT') {
      nextRank = 'LCDR';
      boardMonth = 'May';
      inZoneFY = calculateInZoneFY(dorDate, 'LCDR');
      // O4→O5: Last FITREP in January of (FY-1)
      lastFitrepMonth = 'January';
      lastFitrepYear = inZoneFY - 1;
    } else if (currentRank === 'LCDR') {
      nextRank = 'CDR';
      boardMonth = 'May';
      inZoneFY = calculateInZoneFY(dorDate, 'CDR');
      // O5→O6: Last FITREP in October of (FY-2)
      lastFitrepMonth = 'October';
      lastFitrepYear = inZoneFY - 2;
    } else if (currentRank === 'CDR') {
      nextRank = 'CAPT';
      boardMonth = 'February';
      inZoneFY = calculateInZoneFY(dorDate, 'CAPT');
      // O6→O7: Last FITREP in April of (FY-2)
      lastFitrepMonth = 'April';
      lastFitrepYear = inZoneFY - 2;
    } else if (currentRank === 'CAPT') {
      return {
        message: 'Currently at O6 (CAPT). Flag officer selection is highly competitive and conducted separately.',
        status: 'max-rank',
        statusColor: 'text-gray-700',
        details: null,
      };
    } else {
      // ENS or LTJG - typically statutory promotions
      return {
        message: 'Promotion to LT is typically statutory (time-based) for Medical Corps officers.',
        status: 'statutory',
        statusColor: 'text-gray-700',
        details: null,
      };
    }

    const belowZoneFY = inZoneFY - 1; // Below zone is 1 year before in-zone
    const belowZoneBoardYear = belowZoneFY - 1; // Board convenes year before FY
    const inZoneBoardYear = inZoneFY - 1;
    
    // Determine current status
    const currentFY = now.getMonth() >= 9 ? now.getFullYear() - 2024 + 25 : now.getFullYear() - 2024 + 24;
    
    let status = '';
    let statusColor = '';
    
    if (currentFY < belowZoneFY) {
      status = 'Not yet eligible';
      statusColor = 'text-gray-700';
    } else if (currentFY === belowZoneFY) {
      status = 'Below Zone (Early Look)';
      statusColor = 'text-blue-700';
    } else if (currentFY === inZoneFY) {
      status = 'IN-ZONE';
      statusColor = 'text-green-700 font-bold';
    } else if (currentFY === inZoneFY + 1) {
      status = 'Above Zone (2nd Look)';
      statusColor = 'text-yellow-700';
    } else if (currentFY > inZoneFY + 1) {
      status = 'Above Zone (Multiple Looks)';
      statusColor = 'text-red-700';
    }

    return {
      message: `Next board: ${nextRank} (O${nextRank === 'LCDR' ? '4' : nextRank === 'CDR' ? '5' : '6'})`,
      status,
      statusColor,
      details: {
        nextRank,
        belowZoneFY,
        belowZoneBoardYear,
        inZoneFY,
        inZoneBoardYear,
        boardMonth,
        lastFitrepMonth,
        lastFitrepYear,
        currentFY,
      },
    };
  };

  const eligibility = calculateBoardEligibility();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Rank History & Progression</h2>
        <p className="text-gray-600">
          Enter promotion dates to calculate time in grade and board eligibility windows
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Promotion History</h3>
          </div>
          <button
            onClick={addRankEntry}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Rank
          </button>
        </div>

        <div className="space-y-3">
          {rankHistory.map((entry, index) => (
            <div key={index} className="flex gap-3 items-start">
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rank
                  </label>
                  <select
                    value={entry.rank}
                    onChange={(e) => handleRankChange(index, 'rank', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Rank</option>
                    <option value="ENS">ENS (O-1)</option>
                    <option value="LT">LT (O-3)</option>
                    <option value="LCDR">LCDR (O-4)</option>
                    <option value="CDR">CDR (O-5)</option>
                    <option value="CAPT">CAPT (O-6)</option>
                    <option value="RDML">RDML (O-7)</option>
                    <option value="RADM">RADM (O-8)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date of Rank
                  </label>
                  <input
                    type="date"
                    value={entry.dateOfRank}
                    onChange={(e) => handleRankChange(index, 'dateOfRank', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {rankHistory.length > 1 && (
                <button
                  onClick={() => removeRankEntry(index)}
                  className="mt-7 p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Calculated Information */}
      {rankData.currentRank && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Career Progression Analysis</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm text-gray-600 mb-1">Current Rank</div>
              <div className="text-2xl font-bold text-blue-900">{rankData.currentRank}</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm text-gray-600 mb-1">Time in Grade</div>
              <div className="text-2xl font-bold text-blue-900">
                {Math.floor(rankData.timeInGrade / 12)}y {rankData.timeInGrade % 12}m
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm text-gray-600 mb-1">Total Service Time</div>
              <div className="text-2xl font-bold text-blue-900">
                {Math.floor(rankData.timeInService / 12)}y {rankData.timeInService % 12}m
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm text-gray-600 mb-1">In-Zone Start Date</div>
              <div className="text-lg font-bold text-blue-900">
                {rankData.inZoneDate
                  ? new Date(rankData.inZoneDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </div>
            </div>
          </div>

          {eligibility && (
            <div
              className={`border-2 rounded-lg p-4 text-center ${getEligibilityColor(
                rankData.boardEligibility
              )}`}
            >
              <div className="text-sm font-medium mb-1">Board Eligibility Status</div>
              <div className="text-xl font-bold">{getEligibilityLabel(rankData.boardEligibility)}</div>
              {rankData.boardEligibility === 'below-zone' && rankData.inZoneDate && (
                <div className="text-sm mt-2">
                  Will be in-zone starting{' '}
                  {new Date(rankData.inZoneDate).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              )}
              {rankData.boardEligibility === 'above-zone' && (
                <div className="text-sm mt-2">
                  Continue maintaining strong performance - above-zone selections are competitive
                </div>
              )}
              {eligibility.status && (
                <div className="mt-2">
                  <span className={eligibility.statusColor}>{eligibility.status}</span>
                </div>
              )}
              {eligibility.details && (
                <div className="mt-3 text-sm space-y-1">
                  <div className="font-semibold border-t border-current pt-2 mt-2">
                    Board Details:
                  </div>
                  <div>
                    <strong>Next Promotion:</strong> {eligibility.details.nextRank} (O{eligibility.details.nextRank === 'LCDR' ? '4' : eligibility.details.nextRank === 'CDR' ? '5' : '6'})
                  </div>
                  <div>
                    <strong>Below Zone:</strong> FY{eligibility.details.belowZoneFY} (Board convenes {eligibility.details.boardMonth} {eligibility.details.belowZoneBoardYear})
                  </div>
                  <div>
                    <strong>In-Zone:</strong> FY{eligibility.details.inZoneFY} (Board convenes {eligibility.details.boardMonth} {eligibility.details.inZoneBoardYear})
                  </div>
                  <div>
                    <strong>Last FITREP Due:</strong> {eligibility.details.lastFitrepMonth} {eligibility.details.lastFitrepYear} (before {eligibility.details.boardMonth} board)
                  </div>
                  <div className="text-xs opacity-75 mt-2">
                    Current FY: {eligibility.details.currentFY}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Privacy Notice */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <strong>Privacy Note:</strong> This system does not store or process any Personal
          Identifiable Information (PII) such as names, Social Security Numbers, or DODIDs. Only
          rank dates and career progression data are analyzed. All data remains in your browser and
          is never transmitted to external servers.
        </p>
      </div>
    </div>
  );
}