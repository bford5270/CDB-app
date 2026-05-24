'use client';

import React from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { FitrepEntry } from './VerifyParsedData';

const REC_NUM: Record<string, number> = { EP: 5, MP: 4, P: 3, PR: 2, SP: 1 };
const REC_COLOR: Record<string, string> = {
  EP: '#16a34a', MP: '#2563eb', P: '#d97706', PR: '#dc2626', SP: '#7c3aed',
};
const REC_LABEL: Record<string, string> = {
  EP: 'Early Promote', MP: 'Must Promote', P: 'Promotable',
  PR: 'Progressing', SP: 'Select Promotable',
};

// Distinct but muted palette for station background bands
const BAND_COLORS = [
  '#dbeafe', '#dcfce7', '#fef9c3', '#fce7f3',
  '#e0f2fe', '#ffedd5', '#f0fdf4', '#faf5ff',
  '#fff1f2', '#f0fdfa', '#fefce8', '#ede9fe',
];

function dateLabel(d: string): string {
  if (!d) return '';
  const clean = d.replace(/-/g, '');
  if (clean.length >= 6) {
    const m = parseInt(clean.substring(4, 6));
    const y = clean.substring(2, 4);
    const mo = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (m >= 1 && m <= 12) return `${mo[m]} '${y}`;
  }
  return d.substring(0, 7);
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

interface Props {
  fitreps: FitrepEntry[];
  className?: string;
}

export function PSRTimeline({ fitreps, className = '' }: Props) {
  if (!fitreps?.length) return null;

  // ── build chart rows ────────────────────────────────────────────────────────
  const rows = fitreps.map((f, i) => ({
    i,
    label: dateLabel(f.startDate),
    rec: f.promotionRec || 'NOB',
    recLevel: !isNOB(f) ? (REC_NUM[f.promotionRec || ''] ?? null) : null,
    station: f.station || '',
    payGrade: f.payGrade || '',
    nob: isNOB(f),
    startDate: f.startDate || '',
    endDate: f.endDate || '',
    indAvg: !isNOB(f) ? (f.individualAverage || null) : null,
    rsAvg: !isNOB(f) ? (f.rsAverage || null) : null,
    reportType: f.reportType || '',
  }));

  // ── station background bands ────────────────────────────────────────────────
  const stationColorIdx: Record<string, number> = {};
  let colorCounter = 0;
  const bands: Array<{ x1: number; x2: number; station: string; ci: number }> = [];
  let bandStart = 0;
  let curStation = rows[0].station;

  for (let i = 1; i <= rows.length; i++) {
    const s = i < rows.length ? rows[i].station : '__END__';
    if (s !== curStation) {
      if (!(curStation in stationColorIdx)) {
        stationColorIdx[curStation] = colorCounter++ % BAND_COLORS.length;
      }
      bands.push({ x1: bandStart - 0.5, x2: i - 0.5, station: curStation, ci: stationColorIdx[curStation] });
      curStation = s;
      bandStart = i;
    }
  }

  // ── rank change reference lines ─────────────────────────────────────────────
  const rankChanges: Array<{ x: number; to: string }> = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].payGrade && rows[i - 1].payGrade && rows[i].payGrade !== rows[i - 1].payGrade) {
      rankChanges.push({ x: i - 0.5, to: rows[i].payGrade });
    }
  }

  // ── custom dot ──────────────────────────────────────────────────────────────
  const Dot = (props: { cx?: number; cy?: number; payload?: typeof rows[0] }) => {
    const { cx, cy, payload: p } = props;
    if (cx == null || cy == null || !p) return null;
    if (p.nob || p.recLevel === null) {
      return <circle cx={cx} cy={cy} r={4} fill="#d1d5db" stroke="white" strokeWidth={1.5} />;
    }
    return <circle cx={cx} cy={cy} r={7} fill={REC_COLOR[p.rec] || '#6b7280'} stroke="white" strokeWidth={2} />;
  };

  // ── tooltip ─────────────────────────────────────────────────────────────────
  const Tip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof rows[0] }> }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs max-w-52">
        <div className="font-semibold text-gray-900">{p.payGrade} · {p.station || 'Unknown station'}</div>
        <div className="text-gray-500 mb-1">{dateLabel(p.startDate)} – {dateLabel(p.endDate)}</div>
        {p.nob
          ? <div className="text-gray-400 italic">NOB / Not Observed ({p.reportType})</div>
          : <>
              <div className="font-semibold" style={{ color: REC_COLOR[p.rec] || '#374151' }}>
                {p.rec} — {REC_LABEL[p.rec] || p.rec}
              </div>
              {p.indAvg != null && (
                <div className="text-gray-500 mt-1">IND avg {p.indAvg.toFixed(2)} · R/S {p.rsAvg?.toFixed(2)}</div>
              )}
            </>
        }
      </div>
    );
  };

  const uniqueStations = Object.entries(stationColorIdx).map(([name, ci]) => ({ name, ci }));

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          FITREP Promotion Trend
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          {fitreps.length} reports · shading = duty station · vertical line = rank change
        </p>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={rows} margin={{ top: 14, right: 14, left: 4, bottom: 52 }}>

          {/* Station shading */}
          {bands.map((b, i) => (
            <ReferenceArea
              key={i}
              x1={b.x1}
              x2={b.x2}
              fill={BAND_COLORS[b.ci]}
              fillOpacity={0.5}
              ifOverflow="extendDomain"
            />
          ))}

          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

          <XAxis
            dataKey="i"
            type="number"
            scale="linear"
            domain={[-0.5, rows.length - 0.5]}
            tickCount={rows.length}
            tickFormatter={(v) => rows[Math.round(v)]?.label ?? ''}
            tick={{ fontSize: 9 }}
            angle={-50}
            textAnchor="end"
            height={58}
            interval={0}
          />

          <YAxis
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            tickFormatter={(v) => ({ 1: 'SP', 2: 'PR', 3: 'P', 4: 'MP', 5: 'EP' }[v as number] ?? '')}
            width={30}
            tick={{ fontSize: 11, fontWeight: 600 }}
          />

          {/* Rank change markers */}
          {rankChanges.map((rc, i) => (
            <ReferenceLine
              key={i}
              x={rc.x}
              stroke="#1B365D"
              strokeWidth={2.5}
              label={{
                value: `→ ${rc.to}`,
                position: 'insideTopLeft',
                fontSize: 9,
                fill: '#1B365D',
                fontWeight: 700,
              }}
            />
          ))}

          {/* Promo rec trend */}
          <Line
            dataKey="recLevel"
            stroke="#6366f1"
            strokeWidth={2}
            dot={<Dot />}
            activeDot={false}
            connectNulls={false}
            type="linear"
            isAnimationActive={false}
          />

          <Tooltip content={<Tip />} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Rec legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {Object.entries(REC_LABEL).map(([rec, label]) => (
          <span key={rec} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: REC_COLOR[rec] }} />
            <span className="text-gray-600">{rec} — {label}</span>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />
          <span className="text-gray-500">NOB</span>
        </span>
      </div>

      {/* Station key */}
      {uniqueStations.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs border-t border-gray-100 pt-2">
          <span className="text-gray-400 self-center">Stations:</span>
          {uniqueStations.map(({ name, ci }) => (
            <span key={name} className="flex items-center gap-1">
              <span
                className="w-3 h-3 rounded border border-gray-300 inline-block"
                style={{ background: BAND_COLORS[ci] }}
              />
              <span className="text-gray-600">{name || 'Unknown'}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
