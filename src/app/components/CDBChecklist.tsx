'use client';

import React, { useState } from 'react';
import {
  CheckCircle, AlertTriangle, XCircle, HelpCircle,
  ChevronDown, ChevronUp, Clock, FileText,
  Shield, BookOpen, TrendingUp, Star,
} from 'lucide-react';
import type { ParsedOfficerData } from './VerifyParsedData';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import coursesJson from '../../../public/fy26-courses.json';

// ─── FY26 session lookup helpers ────────────────────────────────────────────

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const mo = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  const dy = (d: Date) => d.getDate();
  return mo(s) === mo(e)
    ? `${mo(s)} ${dy(s)}–${dy(e)}`
    : `${mo(s)} ${dy(s)} – ${mo(e)} ${dy(e)}`;
}

function fy26Sessions(courseId: string, maxPerLoc = 4): string {
  const today = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courses = (coursesJson as any).courses as any[];
  const course = courses.find((c: any) => c.id === courseId);
  if (!course) return '';
  if (course.status?.includes('ON PAUSE')) return ' [ON PAUSE — check NMLPDC for updates]';
  if (!course.sessions?.length) return '';

  const locLines: string[] = [];
  for (const sess of course.sessions) {
    const loc: string = sess.location;
    if (!sess.dates?.length) {
      if (sess.cdp) locLines.push(`  ${loc} (CDP ${sess.cdp})`);
      continue;
    }
    const upcoming = (sess.dates as any[])
      .filter((d: any) => d.start && d.start !== 'TBD' && new Date(d.start + 'T00:00:00') >= today)
      .sort((a: any, b: any) => a.start.localeCompare(b.start));
    if (!upcoming.length) continue;
    const shown = upcoming.slice(0, maxPerLoc);
    const extra = upcoming.length - shown.length;
    const ranges = shown.map((d: any) => {
      const tag = d.virtual ? ' (virt)' : '';
      return fmtRange(d.start, d.end) + tag;
    });
    const plus = extra > 0 ? ` +${extra} more` : '';
    locLines.push(`  ${loc}: ${ranges.join(', ')}${plus}`);
  }
  return locLines.length ? '\nFY26 sessions:\n' + locLines.join('\n') : '';
}

// Promotion timeline (Schofer Promo Prep, May 2023 ed.)
// DOR range is for CURRENT rank; board/fitrep cols are for NEXT-rank selection board.
export const PROMO_TABLE = [
  { fy: 24, start: '2017-10-01', end: '2018-09-30', o4: { board: 'MAY 2023', fitrep: 'JAN 2023' }, o5: { board: 'MAY 2023', fitrep: 'OCT 2022' }, o6: { board: 'FEB 2023', fitrep: 'APR 2022' } },
  { fy: 25, start: '2018-10-01', end: '2019-09-30', o4: { board: 'MAY 2024', fitrep: 'JAN 2024' }, o5: { board: 'MAY 2024', fitrep: 'OCT 2023' }, o6: { board: 'FEB 2024', fitrep: 'APR 2023' } },
  { fy: 26, start: '2019-10-01', end: '2020-09-30', o4: { board: 'MAY 2025', fitrep: 'JAN 2025' }, o5: { board: 'MAY 2025', fitrep: 'OCT 2024' }, o6: { board: 'FEB 2025', fitrep: 'APR 2024' } },
  { fy: 27, start: '2020-10-01', end: '2021-09-30', o4: { board: 'MAY 2026', fitrep: 'JAN 2026' }, o5: { board: 'MAY 2026', fitrep: 'OCT 2025' }, o6: { board: 'FEB 2026', fitrep: 'APR 2025' } },
  { fy: 28, start: '2021-10-01', end: '2022-09-30', o4: { board: 'MAY 2027', fitrep: 'JAN 2027' }, o5: { board: 'MAY 2027', fitrep: 'OCT 2026' }, o6: { board: 'FEB 2027', fitrep: 'APR 2026' } },
  { fy: 29, start: '2022-10-01', end: '2023-09-30', o4: { board: 'MAY 2028', fitrep: 'JAN 2028' }, o5: { board: 'MAY 2028', fitrep: 'OCT 2027' }, o6: { board: 'FEB 2028', fitrep: 'APR 2027' } },
  { fy: 30, start: '2023-10-01', end: '2024-09-30', o4: { board: 'MAY 2029', fitrep: 'JAN 2029' }, o5: { board: 'MAY 2029', fitrep: 'OCT 2028' }, o6: { board: 'FEB 2029', fitrep: 'APR 2028' } },
  { fy: 31, start: '2024-10-01', end: '2025-09-30', o4: { board: 'MAY 2030', fitrep: 'JAN 2030' }, o5: { board: 'MAY 2030', fitrep: 'OCT 2029' }, o6: { board: 'FEB 2030', fitrep: 'APR 2029' } },
];

export const RANK_COL: Record<string, 'o4' | 'o5' | 'o6'> = {
  ENS: 'o4', LTJG: 'o4', LT: 'o4',
  LCDR: 'o5',
  CDR: 'o6',
};
export const NEXT_RANK: Record<string, string> = {
  ENS: 'LTJG', LTJG: 'LT', LT: 'LCDR', LCDR: 'CDR', CDR: 'CAPT',
};
const IZ_RATES: Record<string, string> = { o4: '88–91%', o5: '40–57%', o6: '34–67%' };

// FY26 NAVMED course milestones by rank — session dates appended dynamically
const RANK_COURSES: Record<string, { required: string[]; recommended: string[] }> = {
  LT: {
    required: [
      'DIVOLC — Division Officer Leadership Course (service school per MILPERSMAN 1301-906)' + fy26Sessions('divolc'),
      'BROC — Basic Readiness Officer Course (4-unit self-paced online via Navy E-Learning; prereq for AROC)',
    ],
    recommended: [
      'SWMDOIC — Surface Warfare Medical Dept Officer Indoctrination Course (CIN B-6A-2301, 2 weeks San Diego)' + fy26Sessions('swmdoic'),
    ],
  },
  LTJG: {
    required: [
      'DIVOLC — service school required per MILPERSMAN 1301-906' + fy26Sessions('divolc'),
      'BROC — online via Navy E-Learning',
    ],
    recommended: [],
  },
  ENS: {
    required: [
      'DIVOLC — service school required per MILPERSMAN 1301-906' + fy26Sessions('divolc'),
      'BROC — online via Navy E-Learning',
    ],
    recommended: [],
  },
  LCDR: {
    required: [
      'ILC — Intermediate Leadership Course (CIN H-7C-0104; register at least 5 wks in advance)' + fy26Sessions('ilc'),
    ],
    recommended: [
      'HCM — Healthcare Management Course (JMESI, virtual; for first-time clinical supervisors)' + fy26Sessions('hcm'),
      'IESC — Intermediate Executive Skills Course (JMESI; contributes to 67A Executive Medicine AQD)' + fy26Sessions('iesc'),
      'JPME I — Fleet Seminar Program or Naval Command and Staff Online (apply Apr–May; required for 67B AQD)',
    ],
  },
  CDR: {
    required: [
      'SLC — Senior Leadership Course (CIN H-7C-0107; prereq: ILC)' + fy26Sessions('slc'),
    ],
    recommended: [
      'IESC if not yet complete (required for 67A AQD pathway)' + fy26Sessions('iesc'),
      'NMQSLA — Navy Medicine Quality, Safety & Leadership Academy, if not yet complete (mandated for command/milestone billets per BUMEDINST 1410.1)',
      'SLLC — Senior Leader Legal Course (for incoming COs/XOs; CIN S-5F-0011)' + fy26Sessions('sllc'),
      'MedXellence — 40-hr CE at USU Bethesda (self-nominate; rising MHS executives)',
    ],
  },
  CAPT: {
    required: [
      "Capstone for MHS Leaders (Corps Chief's Office nomination only; 7 seats/class; contributes to 67A AQD)" + fy26Sessions('capstone'),
    ],
    recommended: [
      'NMQSLA if not yet complete',
      'NSLS — Navy Senior Leadership Seminar (2 total Navy Med seats; nomination via MC Career Planner)',
      'IAIFHL — Interagency Institute for Federal Health Leaders (nomination required; 2 weeks in DC; 11 Navy Med seats across all Corps)' + fy26Sessions('iaifhl'),
    ],
  },
};

// ─── helpers ────────────────────────────────────────────────────────────────

type Status = 'good' | 'warning' | 'issue' | 'info';

interface CheckItem {
  label: string;
  status: Status;
  detail: string;
  action?: string;
}
interface Section {
  id: string;
  stepLabel: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: CheckItem[];
}

const NAVY = '#1B365D';
const GOLD = '#FFC72C';

function StatusIcon({ status }: { status: Status }) {
  if (status === 'good') return <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#16A34A' }} />;
  if (status === 'warning') return <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: '#D97706' }} />;
  if (status === 'issue') return <XCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#DC2626' }} />;
  return <HelpCircle className="w-5 h-5 flex-shrink-0" style={{ color: NAVY, opacity: 0.45 }} />;
}

function sectionStatus(items: CheckItem[]): Status {
  if (items.some(i => i.status === 'issue')) return 'issue';
  if (items.some(i => i.status === 'warning')) return 'warning';
  if (items.every(i => i.status === 'good')) return 'good';
  return 'info';
}

function warnHas(warnings: string[], ...keywords: string[]): boolean {
  const w = warnings.join(' ').toLowerCase();
  return keywords.some(k => w.includes(k.toLowerCase()));
}

export function lookupPromo(rank: string, dor: string) {
  const col = RANK_COL[rank.toUpperCase()];
  if (!col) return null;
  const row = PROMO_TABLE.find(r => dor >= r.start && dor <= r.end);
  if (!row) return null;
  return { fy: row.fy, col, ...row[col] };
}

function parseMonthYear(s: string): Date | null {
  const MONTHS: Record<string, number> = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  const [m, y] = s.split(' ');
  if (!(m in MONTHS) || !y) return null;
  return new Date(parseInt(y), MONTHS[m], 1);
}

export function zoneStatus(rank: string, dor: string): 'below-zone' | 'in-zone' | 'above-zone' | 'unknown' {
  const p = lookupPromo(rank, dor);
  if (!p) return 'unknown';
  const boardDate = parseMonthYear(p.board);
  if (!boardDate) return 'unknown';
  const today = new Date();
  const fyStart = new Date(2000 + p.fy - 1, 9, 1);
  if (today < fyStart) return 'below-zone';
  if (today > boardDate) return 'above-zone';
  return 'in-zone';
}

// ─── build sections ─────────────────────────────────────────────────────────

function buildSections(data: ParsedOfficerData): Section[] {
  const rank = (data.currentRank || '').toUpperCase();
  const rankEntry = data.rankHistory.find(r => r.rank.toUpperCase() === rank);
  const dor = rankEntry?.date || null;
  const promoData = dor ? lookupPromo(rank, dor) : null;
  const zone = dor ? zoneStatus(rank, dor) : 'unknown';
  const nextRank = NEXT_RANK[rank];

  // ── 1. Promotion Timeline ──────────────────────────────────────────────────
  const timelineItems: CheckItem[] = [];

  timelineItems.push(
    dor
      ? { label: `Date of Rank (${rank})`, status: 'good', detail: `DOR: ${dor}` }
      : { label: 'Date of Rank', status: 'warning', detail: 'DOR not found in parsed data.', action: 'Verify DOR in Box 36 of ODC or top row of OSR.' }
  );

  if (rank === 'CAPT') {
    timelineItems.push({ label: 'Promotion status', status: 'good', detail: 'Already CAPT (O6) — top rank in MC line officer progression.' });
  } else if (promoData && nextRank) {
    const zoneLabel = zone.replace('-', ' ');
    const zoneItemStatus: Status = zone === 'above-zone' ? 'warning' : zone === 'in-zone' ? 'good' : 'info';
    timelineItems.push({
      label: `Estimated FY in-zone for ${nextRank}`,
      status: zoneItemStatus,
      detail: `FY${promoData.fy} — ${zoneLabel}`,
      action: zone === 'above-zone' ? 'Past primary promotion window. Above-zone selection requires an exceptional record. Seek senior mentorship.' : undefined,
    });
    timelineItems.push({ label: `${nextRank} selection board convenes`, status: 'info', detail: promoData.board });
    timelineItems.push({
      label: 'Last periodic FITREP before board',
      status: 'info',
      detail: `~${promoData.fitrep} (may shift with change-of-command or concurrent FITREPs)`,
      action: 'The board focuses heavily on the last 5 years of FITREPs. Ensure stellar performance through this cutoff.',
    });
    if (promoData.col) {
      timelineItems.push({
        label: 'MC in-zone selection rate (FY14–FY24 historical)',
        status: 'info',
        detail: `${IZ_RATES[promoData.col]} of in-zone candidates selected. Not official — actual rates released with promotion zone announcement.`,
      });
    }
  } else {
    timelineItems.push({
      label: 'Board timeline',
      status: 'warning',
      detail: 'Cannot compute — DOR outside table range or rank not recognized.',
      action: 'Visit MyNavyHR (mynavyhr.navy.mil) for current promotion zone info.',
    });
  }

  // ── 2. PSR Analysis ────────────────────────────────────────────────────────
  const psrItems: CheckItem[] = [];
  const hasGaps = warnHas(data.warnings, 'gap', 'days between');
  const hasLeftward = warnHas(data.warnings, 'leftward', 'left-ward', 'declining', 'ep to mp', 'mp to p', 'p to pr');
  const hasBelowRS = warnHas(data.warnings, 'below rs', 'below reporting senior', 'below average');

  psrItems.push({
    label: `FITREP count: ${data.fitrepCount}`,
    status: data.fitrepCount === 0 ? 'warning' : 'good',
    detail: data.fitrepCount > 0 ? `${data.fitrepCount} FITREPs extracted from PSR.` : 'No FITREP data extracted — upload PSR for full analysis.',
    action: data.fitrepCount > 0 ? 'Verify continuity via BUPERS Online → "CCA/FITREP/Eval Reports" → "Performance Evaluation Continuity Report".' : undefined,
  });

  psrItems.push({
    label: 'Gaps >90 days in FITREP continuity',
    status: hasGaps ? 'issue' : data.fitrepCount > 0 ? 'good' : 'info',
    detail: hasGaps
      ? 'Gap(s) detected — see parser warnings.'
      : data.fitrepCount > 0 ? 'No significant gaps detected.' : 'Cannot assess without PSR.',
    action: hasGaps
      ? 'Gaps >90 days need explanation. Try to fix the record first (send signed copy to PERS-32). After two failed attempts, address in a Letter to the Board.'
      : undefined,
  });

  const graded = data.earlyPromotes + data.mustPromotes + data.promotables;
  const epRate = graded > 0 ? Math.round((data.earlyPromotes / graded) * 100) : 0;
  const epMpRate = graded > 0 ? Math.round(((data.earlyPromotes + data.mustPromotes) / graded) * 100) : 0;

  psrItems.push({
    label: `Promotion recs — EP: ${data.earlyPromotes}  MP: ${data.mustPromotes}  P: ${data.promotables}`,
    status: data.fitrepCount === 0 ? 'info'
      : epRate >= 50 ? 'good'
      : epRate >= 25 ? 'warning'
      : 'warning',
    detail: graded > 0
      ? `EP rate: ${epRate}% | EP+MP rate: ${epMpRate}%`
      : 'No recommendation data extracted.',
    action: promoData?.col === 'o6'
      ? 'For CAPT selection: consistent EP FITREPs over the last 5 years are critical. Even a single non-EP can matter at O6.'
      : undefined,
  });

  psrItems.push({
    label: 'Leftward movement in promotion recommendations',
    status: hasLeftward ? 'issue' : data.fitrepCount > 0 ? 'good' : 'info',
    detail: hasLeftward
      ? 'Potential leftward movement detected (e.g., EP→MP→P). Boards flag downward trends.'
      : data.fitrepCount > 0 ? 'No leftward movement detected.' : 'Cannot assess without PSR.',
    action: hasLeftward
      ? 'Be prepared to explain in a Letter to the Board if the reason is compelling.'
      : undefined,
  });

  psrItems.push({
    label: 'Performance vs. Reporting Senior average',
    status: hasBelowRS ? 'warning' : data.fitrepCount > 0 ? 'good' : 'info',
    detail: hasBelowRS
      ? 'One or more FITREPs where individual average falls below RS cumulative average.'
      : data.fitrepCount > 0 ? 'No below-RS-average FITREPs detected.' : 'Cannot assess without PSR.',
    action: hasBelowRS
      ? 'Boards use RS cumulative average as a benchmark. Multiple below-average FITREPs significantly reduce competitiveness.'
      : undefined,
  });

  if (data.fitrepAverage > 0) {
    psrItems.push({
      label: `FITREP trait average: ${data.fitrepAverage.toFixed(2)}`,
      status: data.fitrepAverage >= 4.5 ? 'good' : data.fitrepAverage >= 4.0 ? 'warning' : 'issue',
      detail: data.fitrepAverage >= 4.5
        ? 'Strong average — competitive for promotion.'
        : data.fitrepAverage >= 4.0
        ? 'Adequate but not highly competitive. Focus on recent FITREPs.'
        : 'Below competitive threshold. Recent high-performing FITREPs are essential.',
    });
  }

  // ── 3. OSR Record Items ────────────────────────────────────────────────────
  const osrItems: CheckItem[] = [];

  osrItems.push({
    label: 'Undergraduate degree on OSR',
    status: data.hasUndergrad ? 'good' : 'warning',
    detail: data.hasUndergrad ? 'Detected in parsed record.' : 'Not confirmed in parsed data.',
    action: !data.hasUndergrad
      ? 'Official transcripts must be sent directly from the school to PERS-313. Electronic: via National Student Clearinghouse — select "Education Organization, Application Service and Scholarships" → "Department of the Navy" → "Navy Personnel Command".'
      : undefined,
  });

  osrItems.push({
    label: 'Medical school degree on OSR',
    status: data.hasMedicalSchool ? 'good' : 'warning',
    detail: data.hasMedicalSchool ? 'Detected in parsed record.' : 'Not confirmed in parsed data.',
    action: !data.hasMedicalSchool ? 'Same process as undergrad — official transcript sent directly from school to PERS-313.' : undefined,
  });

  const certLabel = data.certificationCode === 'K'
    ? 'Board Certified (K code)'
    : data.certificationCode === 'J'
    ? 'Board Eligible — not yet certified (J code)'
    : 'Certification status unknown';

  osrItems.push({
    label: `Subspecialty code: ${certLabel}`,
    status: data.boardCertified === true ? 'good' : data.boardCertified === false ? 'warning' : 'info',
    detail: data.boardCertified === true
      ? 'Board certified (K code) — correctly reflected.'
      : data.boardCertified === false
      ? 'Board eligible but not yet certified (J code). Certification strengthens the record.'
      : 'Board certification not extracted — verify "SUB-SPEC" section of OSR (K = certified, J = board eligible, T = in training).',
    action: data.boardCertified === false
      ? 'Once certified, update from J to K. Contact Anthony.W.Frabutt.civ@health.mil to update specialty codes.'
      : undefined,
  });

  osrItems.push({
    label: 'Awards accurate on OSR',
    status: 'info',
    detail: 'Auto-verification not possible. Only NAM-level and above individual awards appear; unit awards are not displayed.',
    action: 'Awards matter most if you have a Combat Action Ribbon, Bronze Star, Purple Heart, or similar combat award. Verify accuracy via BUPERS Online.',
  });

  // ── 4. ODC Record Items ────────────────────────────────────────────────────
  const odcItems: CheckItem[] = [];

  odcItems.push({
    label: `AQD codes (${data.aqds.length} detected: ${data.aqds.length > 0 ? data.aqds.join(', ') : 'none'})`,
    status: data.aqds.length > 0 ? 'good' : 'info',
    detail: data.aqds.length > 0
      ? `Parsed: ${data.aqds.join(', ')}. Verify in Block 72 of ODC and "Special Qualifications" section of OSR.`
      : 'No AQDs detected. Verify Block 72 of ODC.',
    action: 'If you qualify for AQDs not shown, submit self-service requests. For JPME AQDs (JS7/JS8), provide official JPME completion letter — detailers cannot add these.',
  });

  const clrStatus: Status = data.clearanceLevel && data.clearanceDate ? 'good' : data.clearanceLevel ? 'warning' : 'warning';
  odcItems.push({
    label: `Security clearance: ${data.clearanceLevel || 'unknown'}${data.clearanceDate ? ` (${data.clearanceDate})` : ''}`,
    status: clrStatus,
    detail: data.clearanceLevel && data.clearanceDate
      ? `${data.clearanceLevel} clearance on file. Under continuous evaluation — verify no open issues with your security manager.`
      : data.clearanceLevel
      ? `${data.clearanceLevel} clearance detected. Date not extracted — verify with security manager.`
      : 'Security clearance status not extracted.',
    action: 'CRITICAL: An expired or problematic clearance may cause your name to be removed from the promotion list after the board adjourns. Verify with your security manager before the board.',
  });

  odcItems.push({
    label: 'Service schools on OSR (max 6 entries)',
    status: 'info',
    detail: 'Auto-verification not possible — manually confirm service school entries on OSR.',
    action: 'Only official service schools (with 3-digit code) appear on OSR. To add: provide 3-digit code + course abbreviation + completion date + duration to PERS. Check training transcript at https://jst.doded.mil/jst/',
  });

  odcItems.push({
    label: 'Official photo in OMPF in current rank',
    status: 'info',
    detail: 'Photos are not displayed at promotion boards but must exist in OMPF in current rank.',
    action: 'Get photo taken at Medical Photo (any MTF). Upload via BUPERS Online → OMPF Documents.',
  });

  // ── 5. Course & Career Milestones ──────────────────────────────────────────
  const courseItems: CheckItem[] = [];
  const courses = RANK_COURSES[rank] || RANK_COURSES['LT'];

  // AQDs that indicate a course is already complete
  const aqdsUpper = data.aqds.map(a => a.toUpperCase());
  const has67A_aqd = aqdsUpper.includes('67A');
  const hasJPME_aqd = aqdsUpper.some(a => ['JS7', 'JS8', 'JP1', 'JP2'].includes(a));

  courseItems.push({
    label: `Required courses for ${rank || 'current rank'}`,
    status: 'info',
    detail: courses.required.join('\n'),
  });

  const filteredRecommended = courses.recommended.filter(c => {
    if (has67A_aqd && c.includes('IESC')) return false;
    if (hasJPME_aqd && c.includes('JPME')) return false;
    return true;
  });

  if (filteredRecommended.length > 0) {
    courseItems.push({
      label: 'Recommended courses',
      status: 'info',
      detail: filteredRecommended.join('\n'),
      action: 'Courses already reflected in your AQDs are automatically hidden from this list.',
    });
  }

  courseItems.push({
    label: 'JPME I status',
    status: data.jpmeComplete ? 'good' : (['CDR', 'CAPT'].includes(rank) ? 'warning' : 'info'),
    detail: data.jpmeComplete
      ? 'JPME I complete — satisfies requirement for 67B Expeditionary Medicine AQD.'
      : 'JPME I not yet complete. Required for 67B AQD. Two options: Fleet Seminar Program (apply Apr 1 – May 31) or Naval Command and Staff Online.',
    action: !data.jpmeComplete
      ? 'FSP: apply Apr–May each year. Online NCS: apply via waitlist at usnwc.edu. Reference NAVADMIN 070/25 for AY 2025-2026.'
      : undefined,
  });

  const has67A = data.aqds.some(a => a.toUpperCase() === '67A');
  const hasWarfareAQD = data.aqds.some(a => ['FMF', 'SW', 'AW', 'SS'].includes(a.toUpperCase()));

  if (['LCDR', 'CDR', 'CAPT'].includes(rank)) {
    courseItems.push({
      label: '67A Executive Medicine AQD pathway',
      status: has67A ? 'good' : 'info',
      detail: has67A
        ? '67A Executive Medicine AQD on record.'
        : "Requirements: Master's degree (no waivers) + O4+ rank + 2-yr Dept/Div Head tour + IESC + operational tour.",
      action: !has67A && ['CDR', 'CAPT'].includes(rank)
        ? 'If you meet requirements, apply through JMESP. POC: Clint Garrett, (301) 295-6088, clinton.a.garrett.civ@health.mil'
        : !has67A
        ? 'Begin tracking toward 67A: complete IESC, document operational experience, pursue Master\'s if not yet done.'
        : undefined,
    });
  }

  if (hasWarfareAQD && !data.jpmeComplete) {
    courseItems.push({
      label: '67B gap — JPME I not complete',
      status: 'warning',
      detail: 'Warfare designator present but JPME I not complete. JPME I is required for 67B Expeditionary Medicine AQD.',
      action: 'Complete JPME I via Fleet Seminar or Naval Command and Staff Online to unlock 67B eligibility.',
    });
  }

  // ── 6. Letter to the Board ─────────────────────────────────────────────────
  const ltbItems: CheckItem[] = [];
  const ltbTriggers: string[] = [];
  if (hasGaps) ltbTriggers.push('FITREP gaps >90 days');
  if (hasLeftward) ltbTriggers.push('leftward movement in promotion recommendations');
  if (!data.hasUndergrad) ltbTriggers.push('undergraduate degree not confirmed on OSR');
  if (!data.hasMedicalSchool) ltbTriggers.push('medical degree not confirmed on OSR');
  if (!data.clearanceLevel) ltbTriggers.push('security clearance status unclear');

  ltbItems.push({
    label: 'Letter to the Board recommended?',
    status: ltbTriggers.length > 0 ? 'warning' : 'info',
    detail: ltbTriggers.length > 0
      ? `Consider an LTB for: ${ltbTriggers.join('; ')}.`
      : 'No clear LTB triggers detected from parsed data.',
    action: 'LTB is useful for: record corrections you could not fix, recent significant achievements since last FITREP, gap explanations, adverse info context. Schofer: try to fix the record twice first; ignore adverse info the first time you are in-zone.',
  });

  ltbItems.push({
    label: 'LTB submission deadline',
    status: 'info',
    detail: promoData
      ? `Due ~10 days before board convenes (estimated board: ${promoData.board}). Verify exact cutoff via MyNavyHR when official board date is announced.`
      : 'Verify deadline via MyNavyHR when board date is announced.',
  });

  ltbItems.push({
    label: 'LTB format',
    status: 'info',
    detail: 'One page maximum. Upload via BUPERS Online. Address record issues factually. Include new information that reflects on fitness for promotion.',
  });

  return [
    { id: 'timeline', stepLabel: 'Step 1', title: 'Promotion Timeline', icon: Clock, items: timelineItems },
    { id: 'psr', stepLabel: 'Step 2', title: 'PSR Analysis', icon: TrendingUp, items: psrItems },
    { id: 'osr', stepLabel: 'Step 3', title: 'OSR Record Items', icon: FileText, items: osrItems },
    { id: 'odc', stepLabel: 'Step 4', title: 'ODC Record Items', icon: Shield, items: odcItems },
    { id: 'courses', stepLabel: 'Step 5', title: 'Course & Career Milestones', icon: BookOpen, items: courseItems },
    { id: 'ltb', stepLabel: 'Step 6', title: 'Letter to the Board', icon: Star, items: ltbItems },
  ];
}

// ─── component ───────────────────────────────────────────────────────────────

export function CDBChecklist({ officerData }: { officerData: ParsedOfficerData }) {
  const sections = buildSections(officerData);
  const [open, setOpen] = useState<Set<string>>(new Set(sections.map(s => s.id)));

  function toggle(id: string) {
    setOpen(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const issueCount = sections.filter(s => sectionStatus(s.items) === 'issue').length;
  const warnCount = sections.filter(s => sectionStatus(s.items) === 'warning').length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">CDB Review Checklist</h2>
          <p className="text-sm text-gray-500 mt-0.5">Based on CAPT O'Sullivan's CDB Goby &amp; Schofer's Promo Prep</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {issueCount > 0 && (
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
              {issueCount} issue{issueCount !== 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: `rgba(255,199,44,0.18)`, color: NAVY }}>
              {warnCount} warning{warnCount !== 1 ? 's' : ''}
            </span>
          )}
          {issueCount === 0 && warnCount === 0 && (
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">All clear</span>
          )}
        </div>
      </div>

      {sections.map(section => {
        const Icon = section.icon;
        const status = sectionStatus(section.items);
        const isOpen = open.has(section.id);
        return (
          <div key={section.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggle(section.id)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Icon className="w-5 h-5 flex-shrink-0" style={{ color: NAVY }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: NAVY, opacity: 0.55 }}>{section.stepLabel}</span>
                <span className="font-semibold text-gray-900">{section.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusIcon status={status} />
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {isOpen && (
              <div className="divide-y divide-gray-100">
                {section.items.map((item, idx) => (
                  <div key={idx} className="p-4">
                    <div className="flex items-start gap-3">
                      <StatusIcon status={item.status} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900">{item.label}</p>
                        <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line">{item.detail}</p>
                        {item.action && (
                          <div className="mt-2 rounded px-3 py-2"
                            style={{ background: 'rgba(27,54,93,0.05)', border: '1px solid rgba(27,54,93,0.12)' }}>
                            <p className="text-xs leading-relaxed" style={{ color: NAVY }}>{item.action}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {officerData.warnings.length > 0 && (
        <div className="rounded-lg p-4"
          style={{ background: `rgba(255,199,44,0.08)`, border: `1px solid rgba(255,199,44,0.4)` }}>
          <p className="text-sm font-semibold mb-2" style={{ color: NAVY }}>Parser-flagged warnings</p>
          <ul className="space-y-1">
            {officerData.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#92620A' }}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#D97706' }} />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default CDBChecklist;
