export interface RankDate {
  rank: string;
  date: string; // ISO YYYY-MM-DD — matches AI parser output
}

export interface RankHistoryData {
  rankHistory: RankDate[];
  currentRank: string;
  dateOfRank: string;      // DOR for the current rank — used by PromotionTimeline
  timeInGrade: number;     // months
  timeInService: number;   // months
  inZoneDate: string | null;
  boardEligibility: 'below-zone' | 'in-zone' | 'above-zone' | 'not-eligible';
}

function calculateInZone(
  rank: string,
  rankDate: Date
): { inZoneDate: string | null; eligibility: 'below-zone' | 'in-zone' | 'above-zone' | 'not-eligible' } {
  const today = new Date();

  if (!['LT', 'LCDR', 'CDR'].includes(rank)) {
    return { inZoneDate: null, eligibility: 'not-eligible' };
  }

  // In-zone FY = DOR FY + 5. FY starts Oct 1.
  const dorFY =
    rankDate.getMonth() >= 9
      ? rankDate.getFullYear() + 1
      : rankDate.getFullYear();
  const inZoneFY = dorFY + 5;

  const inZoneStartDate = new Date(inZoneFY - 1, 9, 1); // Oct 1 of prior year
  const currentFY =
    today.getMonth() >= 9 ? today.getFullYear() + 1 : today.getFullYear();

  let eligibility: 'below-zone' | 'in-zone' | 'above-zone';
  if (currentFY < inZoneFY) eligibility = 'below-zone';
  else if (currentFY === inZoneFY) eligibility = 'in-zone';
  else eligibility = 'above-zone';

  return {
    inZoneDate: inZoneStartDate.toISOString().split('T')[0],
    eligibility,
  };
}

export function calculateRankData(history: RankDate[]): RankHistoryData {
  const validHistory = history
    .filter((r) => r.rank && r.date)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (validHistory.length === 0) {
    return {
      rankHistory: history,
      currentRank: '',
      dateOfRank: '',
      timeInGrade: 0,
      timeInService: 0,
      inZoneDate: null,
      boardEligibility: 'not-eligible',
    };
  }

  const today = new Date();
  const latest = validHistory[validHistory.length - 1];
  const currentRankDate = new Date(latest.date);
  const firstRankDate = new Date(validHistory[0].date);

  const timeInGrade = Math.floor(
    (today.getTime() - currentRankDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  );
  const timeInService = Math.floor(
    (today.getTime() - firstRankDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  );

  const inZoneInfo = calculateInZone(latest.rank, currentRankDate);

  return {
    rankHistory: validHistory,
    currentRank: latest.rank,
    dateOfRank: latest.date,
    timeInGrade,
    timeInService,
    inZoneDate: inZoneInfo.inZoneDate,
    boardEligibility: inZoneInfo.eligibility,
  };
}
