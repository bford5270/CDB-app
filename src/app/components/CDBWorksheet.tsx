'use client';

import React, { useMemo } from 'react';
import { Printer } from 'lucide-react';
import type { ParsedOfficerData } from './VerifyParsedData';
import { NEXT_RANK } from './CDBChecklist';
import { WOOP_GOAL_COUNT, isGoalStarted, type WoopGoal } from './WOOPGoals';
import {
  CATALOG_FY,
  belowRsStats,
  buildRecordActions,
  buildCourseRecs,
  buildAqdGaps,
  fmtDate,
} from '../utils/worksheetData';

// Printable CDB worksheet: PSR detail, recommendations, and the officer's three
// WOOP goals on one document to take into the board.

const PROMO_LABEL: Record<string, string> = {
  EP: 'Early Promote', MP: 'Must Promote', P: 'Promotable',
  Progressing: 'Progressing', SP: 'Significant Problems',
};

// Month + apostrophed year, so a FITREP period reads "Jan '25 - Dec '25" rather
// than "Jan 25 - Dec 25", which looks like a day of the month on a printed page.
function fmtMonth(iso?: string): string {
  if (!iso) return '\u2014';
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  return `${mon} \u2019${String(d.getFullYear()).slice(-2)}`;
}

function fmtNum(n?: number, digits = 2): string {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n.toFixed(digits) : '—';
}

interface CDBWorksheetProps {
  officerData: ParsedOfficerData;
  goals: WoopGoal[];
  className?: string;
}

export function CDBWorksheet({ officerData: d, goals, className = '' }: CDBWorksheetProps) {
  const fitreps = useMemo(
    () => [...(d.fitreps || [])].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')),
    [d.fitreps]
  );

  const belowRs = useMemo(() => belowRsStats(d.fitreps || []), [d.fitreps]);

  const recordActions = useMemo(() => buildRecordActions(d), [d]);
  const courseRecs = useMemo(() => buildCourseRecs(d), [d]);
  const aqdGaps = useMemo(() => buildAqdGaps(d), [d]);
  const startedGoals = goals.filter(isGoalStarted);

  const nextRank = NEXT_RANK[d.currentRank] || '';
  const prepared = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className={className}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #cdb-worksheet, #cdb-worksheet * { visibility: visible; }
          #cdb-worksheet {
            position: absolute; left: 0; top: 0; width: 100%;
            padding: 0; margin: 0; font-size: 10pt;
          }
          .no-print { display: none !important; }
          .page-break { break-before: page; }
          .avoid-break { break-inside: avoid; }
          @page { margin: 0.5in; }
        }
      `}</style>

      <div className="no-print bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">CDB worksheet</h2>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Your PSR detail, record-correction actions and {CATALOG_FY} course recommendations,
            with your WOOP goals, on one printable document.
            {startedGoals.length === 0 && ' Your goals are still blank — fill them in on the WOOP Goals tab first.'}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      <div id="cdb-worksheet" className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 text-gray-900">

        {/* Header */}
        <header className="avoid-break border-b-2 border-gray-800 pb-3">
          <p className="text-center text-xs font-bold tracking-widest text-gray-700">CUI</p>
          <h1 className="text-xl font-bold mt-1">Career Development Board Worksheet</h1>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <p><span className="font-semibold">Name:</span> {d.name || '—'}</p>
            <p><span className="font-semibold">Rank:</span> {d.currentRank || '—'}{nextRank && ` (next: ${nextRank})`}</p>
            <p><span className="font-semibold">Designator:</span> {d.designator || '—'}</p>
            <p><span className="font-semibold">Prepared:</span> {prepared}</p>
          </div>
        </header>

        {/* 1. Record snapshot */}
        <section className="avoid-break">
          <h2 className="text-base font-bold border-b border-gray-400 mb-2">1. Record snapshot</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <p><span className="font-semibold">Board certification:</span>{' '}
              {d.boardCertified === true ? 'Certified (code K)'
                : d.boardCertified === false ? `Not certified${d.certificationCode ? ` (code ${d.certificationCode})` : ''}`
                : 'Not determined'}</p>
            <p><span className="font-semibold">Clearance:</span> {d.clearanceLevel || '—'}{d.clearanceDate ? ` (${fmtDate(d.clearanceDate)})` : ''}</p>
            <p><span className="font-semibold">Undergraduate degree:</span> {d.hasUndergrad ? 'On record' : 'Not on record'}</p>
            <p><span className="font-semibold">Medical school:</span> {d.hasMedicalSchool ? 'On record' : 'Not on record'}</p>
          </div>

          <div className="mt-2 text-sm space-y-1">
            <p><span className="font-semibold">Rank history:</span>{' '}
              {(d.rankHistory || []).length
                ? d.rankHistory.map(r => `${r.rank} ${fmtDate(r.date)}`).join(' · ')
                : '—'}</p>
            <p><span className="font-semibold">AQDs ({(d.aqds || []).length}):</span> {(d.aqds || []).join(', ') || '—'}</p>
            <p><span className="font-semibold">Personal awards ({(d.awards || []).length}):</span>{' '}
              {(d.awards || []).length
                ? d.awards.map(a => `${a.name}${a.count > 1 ? ` (×${a.count})` : ''}`).join(', ')
                : '— none found on the OSR'}</p>
            <p><span className="font-semibold">Completed per OSR ({(d.specialQualifications || []).length}):</span>{' '}
              {(d.specialQualifications || []).join(', ') || '—'}</p>
          </div>
        </section>

        {/* 2. PSR detail */}
        <section>
          <h2 className="text-base font-bold border-b border-gray-400 mb-2">2. PSR detail</h2>

          <div className="grid grid-cols-4 gap-3 text-sm avoid-break">
            {[
              ['FITREPs', String(d.fitrepCount || fitreps.length || 0)],
              ['Trait average', fmtNum(d.fitrepAverage)],
              ['RS cumulative avg', fmtNum(d.rscaAverage)],
              ['Trend', d.psrTrend ? d.psrTrend.replace(/_/g, ' ') : '—'],
              ['Early Promote', String(d.earlyPromotes || 0)],
              ['Must Promote', String(d.mustPromotes || 0)],
              ['Promotable', String(d.promotables || 0)],
              ['Below RS average', belowRs.total ? `${belowRs.count} of ${belowRs.total} (${belowRs.pct}%)` : '—'],
            ].map(([label, value]) => (
              <div key={label} className="border border-gray-300 rounded p-2">
                <p className="text-xs text-gray-600">{label}</p>
                <p className="font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {fitreps.length > 0 ? (
            <table className="w-full mt-3 text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  {['Period', 'Pay grade', 'Station', 'Type', 'Ind avg', 'RS avg', 'Δ', 'Promotion rec'].map(h => (
                    <th key={h} className="border border-gray-300 px-1.5 py-1 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fitreps.map((f, i) => {
                  const delta = (typeof f.individualAverage === 'number' && typeof f.rsAverage === 'number' && f.rsAverage > 0)
                    ? f.individualAverage - f.rsAverage
                    : null;
                  return (
                    <tr key={i}>
                      <td className="border border-gray-300 px-1.5 py-1 whitespace-nowrap">
                        {fmtMonth(f.startDate)} – {fmtMonth(f.endDate)}
                      </td>
                      <td className="border border-gray-300 px-1.5 py-1">{f.payGrade || '—'}</td>
                      <td className="border border-gray-300 px-1.5 py-1">{f.station || '—'}</td>
                      <td className="border border-gray-300 px-1.5 py-1">{f.reportType || '—'}</td>
                      <td className="border border-gray-300 px-1.5 py-1">{fmtNum(f.individualAverage)}</td>
                      <td className="border border-gray-300 px-1.5 py-1">{fmtNum(f.rsAverage)}</td>
                      <td className={`border border-gray-300 px-1.5 py-1 font-medium ${
                        delta === null ? '' : delta < 0 ? 'text-red-700' : 'text-green-700'
                      }`}>
                        {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}
                      </td>
                      <td className="border border-gray-300 px-1.5 py-1">
                        {f.promotionRec ? (PROMO_LABEL[f.promotionRec] || f.promotionRec) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-600 mt-2">No FITREP rows were parsed from the PSR.</p>
          )}

          {(d.psrIssues || []).length > 0 && (
            <div className="mt-3 avoid-break">
              <h3 className="text-sm font-semibold">Record issues to discuss</h3>
              <ul className="list-disc ml-5 text-sm mt-1 space-y-0.5">
                {d.psrIssues.map((issue, i) => <li key={i}>{issue}</li>)}
              </ul>
              <p className="text-xs text-gray-600 mt-1">
                Gaps in FITREP coverage should be explained — a letter to the board is the route for
                anything your record cannot show.
              </p>
            </div>
          )}
        </section>

        {/* 3. Recommendations */}
        <section className="page-break">
          <h2 className="text-base font-bold border-b border-gray-400 mb-2">3. Recommendations</h2>

          <h3 className="text-sm font-semibold mt-2">Record corrections</h3>
          <table className="w-full mt-1 text-xs border-collapse">
            <tbody>
              {recordActions.map((a, i) => (
                <tr key={i} className="avoid-break">
                  <td className="border border-gray-300 px-1.5 py-1 font-medium w-1/3 align-top">{a.item}</td>
                  <td className="border border-gray-300 px-1.5 py-1 align-top">{a.action}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="text-sm font-semibold mt-4">
            {CATALOG_FY} courses for {d.currentRank || 'your rank'}
          </h3>
          {courseRecs.length > 0 ? (
            <ul className="mt-1 text-xs space-y-1.5">
              {courseRecs.map(c => (
                <li key={c.id} className="avoid-break">
                  <span className="font-medium">{c.name}</span>
                  {c.status && <span className="text-red-700"> — {c.status.split(' — ')[0]}</span>}
                  {c.sessions.map((s, i) => (
                    <div key={i} className="ml-4 text-gray-700">{s}</div>
                  ))}
                  {c.caution && <div className="ml-4 text-amber-800">⚠ {c.caution}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-600 mt-1">
              No outstanding course recommendations for this rank — everything the {CATALOG_FY} catalog
              lists is already reflected in your record.
            </p>
          )}
          <p className="text-xs text-gray-600 mt-1">
            Courses already in your AQDs, OSR special qualifications or service schools are omitted.
            Verify all dates via CeTARS/eNTRS or the NMLPDC ACR site before planning travel.
          </p>

          {aqdGaps.length > 0 && (
            <>
              <h3 className="text-sm font-semibold mt-4">AQDs not yet on your record</h3>
              <ul className="mt-1 text-xs space-y-1">
                {aqdGaps.map(a => (
                  <li key={a.code} className="avoid-break">
                    <span className="font-medium">{a.code} — {a.name}:</span> {a.description}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* 4. WOOP goals */}
        <section className="page-break">
          <h2 className="text-base font-bold border-b border-gray-400 mb-2">
            4. WOOP goals
          </h2>
          <p className="text-xs text-gray-600 mb-2">
            Wish · Outcome · Obstacle · Plan — written by the officer.
          </p>

          {Array.from({ length: WOOP_GOAL_COUNT }, (_, i) => {
            const g = goals[i];
            const blank = !g || !isGoalStarted(g);
            return (
              <div key={i} className="avoid-break border border-gray-400 rounded mb-3">
                <div className="bg-gray-100 px-2 py-1 flex items-baseline justify-between">
                  <span className="text-sm font-semibold">Goal {i + 1}</span>
                  {g?.horizon && <span className="text-xs text-gray-700">Target: {g.horizon}</span>}
                </div>
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    {([
                      ['Wish', g?.wish],
                      ['Outcome', g?.outcome],
                      ['Obstacle', g?.obstacle],
                      ['Plan (if–then)', g?.plan],
                    ] as Array<[string, string | undefined]>).map(([label, value]) => (
                      <tr key={label}>
                        <td className="border-t border-gray-300 px-2 py-1 font-medium w-28 align-top">{label}</td>
                        <td className="border-t border-gray-300 px-2 py-1 align-top">
                          {value?.trim()
                            ? <span className="whitespace-pre-wrap">{value}</span>
                            : <span className="text-gray-400">
                                {blank ? ' ' : '(not filled in)'}
                              </span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>

        <footer className="pt-2 border-t border-gray-400 text-xs text-gray-600">
          <p>
            Generated from your uploaded ODC, OSR and PSR plus the {CATALOG_FY} Navy Medicine
            Leadership Course Catalog. Parsed values are AI-extracted — verify against your record
            before relying on them. Course dates and quotas are subject to change.
          </p>
          <p className="text-center font-bold tracking-widest text-gray-700 mt-2">CUI</p>
        </footer>
      </div>
    </div>
  );
}

export default CDBWorksheet;
