'use client';

import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { FitrepEntry } from './VerifyParsedData';

// ── constants ─────────────────────────────────────────────────────────────────

const REC_NUM: Record<string, number> = { EP: 5, MP: 4, P: 3, PR: 2, SP: 1 };
const REC_COLOR: Record<string, string> = {
  EP: '#16a34a', MP: '#2563eb', P: '#d97706', PR: '#dc2626', SP: '#7c3aed',
};
const REC_LABEL: Record<string, string> = {
  EP: 'Early Promote', MP: 'Must Promote', P: 'Promotable',
  PR: 'Progressing', SP: 'Select Promotable',
};

// Pay grade strip — light→dark as rank increases
const GRADE_BG: Record<string, string> = {
  O1: '#bfdbfe', O2: '#93c5fd', O3: '#60a5fa',
  O4: '#3b82f6', O5: '#1d4ed8', O6: '#1e3a8a',
};
const GRADE_FG: Record<string, string> = {
  O1: '#1e40af', O2: '#1e40af', O3: '#1e3a8a',
  O4: '#fff', O5: '#fff', O6: '#fff',
};

// Station strip — cycling warm/cool palette
const STATION_PAL = [
  '#fca5a5', '#fdba74', '#fde68a', '#86efac',
  '#67e8f9', '#c4b5fd', '#f9a8d4', '#6ee7b7',
  '#7dd3fc', '#a5b4fc', '#d9f99d', '#fcd34d',
];

// ── helpers ───────────────────────────────────────────────────────────────────

function shortDate(d: string): string {
  if (!d) return '';
  const s = d.replace(/-/g, '');
  if (s.length >= 6) {
    const m = parseInt(s.slice(4, 6));
    const y = s.slice(2, 4);
    const mo = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (m >= 1 && m <= 12) return `${mo[m]} '${y}`;
  }
  return d.slice(0, 7);
}

function isNOB(f: FitrepEntry): boolean {
  return (
    !f.promotionRec ||
    f.promotionRec === 'NOB' ||
    f.reportType === 'AT' ||
    f.reportType === 'TR' ||
    (f.individualAverage ?? 0) === 0
  );
}

// ── types ─────────────────────────────────────────────────────────────────────

interface Props {
  fitreps: FitrepEntry[];
  className?: string;
}

// ── component ─────────────────────────────────────────────────────────────────

export function PSRTimeline({ fitreps, className = '' }: Props) {
  if (!fitreps?.length) return null;

  // Build chart rows
  const pts = fitreps.map((f, i) => ({
    i,
    label: shortDate(f.startDate),
    recLevel: !isNOB(f) ? (REC_NUM[f.promotionRec ?? ''] ?? null) : null,
    rec: f.promotionRec ?? 'NOB',
    nob: isNOB(f),
    payGrade: f.payGrade ?? '',
    station: f.station ?? '',
    startDate: f.startDate,
    endDate: f.endDate,
    indAvg: !isNOB(f) ? (f.individualAverage ?? null) : null,
    rsAvg: !isNOB(f) ? (f.rsAverage ?? null) : null,
    reportType: f.reportType ?? '',
  }));

  // Station → color index
  const stCI: Record<string, number> = {};
  let sci = 0;
  fitreps.forEach(f => {
    const s = f.station ?? '';
    if (!(s in stCI)) stCI[s] = sci++ % STATION_PAL.length;
  });

  // ── subcomponents ─────────────────────────────────────────────────────────

  const Dot = (p: { cx?: number; cy?: number; payload?: typeof pts[0] }) => {
    const { cx, cy, payload: d } = p;
    if (!d || cx == null || cy == null) return null;
    if (d.nob) return <circle cx={cx} cy={cy} r={3.5} fill="#d1d5db" stroke="white" strokeWidth={1.5} />;
    return <circle cx={cx} cy={cy} r={7} fill={REC_COLOR[d.rec] ?? '#6b7280'} stroke="white" strokeWidth={2} />;
  };

  const Tip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof pts[0] }> }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs max-w-56 z-50">
        <div className="font-semibold text-gray-900">{d.payGrade} · {d.station || '—'}</div>
        <div className="text-gray-500 mb-1.5">{shortDate(d.startDate)} – {shortDate(d.endDate)}</div>
        {d.nob
          ? <span className="italic text-gray-400">NOB / Not Observed ({d.reportType})</span>
          : <>
              <span className="font-semibold" style={{ color: REC_COLOR[d.rec] ?? '#374151' }}>
                {d.rec} — {REC_LABEL[d.rec] ?? d.rec}
              </span>
              {d.indAvg != null && (
                <div className="text-gray-500 mt-1">IND {d.indAvg.toFixed(2)} · R/S {d.rsAvg?.toFixed(2)}</div>
              )}
            </>
        }
      </div>
    );
  };

  // Build unique station list for legend (in order of first appearance)
  const stations = Object.keys(stCI);

  return (
    <div className={`space-y-5 ${className}`}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          FITREP Career Timeline
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {fitreps.length} fitness reports · hover dots for details
        </p>
      </div>

      {/* ── Trend chart ────────────────────────────────────────────────────── */}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={pts} margin={{ top: 10, right: 12, left: 0, bottom: 52 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="i"
            type="number"
            scale="linear"
            domain={[-0.5, pts.length - 0.5]}
            tickCount={pts.length}
            tickFormatter={(v) => pts[Math.round(v)]?.label ?? ''}
            tick={{ fontSize: 9 }}
            angle={-50}
            textAnchor="end"
            height={56}
            interval={0}
          />
          <YAxis
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            tickFormatter={(v) => ({ 1: 'SP', 2: 'PR', 3: 'P', 4: 'MP', 5: 'EP' }[v as number] ?? '')}
            width={30}
            tick={{ fontSize: 11, fontWeight: 600 }}
          />
          <Line
            dataKey="recLevel"
            stroke="#6366f1"
            strokeWidth={2.5}
            dot={<Dot />}
            activeDot={false}
            connectNulls={false}
            type="linear"
            isAnimationActive={false}
          />
          <Tooltip content={<Tip />} />
        </LineChart>
      </ResponsiveContainer>

      {/* ── Horizontal context strips ──────────────────────────────────────── */}
      <div className="space-y-2.5">

        {/* Pay Grade strip */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-400 w-14 text-right flex-shrink-0 uppercase tracking-wide">
            Grade
          </span>
          <div className="flex flex-1 h-8 rounded-md overflow-hidden border border-gray-200 shadow-sm">
            {pts.map((p, i) => {
              const prev = pts[i - 1];
              const changed = prev && prev.payGrade !== p.payGrade;
              return (
                <div
                  key={i}
                  className="flex-1 h-full flex items-center justify-center relative"
                  style={{
                    background: GRADE_BG[p.payGrade] ?? '#e2e8f0',
                    borderLeft: changed
                      ? '2.5px solid #1B365D'
                      : i > 0 ? '1px solid rgba(0,0,0,0.07)' : 'none',
                  }}
                  title={`${p.payGrade} · ${shortDate(p.startDate)}`}
                >
                  {(changed || i === 0) && (
                    <span
                      className="font-bold select-none"
                      style={{ fontSize: 9, color: GRADE_FG[p.payGrade] ?? '#1e40af' }}
                    >
                      {p.payGrade}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Duty Station strip */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-400 w-14 text-right flex-shrink-0 uppercase tracking-wide">
            Station
          </span>
          <div className="flex flex-1 h-8 rounded-md overflow-hidden border border-gray-200 shadow-sm">
            {pts.map((p, i) => {
              const prev = pts[i - 1];
              const changed = prev && prev.station !== p.station;
              return (
                <div
                  key={i}
                  className="flex-1 h-full relative"
                  style={{
                    background: STATION_PAL[stCI[p.station] ?? 0],
                    borderLeft: changed
                      ? '2.5px solid rgba(0,0,0,0.35)'
                      : i > 0 ? '1px solid rgba(0,0,0,0.07)' : 'none',
                  }}
                  title={`${p.station} · ${shortDate(p.startDate)}`}
                />
              );
            })}
          </div>
        </div>

        <p className="text-xs text-gray-400 pl-[68px]">
          Bold divider = change in pay grade (Grade) or duty station (Station) · hover any cell for details
        </p>
      </div>

      {/* ── Legends ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 text-xs pt-2 border-t border-gray-100">
        <div className="space-y-1.5">
          <div className="font-semibold text-gray-500 uppercase tracking-wide text-xs">Promotion Rec</div>
          {Object.entries(REC_LABEL).map(([rec, label]) => (
            <div key={rec} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: REC_COLOR[rec] }} />
              <span className="text-gray-600">{rec} — {label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-gray-300 flex-shrink-0" />
            <span className="text-gray-500">NOB / Not Observed</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="font-semibold text-gray-500 uppercase tracking-wide text-xs">Duty Stations</div>
          {stations.map(name => (
            <div key={name} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded border border-gray-300 flex-shrink-0"
                style={{ background: STATION_PAL[stCI[name] ?? 0] }}
              />
              <span className="text-gray-600 break-all">{name || 'Unknown'}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
