// api/ask.js - Vercel Serverless Function
// Handles two modes:
//   1. action: 'parse-documents' — AI extraction of ODC/OSR/PSR (three separate calls)
//   2. (default) Q&A against uploaded reference documents

import { readFileSync } from 'fs';
import { join } from 'path';

function buildCoursesKnowledge() {
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'fy26-courses.json'), 'utf8');
    const d = JSON.parse(raw);
    const lines = [
      `=== FY26 NAVMED COURSE CATALOG (MEDICAL CORPS) — STRUCTURED DATA ===`,
      `Source: ${d.source} | Updated: ${d.lastUpdated}`,
      `Career Planner POC: ${d.pocCareerPlanner.name} | ${d.pocCareerPlanner.email}`,
      '',
      'COURSES:',
    ];
    for (const c of d.courses) {
      lines.push(`• ${c.name} [${c.id}]: target rank ${(c.targetRank || []).join('/')} | ${c.requirement || ''}`.slice(0, 180));
      if (c.cin) lines.push(`  CIN: ${c.cin}`);
      if (c.contributesToAQD) lines.push(`  → Contributes to AQD: ${c.contributesToAQD}`);
      if (c.status) lines.push(`  STATUS: ${c.status}`);
    }
    lines.push('', 'AQD PATHWAYS:');
    for (const [code, aqd] of Object.entries(d.aqds)) {
      lines.push(`• ${code} — ${aqd.name}: ${aqd.description}`);
      const reqs = Object.entries(aqd.requirements).map(([k, v]) => `${k}: ${v}`).join(' | ');
      lines.push(`  Reqs: ${reqs}`);
    }
    lines.push('', 'CAREER MILESTONES BY RANK:');
    for (const [rank, m] of Object.entries(d.careerMilestones)) {
      lines.push(`• ${rank} (${m.typicalYears} yrs): ${m.focus.join(', ')}`);
      lines.push(`  Recommended: ${m.recommendedCourses.join(', ')}`);
    }
    return lines.join('\n');
  } catch (e) {
    console.warn('Could not load FY26 courses:', e.message);
    return '';
  }
}

const FY26_COURSES_KNOWLEDGE = buildCoursesKnowledge();

function buildAQDReference() {
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'aqd-master-list.json'), 'utf8');
    const d = JSON.parse(raw);
    const lines = ['=== MASTER AQD REFERENCE LIST ==='];
    for (const [code, name] of Object.entries(d.aqds)) {
      lines.push(`  ${code}: ${name}`);
    }
    return lines.join('\n');
  } catch (e) {
    console.warn('Could not load AQD master list:', e.message);
    return '';
  }
}

const AQD_REFERENCE = buildAQDReference();

// Strip OCR garbage before sending to Claude.
// PSR PDFs especially produce lines that are >60% box-drawing characters.
function cleanDocumentText(text, docType) {
  if (!text) return '';
  let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
  if (docType === 'psr') {
    const lines = cleaned.split('\n');
    cleaned = lines
      .map(line => {
        if (line.length < 4) return line;
        const usable = (line.match(/[a-zA-Z0-9 .,\/\-:|()]/g) || []).length;
        return usable / line.length < 0.45 ? '' : line;
      })
      .reduce((acc, line, i, arr) => {
        if (line === '' && i > 0 && arr[i - 1] === '') return acc;
        acc.push(line);
        return acc;
      }, [])
      .join('\n');
  }
  return cleaned
    .replace(/\t/g, ' ')
    .replace(/ {4,}/g, '   ')
    .replace(/\n{5,}/g, '\n\n\n');
}

// ── PSR date transposition repair ───────────────────────────────────────────
// PSR period dates are MMDDYY. When both the month and the day are <= 12 the
// value is ambiguous (e.g. "070124" is Jul 01 or Jan 07), and the model
// occasionally emits the swapped orientation. The "DD > 31 → swap" rule in the
// prompt cannot catch this because both orientations are valid calendar dates.
//
// PSR FITREPs are strictly sequential and contiguous (each period starts the
// day after the previous one ends), so we recover the correct orientation by
// choosing, across the whole sequence, the set of per-date orientations that
// best fits that chain. Only ambiguous dates are candidates for swapping, and a
// per-swap cost keeps already-correct dates untouched. Dates that no swap can
// reconcile (genuinely garbled OCR, not a clean transposition) are left as-is
// and flagged rather than guessed.

const dayDiff = (a, b) =>
  (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;

// Return the MM/DD-swapped ISO date, or null when the date is unambiguous
// (month or day > 12, so it cannot be a transposition) or malformed.
function swapMonthDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const mm = +m[2], dd = +m[3];
  if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 12 && mm !== dd) {
    return `${m[1]}-${m[3]}-${m[2]}`;
  }
  return null;
}

// Repair transposed FITREP dates in place. `fitreps` is assumed to be in
// document order (the model emits rows top-to-bottom = chronological).
// Returns an array of human-readable warnings for corrections and residual
// sequence breaks. CC (concurrent) reports overlap by design and are excluded
// from the contiguity chain.
function repairTransposedDates(fitreps) {
  const WSWAP = 8; // cost of one swap, in "gap-day" units; a swap must improve
                   // contiguity by more than this to be chosen.
  const warnings = [];

  const chain = fitreps
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => f.startDate && f.endDate && f.reportType !== 'CC');
  if (chain.length < 2) return warnings;
  const n = chain.length;

  // Lock confidently-correct dates so the optimizer can never "fix" a good row by
  // sacrificing it to chase a garbled neighbor. A report is locked to its original
  // orientation when it sits inside a run of >=2 reports joined by tight (contiguous)
  // junctions that contains at least one UNAMBIGUOUS date (month or day > 12, which
  // cannot be a transposition) — or when both of its own dates are unambiguous.
  const tight = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const g = dayDiff(chain[i - 1].f.endDate, chain[i].f.startDate);
    tight[i] = g >= -2 && g <= 25;
  }
  const locked = new Array(n).fill(false);
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && tight[j + 1]) j++;
    if (j > i) {
      let hasUnambiguous = false;
      for (let k = i; k <= j; k++) {
        if (!swapMonthDay(chain[k].f.startDate) || !swapMonthDay(chain[k].f.endDate)) {
          hasUnambiguous = true; break;
        }
      }
      if (hasUnambiguous) for (let k = i; k <= j; k++) locked[k] = true;
    }
    i = j + 1;
  }
  for (let k = 0; k < n; k++) {
    if (!swapMonthDay(chain[k].f.startDate) && !swapMonthDay(chain[k].f.endDate)) locked[k] = true;
  }

  // Penalty for the gap between one report's end and the next report's start.
  const gapPenalty = (prevEnd, currStart) => {
    const g = dayDiff(prevEnd, currStart);
    if (g < 0) return -g * 3 + 100;   // overlap / backwards — heavily penalized
    if (g <= 45) return g;            // normal report-to-report gap
    return 45 + (g - 45) * 0.5;       // tolerate genuine gaps without forcing them shut
  };

  // Candidate (start, end) orientations per report, each with a swap count.
  // Locked reports contribute only their original orientation.
  const cands = chain.map(({ f }, idx) => {
    if (locked[idx]) return [{ start: f.startDate, end: f.endDate, swaps: 0 }];

    const starts = [{ d: f.startDate, s: 0 }];
    const ss = swapMonthDay(f.startDate); if (ss) starts.push({ d: ss, s: 1 });
    const ends = [{ d: f.endDate, s: 0 }];
    const se = swapMonthDay(f.endDate); if (se) ends.push({ d: se, s: 1 });

    const list = [];
    for (const a of starts) {
      for (const b of ends) {
        if (dayDiff(a.d, b.d) > 0) list.push({ start: a.d, end: b.d, swaps: a.s + b.s });
      }
    }
    if (list.length === 0) {
      // No orientation yields start < end — keep original and flag.
      list.push({ start: f.startDate, end: f.endDate, swaps: 0, invalid: true });
    }
    return list;
  });

  // Min-cost orientation sequence via DP over the chain.
  const dp = cands.map(c => c.map(() => Infinity));
  const back = cands.map(c => c.map(() => -1));
  cands[0].forEach((c, j) => { dp[0][j] = c.swaps * WSWAP; });
  for (let r = 1; r < cands.length; r++) {
    cands[r].forEach((c, j) => {
      for (let k = 0; k < cands[r - 1].length; k++) {
        const cost = dp[r - 1][k] + gapPenalty(cands[r - 1][k].end, c.start) + c.swaps * WSWAP;
        if (cost < dp[r][j]) { dp[r][j] = cost; back[r][j] = k; }
      }
    });
  }

  // Backtrack to the chosen orientation per report.
  let best = 0;
  dp[cands.length - 1].forEach((v, j) => { if (v < dp[cands.length - 1][best]) best = j; });
  const chosen = new Array(cands.length);
  for (let r = cands.length - 1; r >= 0; r--) {
    chosen[r] = best;
    best = back[r][best] >= 0 ? back[r][best] : 0;
  }

  // Apply corrections and collect warnings.
  chain.forEach(({ f }, r) => {
    const c = cands[r][chosen[r]];
    if (!c.invalid && c.swaps > 0 && (c.start !== f.startDate || c.end !== f.endDate)) {
      warnings.push(
        `Corrected transposed PSR date for ${f.payGrade || '?'} ${f.station || ''}`.trim() +
        `: ${f.startDate}…${f.endDate} → ${c.start}…${c.end}`,
      );
      f.startDate = c.start;
      f.endDate = c.end;
    } else if (c.invalid) {
      warnings.push(
        `Unresolved PSR date for ${f.payGrade || '?'} ${f.station || ''}`.trim() +
        ` (${f.startDate}…${f.endDate}) — could not reconcile to a valid period; verify against source.`,
      );
    }
  });

  // Flag residual sequence breaks no swap could fix (e.g. a garbled date).
  for (let r = 1; r < chain.length; r++) {
    if (dayDiff(cands[r - 1][chosen[r - 1]].end, cands[r][chosen[r]].start) < -31) {
      warnings.push(
        `PSR reports appear out of sequence near ${chain[r].f.startDate} ` +
        `(${chain[r].f.payGrade || '?'} ${chain[r].f.station || ''})`.trim() +
        ` — possible unreadable date; verify against source.`,
      );
    }
  }

  return warnings;
}

// Override FITREP promotion recommendations with values read deterministically
// from the PSR's geometry (the X-mark column), supplied by the frontend. The
// vision model reads this field unreliably (it defaults to "P" or grabs the
// adjacent PRT letter), whereas the X-mark column position is exact. Match each
// FITREP to its authoritative rec by end date (rarely transposed), then start
// date, then the MM/DD-swapped start (covers a residual transposed start).
// Returns the number of recommendations changed.
function applyPromotionRecOverride(fitreps, psrRecs) {
  if (!Array.isArray(psrRecs) || psrRecs.length === 0) return 0;
  const VALID = new Set(['EP', 'MP', 'P', 'PR', 'SP', 'NOB']);
  let changed = 0;
  for (const f of fitreps) {
    if (!f.startDate && !f.endDate) continue;
    const swappedStart = swapMonthDay(f.startDate);
    const m = psrRecs.find(r =>
      (f.endDate && r.end === f.endDate) ||
      (f.startDate && r.start === f.startDate) ||
      (swappedStart && r.start === swappedStart),
    );
    if (m && VALID.has(m.rec) && m.rec !== f.promotionRec) {
      f.promotionRec = m.rec;
      changed++;
    }
  }
  return changed;
}

// Post-parse validation: remove impossible rank dates and backward progressions,
// and normalize the two-letter clearance code to a human-readable level.
// `psrRecs` (optional) carries authoritative promotion recommendations read from
// the PSR geometry; when present they override the model's promotionRec values.
function validateParsed(parsed, psrRecs) {
  if (!parsed || typeof parsed !== 'object') return parsed;

  const RANK_ORDER = ['ENS', 'LTJG', 'LT', 'LCDR', 'CDR', 'CAPT'];

  if (Array.isArray(parsed.rankHistory)) {
    parsed.rankHistory = parsed.rankHistory
      .filter(e => e && e.rank && e.date && typeof e.date === 'string')
      .map(e => ({ ...e, rank: e.rank.toUpperCase().trim() }))
      .filter(e => RANK_ORDER.includes(e.rank))
      .filter(e => {
        const year = parseInt(e.date.substring(0, 4), 10);
        return !isNaN(year) && year >= 1995 && year <= 2033;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .reduce((acc, entry) => {
        const maxIdx = acc.length > 0 ? RANK_ORDER.indexOf(acc[acc.length - 1].rank) : -1;
        if (RANK_ORDER.indexOf(entry.rank) > maxIdx) acc.push(entry);
        return acc;
      }, []);

    // Medical Corps officers commission directly as LT; ENS/LTJG entries with the
    // same date as LT are AI artifacts from listing all ranks and picking up the LT date.
    const ltEntry = parsed.rankHistory.find(e => e.rank === 'LT');
    if (ltEntry) {
      parsed.rankHistory = parsed.rankHistory.filter(e =>
        !(['ENS', 'LTJG'].includes(e.rank) && e.date === ltEntry.date)
      );
    }

    // If consecutive ranks are within 90 days of each other, the date extraction
    // is almost certainly wrong — flag it rather than silently accepting bad data.
    const rankIssues = [];
    for (let i = 1; i < parsed.rankHistory.length; i++) {
      const prev = new Date(parsed.rankHistory[i - 1].date).getTime();
      const curr = new Date(parsed.rankHistory[i].date).getTime();
      const daysDiff = (curr - prev) / (1000 * 60 * 60 * 24);
      if (daysDiff < 90) {
        rankIssues.push(`Suspicious: ${parsed.rankHistory[i - 1].rank} and ${parsed.rankHistory[i].rank} dates are only ${Math.round(daysDiff)} days apart — likely a date extraction error`);
      }
    }
    if (rankIssues.length > 0) {
      parsed.warnings = [...(parsed.warnings || []), ...rankIssues];
      if (parsed.confidence) parsed.confidence.rankHistory = 'low';
    }
  }

  if (parsed.clearanceLevel) {
    const cl = parsed.clearanceLevel.toUpperCase().replace(/\s/g, '');
    if (/^S/.test(cl) || cl === 'SS') parsed.clearanceLevel = 'Secret';
    else if (/^(T|TS)/.test(cl) || cl === 'TT') parsed.clearanceLevel = 'Top Secret';
    else if (/^V/.test(cl) || cl === 'VV' || cl.includes('SCI')) parsed.clearanceLevel = 'Top Secret';
    else if (cl === 'N' || cl === 'NONE') parsed.clearanceLevel = 'None';
  }

  if (Array.isArray(parsed.fitreps)) {
    // Strip duty-title overflow fragments from station names. These appear when a long
    // duty title (e.g. "ASSOC PROFESSOR") overflows from LINE 1 onto LINE 2 and the AI
    // mistakenly appends the tail fragment to the station string from LINE 2.
    // Pattern: trailing whitespace + fragment that is NOT a recognizable station word.
    const OVERFLOW_RE = /\s+(FESS|FESSOR|OFESSO|ROFESSOR|PROFESSOR|SSISTANT|SSOC|ESIDENT|OCIATE|ESSOR|SSOR|IDENT)\s*$/i;
    for (const f of parsed.fitreps) {
      if (f.station) {
        f.station = f.station.replace(OVERFLOW_RE, '').trim();
      }
    }

    // Normalize payGrade: "01"/"03"/"04" (digit zero) → "O1"/"O3"/"O4" (letter O).
    for (const f of parsed.fitreps) {
      if (f.payGrade) f.payGrade = String(f.payGrade).replace(/^0(\d)$/, 'O$1');
    }

    // Normalize station names: when two entries share the same first word (command
    // root), promote the shorter variant to match the longest canonical form — e.g.,
    // "USU BETHESDA" → "USU BETHESDA MD".  Only applies when the canonical is a
    // word-aligned prefix extension of the shorter name, so "NAVHOSP GUAM" is never
    // confused with "NAVHOSP CAMP PENDLETON".
    // RS names and all other per-FITREP fields are unaffected by this normalization.
    for (const f of parsed.fitreps) {
      if (f.station) f.station = f.station.replace(/,\s*$/, '').replace(/\s+/g, ' ').trim();
    }
    const stationCanon = {};
    for (const f of parsed.fitreps) {
      if (!f.station || f.station.length < 2) continue;
      const key = f.station.split(' ')[0];
      if (!stationCanon[key] || f.station.length > stationCanon[key].length) {
        stationCanon[key] = f.station;
      }
    }
    for (const f of parsed.fitreps) {
      if (!f.station || f.station.length < 2) continue;
      const key = f.station.split(' ')[0];
      const canon = stationCanon[key];
      if (canon && canon !== f.station) {
        const tail = canon.slice(f.station.length);
        if (tail === '' || tail.startsWith(' ')) f.station = canon;
      }
    }

    // Drop FITREPs whose startDate is outside the plausible range.
    // Minimum year: one year before the officer's LT commissioning date (from rankHistory),
    // or 2000 if unknown. Maximum year: next calendar year.
    const ltEntry = Array.isArray(parsed.rankHistory)
      ? parsed.rankHistory.find(e => e.rank === 'LT')
      : null;
    const minFitrepYear = ltEntry
      ? Math.max(2000, parseInt(ltEntry.date.substring(0, 4), 10) - 1)
      : 2000;
    const maxYear = new Date().getFullYear() + 1;
    parsed.fitreps = parsed.fitreps.filter(f => {
      const yr = f.startDate ? parseInt(f.startDate.substring(0, 4), 10) : NaN;
      return isNaN(yr) || (yr >= minFitrepYear && yr <= maxYear);
    });

    // Repair MM/DD transpositions BEFORE sorting — a transposed startDate would
    // otherwise sort to the wrong position. Operates on document order, which is
    // chronological as emitted by the model.
    const dateWarnings = repairTransposedDates(parsed.fitreps);
    if (dateWarnings.length > 0) {
      parsed.warnings = [...(parsed.warnings || []), ...dateWarnings];
    }

    // Sort by startDate so overlap detection is sequential.
    parsed.fitreps.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

    // Remove phantom FITREPs in two passes so each pass operates on a clean list.
    // If both passes run in one step, a short phantom's endDate can match the next
    // real FITREP's startDate and incorrectly remove a legitimate entry.

    const before = parsed.fitreps.length;

    // Pass 1: drop entries whose period is < 7 days — always a parsing artifact.
    parsed.fitreps = parsed.fitreps.filter(f => {
      if (!f.startDate || !f.endDate) return true;
      const start = new Date(f.startDate).getTime();
      const end = new Date(f.endDate).getTime();
      if (isNaN(start) || isNaN(end)) return true;
      return (end - start) / (1000 * 60 * 60 * 24) >= 7;
    });

    // Pass 2 (on already-cleaned list): drop entries whose startDate equals the
    // previous FITREP's endDate. Real FITREPs always start the day after the
    // previous one ends; same-day start means LINE 2's endDate was misread as a new LINE 1.
    parsed.fitreps = parsed.fitreps.filter((f, i, arr) => {
      if (i === 0 || !f.startDate) return true;
      const prev = arr[i - 1];
      return !(prev.endDate && f.startDate === prev.endDate);
    });

    const removed = before - parsed.fitreps.length;
    if (removed > 0) {
      parsed.warnings = [...(parsed.warnings || []),
        `Removed ${removed} phantom FITREP(s) (period < 7 days or startDate equals previous endDate — LINE 2 misread as new entry)`,
      ];
    }

    // Override promotion recommendations with authoritative values read from the
    // PSR grid geometry. Runs AFTER date repair so the date-based match keys align,
    // and BEFORE the analytics recompute below so counts/trend use the corrected recs.
    const recsChanged = applyPromotionRecOverride(parsed.fitreps, psrRecs);
    if (recsChanged > 0) {
      parsed.warnings = [...(parsed.warnings || []),
        `Corrected ${recsChanged} promotion recommendation(s) from the PSR grid (the X-mark column was misread during extraction).`,
      ];
    }

    // Re-derive ALL aggregate stats from the cleaned fitrep list.
    // The AI's summary-row readings are unreliable (it reads the RS's historical
    // distribution totals, not this officer's). Compute everything deterministically.
    const REC_ORDER = { SP: 0, PR: 1, P: 2, MP: 3, EP: 4 };
    const graded = parsed.fitreps.filter(f => f.promotionRec && f.promotionRec !== 'NOB');
    const gradedWithAvg = graded.filter(f => f.individualAverage > 0);
    const gradedWithRS  = graded.filter(f => f.rsAverage > 0);
    const gradedWithBoth = graded.filter(f => f.individualAverage > 0 && f.rsAverage > 0);

    parsed.fitrepCount    = parsed.fitreps.length;
    parsed.earlyPromotes  = graded.filter(f => f.promotionRec === 'EP').length;
    parsed.mustPromotes   = graded.filter(f => f.promotionRec === 'MP').length;
    parsed.promotables    = graded.filter(f => f.promotionRec === 'P').length;
    parsed.progressings   = graded.filter(f => f.promotionRec === 'PR').length;

    parsed.fitrepAverage = gradedWithAvg.length > 0
      ? Math.round(gradedWithAvg.reduce((s, f) => s + f.individualAverage, 0) / gradedWithAvg.length * 100) / 100
      : 0;
    parsed.rscaAverage = gradedWithRS.length > 0
      ? Math.round(gradedWithRS.reduce((s, f) => s + f.rsAverage, 0) / gradedWithRS.length * 100) / 100
      : 0;

    const belowRS = gradedWithBoth.filter(f => f.individualAverage < f.rsAverage);
    parsed.belowRSAverageCount      = belowRS.length;
    parsed.belowRSAveragePercentage = gradedWithBoth.length > 0
      ? Math.round(belowRS.length / gradedWithBoth.length * 100)
      : 0;

    // Re-derive psrTrend from the cleaned graded list.
    const recValues = graded
      .filter(f => f.promotionRec in REC_ORDER)
      .map(f => REC_ORDER[f.promotionRec]);
    if (recValues.length >= 6) {
      const oldest = recValues.slice(0, 3).reduce((s, v) => s + v, 0);
      const newest = recValues.slice(-3).reduce((s, v) => s + v, 0);
      parsed.psrTrend = newest > oldest ? 'improving' : newest < oldest ? 'declining' : 'stable';
    } else if (recValues.length >= 2) {
      const first = recValues[0], last = recValues[recValues.length - 1];
      parsed.psrTrend = last > first ? 'improving' : last < first ? 'declining' : 'stable';
    } else {
      parsed.psrTrend = 'insufficient_data';
    }

    // Re-derive psrIssues: leftward movement in consecutive graded reports, and
    // coverage gaps > 90 days between consecutive non-concurrent FITREPs.
    const derivedIssues = [];

    // Leftward movement — only flag when the transition stays within the same
    // reporting context (same RS, same command, same payGrade).  Movement across
    // a context boundary (new RS, PCS, or promotion) is expected and not adverse.
    for (let i = 1; i < graded.length; i++) {
      const prevF = graded[i - 1];
      const currF = graded[i];
      const prevVal = REC_ORDER[prevF.promotionRec] ?? -1;
      const currVal = REC_ORDER[currF.promotionRec] ?? -1;
      if (prevVal >= 0 && currVal >= 0 && currVal < prevVal) {
        const sameRS      = !prevF.rsName  || !currF.rsName  || prevF.rsName  === currF.rsName;
        const sameStation = !prevF.station || !currF.station || prevF.station === currF.station;
        const sameGrade   = !prevF.payGrade || !currF.payGrade || prevF.payGrade === currF.payGrade;
        if (sameRS && sameStation && sameGrade) {
          derivedIssues.push(
            `Leftward movement: ${prevF.promotionRec} → ${currF.promotionRec} (period ending ${currF.endDate})`
          );
        }
      }
    }

    // Coverage gaps — exclude concurrent (CC) reports from the timeline anchors.
    // CC reports run simultaneously with a primary billet and do not represent
    // uncovered periods; using their endDate as a gap reference produces false positives.
    const timelineFitreps = parsed.fitreps.filter(f => f.reportType !== 'CC');
    for (let i = 1; i < timelineFitreps.length; i++) {
      const prevEnd   = new Date(timelineFitreps[i - 1].endDate).getTime();
      const currStart = new Date(timelineFitreps[i].startDate).getTime();
      if (!isNaN(prevEnd) && !isNaN(currStart)) {
        const gapDays = (currStart - prevEnd) / (1000 * 60 * 60 * 24);
        if (gapDays > 90) {
          derivedIssues.push(
            `Coverage gap of ${Math.round(gapDays)} days before ${timelineFitreps[i].startDate}`
          );
        }
      }
    }
    if (derivedIssues.length > 0) parsed.psrIssues = derivedIssues;
  }

  return parsed;
}

function scrubPII(text) {
  if (!text) return '';
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b\d{3} \d{2} \d{4}\b/g, '[SSN REDACTED]')
    .replace(/\b(SSN|Social Security)[:\s#]+\d{9}\b/gi, '[SSN REDACTED]')
    .replace(/\b(DODID|EDIPI|EDI-PI|DOD\s+ID)[:\s]+\d{10}\b/gi, '[DOD ID REDACTED]')
    .replace(/\b(DOB|Date\s+of\s+Birth|Birth\s+Date|Born)[:\s]+[\d\/\-\.]+/gi, '[DOB REDACTED]')
    .replace(/\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, '[PHONE REDACTED]')
    .replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[EMAIL REDACTED]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP REDACTED]')
    .replace(/\b(?:\d{4}[-\s]?){3}\d{1,4}\b/g, '[CARD REDACTED]')
    .replace(/\b(routing|account|acct|RTN)[:\s#]+\d{9,17}\b/gi, '[ACCOUNT REDACTED]')
    .replace(/\b(passport|PASSNO)[:\s#]+[A-Z]{0,2}\d{6,9}\b/gi, '[PASSPORT REDACTED]')
    .replace(/\b\d{1,6}\s+[A-Za-z0-9\s]{3,30}\b(Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Circle|Cir)\b/gi, '[ADDRESS REDACTED]')
    .replace(/\b(ZIP|Zip Code|Postal Code)[:\s]+\d{5}(-\d{4})?\b/gi, '[ZIP REDACTED]');
}

// Walk the string tracking brace depth and string state to extract the outermost JSON object.
function extractJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return text.substring(start, i + 1);
    }
  }
  return null;
}

// Build the user-turn content for a Claude call.
// When a base64 PDF is available, sends a native document block + instruction text.
// Falls back to plain text when base64 is absent.
function buildUserContent(textMessage, base64Pdf) {
  if (base64Pdf) {
    return [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
      },
      { type: 'text', text: textMessage },
    ];
  }
  return textMessage;
}

// Call Anthropic and return a parsed JSON object. Throws on API error or invalid JSON.
// When base64Pdf is provided, uses the native PDF document API (higher accuracy on tables).
// model defaults to Haiku (fast); pass 'claude-sonnet-4-6' for complex parsing tasks.
async function callClaude(systemPrompt, userMessage, apiKey, label, base64Pdf, model = 'claude-haiku-4-5-20251001') {
  const content = buildUserContent(userMessage, base64Pdf);
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (base64Pdf) headers['anthropic-beta'] = 'pdfs-2024-09-25';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Claude ${label} error:`, res.status, errText.substring(0, 300));
    throw new Error(`Claude API error ${res.status} on ${label}`);
  }

  const data = await res.json();
  const rawText = data.content?.[0]?.text || '';
  if (data.stop_reason === 'max_tokens') {
    console.warn(`${label} response truncated at max_tokens`);
  }
  console.log(`${label} raw (first 400):`, rawText.substring(0, 400));

  let jsonText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const extracted = extractJsonObject(jsonText);
  if (extracted) jsonText = extracted;

  try {
    return JSON.parse(jsonText);
  } catch (e) {
    console.error(`${label} JSON parse error:`, e.message, '\nRaw (first 600):', rawText.substring(0, 600));
    throw new Error(`${label}: AI returned invalid JSON`);
  }
}

// ============================================================================
// FOCUSED SYSTEM PROMPTS
// ============================================================================

function buildOdcSystemPrompt(today) {
  return [
    'You are a Navy personnel record parser. You are parsing ONLY the Officer Data Card (ODC).',
    'RETURN ONLY a valid JSON object. No markdown, no code fences, no explanation.',
    `TODAY'S DATE: ${today}`,
    '',
    '=== RANK / PROMOTION HISTORY EXTRACTION ===',
    'Navy rank order (O1→O6): ENS → LTJG → LT → LCDR → CDR → CAPT.',
    '',
    'PRIMARY SOURCE — "Promotion History" block on the ODC:',
    'The ODC contains a chart or table explicitly labeled "Promotion History" (sometimes "Date of Rank" or "Promotion Dates").',
    'This block has one row per rank showing the rank abbreviation and a 6-digit date side by side.',
    'Extract EVERY rank-date pair from this block into rankHistory. This is the authoritative source.',
    '',
    'RULES:',
    '1. A rank row MUST have a non-blank 6-digit date next to it to be included.',
    '   If the date field is empty, dashes, zeros, or "N/A" → the officer has NOT been promoted to that rank. OMIT it.',
    '2. The Promotion History chart lists ALL potential ranks (ENS through CAPT) — future ranks have blank dates.',
    '   Higher ranks with no date = not yet promoted. DO NOT include them.',
    '3. LTJG rarely appears — only include it if it has an explicit 6-digit date.',
    '4. Do NOT pick up 6-digit numbers from other ODC fields (PEBD, PRD, EAOS, UIC codes, report numbers).',
    '   A number is a DOR only if it is in the Promotion History block adjacent to a rank abbreviation.',
    '',
    'DATE FORMAT: Promotion History dates are 6-digit MMDDYY → convert to YYYY-MM-DD.',
    '  Parse as: first 2 digits = MM (month 01–12), middle 2 = DD (day 01–31), last 2 = YY (year).',
    '  YY is ALWAYS a 2000s year: 00→2000, 12→2012, 18→2018, 24→2024. NEVER interpret YY as 1900s.',
    '  Examples from a real CDR record:',
    '    "090124" → MM=09 (September), DD=01, YY=24 → 2024-09-01  (Sep 01, 2024)  ← CDR date',
    '    "090118" → MM=09 (September), DD=01, YY=18 → 2018-09-01  (Sep 01, 2018)  ← LCDR date',
    '    "052112" → MM=05 (May),       DD=21, YY=12 → 2012-05-21  (May 21, 2012)  ← LT date',
    'Valid DOR years: 2000–2032. Discard any entry whose converted year falls outside this range.',
    'CRITICAL: The FIRST two digits are the MONTH (01=Jan … 09=Sep … 12=Dec).',
    '  "09" at the start means September — NOT day 9.',
    '  "01" in the middle position means day 1 — NOT January.',
    'VALIDATION: If the middle 2 digits (DD) would exceed 31, you have MM and DD reversed — swap them.',
    'STALE GRADE: Block 5 GRADE on the ODC reflects the grade at time of printing, not today.',
    '  The ODC may be printed months before a promotion takes effect.',
    '  ALWAYS trust the Promotion History block dates (Block 36) over Block 5 GRADE.',
    '',
    'CLEARANCE DATE: 4-digit MMYY format → convert to YYYY-MM. "0520"→2020-05  "1118"→2018-11',
    '',
    `SET "rank" = most recent rankHistory entry whose date ≤ today (${today}).`,
    `rankHistory: ONLY include ranks the officer has already been promoted to (date ≤ today: ${today}).`,
    'CRITICAL: Do NOT add CAPT or any future rank to rankHistory unless its date is already in the past.',
    'If a future promotion date appears in the ODC, capture it in selectedForNextRank only — NOT in rankHistory.',
    '',
    '=== AQD EXTRACTION (ODC ONLY) ===',
    'Extract AQD codes from ODC Block 72 / "Additional Qualification Designators" section.',
    'EXCLUDE: clearance codes (SS/TT/VV/TS), rank abbrevs (ENS/LTJG/LT/LCDR/CDR/CAPT),',
    '  4-digit designator codes (2100–2399), report types (RG/CC/AT/TR), specialty codes ending in K/J/T.',
    'Return [] if no AQD section found.',
    '',
    '=== BOARD CERTIFICATION ===',
    'Look for a specialty code where the LAST character is K or J (e.g. "16Q0K" or "16Q0J").',
    'K = Board Certified (set boardCertified=true, certificationCode="K").',
    'J = Board Eligible / NOT Board Certified (set boardCertified=false, certificationCode="J").',
    'T = In Training (set boardCertified=false, certificationCode=null).',
    '',
    '=== MEDICAL CORPS DESIGNATOR & CLINICAL SPECIALTY ===',
    'Medical Corps officers have a designator in the 2100 range (2100, 2105, 2109, etc.).',
    'RULE: Always output designator as exactly "2100" for any Medical Corps officer.',
    '  Do NOT return 2105, 2300, 2305, or any sub-code — always normalize to "2100".',
    '',
    'Also extract clinicalSpecialty from the 5-character specialty/subspecialty code on the ODC.',
    'The code looks like "16Q0K", "11A0J", "18A0K", etc. The FIRST TWO DIGITS identify the specialty:',
    '  11 = General/Vascular Surgery  |  12 = Orthopedic Surgery  |  13 = OB/GYN',
    '  14 = Pediatrics                |  15 = Internal Medicine   |  16 = Family Medicine',
    '  17 = General Practice          |  18 = Emergency Medicine  |  19 = Anesthesiology',
    '  20 = Ophthalmology             |  21 = Radiology           |  22 = Pathology',
    '  23 = Preventive Medicine       |  24 = Dermatology         |  25 = Urology',
    '  26 = Neurosurgery              |  27 = Plastic Surgery     |  28 = Otolaryngology (ENT)',
    '  29 = PM&R                      |  30 = Neurology           |  31 = Aerospace Medicine',
    '  67 = Operational/Expeditionary Medicine',
    'Return the specialty NAME string (e.g. "Internal Medicine"). Return null if not MC or code not found.',
    '',
    '=== SELECTED FOR PROMOTION (not yet frocked) ===',
    `If the Promotion History block contains a rank with a date strictly in the FUTURE (date > ${today}),`,
    'the officer has been selected for that rank but has not yet been promoted.',
    'Set selectedForNextRank = {"rank": "CDR", "date": "YYYY-MM-DD"} for that future rank.',
    'If no future rank dates exist, set selectedForNextRank = null.',
    'Do NOT add this future rank to rankHistory — rankHistory contains only already-achieved ranks.',
    '',
    '=== OTHER ODC FIELDS ===',
    'name: officer full name as printed.',
    'designator: 4-digit code — always "2100" for Medical Corps. yearGroup: 2-digit YG.',
    'clearanceLevel: the two-letter clearance eligibility/level code from the ODC — return it as-is (e.g., "SS", "TT", "VV").',
    'clearanceDate: 4-digit MMYY → YYYY-MM.',
    '',
    'Return ONLY this JSON (null for unknown strings, 0 for unknown numbers, [] for unknown arrays, false for unknown booleans):',
    '{',
    '  "name": null,',
    '  "rank": null,',
    '  "designator": null,',
    '  "yearGroup": null,',
    '  "rankHistory": [{"rank": "LT", "date": "YYYY-MM-DD"}],',
    '  "boardCertified": null,',
    '  "certificationCode": null,',
    '  "clinicalSpecialty": null,',
    '  "selectedForNextRank": null,',
    '  "clearanceLevel": "",',
    '  "clearanceDate": "",',
    '  "aqds": [],',
    '  "warnings": [],',
    '  "confidence": {"rankHistory": "medium", "aqds": "medium"}',
    '}',
  ].join('\n');
}

function buildOsrSystemPrompt(odcResult) {
  const ctx = odcResult.name
    ? `Officer context from ODC: name=${odcResult.name}, rank=${odcResult.rank || 'unknown'}, designator=${odcResult.designator || 'unknown'}.`
    : 'ODC data not available.';
  return [
    'You are a Navy personnel record parser. You are parsing ONLY the Officer Summary Record (OSR).',
    'RETURN ONLY a valid JSON object. No markdown, no code fences, no explanation.',
    ctx,
    '',
    '=== EDUCATION ===',
    'hasUndergrad: true if any undergraduate degree is listed.',
    'hasMedicalSchool: true if medical school (MD/DO) or nursing degree is listed.',
    '',
    '=== RANK HISTORY FROM OSR ===',
    'The OSR contains a promotion section with column headers: HIGHEST FLAG | CAPT | CDR | LCDR | LT | LTJG | ENS | HIGHEST CWO',
    'Below those headers are the actual date-of-rank values, one per column, in YYMMDD format.',
    '',
    'CRITICAL — COLUMN ALIGNMENT: The header row has 6 rank columns. Dates only appear under ranks',
    'the officer has actually been promoted to. Count columns carefully left-to-right.',
    'A blank cell under CAPT means the officer has NOT been promoted to CAPT. Do not assume the',
    'leftmost date belongs under CAPT. Medical Corps officers often commission directly as LT,',
    'so only CDR, LCDR, and LT columns will have dates — CAPT, LTJG, ENS will be blank.',
    'EXAMPLE: If you see three dates (240901, 180901, 120521) and the CAPT column is blank,',
    '  then CDR=240901, LCDR=180901, LT=120521. NOT CAPT=240901, CDR=180901, LCDR=120521.',
    '',
    'OSR dates use YYMMDD format: first 2 digits = YY (year 2000s), next 2 = MM (month), last 2 = DD (day).',
    '  Examples: "240901" → year=24=2024, month=09, day=01 → 2024-09-01  ← CDR date',
    '            "180901" → year=18=2018, month=09, day=01 → 2018-09-01  ← LCDR date',
    '            "120521" → year=12=2012, month=05, day=21 → 2012-05-21  ← LT date',
    'YYMMDD is unambiguous because MM must be 01–12; if the first 2 digits (as MM) would be > 12 or 00, the format is wrong.',
    'Return [] if no promotion dates found in the OSR.',
    '',
    '=== AQD EXTRACTION (OSR ONLY) ===',
    'Extract AQD codes from the OSR "Special Qualifications" section.',
    'OSR may spell out AQD names (e.g. "67A Executive Medicine") — extract just the code ("67A").',
    'EXCLUDE: clearance codes (SS/TT/VV/TS), rank abbrevs (ENS/LTJG/LT/LCDR/CDR/CAPT),',
    '  4-digit designator codes (2100–2399), report types (RG/CC/AT/TR).',
    'Return [] if no Special Qualifications section found.',
    '',
    '=== COMPLETED QUALIFICATIONS & COURSES (for "already done" detection) ===',
    'List every item the officer has ALREADY COMPLETED, drawn from TWO OSR sections:',
    '  1. "SPECIAL QUALIFICATIONS" block — the named qualification labels listed for this officer',
    '     (e.g. "NMQSLA GRAD", "JPME PHASE1", "FMFWO", "EXECUTIVE MED", "INTERN", "FAM PHYS",',
    '     "ASSTPROF", "ASSCPROF", "DIR HS/PGM", "CMD QUAL PRGM", "HLTH SEC COOP", "HOSPSHIP").',
    '  2. "SERVICE SCHOOLS ATTENDED" block — each COURSE name listed (e.g. "MEDXELLENCE", "AROC",',
    '     "MTM-DIDACTICS", "COMBAT CASE CA", "INT CLNMAN DEC"). Take the course NAME, not the date/weeks.',
    'Copy each label/name VERBATIM. These represent training/qualifications the officer has FINISHED,',
    '  so downstream logic can avoid recommending things already done.',
    'Return [] if neither section is present.',
    '',
    'Return ONLY this JSON:',
    '{',
    '  "hasUndergrad": false,',
    '  "hasMedicalSchool": false,',
    '  "rankHistory": [{"rank": "CDR", "date": "YYYY-MM-DD"}],',
    '  "aqds": [],',
    '  "specialQualifications": []',
    '}',
  ].join('\n');
}

function buildPsrSystemPrompt(odcResult) {
  // Build grade-period context from rankHistory so AI can sanity-check payGrades.
  let gradeContext = '';
  if (Array.isArray(odcResult.rankHistory) && odcResult.rankHistory.length > 0) {
    const sorted = [...odcResult.rankHistory].sort((a, b) => a.date.localeCompare(b.date));
    const lines = sorted.map((entry, i) => {
      const next = sorted[i + 1];
      return next
        ? `  ${entry.rank} from ${entry.date} to ${next.date}`
        : `  ${entry.rank} from ${entry.date} to present`;
    });
    gradeContext = '\nOfficer grade history (use to verify payGrade per FITREP period):\n' + lines.join('\n');
  }
  const ctx = odcResult.rank
    ? `Officer context from ODC: rank=${odcResult.rank}, name=${odcResult.name || 'unknown'}.${gradeContext}`
    : 'ODC data not available.';
  return [
    'You are a Navy personnel record parser. You are parsing ONLY the Performance Summary Record (PSR).',
    'RETURN ONLY a valid JSON object. No markdown, no code fences, no explanation.',
    ctx,
    '',
    '=== PSR PARSING (CRITICAL — NO HALLUCINATION) ===',
    'STRICT RULE: Every field you extract must come VERBATIM from the document text. Do NOT infer, guess, or fill in missing values.',
    'Station/command names: copy EXACTLY as they appear. Do NOT substitute, abbreviate, or invent command names.',
    '  If a station name is garbled or unreadable, use the garbled text as-is or leave it blank — NEVER guess a real command name.',
    'Numbers (scores, averages, counts): copy EXACTLY from the document. Do NOT round, estimate, or calculate.',
    '',
    'DATE FORMAT FOR startDate/endDate: PSR period dates are 6-digit MMDDYY → convert to YYYY-MM-DD.',
    '  Parse as: first 2 digits = MM (month 01–12), middle 2 = DD (day 01–31), last 2 = YY (year, always 2000s).',
    '  Examples from a real PSR record:',
    '    "061212" → MM=06 (June),    DD=12, YY=12 → 2012-06-12  (Jun 12, 2012)',
    '    "013113" → MM=01 (January), DD=31, YY=13 → 2013-01-31  (Jan 31, 2013)',
    '    "070115" → MM=07 (July),    DD=01, YY=15 → 2015-07-01  (Jul 01, 2015)',
    '    "100311" → MM=10 (October), DD=03, YY=11 → 2011-10-03  (Oct 03, 2011)',
    'CRITICAL: The FIRST two digits are the MONTH. "06" at the start = June — NOT day 6.',
    'VALIDATION: If the middle 2 digits (DD) would exceed 31, you have MM and DD reversed — swap them.',
    'If a date is garbled or unreadable, use "" (empty string) rather than guessing.',
    '',
    '=== PSR TWO-LINE ROW FORMAT — CRITICAL ===',
    'Each FITREP in the PSR spans EXACTLY TWO physical lines. Always combine both lines into ONE JSON entry.',
    'NEVER create two separate FITREP objects from a single two-line row.',
    '',
    'LINE 1 of each FITREP contains (left to right):',
    '  payGrade (O1–O6) | station (part 1) | duty title | START DATE (MMDDYY) | months | RS last name | RS payGrade | RS title',
    '  | 5 trait counts | IND_PERIOD_AVG | RS_REPORT_COUNT | X_mark | PRT_result',
    '',
    'LINE 2 of each FITREP (the continuation line) contains:',
    '  station (part 2) | END DATE (MMDDYY) | RS initials | IND_RUNNING_AVG | RSCA | SP_cnt | PR_cnt | P_cnt | MP_cnt | EP_cnt | reportType',
    '',
    '=== DUTY TITLE OVERFLOW — VERY COMMON CAUSE OF PHANTOM FITREPS ===',
    'When the duty title on LINE 1 is long (e.g., "ASST PROFESSOR", "ASSOC PROFESSOR", "CHIEF RESIDENT"),',
    'the tail of the duty title OVERFLOWS and appears at the START of LINE 2, before the end date.',
    'EXAMPLES of overflow fragments you will see at the start of LINE 2:',
    '  "FESS" — overflow from "PROFESSOR" (PROFES|SOR split, "FESS" continues on line 2)',
    '  "FESSOR" — overflow from "PROFESSOR"',
    '  "OFESSO" — overflow from "PROFESSOR"',
    '  "OR" — overflow from "PROFESSOR"',
    '  "R" — single letter overflow from any word',
    '  "OCIATE" — overflow from "ASSOCIATE"',
    '  "ESIDENT" — overflow from "RESIDENT"',
    'CRITICAL: These overflow fragments are NOT a station name, NOT a payGrade, and NOT a new LINE 1.',
    'When you see a LINE 2 that starts with a garbled fragment instead of a recognizable station abbreviation,',
    'SKIP the fragment, find the 6-digit date that follows, and use that as the endDate.',
    'NEVER create a new FITREP entry for overflow text — it belongs to the previous FITREP.',
    '',
    'HOW TO IDENTIFY LINE 2 vs LINE 1:',
    '  LINE 1 starts with a pay grade digit (02, 03, 04, 05, O2, O3, O4, O5) followed by a station abbreviation.',
    '  LINE 2 starts with either a station continuation, overflow text, or directly a 6-digit date.',
    '  If a line does NOT begin with a pay grade digit, it is LINE 2 — do not create a new FITREP for it.',
    '',
    'HOW TO EXTRACT EACH FIELD:',
    '  startDate → START DATE on LINE 1 (MMDDYY format)',
    '  endDate   → END DATE on LINE 2 (MMDDYY format) — skip any overflow text at the start of LINE 2',
    '  station   → station part1 from LINE 1 + station part2 from LINE 2 (omit overflow fragments)',
    '  STATION CONSISTENCY: If the same command appears across multiple consecutive FITREPs, use the same station string for all of them.',
    '  Prefer the most complete form — e.g., if one row has "USU BETHESDA MD" and another has "USU BETHESDA", use "USU BETHESDA MD" for both.',
    '  The rsName may differ across FITREPs at the same command (different reporting seniors) — that is normal and expected.',
    '  rsName    → RS last name from LINE 1',
    '  reportType → 2-letter code at end of LINE 2 (RG/CC/AT/TR)',
    '',
    '=== INDIVIDUAL AVERAGE vs RS AVERAGE — READ THIS CAREFULLY ===',
    'LINE 1 has TWO numbers after the 5 trait counts:',
    '  Number 1: IND_PERIOD_AVG — this officer\'s average score for this period (decimal like 3.33 or 4.17)',
    '  Number 2: RS_REPORT_COUNT — a large INTEGER showing how many total reports this RS has written (e.g., 307, 334, 92, 123)',
    '            THIS IS A COUNT, NOT AN AVERAGE. Do NOT use it as rsAverage.',
    '',
    'LINE 2 has TWO decimals after the RS initials and end date:',
    '  Decimal 1: IND_RUNNING_AVG — this officer\'s running career average (ignore this)',
    '  Decimal 2: RSCA — the RS\'s cumulative grade average across all officers they have ever rated (typically 3.50–5.00)',
    '             THIS IS rsAverage. Always between 3.0 and 5.0.',
    '',
    'REAL EXAMPLE from a CDR\'s PSR:',
    '  LINE 1: "03 NAVHOSP CAMPE PGY 1 061212 8 IVERSON 06 co 0 0 4 2 0  3.33  307  X p"',
    '  LINE 2: "N TRN 013113 K J  3.33  3.79  0 0 12 0 0 RG"',
    '  → individualAverage = 3.33  (from LINE 1, first decimal after trait counts)',
    '  → rsAverage = 3.79          (from LINE 2, SECOND decimal — NOT 307, NOT 3.33)',
    '  → RS_REPORT_COUNT = 307     (the large integer on LINE 1 — IGNORE for rsAverage)',
    '',
    'VALIDATION: If your rsAverage is > 5.0 or < 2.0, you have read the RS_REPORT_COUNT by mistake.',
    '  The correct rsAverage is ALWAYS a decimal between 3.0 and 5.0.',
    '',
    '=== PROMOTION RECOMMENDATION ===',
    'The X mark appears near the end of LINE 1 of each FITREP row, inside the SP|PR|P|MP|EP grid.',
    'After the X comes the PRT (Physical Readiness Test) result: p=passed, N=not observed, B=blank.',
    'The character immediately after X is ALWAYS the PRT result — it is NEVER part of the promotionRec.',
    '',
    '!!! CRITICAL: PRT IS NOT THE PROMOTION RECOMMENDATION !!!',
    'The lowercase "p" or "N" or "B" immediately after the X is the PRT column — IGNORE it for promotionRec.',
    '',
    'THE ONLY WAY to determine promotionRec is the X mark position within the SP|PR|P|MP|EP grid on LINE 1.',
    'The grid has exactly 5 columns in order: SP | PR | P | MP | EP (worst → best, left to right).',
    'The 5 counts before the individualAverage correspond to these 5 columns: SP_cnt PR_cnt P_cnt MP_cnt EP_cnt.',
    'The X mark appears AFTER the RS_REPORT_COUNT (the large integer), in one of these 5 column positions.',
    'The X is always in the column that has the non-zero count (usually one of the 5 counts is non-zero and matches).',
    'EXAMPLE MAPPING: "0 0 4 2 0" → SP=0, PR=0, P=4, MP=2, EP=0. X typically lands in P or MP column.',
    '',
    'REAL EXAMPLES from a CDR\'s PSR (LINE 1 endings):',
    '  "0 0 4 2 0  3.33  307  X p" → counts: SP=0,PR=0,P=4,MP=2,EP=0. X in P column → promotionRec = "P"',
    '  "0 0 1 3 2  4.17  321  X p" → counts: SP=0,PR=0,P=1,MP=3,EP=2. X in P column → promotionRec = "P"',
    '  "0 0 2 1 3  4.17    0  X N" → counts: SP=0,PR=0,P=2,MP=1,EP=3. X in EP column → promotionRec = "EP"',
    '  "0 0 8 4 2  3.67   92  X p" → counts: SP=0,PR=0,P=8,MP=4,EP=2. X in P column → promotionRec = "P"',
    '',
    'DO NOT use the counts from LINE 2 (SP_cnt, PR_cnt, P_cnt, MP_cnt, EP_cnt) to determine the rec.',
    'Those counts show how many reports the RS has given at each level historically — not this officer\'s rec.',
    '',
    'No X in any column → promotionRec = "NOB".',
    '',
    'Valid promotionRec values: "EP", "MP", "P", "PR", "SP", "NOB".',
    '',
    'REPORT TYPE (RPT TYPE column, last column): RG=regular, CC=concurrent, AT=administrative, TR=transfer.',
    'CC and AT reports often have no X in the promo rec grid — set promotionRec="NOB" for those.',
    '',
    'NOB reports: set promotionRec="NOB". Do not count toward averages.',
    'NOTE: fitrepCount, earlyPromotes, mustPromotes, promotables, progressings, fitrepAverage,',
    '  rscaAverage, belowRSAverageCount, psrTrend, and psrIssues are computed server-side from',
    '  the fitreps array you return. Set them to 0/[] and "insufficient_data" — do not try to',
    '  read the PSR summary row for these values, as that row contains RS historical totals,',
    '  not this officer\'s personal counts.',
    '',
    'Return ONLY this JSON:',
    '{',
    '  "fitreps": [{"payGrade":"","station":"","startDate":"","endDate":"","rsName":"","individualAverage":0,"rsAverage":0,"promotionRec":"","reportType":""}],',
    '  "warnings": [],',
    '  "confidence": {"psrData": "high"}',
    '}',
  ].join('\n');
}

// Compute all PSR analytics from raw fitrep rows in deterministic JS.
// Claude's only job is accurate row extraction — counts, averages, trend, and
// issues are computed here so there is nothing left for the model to hallucinate.
function computePsrAnalytics(fitreps) {
  if (!Array.isArray(fitreps) || fitreps.length === 0) {
    return {
      fitrepCount: 0, earlyPromotes: 0, mustPromotes: 0, promotables: 0, progressings: 0,
      fitrepAverage: 0, rscaAverage: 0, belowRSAverageCount: 0, belowRSAveragePercentage: 0,
      psrTrend: 'insufficient_data', psrIssues: [],
    };
  }

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

  for (let i = 1; i < graded.length; i++) {
    const pi = PROMO_ORDER.indexOf(graded[i - 1].promotionRec);
    const ci = PROMO_ORDER.indexOf(graded[i].promotionRec);
    if (pi >= 2 && ci >= 0 && ci < pi - 1 && graded[i - 1].payGrade === graded[i].payGrade) {
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
    psrTrend, psrIssues,
  };
}

// Merge ODC, OSR, and PSR parsed results into the full ExtractedOfficerData shape.
function mergeResults(odcResult, osrResult, psrResult) {
  // Deduplicate AQDs from ODC and OSR.
  const aqds = [...new Set([...(odcResult.aqds || []), ...(osrResult.aqds || [])])];

  // Merge warnings from all three calls.
  const warnings = [
    ...(odcResult.warnings || []),
    ...(psrResult.warnings || []),
  ];

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
    selectedForNextRank: odcResult.selectedForNextRank ?? null,
    rankHistory,
    boardCertified: odcResult.boardCertified ?? null,
    certificationCode: odcResult.certificationCode ?? null,
    clearanceLevel: odcResult.clearanceLevel ?? '',
    clearanceDate: odcResult.clearanceDate ?? '',
    aqds,
    specialQualifications: Array.isArray(osrResult.specialQualifications) ? osrResult.specialQualifications : [],
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

// ============================================================================
// HANDLER
// ============================================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured');
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const body = req.body || {};
    const { action } = body;

    // =========================================================================
    // MODE 1: DOCUMENT PARSING — three focused sequential/parallel Claude calls
    // =========================================================================
    if (action === 'parse-documents') {
      const { odc, osr, psr, odcBase64, osrBase64, psrBase64, psrRecs } = body;

      if (!odc && !osr && !psr) {
        return res.status(400).json({ error: 'At least one document is required' });
      }

      const today = new Date().toISOString().split('T')[0];

      const osrDefault = { hasUndergrad: false, hasMedicalSchool: false, aqds: [] };
      // PSR default only needs raw rows — analytics computed by computePsrAnalytics.
      const psrDefault = { fitreps: [], warnings: [], confidence: { psrData: 'medium' } };

      // Start the slow PSR call (Sonnet, reads the PDF) IMMEDIATELY, concurrent with
      // the ODC/OSR calls, so the function's wall-clock stays under Vercel's 60s
      // maxDuration. Previously PSR waited for ODC to finish first (ODC + PSR could
      // exceed 60s → 504 Gateway Timeout). The PSR carries its own payGrade in every
      // row, so it does not need ODC's grade-history context.
      const psrPromise = psr
        ? (() => {
            const psrText = scrubPII(cleanDocumentText(psr, 'psr'));
            console.log('PSR input text (first 3000):\n', psrText.substring(0, 3000));
            return callClaude(
              buildPsrSystemPrompt({ rank: null, name: null, rankHistory: [] }),
              'Parse this Performance Summary Record (PSR):\n\n' + psrText,
              apiKey,
              'PSR',
              psrBase64 || null,
              'claude-sonnet-4-6',
            ).catch(e => {
              console.error('PSR parse failed (using defaults):', e.message);
              return { ...psrDefault, warnings: ['PSR parsing failed — FITREP data not extracted'] };
            });
          })()
        : Promise.resolve(psrDefault);

      // --- ODC (fast Haiku — must finish before OSR, whose prompt uses its results) ---
      let odcResult = {
        name: null, rank: null, designator: null, yearGroup: null,
        clinicalSpecialty: null, selectedForNextRank: null,
        rankHistory: [], boardCertified: null, certificationCode: null,
        clearanceLevel: '', clearanceDate: '', aqds: [], warnings: [],
        confidence: { rankHistory: 'medium', aqds: 'medium' },
      };

      if (odc) {
        const odcText = scrubPII(cleanDocumentText(odc, 'odc'));
        console.log('ODC input text (first 2000):\n', odcText.substring(0, 2000));
        const rawOdcResult = await callClaude(
          buildOdcSystemPrompt(today),
          'Parse this Officer Data Card (ODC):\n\n' + odcText,
          apiKey,
          'ODC',
          odcBase64 || null,
          'claude-haiku-4-5-20251001',
        );
        // Validate ODC dates NOW so confidence.rankHistory is set before mergeResults
        // decides whether to fall back to OSR dates.
        odcResult = validateParsed(rawOdcResult);
        console.log('ODC result (validated):', JSON.stringify(odcResult).substring(0, 600));
      }

      // --- OSR (fast Haiku, uses ODC context) ---
      const osrResult = osr
        ? await callClaude(
            buildOsrSystemPrompt(odcResult),
            'Parse this Officer Summary Record (OSR):\n\n' + scrubPII(cleanDocumentText(osr, 'osr')),
            apiKey,
            'OSR',
            osrBase64 || null,
            'claude-haiku-4-5-20251001',
          ).catch(e => {
            console.error('OSR parse failed (using defaults):', e.message);
            return { ...osrDefault, warnings: ['OSR parsing failed — education and OSR AQDs not extracted'] };
          })
        : osrDefault;

      // --- Await the PSR call that has been running concurrently with ODC/OSR ---
      const psrResult = await psrPromise;

      const merged = mergeResults(odcResult, osrResult, psrResult);
      const validated = validateParsed(merged, psrRecs);
      return res.status(200).json(validated);
    }

    // =========================================================================
    // MODE 2: Q&A
    // =========================================================================
    const { question: rawQuestion, context: rawContext, documentCount } = body;

    if (!rawQuestion) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const question = scrubPII(rawQuestion);
    const context = scrubPII(rawContext);

    const coursesSupplement = FY26_COURSES_KNOWLEDGE
      ? '\n\n## EMBEDDED STRUCTURED DATA — FY26 NAVMED COURSE CATALOG\n\nUse this as authoritative course/AQD data. It supplements (does not replace) uploaded catalog documents.\n\n' + FY26_COURSES_KNOWLEDGE
      : '';

    const systemPrompt = 'You are a pragmatic, detail-oriented assistant for Navy Medical Corps officers preparing for Career Development Boards (CDB).\n\n'
      + 'Your ONLY job is to extract and present information from the uploaded reference documents and the embedded structured data below. You are NOT a general advisor.\n\n'
      + '## ABSOLUTE REQUIREMENTS:\n\n'
      + 'NEVER GIVE GENERIC ADVICE. Always answer from the documents with specific citations.\n\n'
      + 'Format citations as: "According to [Document Name] [Year]: \'[quoted text]\'\"\n\n'
      + '## YEAR-AWARE CITATION RULES:\n\n'
      + 'Documents are labeled with their year (e.g., [Year: 2026]). '
      + 'Always prefer the most recent year catalog for course recommendations. '
      + 'If citing an older catalog, flag it: "This was in the FY25 catalog - verify it is still offered."\n\n'
      + '## DOCUMENT SEARCH PRIORITY:\n'
      + '1. Medical Corps CDB Slide Presentation (most current guidance)\n'
      + '2. Schofer Promo Prep PDF (comprehensive prep guide)\n'
      + '3. CDB guidance documents\n'
      + '4. Course catalogs - USE MOST RECENT YEAR\n'
      + '5. NAVADMINs and official instructions\n\n'
      + '## RESPONSE STYLE:\n'
      + '- Concrete specifics (course codes, dates, procedures), not principles\n'
      + '- Quote exact language from docs when it matters\n'
      + '- Include all relevant details from the source\n'
      + '- Use "consider" / "you may want to" rather than "you must" unless the doc explicitly requires it\n\n'
      + (documentCount > 0
        ? 'You have access to ' + documentCount + ' document(s), ordered most-recent-year first. Prefer the newest year when making recommendations.'
        : 'No documents uploaded yet. Use the embedded FY26 course catalog data above to answer course-related questions.')
      + coursesSupplement;

    let userMessage = question;
    if (context && context.trim()) {
      userMessage = '## REFERENCE DOCUMENTS TO SEARCH:\n\n'
        + context
        + '\n\n---\n\n'
        + '## QUESTION: ' + question + '\n\n'
        + '## YOUR TASK:\n'
        + '1. Search most recent year documents first\n'
        + '2. Find SPECIFIC information: exact requirements, course names, dates, procedures\n'
        + '3. QUOTE the relevant text and CITE the document name and year\n'
        + '4. NO GENERIC ADVICE - only facts from the documents\n'
        + '5. If not found, say "I could not find..." and stop';
    } else {
      userMessage = '## QUESTION: ' + question + '\n\n'
        + 'No reference documents uploaded yet. Please upload documents to the Documents tab before asking questions.';
    }

    const qaRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!qaRes.ok) {
      const errorText = await qaRes.text();
      console.error('Claude Q&A error:', qaRes.status, errorText);
      return res.status(500).json({ error: 'Failed to get AI response' });
    }

    const qaData = await qaRes.json();
    const answer = (qaData.content && qaData.content[0] && qaData.content[0].text) || 'Sorry, I could not generate a response.';

    return res.status(200).json({
      answer,
      documentsSearched: documentCount || 0,
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
