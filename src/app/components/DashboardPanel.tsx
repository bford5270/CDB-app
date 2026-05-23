'use client';

import type { ParsedOfficerData } from './VerifyParsedData';

export interface DocStatus {
  odc: boolean;
  osr: boolean;
  psr: boolean;
}

export interface DocMeta {
  odc?: { name: string; size: number; uploadedAt: string } | null;
  osr?: { name: string; size: number; uploadedAt: string } | null;
  psr?: { name: string; size: number; uploadedAt: string } | null;
}

interface ActionItem {
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
  section: 'checklist' | 'analysis' | 'qa';
}

interface Milestone {
  label: string;
  status: 'done' | 'current' | 'future';
}

const RANK_ORDER = ['ENS', 'LTJG', 'LT', 'LCDR', 'CDR', 'CAPT'];

function rankIdx(rank: string) {
  return RANK_ORDER.indexOf((rank || '').toUpperCase());
}

function hasAqd(data: ParsedOfficerData, code: string) {
  return (data.aqds || []).some(a => a.toUpperCase() === code.toUpperCase());
}

function deriveMilestones(data: ParsedOfficerData): Milestone[] {
  const ri = rankIdx(data.currentRank);
  const jpme1 = data.jpmeComplete || hasAqd(data, 'JS7');
  const jpme2 = hasAqd(data, 'JS8');

  return [
    { label: 'DIVOLC / BROC', status: ri >= 3 ? 'done' : ri === 2 ? 'current' : 'future' },
    { label: 'ILC',            status: ri >= 4 ? 'done' : ri === 3 ? 'current' : 'future' },
    { label: 'JPME I',         status: jpme1 ? 'done' : ri >= 3 ? 'current' : 'future' },
    { label: 'SLC',            status: ri >= 5 ? 'done' : ri === 4 ? 'current' : 'future' },
    { label: '67A AQD',        status: hasAqd(data, '67A') ? 'done' : ri >= 4 ? 'current' : 'future' },
    { label: 'JPME II',        status: jpme2 ? 'done' : ri >= 4 ? 'current' : 'future' },
    { label: 'Command tour',   status: data.commandTour ? 'done' : ri >= 4 ? 'current' : 'future' },
  ];
}

function deriveActions(data: ParsedOfficerData): ActionItem[] {
  const ri = rankIdx(data.currentRank);
  const rank = (data.currentRank || '').toUpperCase();
  const actions: ActionItem[] = [];

  if (ri >= 3 && data.boardCertified === false) {
    actions.push({
      title: 'Achieve board certification',
      detail: 'K subspecialty code is reviewed at every O-5 and O-6 board — a major differentiator',
      priority: 'high', section: 'checklist',
    });
  }

  if (ri >= 3 && !data.jpmeComplete && !hasAqd(data, 'JS7')) {
    actions.push({
      title: 'Complete JPME Phase I (JS7)',
      detail: 'Fleet Seminar Program or Naval Command & Staff Online; required for 67B AQD',
      priority: 'high', section: 'qa',
    });
  }

  if (rank === 'CDR') {
    actions.push({
      title: 'Complete SLC — Senior Leadership Course',
      detail: 'Required service school for all CDRs (CIN H-7C-0107); must hold ILC first',
      priority: 'high', section: 'checklist',
    });
  }

  const opAqds = ['6FA', '6FD', '6OW', '6OU', '6OC', '6OE', 'BX2', 'LA7', '6AB', '6OB'];
  if (!opAqds.some(a => hasAqd(data, a))) {
    actions.push({
      title: 'Pursue an operational AQD',
      detail: '6FA, 6FD, BX2, 6OW and similar AQDs signal operational commitment to boards',
      priority: ri >= 3 ? 'high' : 'medium', section: 'qa',
    });
  }

  if (ri >= 3 && ri <= 4 && !hasAqd(data, '67A')) {
    actions.push({
      title: 'Work toward 67A Executive Medicine AQD',
      detail: 'Requires IESC + 2-yr Dept/Div Head tour + master\'s degree',
      priority: 'medium', section: 'checklist',
    });
  }

  if (ri >= 4 && !data.commandTour) {
    actions.push({
      title: 'Plan command tour timing',
      detail: 'Command tour is critical for O-6 selection; coordinate early with your detailer',
      priority: 'medium', section: 'qa',
    });
  }

  if (ri >= 3 && !hasAqd(data, '68I') && !hasAqd(data, '67A')) {
    actions.push({
      title: 'Pursue graduate degree in healthcare management (68I)',
      detail: 'Master\'s in HCM supports 67A Executive Medicine AQD pathway',
      priority: 'low', section: 'qa',
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return actions.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 3);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SourceDocsPanel({ docStatus, docMeta, fitrepCount }: { docStatus: DocStatus; docMeta?: DocMeta; fitrepCount: number }) {
  const docs: { key: keyof DocStatus; label: string; desc: string }[] = [
    { key: 'odc', label: 'Officer Data Card (ODC)', desc: 'Rank, AQDs, clearance, designator' },
    { key: 'osr', label: 'Officer Summary Record (OSR)', desc: 'Education, service schools, quals' },
    { key: 'psr', label: 'Performance Summary Record (PSR)', desc: 'FITREP history, promo recs' },
  ];

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(0)} KB`;

  return (
    <div className="bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3">Source documents</div>
      <div className="space-y-0">
        {docs.map(d => {
          const meta = docMeta?.[d.key];
          return (
            <div key={d.key} className="flex items-center gap-3 py-2.5 border-b border-gray-50">
              <span className="text-base">📄</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800">{d.label}</div>
                {meta ? (
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {meta.name} · {formatSize(meta.size)} · {formatDate(meta.uploadedAt)}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 mt-0.5">{d.desc}</div>
                )}
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                style={docStatus[d.key]
                  ? { background: '#DCFCE7', color: '#166534' }
                  : { background: '#F1F5F9', color: '#94A3B8' }}>
                {docStatus[d.key] ? 'Parsed' : 'Not uploaded'}
              </span>
            </div>
          );
        })}
        {/* FITREP packet row */}
        <div className="flex items-center gap-3 py-2.5">
          <span className="text-base">📋</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-800">FITREP Packet</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {fitrepCount > 0 ? `${fitrepCount} report${fitrepCount !== 1 ? 's' : ''} indexed` : 'Extracted from PSR'}
            </div>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
            style={fitrepCount > 0
              ? { background: '#DBEAFE', color: '#1E40AF' }
              : { background: '#F1F5F9', color: '#94A3B8' }}>
            {fitrepCount > 0 ? `Indexed · ${fitrepCount}` : 'No data'}
          </span>
        </div>
      </div>
    </div>
  );
}

function FitrepPanel({ data }: { data: ParsedOfficerData }) {
  const total = data.fitrepCount || 0;
  const ep = Math.min(data.earlyPromotes || 0, total);
  const mp = Math.min(data.mustPromotes || 0, total - ep);
  const p  = Math.max(0, total - ep - mp);

  const traitPct = data.fitrepAverage ? (data.fitrepAverage / 5) * 100 : 0;
  const rscaPct = data.rscaAverage ? (data.rscaAverage / 5) * 100 : 0;
  const peerTick = 80; // ~4.0/5.0

  const cells = [
    ...Array(ep).fill('ep'),
    ...Array(mp).fill('mp'),
    ...Array(p).fill('p'),
  ];

  const NAVY = '#1B365D';
  const GOLD = '#FFC72C';

  return (
    <div className="bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">FITREP trajectory</div>

      {/* RSCA bar — first per mockup */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs text-gray-500 w-20 flex-shrink-0">RSCA</span>
          <div className="flex-1 h-2 bg-gray-100 rounded-sm relative overflow-visible">
            <div className="h-full rounded-sm" style={{ width: `${rscaPct}%`, background: NAVY }} />
            <div className="absolute top-[-3px] w-0.5 h-[14px] rounded-sm" style={{ left: `${peerTick}%`, background: GOLD }} />
          </div>
          <span className="text-xs font-medium w-9 text-right" style={{ color: NAVY }}>
            {data.rscaAverage ? data.rscaAverage.toFixed(2) : '—'}
          </span>
        </div>
      </div>

      {/* Trait avg bar — second */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs text-gray-500 w-20 flex-shrink-0">Trait avg</span>
          <div className="flex-1 h-2 bg-gray-100 rounded-sm relative overflow-visible">
            <div className="h-full rounded-sm" style={{ width: `${traitPct}%`, background: '#94A3B8' }} />
            <div className="absolute top-[-3px] w-0.5 h-[14px] rounded-sm" style={{ left: `${peerTick}%`, background: GOLD }} />
          </div>
          <span className="text-xs font-medium w-9 text-right text-gray-500">
            {data.fitrepAverage ? data.fitrepAverage.toFixed(2) : '—'}
          </span>
        </div>
      </div>

      {/* EP/MP sparkline */}
      {total > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1 mb-0.5">
            {cells.map((type, i) => (
              <div key={i} className="flex flex-col items-center" style={{ width: '20px' }}>
                <div
                  className="rounded-sm"
                  style={{
                    width: '20px', height: '14px',
                    background: type === 'ep' ? NAVY : type === 'mp' ? '#94A3B8' : '#E2E8F0',
                  }}
                  title={type.toUpperCase()}
                />
                <span style={{ fontSize: 9, color: '#94A3B8', lineHeight: '1.2', marginTop: 1 }}>
                  {type.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: NAVY }} />
              EP ({ep})
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#94A3B8' }} />
              MP ({mp})
            </div>
            {p > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#E2E8F0' }} />
                P ({p})
              </div>
            )}
            <div className="flex items-center gap-1 ml-auto text-xs text-gray-500">
              <div className="w-0.5 h-3.5 rounded-sm" style={{ background: GOLD }} />
              Peer avg
            </div>
          </div>
        </div>
      )}

      {total === 0 && (
        <p className="text-xs text-gray-400">No FITREP data parsed — upload PSR to populate</p>
      )}
    </div>
  );
}

function FitrepCoverageTimeline({ data }: { data: ParsedOfficerData }) {
  const NAVY = '#1B365D';
  const GOLD = '#FFC72C';

  const fitreps = (data.fitreps || []).filter(
    f => f.startDate && f.endDate && f.reportType !== 'NOB'
  );
  if (fitreps.length === 0) return null;

  const parseDate = (s: string) => new Date(s).getTime();
  const sorted = [...fitreps].sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));

  const earliest = parseDate(sorted[0].startDate);
  const latest = parseDate(sorted[sorted.length - 1].endDate);
  const totalMs = Math.max(latest - earliest, 1);

  const toLabel = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
  };

  const recColor = (rec: string) => {
    if (rec === 'EP') return NAVY;
    if (rec === 'MP') return '#64748B';
    if (rec === 'P')  return '#CBD5E1';
    return '#FCA5A5';
  };

  // Find gaps > 45 days between consecutive FITREPs
  const gaps: { start: number; end: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gapStart = parseDate(sorted[i - 1].endDate);
    const gapEnd   = parseDate(sorted[i].startDate);
    if (gapEnd - gapStart > 45 * 24 * 60 * 60 * 1000) {
      gaps.push({ start: gapStart, end: gapEnd });
    }
  }

  return (
    <div className="bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wider text-gray-500">FITREP coverage</div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 10, height: 10, background: NAVY, borderRadius: 2 }}></span>EP</span>
          <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 10, height: 10, background: '#64748B', borderRadius: 2 }}></span>MP</span>
          <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 10, height: 10, background: '#CBD5E1', borderRadius: 2 }}></span>P</span>
          {gaps.length > 0 && <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 10, height: 10, background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 2 }}></span>Gap</span>}
        </div>
      </div>

      {/* Timeline track */}
      <div className="relative" style={{ height: 28 }}>
        <div className="absolute inset-0 rounded" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }} />

        {/* FITREP blocks */}
        {sorted.map((f, i) => {
          const left = ((parseDate(f.startDate) - earliest) / totalMs) * 100;
          const width = Math.max(((parseDate(f.endDate) - parseDate(f.startDate)) / totalMs) * 100, 0.5);
          return (
            <div
              key={i}
              title={`${f.promotionRec || '?'} · ${f.station || ''} · ${f.startDate} – ${f.endDate}`}
              className="absolute top-0 bottom-0 rounded-sm"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: recColor(f.promotionRec || ''),
                opacity: 0.85,
                cursor: 'default',
              }}
            />
          );
        })}

        {/* Gap markers */}
        {gaps.map((g, i) => {
          const left = ((g.start - earliest) / totalMs) * 100;
          const width = Math.max(((g.end - g.start) / totalMs) * 100, 0.5);
          return (
            <div
              key={`gap-${i}`}
              title={`Coverage gap: ${toLabel(g.start)} – ${toLabel(g.end)}`}
              className="absolute top-0 bottom-0"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: 'rgba(252,211,77,0.45)',
                border: '1px solid #FCD34D',
              }}
            />
          );
        })}
      </div>

      {/* Year labels */}
      <div className="flex justify-between mt-1" style={{ fontSize: 9, color: '#94A3B8' }}>
        <span>{toLabel(earliest)}</span>
        <span>{toLabel(latest)}</span>
      </div>

      {gaps.length > 0 && (
        <p className="mt-2 text-xs" style={{ color: '#D97706' }}>
          ⚠ {gaps.length} coverage gap{gaps.length > 1 ? 's' : ''} detected — board members may ask about uncovered periods.
        </p>
      )}
    </div>
  );
}

function MilestonesTimeline({ data }: { data: ParsedOfficerData }) {
  const milestones = deriveMilestones(data);
  const NAVY = '#1B365D';
  const GOLD = '#FFC72C';

  return (
    <div className="bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Career milestones</div>
      <div className="flex items-start overflow-x-auto pb-1">
        {milestones.map((m, i) => (
          <div key={m.label} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center" style={{ minWidth: '72px' }}>
              {/* Dot */}
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                style={
                  m.status === 'done'
                    ? { background: NAVY, border: `2px solid ${NAVY}` }
                    : m.status === 'current'
                    ? { background: '#fff', border: `3px solid ${GOLD}`, boxShadow: `0 0 0 4px rgba(255,199,44,0.18)` }
                    : { background: '#fff', border: '2px solid #CBD5E1' }
                }
              >
                {m.status === 'done' && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <polyline points="2,5 4,7.5 8,3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              {/* Label */}
              <div
                className="text-center mt-1.5 leading-tight"
                style={{
                  fontSize: '10px',
                  color: m.status === 'current' ? NAVY : m.status === 'done' ? '#64748B' : '#94A3B8',
                  fontWeight: m.status === 'current' ? 600 : 400,
                  maxWidth: '68px',
                  wordBreak: 'break-word',
                }}
              >
                {m.label}
              </div>
            </div>
            {/* Connector line */}
            {i < milestones.length - 1 && (
              <div
                className="flex-1 h-px mx-1 mb-5"
                style={{ background: m.status === 'done' ? NAVY : '#E2E8F0', minWidth: '8px' }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendedActionsPanel({
  data,
  onSectionClick,
}: {
  data: ParsedOfficerData;
  onSectionClick?: (section: 'checklist' | 'analysis' | 'qa') => void;
}) {
  const actions = deriveActions(data);
  const GOLD = '#FFC72C';

  const barColor = (p: ActionItem['priority']) =>
    p === 'high' ? GOLD : p === 'medium' ? '#F59E0B' : '#CBD5E1';

  const btnLabel = (s: ActionItem['section']) =>
    s === 'checklist' ? 'View checklist →' : s === 'qa' ? 'Open CDB Q&A →' : 'Step-by-step →';

  return (
    <div className="bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3">Recommended actions</div>
      <div className="space-y-0">
        {actions.map((a, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
            <div className="rounded w-1 flex-shrink-0 self-stretch" style={{ background: barColor(a.priority), minHeight: '36px' }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 leading-snug">{a.title}</div>
              <div className="text-xs text-gray-500 mt-0.5 leading-snug">{a.detail}</div>
            </div>
            {onSectionClick && (
              <button
                onClick={() => onSectionClick(a.section)}
                className="text-xs font-medium whitespace-nowrap px-2.5 py-1.5 rounded border"
                style={{ color: '#1B365D', borderColor: '#1B365D', background: '#F8FAFC' }}
              >
                {btnLabel(a.section)}
              </button>
            )}
          </div>
        ))}
        {actions.length === 0 && (
          <p className="text-sm text-gray-500 py-2">No priority actions identified — record looks strong.</p>
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface DashboardPanelProps {
  officerData: ParsedOfficerData;
  docStatus: DocStatus;
  docMeta?: DocMeta;
  onSectionClick?: (section: 'checklist' | 'analysis' | 'qa') => void;
}

export function DashboardPanel({ officerData, docStatus, docMeta, onSectionClick }: DashboardPanelProps) {
  return (
    <div className="mb-6 space-y-px" style={{ background: '#E2E8F0' }}>
      {/* Row 1: Docs + FITREP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px">
        <SourceDocsPanel docStatus={docStatus} docMeta={docMeta} fitrepCount={officerData.fitrepCount || 0} />
        <FitrepPanel data={officerData} />
      </div>

      {/* Row 2: FITREP coverage timeline */}
      <FitrepCoverageTimeline data={officerData} />

      {/* Row 3: Career milestones */}
      <MilestonesTimeline data={officerData} />

      {/* Row 4: Recommended actions */}
      <RecommendedActionsPanel data={officerData} onSectionClick={onSectionClick} />
    </div>
  );
}
