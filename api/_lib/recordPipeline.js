// Deterministic record-processing pipeline for the document parser.
//
// Everything here runs on the model's extracted JSON, not on the documents, so it
// is pure and testable without an API key. api/ask.js owns the prompts and the
// Claude calls; this module owns what happens to the result afterwards.
//
// Lives under api/_lib/ so Vercel does not expose it as an endpoint — files and
// directories in api/ whose names begin with an underscore are not routed.

import { readFileSync } from 'fs';
import { join } from 'path';

// Service school codes as printed in OSR Block 52. Loaded once; a missing file
// simply means codes stay undecoded rather than breaking the parse.
const SERVICE_SCHOOL_CODES = (() => {
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'service-school-codes.json'), 'utf8');
    return JSON.parse(raw).codes || {};
  } catch (e) {
    console.warn('Could not load service-school-codes.json:', e.message);
    return {};
  }
})();

/**
 * Resolve the service-school rows the OSR printed. A bare code such as "082" is
 * meaningless on screen and invisible to the "already completed" matcher, so each
 * known code is decoded to its canonical course name.
 *
 * Returns the decoded rows plus the extra names to fold into specialQualifications.
 */
function decodeServiceSchools(rawRows) {
  if (!Array.isArray(rawRows)) return { serviceSchools: [], decodedNames: [], unknownCodes: [] };

  const serviceSchools = [];
  const decodedNames = [];
  const unknownCodes = [];
  const seen = new Set();

  for (const row of rawRows) {
    if (!row || typeof row !== 'object') continue;
    const rawCode = typeof row.code === 'string' ? row.code.trim().toUpperCase() : '';
    const printed = typeof row.name === 'string' ? row.name.trim().replace(/\s+/g, ' ') : '';
    if (!rawCode && !printed) continue;

    const entry = rawCode ? SERVICE_SCHOOL_CODES[rawCode] : undefined;
    const key = `${rawCode}|${printed.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    serviceSchools.push({
      code: rawCode || null,
      printedName: printed || null,
      resolvedName: entry ? entry.name : null,
    });

    if (entry) decodedNames.push(entry.name);
    else if (rawCode && !printed) unknownCodes.push(rawCode);
  }

  return { serviceSchools, decodedNames, unknownCodes };
}

// A FITREP summary group is the population a reporting senior ranks the officer
// against. Per the Medical Corps CDB brief, it resets on a new duty station, a new
// reporting senior, or a change of rank — which is why a promotion recommendation
// can legitimately drop right after a move without being a performance signal.
//
// Concurrent reports (CC) come from a separate chain of command, so they are grouped
// on their own rather than splitting the regular-report chain every time one appears.
function assignSummaryGroups(fitreps) {
  const groups = [];

  const keyOf = f => [
    (f.rsName || '').trim().toUpperCase(),
    (f.payGrade || '').trim().toUpperCase(),
    (f.station || '').trim().toUpperCase(),
  ].join('|');

  for (const concurrent of [false, true]) {
    const chain = fitreps
      .filter(f => (f.reportType === 'CC') === concurrent && f.startDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    let prev = null;
    for (const f of chain) {
      const isNew = !prev || keyOf(prev) !== keyOf(f);
      if (isNew) {
        const reasons = [];
        if (prev) {
          if ((prev.rsName || '').trim().toUpperCase() !== (f.rsName || '').trim().toUpperCase()) {
            reasons.push('new reporting senior');
          }
          if ((prev.payGrade || '').trim().toUpperCase() !== (f.payGrade || '').trim().toUpperCase()) {
            reasons.push('change of rank');
          }
          if ((prev.station || '').trim().toUpperCase() !== (f.station || '').trim().toUpperCase()) {
            reasons.push('new duty station');
          }
        }
        groups.push({
          index: groups.length,
          rsName: f.rsName || '',
          payGrade: f.payGrade || '',
          station: f.station || '',
          concurrent,
          startDate: f.startDate,
          endDate: f.endDate,
          reportCount: 0,
          resetReason: reasons.join(' + '),
        });
      }
      const group = groups[groups.length - 1];
      group.reportCount += 1;
      if (f.endDate && (!group.endDate || f.endDate > group.endDate)) group.endDate = f.endDate;
      f.summaryGroupIndex = group.index;
      prev = f;
    }
  }

  // Below-RS tally per group. Each row's rsAverage already belongs to that row's
  // own group, so this slices an already-correct comparison rather than fixing it.
  for (const g of groups) {
    const rows = fitreps.filter(f =>
      f.summaryGroupIndex === g.index
      && (f.individualAverage ?? 0) > 0
      && (f.rsAverage ?? 0) > 0);
    g.gradedCount = rows.length;
    g.belowRSCount = rows.filter(f => f.individualAverage < f.rsAverage).length;
  }

  return groups;
}

// Compute all PSR analytics from raw fitrep rows in deterministic JS.
// Claude's only job is accurate row extraction — counts, averages, trend, and
// issues are computed here so there is nothing left for the model to hallucinate.
function computePsrAnalytics(fitreps) {
  if (!Array.isArray(fitreps) || fitreps.length === 0) {
    return {
      fitrepCount: 0, earlyPromotes: 0, mustPromotes: 0, promotables: 0, progressings: 0,
      fitrepAverage: 0, rscaAverage: 0, belowRSAverageCount: 0, belowRSAveragePercentage: 0,
      psrTrend: 'insufficient_data', psrIssues: [], summaryGroups: [],
    };
  }

  // Tags each row with summaryGroupIndex, which the checks below rely on.
  const summaryGroups = assignSummaryGroups(fitreps);

  const graded = fitreps.filter(f =>
    (f.individualAverage ?? 0) > 0 && f.promotionRec !== 'NOB' && f.reportType !== 'AT',
  );

  const fitrepCount    = fitreps.length;
  const earlyPromotes  = fitreps.filter(f => f.promotionRec === 'EP').length;
  const mustPromotes   = fitreps.filter(f => f.promotionRec === 'MP').length;
  const promotables    = fitreps.filter(f => f.promotionRec === 'P').length;
  const progressings   = fitreps.filter(f => f.promotionRec === 'PR').length;
  const round2         = n => Math.round(n * 100) / 100;
  const fitrepAverage  = graded.length > 0
    ? round2(graded.reduce((s, f) => s + (f.individualAverage ?? 0), 0) / graded.length) : 0;
  const rscaAverage    = graded.length > 0
    ? round2(graded.reduce((s, f) => s + (f.rsAverage ?? 0), 0) / graded.length) : 0;

  const withRS                = graded.filter(f => (f.rsAverage ?? 0) > 0);
  const belowRSAverageCount   = withRS.filter(f => (f.individualAverage ?? 0) < (f.rsAverage ?? 0)).length;
  const belowRSAveragePercentage = withRS.length > 0
    ? Math.round(belowRSAverageCount / withRS.length * 100) : 0;

  const PROMO_RANK = { SP: 1, PR: 2, P: 3, MP: 4, EP: 5 };
  let psrTrend = 'insufficient_data';
  if (graded.length >= 4) {
    const avg  = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
    const diff = avg(graded.slice(-3).map(f => PROMO_RANK[f.promotionRec] ?? 0))
               - avg(graded.slice(0, 3).map(f => PROMO_RANK[f.promotionRec] ?? 0));
    psrTrend = diff > 0.5 ? 'improving' : diff < -0.5 ? 'declining' : 'stable';
  }

  const PROMO_ORDER = ['SP', 'PR', 'P', 'MP', 'EP'];
  const psrIssues = [];

  const byDate = [...fitreps]
    .filter(f => f.startDate && f.endDate && f.reportType !== 'CC')
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let i = 1; i < byDate.length; i++) {
    const gap = Math.round((new Date(byDate[i].startDate) - new Date(byDate[i - 1].endDate)) / 86400000);
    if (gap > 90) psrIssues.push(`Gap of ${gap} days between ${byDate[i - 1].endDate} and ${byDate[i].startDate}`);
  }

  // Leftward movement is only a signal inside one summary group. Across a reset
  // the officer starts over against a new population, so a drop there is expected
  // and flagging it produced false positives.
  for (let i = 1; i < graded.length; i++) {
    const pi = PROMO_ORDER.indexOf(graded[i - 1].promotionRec);
    const ci = PROMO_ORDER.indexOf(graded[i].promotionRec);
    const sameGroup = graded[i - 1].summaryGroupIndex !== undefined
      && graded[i - 1].summaryGroupIndex === graded[i].summaryGroupIndex;
    if (sameGroup && pi >= 2 && ci >= 0 && ci < pi - 1) {
      psrIssues.push(`Leftward movement: ${graded[i - 1].promotionRec} → ${graded[i].promotionRec} at ${graded[i].payGrade} (ending ${graded[i].endDate})`);
    }
  }

  let streak = 0;
  for (const f of graded) {
    if (PROMO_ORDER.indexOf(f.promotionRec) <= 2) {
      if (++streak >= 2) { psrIssues.push('Two or more consecutive P or below recommendations'); break; }
    } else { streak = 0; }
  }

  return {
    fitrepCount, earlyPromotes, mustPromotes, promotables, progressings,
    fitrepAverage, rscaAverage, belowRSAverageCount, belowRSAveragePercentage,
    psrTrend, psrIssues, summaryGroups,
  };
}

// Normalize the OSR awards block. Per the Medical Corps CDB brief, the OSR records
// PERSONAL decorations (NAM and above) only; unit citations are not listed there, so
// anything that looks like a unit award is surfaced as a record-accuracy warning
// rather than silently kept as a personal award.
const UNIT_AWARD_PATTERN = /\bUNIT\b|BATTLE\s*["“]?E|MERITORIOUS\s+UNIT|NAVY\s+"?E"?\b/i;

function normalizeAwards(rawAwards) {
  if (!Array.isArray(rawAwards)) return { awards: [], unitAwards: [] };
  const awards = [];
  const unitAwards = [];
  const seen = new Map();

  for (const entry of rawAwards) {
    const name = typeof entry === 'string' ? entry : entry?.name;
    if (typeof name !== 'string') continue;
    const label = name.trim().replace(/\s+/g, ' ');
    if (!label) continue;

    const rawCount = typeof entry === 'object' ? Number(entry.count) : NaN;
    const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 1;
    const isUnit = (typeof entry === 'object' && entry.isUnitAward === true)
      || UNIT_AWARD_PATTERN.test(label);

    if (isUnit) {
      if (!unitAwards.includes(label)) unitAwards.push(label);
      continue;
    }
    // Repeat awards may arrive as separate rows or as one row with a count.
    const key = label.toUpperCase();
    const existing = seen.get(key);
    if (existing) existing.count += count;
    else {
      const rec = { name: label, count };
      seen.set(key, rec);
      awards.push(rec);
    }
  }
  return { awards, unitAwards };
}

// Merge ODC, OSR, and PSR parsed results into the full ExtractedOfficerData shape.
function mergeResults(odcResult, osrResult, psrResult) {
  // Deduplicate AQDs from ODC and OSR.
  const aqds = [...new Set([...(odcResult.aqds || []), ...(osrResult.aqds || [])])];

  // Merge warnings from all three calls.
  const warnings = [
    ...(odcResult.warnings || []),
    ...(osrResult.warnings || []),
    ...(psrResult.warnings || []),
  ];

  const { serviceSchools, decodedNames, unknownCodes } = decodeServiceSchools(osrResult.serviceSchools);
  if (unknownCodes.length > 0) {
    warnings.push(
      `Service school code(s) not in the lookup (${unknownCodes.join(', ')}) — `
      + 'check NOOCS Manual Volume II, Appendix C for the course name.'
    );
  }

  const { awards, unitAwards } = normalizeAwards(osrResult.awards);
  if (unitAwards.length > 0) {
    warnings.push(
      `Unit citation(s) found in the OSR awards block (${unitAwards.join(', ')}) — `
      + 'the OSR records personal awards only (NAM and above). Verify against NDAWS.'
    );
  }

  // Prefer OSR rank dates when ODC dates failed the sanity check.
  // OSR uses unambiguous YYMMDD (month 01-12 constraint eliminates ambiguity),
  // while ODC uses MMDDYY which the model sometimes misreads as YYMMDD.
  let rankHistory = odcResult.rankHistory ?? [];
  if (
    odcResult.confidence?.rankHistory === 'low' &&
    Array.isArray(osrResult.rankHistory) &&
    osrResult.rankHistory.length > 0
  ) {
    rankHistory = osrResult.rankHistory;
    warnings.push('Rank dates sourced from OSR (ODC dates failed sanity check — OSR YYMMDD dates used instead)');
  }

  // Composite confidence: overall = min of individual levels.
  const levelRank = { high: 2, medium: 1, low: 0 };
  const rankToLevel = ['low', 'medium', 'high'];
  const odcConf = odcResult.confidence || {};
  const psrConf = psrResult.confidence || {};
  const minRank = Math.min(
    levelRank[odcConf.rankHistory] ?? 1,
    levelRank[odcConf.aqds] ?? 1,
    levelRank[psrConf.psrData] ?? 1,
  );
  const overall = rankToLevel[minRank];

  return {
    name: odcResult.name ?? null,
    rank: odcResult.rank ?? null,
    designator: odcResult.designator ?? null,
    yearGroup: odcResult.yearGroup ?? null,
    clinicalSpecialty: odcResult.clinicalSpecialty ?? null,
    subspecialtyCodes: Array.isArray(odcResult.subspecialtyCodes) ? odcResult.subspecialtyCodes : [],
    selectedForNextRank: odcResult.selectedForNextRank ?? null,
    rankHistory,
    boardCertified: odcResult.boardCertified ?? null,
    certificationCode: odcResult.certificationCode ?? null,
    clearanceLevel: odcResult.clearanceLevel ?? '',
    clearanceDate: odcResult.clearanceDate ?? '',
    aqds,
    // Decoded school names join the OSR's own labels so "already completed"
    // suppression sees a course listed only by its numeric code.
    specialQualifications: [...new Set([
      ...(Array.isArray(osrResult.specialQualifications) ? osrResult.specialQualifications : []),
      ...decodedNames,
    ])],
    serviceSchools,
    awards,
    unitAwardsFound: unitAwards,
    hasUndergrad: osrResult.hasUndergrad ?? false,
    hasMedicalSchool: osrResult.hasMedicalSchool ?? false,
    // Analytics computed deterministically from extracted rows — nothing hallucinated.
    ...computePsrAnalytics(psrResult.fitreps ?? []),
    fitreps: psrResult.fitreps ?? [],
    warnings,
    confidence: {
      rankHistory: odcConf.rankHistory ?? 'medium',
      aqds: odcConf.aqds ?? 'medium',
      psrData: psrConf.psrData ?? 'medium',
      overall,
    },
  };
}

export {
  SERVICE_SCHOOL_CODES,
  decodeServiceSchools,
  assignSummaryGroups,
  computePsrAnalytics,
  UNIT_AWARD_PATTERN,
  normalizeAwards,
  mergeResults,
};
