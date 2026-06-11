import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';

const NAVY = '#1B365D';
const GOLD = '#FFC72C';

// Ranks at O4 and below — the audience this plain-English guide targets.
const JUNIOR_RANKS = new Set(['LCDR', 'LT', 'LTJG', 'ENS']);

export function isJuniorRank(rank: string | undefined | null): boolean {
  return JUNIOR_RANKS.has((rank || '').toUpperCase());
}

interface Term {
  term: string;
  def: string;
}
interface Group {
  heading: string;
  blurb?: string;
  terms: Term[];
}

const GUIDE: Group[] = [
  {
    heading: 'The three documents',
    blurb: 'Everything here is pulled from records you can request through your command or BUPERS.',
    terms: [
      { term: 'ODC — Officer Data Card', def: 'A snapshot of your record: rank history, designator, AQDs, board-certification status, and security clearance.' },
      { term: 'OSR — Officer Summary Record', def: 'Your education, special qualifications, service schools attended, and promotion dates.' },
      { term: 'PSR — Performance Summary Record', def: 'A one-line summary of every FITREP you have ever received — the heart of your promotion case.' },
    ],
  },
  {
    heading: 'Your FITREPs (the timeline & table)',
    blurb: 'Each row is one Fitness Report. Boards read the last ~5 years most closely.',
    terms: [
      { term: 'Reporting period', def: 'The date range a report covers. Reports should be continuous — gaps or overlaps can be questioned by a board.' },
      { term: 'Reporting Senior (RS)', def: 'The officer who wrote and signed the report — usually your CO.' },
      { term: 'Individual average (Ind)', def: 'The average of your trait grades (1.0–5.0) on that report. Higher is better.' },
      { term: 'RS average (RSCA)', def: 'Reporting Senior Cumulative Average — the average grade that RS has given everyone of your rank. It is the bar you are measured against.' },
      { term: '▲ above / ▼ below RS average', def: 'Scoring above your RS’s average is a strength; scoring below is a relative weakness. One ▼ is not fatal — boards look at the trend.' },
    ],
  },
  {
    heading: 'Promotion recommendation (the "Rec" block)',
    blurb: 'Where your RS ranked you among peers in the same summary group, lowest to highest:',
    terms: [
      { term: 'SP — Significant Problems', def: 'Lowest. A serious flag.' },
      { term: 'Progressing', def: 'Developing; below the "promote" line.' },
      { term: 'P — Promotable', def: 'Solid performer, recommended for promotion.' },
      { term: 'MP — Must Promote', def: 'Top tier — a "top block."' },
      { term: 'EP — Early Promote', def: 'Highest; limited to a set percentage of the group — the strongest "top block."' },
      { term: 'EP/MP rate', def: 'Your share of Early/Must Promote reports. Boards weigh this heavily — it is the single biggest performance signal.' },
    ],
  },
  {
    heading: 'Report types you may see',
    terms: [
      { term: 'RG — Regular', def: 'A normal periodic report (the main one).' },
      { term: 'CC — Concurrent', def: 'A second report for a simultaneous duty; overlaps a regular report by design.' },
      { term: 'AT — Active-duty Training', def: 'Reserve / training report.' },
      { term: 'NOB — Not Observed', def: 'Too short to grade — no recommendation given. It neither helps nor hurts you.' },
    ],
  },
  {
    heading: 'Qualifications & promotion timing',
    terms: [
      { term: 'AQDs', def: 'Additional Qualification Designators — codes for special training/quals (e.g. 67A Executive Medicine, JPME). They strengthen your record.' },
      { term: 'Board certification (J / K)', def: 'K = Board Certified, J = Board Eligible. Certification (K) is a major plus for promotion.' },
      { term: 'Below / In / Above zone', def: 'Below zone = not yet your turn (early-promote only). In zone = your primary promotion window — when most officers are selected. Above zone = past your window; selection is harder.' },
      { term: 'FY in-zone', def: 'The fiscal year the selection board will primarily consider you for the next rank.' },
      { term: 'Year Group (YG) & Designator', def: 'YG = the year you entered, used to group you with peers. Designator 2100 = Medical Corps.' },
    ],
  },
];

export function HowToReadRecord() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-lg border mb-6" style={{ borderColor: 'rgba(27,54,93,0.15)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-6 py-4 text-left"
        style={{ borderLeft: `3px solid ${GOLD}` }}
      >
        <div
          className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{ width: 36, height: 36, background: 'rgba(27,54,93,0.08)' }}
        >
          <BookOpen className="w-5 h-5" style={{ color: NAVY }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold" style={{ color: NAVY }}>
            How to read this — a plain-English guide to your record
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            New to FITREPs and promotion boards? Start here. What every term below means.
          </div>
        </div>
        {open
          ? <ChevronDown className="w-5 h-5 flex-shrink-0" style={{ color: NAVY, opacity: 0.5 }} />
          : <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: NAVY, opacity: 0.5 }} />}
      </button>

      {open && (
        <div className="px-6 pb-6 pt-1 space-y-5">
          {GUIDE.map(group => (
            <div key={group.heading}>
              <div className="text-sm font-semibold mb-1" style={{ color: NAVY }}>{group.heading}</div>
              {group.blurb && <div className="text-xs text-gray-500 mb-2">{group.blurb}</div>}
              <dl className="space-y-1.5">
                {group.terms.map(t => (
                  <div key={t.term} className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-x-3 gap-y-0.5">
                    <dt className="text-xs font-semibold" style={{ color: '#334155' }}>{t.term}</dt>
                    <dd className="text-xs text-gray-600 leading-relaxed">{t.def}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <div className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            This guide is general orientation, not official policy. Confirm specifics with your detailer,
            command career counselor, or the current NAVADMIN / BUPERSINST before acting.
          </div>
        </div>
      )}
    </div>
  );
}
