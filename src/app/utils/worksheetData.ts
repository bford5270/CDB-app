// Pure derivations for the printable CDB worksheet. Kept free of React so the
// logic can be compiled and exercised on its own.

import catalogJson from '../../../public/fy27-courses.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CATALOG = catalogJson as any;

export const CATALOG_FY = `FY${String(CATALOG.fiscalYear ?? '').slice(-2)}`;

// Navy rank to the catalog's paygrade milestone key.
export const MILESTONE_KEY: Record<string, string> = {
  ENS: 'O3', LTJG: 'O3', LT: 'O3', LCDR: 'O4', CDR: 'O5', CAPT: 'O6',
};

export interface WorksheetFitrep {
  payGrade?: string;
  station?: string;
  startDate: string;
  endDate: string;
  individualAverage?: number;
  rsAverage?: number;
  promotionRec?: string;
  reportType?: string;
}

/** The subset of parsed record data the worksheet derives from. */
export interface WorksheetInput {
  currentRank: string;
  boardCertified: boolean | null;
  certificationCode: 'J' | 'K' | null;
  clearanceLevel: string;
  hasUndergrad: boolean;
  hasMedicalSchool: boolean;
  aqds: string[];
  specialQualifications: string[];
  awards: Array<{ name: string; count: number }>;
  unitAwardsFound: string[];
  fitreps?: WorksheetFitrep[];
}

export interface RecordAction {
  item: string;
  action: string;
}

export interface CourseRec {
  id: string;
  name: string;
  status?: string;
  sessions: string[];
  /** Set when the catalog itself flags its own data for this course. */
  caution?: string;
}

export interface AqdGap {
  code: string;
  name: string;
  description: string;
}

export interface BelowRsStats {
  count: number;
  total: number;
  pct: number;
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Share of graded reports that fell below the reporting senior's cumulative
 * average. Uses the same comparison as the server-side analytics; recomputed
 * here so the worksheet does not depend on an extra plumbed-through field.
 */
export function belowRsStats(fitreps: WorksheetFitrep[] = []): BelowRsStats {
  const withBoth = fitreps.filter(
    f => typeof f.individualAverage === 'number'
      && typeof f.rsAverage === 'number'
      && (f.rsAverage as number) > 0
  );
  const below = withBoth.filter(f => (f.individualAverage as number) < (f.rsAverage as number));
  return {
    count: below.length,
    total: withBoth.length,
    pct: withBoth.length ? Math.round((below.length / withBoth.length) * 100) : 0,
  };
}

// Remediation routes come straight from the Medical Corps CDB brief, which names
// a different owner for each part of the record.
export function buildRecordActions(d: WorksheetInput): RecordAction[] {
  const actions: RecordAction[] = [];

  if (d.certificationCode === 'J') {
    actions.push({
      item: 'Subspecialty code ends in "J" — trained but not board certified',
      action: 'If you are now board certified, email your board certificate to Anthony W. Frabutt (anthony.w.frabutt.civ@health.mil) at BUMED to have the code updated to "K".',
    });
  } else if (d.boardCertified === null) {
    actions.push({
      item: 'Board certification status could not be read from the record',
      action: 'Confirm your subspecialty code on the OSR. A code ending in "K" is certified, "J" is trained but not certified, "T" is in training.',
    });
  }

  if (!d.hasUndergrad) {
    actions.push({
      item: 'No undergraduate degree found on the OSR',
      action: 'Send sealed official transcripts to Navy Personnel Command, or electronically via eScript/Parchment to askmncc.fct@navy.mil. Duplicate degrees: askmncc@navy.mil or 1-833-330-6622.',
    });
  }
  if (!d.hasMedicalSchool) {
    actions.push({
      item: 'No medical school degree found on the OSR',
      action: 'Same transcript route as above. Education codes are in Appendix D of NAVPERS 15839I, Volume II.',
    });
  }

  if ((d.awards || []).length === 0) {
    actions.push({
      item: 'No personal awards found on the OSR',
      action: 'The OSR records personal awards of NAM or higher. Check the awards page on BOL (https://www.bol.navy.mil/) — NDAWS is read-only, so corrections go through the awards process.',
    });
  }
  for (const unit of d.unitAwardsFound || []) {
    actions.push({
      item: `Unit citation listed in the awards block: ${unit}`,
      action: 'Unit citations are not recorded on the OSR — only personal awards. Verify this entry against NDAWS.',
    });
  }

  if ((d.specialQualifications || []).length === 0) {
    actions.push({
      item: 'No service schools or special qualifications found on the OSR',
      action: 'Updated service schools demonstrate continued interest in Navy Medicine. Email askmncc@navy.mil with your course completion certificate. Prior training is listed at https://jst.doded.mil/jst/.',
    });
  }
  if ((d.aqds || []).length === 0) {
    actions.push({
      item: 'No AQDs found on the record',
      action: 'Detailers add AQDs. Email your detailer the reference code, AQD name, and a qualifying document (FITREP statement, appointment letter, certification). Allow 2-3 weeks to populate.',
    });
  }

  if (!d.clearanceLevel) {
    actions.push({
      item: 'Security clearance not found on the ODC',
      action: 'Confirm your clearance is current — the ODC is where the board sees it.',
    });
  }

  actions.push({
    item: 'Official photo',
    action: 'No longer displayed to the board as of 2020, but must still be on file in your current rank. Upload with your CAC at https://my.navy.mil.',
  });

  return actions;
}

/**
 * Rank-appropriate courses from the catalog's milestone list, dropping any the
 * officer's record already shows and attaching the next few session dates.
 */
export function buildCourseRecs(d: WorksheetInput, now: Date = new Date()): CourseRec[] {
  const key = MILESTONE_KEY[d.currentRank] || '';
  const milestone = CATALOG.careerMilestones?.[key];
  if (!milestone) return [];

  // Same completion test the checklist uses: a course counts as done when its
  // leading code appears as a whole word in the officer's AQDs / OSR entries.
  const completedBlob = [...(d.aqds || []), ...(d.specialQualifications || [])]
    .join(' ')
    .toUpperCase();

  // AQD-implied completions, matching the checklist: holding 67A means the IESC
  // requirement is already satisfied, and a JPME AQD means JPME I is done (the
  // JPME course ids do not token-match the "JPME PHASE1" label on the OSR).
  const aqdsUpper = (d.aqds || []).map(a => a.toUpperCase());
  const has67A = aqdsUpper.includes('67A');
  const hasJpmeAqd = aqdsUpper.some(a => ['JS7', 'JS8', 'JP1', 'JP2'].includes(a));

  const recs: CourseRec[] = [];

  for (const id of milestone.recommendedCourses || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const course = (CATALOG.courses as any[]).find(c => c.id === id);
    if (!course) continue;

    if (has67A && id === 'iesc') continue;
    if (hasJpmeAqd && id.startsWith('jpmei')) continue;

    const token = id.split('-')[0].toUpperCase();
    if (token.length >= 3 && new RegExp(`\\b${token}\\b`).test(completedBlob)) continue;
    if (token === 'NMQSLA' && /\bN?M?QSLA\b/.test(completedBlob)) continue;

    const sessions: string[] = [];
    for (const s of course.sessions || []) {
      const upcoming = ((s.dates || []) as Array<{ start?: string; end: string }>)
        .filter(dt => dt.start && dt.start !== 'TBD' && new Date(dt.start + 'T00:00:00') >= now)
        .sort((a, b) => (a.start as string).localeCompare(b.start as string))
        .slice(0, 3);
      if (upcoming.length) {
        sessions.push(
          `${s.location}: ` +
          upcoming.map(dt => `${fmtDate(dt.start)} – ${fmtDate(dt.end)}`).join('; ')
        );
      }
    }

    // The catalog records contradictions in its own source rather than guessing;
    // carry that caution onto the worksheet, where the dates are actually read.
    const notes: string = typeof course.notes === 'string' ? course.notes : '';
    const caution = notes.includes('SOURCE DISCREPANCY')
      ? 'Catalog flags a discrepancy in this course\'s published schedule — confirm in CeTARS/eNTRS before planning travel.'
      : undefined;

    recs.push({ id, name: course.name, status: course.status, sessions, caution });
  }

  return recs;
}

/** Catalog AQDs the officer does not already hold. */
export function buildAqdGaps(d: WorksheetInput): AqdGap[] {
  const held = new Set((d.aqds || []).map(a => a.toUpperCase()));
  const gaps: AqdGap[] = [];
  for (const [code, aqd] of Object.entries(CATALOG.aqds || {})) {
    if (held.has(code.toUpperCase())) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = aqd as any;
    gaps.push({ code, name: a.name, description: a.description });
  }
  return gaps;
}
