import { useRef } from 'react';
import { Printer, X, Anchor, ExternalLink } from 'lucide-react';
import type { ParsedOfficerData } from './VerifyParsedData';

// ── Update this URL when the scheduling link is confirmed ──
const SCHEDULING_URL = 'https://outlook.office365.com/YOUR_SCHEDULING_LINK';
const SCHEDULING_LABEL = 'Schedule Your CDB';

interface PrintableSummaryProps {
  officerData: ParsedOfficerData;
  onClose: () => void;
}

const WARFARE_AQDS = ['LA7', 'BX2', 'FMF', 'SW', 'AW', 'SS', 'EXW', 'SCW'];
const RANK_ORDER = ['ENS', 'LTJG', 'LT', 'LCDR', 'CDR', 'CAPT'];
const rankGTE = (a: string, b: string) => RANK_ORDER.indexOf(a) >= RANK_ORDER.indexOf(b);

function certLabel(o: ParsedOfficerData): string {
  if (o.certificationCode === 'K' || o.boardCertified === true) return 'Board Certified (K)';
  if (o.certificationCode === 'T') return 'In Training / Residency (T)';
  if (o.certificationCode === 'J' || o.boardCertified === false) return 'Board Eligible, Not Certified (J)';
  return 'Not detected';
}

function buildGaps(o: ParsedOfficerData): string[] {
  const gaps: string[] = [];
  const rank = o.currentRank;
  const hasWarfare = WARFARE_AQDS.some(q => o.aqds.includes(q));

  if (o.certificationCode !== 'K' && o.boardCertified !== true && rankGTE(rank, 'LCDR'))
    gaps.push('Board certification (K code) — critical for O-5 selection');
  if (o.fitrepAverage > 0 && o.fitrepAverage < 4.0)
    gaps.push(`FITREP average ${o.fitrepAverage.toFixed(2)} — below competitive threshold`);
  if (o.psrTrend === 'declining')
    gaps.push('Declining FITREP trend — consider letter to the board');
  if ((o.belowRSAveragePercentage ?? 0) > 30)
    gaps.push(`Below RS average in ${o.belowRSAveragePercentage}% of reports`);
  if (!hasWarfare && rankGTE(rank, 'LCDR'))
    gaps.push('No warfare qualification (BX2/FMF or LA7/SW) on record');
  if (!o.jointDuty && rankGTE(rank, 'CDR'))
    gaps.push('No joint duty assignment — required for senior leadership');
  if (!o.jointDuty && rankGTE(rank, 'LCDR'))
    gaps.push('JPME Phase I not complete — begin distance learning');
  if (!o.commandTour && rankGTE(rank, 'CDR'))
    gaps.push('No command / department head tour documented');
  if ((o.deployments ?? 0) === 0 && rankGTE(rank, 'LCDR'))
    gaps.push('No deployment experience on record');
  return gaps;
}

function buildStrengths(o: ParsedOfficerData): string[] {
  const strengths: string[] = [];
  const hasWarfare = WARFARE_AQDS.some(q => o.aqds.includes(q));

  if (o.certificationCode === 'K' || o.boardCertified === true)
    strengths.push('Board certified (K code)');
  if (o.fitrepAverage >= 4.5)
    strengths.push(`Strong FITREP average: ${o.fitrepAverage.toFixed(2)}`);
  if ((o.earlyPromotes ?? 0) > 0)
    strengths.push(`${o.earlyPromotes} Early Promote recommendation(s)`);
  if (o.psrTrend === 'improving')
    strengths.push('Improving FITREP trend');
  if (hasWarfare)
    strengths.push(`Warfare qualification: ${WARFARE_AQDS.filter(q => o.aqds.includes(q)).join(', ')}`);
  if (o.jointDuty)
    strengths.push('Joint duty assignment complete');
  if (o.commandTour)
    strengths.push('Command / department head tour complete');
  if ((o.deployments ?? 0) >= 2)
    strengths.push(`${o.deployments} deployments`);
  return strengths;
}

// Questions tailored by rank
function boardQuestions(rank: string): string[] {
  const base = [
    'What does my PSR trend tell you, and what should I do about it?',
    'Am I on track for my next promotion board — what\'s my biggest gap?',
    'Which AQDs should I prioritize at my next PCS?',
    'Should I be considering a Milestone position, and how do I apply?',
    'How do I work with my detailer to get the right next billet?',
  ];
  if (rankGTE(rank, 'CDR')) {
    base.push('What jobs put me in the best position for O-6?');
    base.push('Do I need a letter to the board, and what should it say?');
  }
  if (rank === 'LCDR') {
    base.push('Should I pursue the 67A (Executive Medicine) AQD — do I qualify?');
    base.push('What broadening assignment would strengthen my record most?');
  }
  if (rank === 'LT') {
    base.push('What operational billet should I request at my next PCS?');
    base.push('How do I get a warfare qualification (BX2 or LA7)?');
  }
  return base;
}

export function PrintableSummary({ officerData: o, onClose }: PrintableSummaryProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const gaps = buildGaps(o);
  const strengths = buildStrengths(o);
  const questions = boardQuestions(o.currentRank);
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const fitreps = o.fitreps ?? [];
  const prCount = fitreps.filter(f => f.promotionRec === 'PR').length;

  function handlePrint() {
    window.print();
  }

  return (
    <>
      {/* ── Screen: modal wrapper (hidden on print) ── */}
      <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8 print:hidden">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4">
          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-900">CDB Preparation Sheet</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 text-sm"
              >
                <Printer className="w-4 h-4" />
                Print / Save as PDF
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Preview (scrollable) */}
          <div className="p-6 overflow-y-auto max-h-[75vh]">
            <PrintContent
              o={o}
              gaps={gaps}
              strengths={strengths}
              questions={questions}
              today={today}
              prCount={prCount}
            />
          </div>
        </div>
      </div>

      {/* ── Print-only full-page render ── */}
      <div ref={printRef} className="hidden print:block">
        <PrintContent
          o={o}
          gaps={gaps}
          strengths={strengths}
          questions={questions}
          today={today}
          prCount={prCount}
        />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared content rendered in both preview and print
// ─────────────────────────────────────────────────────────────────────────────

interface PrintContentProps {
  o: ParsedOfficerData;
  gaps: string[];
  strengths: string[];
  questions: string[];
  today: string;
  prCount: number;
}

function PrintContent({ o, gaps, strengths, questions, today, prCount }: PrintContentProps) {
  return (
    <div className="font-sans text-gray-900 text-sm leading-relaxed print:text-[11px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-blue-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Anchor className="w-6 h-6 text-blue-800" />
          <div>
            <div className="text-lg font-bold text-blue-900">Navy Medical Corps</div>
            <div className="text-xs text-blue-700 font-medium uppercase tracking-wide">Career Development Board — Preparation Summary</div>
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>Generated {today}</div>
          <div className="font-medium text-gray-700 mt-0.5">{o.currentRank || '—'} · {o.designator || '—'}</div>
        </div>
      </div>

      {/* Record Snapshot */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* FITREP summary */}
        <div className="col-span-2 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">FITREP Summary</div>
          <div className="grid grid-cols-6 gap-2 text-center">
            {[
              { label: 'Total', value: o.fitrepCount || 0 },
              { label: 'Average', value: o.fitrepAverage > 0 ? o.fitrepAverage.toFixed(2) : '—' },
              { label: 'EP', value: o.earlyPromotes ?? 0 },
              { label: 'MP', value: o.mustPromotes ?? 0 },
              { label: 'P', value: o.promotables ?? 0 },
              { label: 'PR', value: prCount },
            ].map(s => (
              <div key={s.label}>
                <div className="text-[10px] text-gray-500">{s.label}</div>
                <div className="font-bold text-blue-700 text-base">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Trend: <span className={`font-semibold ${
              o.psrTrend === 'improving' ? 'text-green-700' :
              o.psrTrend === 'declining' ? 'text-red-700' : 'text-blue-700'
            }`}>{o.psrTrend ?? 'unknown'}</span>
            {(o.belowRSAveragePercentage ?? 0) > 0 &&
              <span className="ml-2 text-amber-700">· Below RS average: {o.belowRSAveragePercentage}% of reports</span>}
          </div>
        </div>

        {/* Qualifications */}
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Qualifications</div>
          <div className="space-y-1 text-xs">
            <div><span className="text-gray-500">Board Cert:</span> <span className="font-medium">{certLabel(o)}</span></div>
            <div><span className="text-gray-500">Clearance:</span> <span className="font-medium">{o.clearanceLevel || 'Not on record'}</span></div>
            <div><span className="text-gray-500">Joint Duty:</span> <span className="font-medium">{o.jointDuty ? 'Complete' : 'Not complete'}</span></div>
            <div><span className="text-gray-500">Cmd/DH Tour:</span> <span className="font-medium">{o.commandTour ? 'Complete' : 'Not complete'}</span></div>
            <div><span className="text-gray-500">Deployments:</span> <span className="font-medium">{o.deployments ?? 0}</span></div>
            {o.aqds.length > 0 && (
              <div><span className="text-gray-500">AQDs:</span> <span className="font-medium font-mono">{o.aqds.join(' · ')}</span></div>
            )}
          </div>
        </div>
      </div>

      {/* Two-column: Gaps + Strengths */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="border border-red-200 bg-red-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">Gaps to Address</div>
          {gaps.length > 0 ? (
            <ul className="space-y-1">
              {gaps.map((g, i) => (
                <li key={i} className="text-xs text-red-900 flex items-start gap-1.5">
                  <span className="mt-0.5 text-red-500 flex-shrink-0">▸</span>{g}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-red-700 italic">No major gaps detected.</p>
          )}
        </div>

        <div className="border border-green-200 bg-green-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Record Strengths</div>
          {strengths.length > 0 ? (
            <ul className="space-y-1">
              {strengths.map((s, i) => (
                <li key={i} className="text-xs text-green-900 flex items-start gap-1.5">
                  <span className="mt-0.5 text-green-500 flex-shrink-0">✓</span>{s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-green-700 italic">Complete the Verify step for strength analysis.</p>
          )}
        </div>
      </div>

      {/* Questions for the board */}
      <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 mb-4">
        <div className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-2">Questions to Ask at Your CDB</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {questions.map((q, i) => (
            <div key={i} className="text-xs text-blue-900 flex items-start gap-1.5">
              <span className="mt-0.5 text-blue-500 flex-shrink-0 font-bold">{i + 1}.</span>{q}
            </div>
          ))}
        </div>
      </div>

      {/* Notes area */}
      <div className="border border-gray-200 rounded-lg p-3 mb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes from CDB</div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="border-b border-gray-200 pb-1 h-5" />
          ))}
        </div>
      </div>

      {/* Footer with scheduling link */}
      <div className="border-t-2 border-blue-800 pt-3 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Generated by <strong>Navy Medical Corps CDB App</strong> · For official counseling consult your detailer, CO, or BUMED Career Development Division
        </div>
        <a
          href={SCHEDULING_URL}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-semibold hover:bg-blue-800 print:bg-blue-700 print:text-white no-underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink className="w-3 h-3" />
          {SCHEDULING_LABEL}
        </a>
      </div>
    </div>
  );
}
