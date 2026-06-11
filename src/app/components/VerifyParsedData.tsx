'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import type { RankDate } from './RankHistoryForm';

// Types
export interface FitrepEntry {
  payGrade?: string;
  station?: string;
  startDate: string;
  endDate: string;
  individualAverage?: number;
  rsAverage?: number;
  promotionRec?: string;
  reportType?: string;
}

export interface ParsedOfficerData {
  // From ODC/OSR parsing
  name?: string;
  rankHistory: RankDate[];
  currentRank: string;

  // From OSR
  clearanceLevel: 'Secret' | 'Top Secret' | 'None' | '';
  clearanceDate: string;

  // From ODC - Board Certification
  boardCertified: boolean | null;
  certificationCode: 'J' | 'K' | null; // K = Board Certified, J = Board Eligible

  // From ODC - AQDs
  aqds: string[];

  // From OSR - completed special qualifications + service-school courses
  // (used to suppress recommendations for training already done)
  specialQualifications: string[];

  // From PSR
  fitrepAverage: number;
  rscaAverage?: number;
  fitrepCount: number;
  earlyPromotes: number;
  mustPromotes: number;
  promotables: number;
  fitreps?: FitrepEntry[];
  psrTrend?: string;
  psrIssues?: string[];

  // Education (parsed)
  hasUndergrad: boolean;
  hasMedicalSchool: boolean;

  // Manual entry required
  designator: string;
  currentBillet: string;
  deployments: number;
  operationalTours: number;
  jointDuty: boolean;
  commandTour: boolean;
  jpmeComplete: boolean;

  // Warnings from parsing
  warnings: string[];
}

interface VerifyParsedDataProps {
  parsedData: Partial<ParsedOfficerData>;
  onDataConfirmed: (data: ParsedOfficerData) => void;
  onBack: () => void;
}

// Parse an ISO date string (YYYY-MM-DD) as local time so "2024-09-01" never
// renders as Aug 31 due to UTC-to-local offset.
const localDateStr = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// AQD codes that satisfy JPME Phase I or II.
const JPME_AQDS = new Set(['JS7', 'JS8']);

const RANK_OPTIONS = ['ENS', 'LTJG', 'LT', 'LCDR', 'CDR', 'CAPT'];

const DESIGNATOR_OPTIONS = [
  { value: '2100', label: '2100 - Medical Corps (General)' },
  { value: '2105', label: '2105 - Flight Surgeon' },
  { value: '2300', label: '2300 - Family Medicine' },
  { value: '2305', label: '2305 - Internal Medicine' },
  { value: '2310', label: '2310 - Pediatrics' },
  { value: '2315', label: '2315 - Dermatology' },
  { value: '2320', label: '2320 - Neurology' },
  { value: '2325', label: '2325 - Psychiatry' },
  { value: '2330', label: '2330 - Physical Medicine' },
  { value: '2335', label: '2335 - Preventive Medicine' },
  { value: '2340', label: '2340 - Radiology' },
  { value: '2345', label: '2345 - Anesthesiology' },
  { value: '2350', label: '2350 - Pathology' },
  { value: '2355', label: '2355 - Emergency Medicine' },
  { value: '2500', label: '2500 - Operational Medicine' },
  { value: '2505', label: '2505 - Aerospace Medicine' },
  { value: '2510', label: '2510 - Undersea Medicine' },
];

const COMMON_AQDS = [
  { code: 'LA7', name: 'Surface Warfare (SWMDO)' },
  { code: 'BX2', name: 'FMF Warfare (FMFWO)' },
  { code: 'AW5', name: 'Aviation Warfare' },
  { code: 'JS7', name: 'JPME Phase I' },
  { code: 'JS8', name: 'JPME Phase II' },
  { code: '67A', name: 'Executive Medicine' },
  { code: '67B', name: 'Expeditionary Medicine' },
  { code: '67G', name: 'Managed Care' },
  { code: '6FA', name: 'FMF Medical Officer' },
  { code: '6FD', name: 'Surface Experienced' },
  { code: '6OW', name: 'Trauma Team Trained' },
  { code: '6ZG', name: 'Residency Program Dir.' },
  { code: '68I', name: 'HCM Master\'s Degree' },
  { code: '62D', name: 'Faculty Dev. Fellowship' },
  { code: '680', name: 'Milestone Eligible' },
];

export function VerifyParsedData({ parsedData, onDataConfirmed, onBack }: VerifyParsedDataProps) {
  const [data, setData] = useState<ParsedOfficerData>({
    name: parsedData.name || '',
    rankHistory: parsedData.rankHistory || [],
    currentRank: parsedData.currentRank || '',
    clearanceLevel: parsedData.clearanceLevel || '',
    clearanceDate: parsedData.clearanceDate || '',
    boardCertified: parsedData.boardCertified ?? null,
    certificationCode: parsedData.certificationCode || null,
    aqds: parsedData.aqds || [],
    specialQualifications: parsedData.specialQualifications || [],
    fitrepAverage: parsedData.fitrepAverage || 0,
    fitrepCount: parsedData.fitrepCount || 0,
    earlyPromotes: parsedData.earlyPromotes || 0,
    mustPromotes: parsedData.mustPromotes || 0,
    promotables: parsedData.promotables || 0,
    hasUndergrad: parsedData.hasUndergrad ?? true,
    hasMedicalSchool: parsedData.hasMedicalSchool ?? true,
    designator: parsedData.designator || '2100',
    currentBillet: parsedData.currentBillet || '',
    deployments: parsedData.deployments || 0,
    operationalTours: parsedData.operationalTours || 0,
    jointDuty: parsedData.jointDuty ?? false,
    commandTour: parsedData.commandTour ?? false,
    jpmeComplete: parsedData.jpmeComplete ?? (parsedData.aqds ?? []).some(a => JPME_AQDS.has(a)),
    warnings: parsedData.warnings || [],
  });

  // Calculate current rank from rank history if not set
  useEffect(() => {
    if (!data.currentRank && data.rankHistory.length > 0) {
      const sortedRanks = [...data.rankHistory].sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setData(prev => ({ ...prev, currentRank: sortedRanks[0].rank }));
    }
  }, [data.rankHistory, data.currentRank]);

  const updateField = <K extends keyof ParsedOfficerData>(field: K, value: ParsedOfficerData[K]) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const toggleAQD = (aqd: string) => {
    setData(prev => {
      const next = prev.aqds.includes(aqd)
        ? prev.aqds.filter(a => a !== aqd)
        : [...prev.aqds, aqd];
      const derivedJpme = next.some(a => JPME_AQDS.has(a));
      return { ...prev, aqds: next, jpmeComplete: derivedJpme || prev.jpmeComplete };
    });
  };

  const canProceed = data.currentRank && data.fitrepAverage > 0;
  const jpmeSource = data.aqds.filter(a => JPME_AQDS.has(a)).join(' + ') || null;
  const commonCodes = new Set(COMMON_AQDS.map(a => a.code));
  const extraAqds = data.aqds.filter(c => !commonCodes.has(c));

  const NAVY = '#1B365D';
  const INP_STYLE: React.CSSProperties = { width: '100%', border: '1px solid #CBD5E1', borderRadius: 4, padding: '5px 8px', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
  const LABEL_STYLE: React.CSSProperties = { display: 'block', fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 };
  const PARSED_VAL: React.CSSProperties = { fontSize: 13, color: '#1E293B' };
  const PARSED_EMPTY: React.CSSProperties = { fontSize: 13, color: '#CBD5E1' };

  const SectionBand = ({ title }: { title: string }) => (
    <div style={{ padding: '5px 14px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
    </div>
  );

  const ParsedField = ({ label, value }: { label: string; value?: string | null }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
      <div style={value ? PARSED_VAL : PARSED_EMPTY}>{value || '—'}</div>
    </div>
  );

  const LEFT: React.CSSProperties = { padding: '12px 14px', background: 'rgba(27,54,93,0.025)', borderRight: '1px solid #E2E8F0' };
  const RIGHT: React.CSSProperties = { padding: '12px 14px' };
  const SPLIT: React.CSSProperties = { display: 'grid', gridTemplateColumns: '42% 58%', borderBottom: '1px solid #E2E8F0' };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: 0 }}>Record Review</h2>
        <p style={{ fontSize: 12, color: '#64748B', margin: '3px 0 0' }}>Confirm what we parsed — correct anything before the analysis runs.</p>
      </div>

      {data.warnings.length > 0 && (
        <div style={{ background: 'rgba(255,199,44,0.08)', border: '1px solid rgba(255,199,44,0.4)', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#92620A', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Parsing notes</div>
          {data.warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: '#92620A' }}>• {w}</div>)}
        </div>
      )}

      <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, overflow: 'hidden' }}>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '42% 58%', background: NAVY }}>
          <div style={{ padding: '8px 14px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>From documents</span>
          </div>
          <div style={{ padding: '8px 14px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Confirm / correct</span>
          </div>
        </div>

        {/* ─── Identity ─── */}
        <SectionBand title="Identity" />
        <div style={SPLIT}>
          <div style={LEFT}>
            <ParsedField label="Name" value={parsedData.name} />
            {parsedData.rankHistory && parsedData.rankHistory.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 3 }}>Rank history</div>
                {[...parsedData.rankHistory]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((rh, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#1E293B', marginBottom: 2 }}>
                      {rh.rank} <span style={{ color: '#CBD5E1' }}>·</span> {localDateStr(rh.date)}
                    </div>
                  ))}
              </div>
            )}
            <ParsedField label="Designator" value={parsedData.designator} />
          </div>
          <div style={RIGHT}>
            <div style={{ marginBottom: 10 }}>
              <label style={LABEL_STYLE}>Name</label>
              <input type="text" value={data.name || ''} onChange={e => updateField('name', e.target.value)}
                style={INP_STYLE} placeholder="e.g. Brian S. Ford" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={LABEL_STYLE}>Current Rank</label>
                <select value={data.currentRank} onChange={e => updateField('currentRank', e.target.value)} style={INP_STYLE}>
                  <option value="">Select</option>
                  {RANK_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL_STYLE}>Designator</label>
                <select value={data.designator} onChange={e => updateField('designator', e.target.value)} style={INP_STYLE}>
                  {DESIGNATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Clearance ─── */}
        <SectionBand title="Security Clearance" />
        <div style={SPLIT}>
          <div style={LEFT}>
            <ParsedField label="Level" value={parsedData.clearanceLevel || null} />
            <ParsedField label="Date" value={parsedData.clearanceDate ? localDateStr(parsedData.clearanceDate) : null} />
          </div>
          <div style={{ ...RIGHT, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start' }}>
            <div>
              <label style={LABEL_STYLE}>Level</label>
              <select value={data.clearanceLevel} onChange={e => updateField('clearanceLevel', e.target.value as ParsedOfficerData['clearanceLevel'])} style={INP_STYLE}>
                <option value="">Not specified</option>
                <option value="Secret">Secret</option>
                <option value="Top Secret">Top Secret</option>
                <option value="None">None</option>
              </select>
            </div>
            <div>
              <label style={LABEL_STYLE}>Date</label>
              <input type="date" value={data.clearanceDate} onChange={e => updateField('clearanceDate', e.target.value)} style={INP_STYLE} />
            </div>
          </div>
        </div>

        {/* ─── Performance ─── */}
        <SectionBand title="Fitness Report Summary" />
        <div style={SPLIT}>
          <div style={LEFT}>
            <ParsedField label="FITREPs" value={parsedData.fitrepCount != null ? String(parsedData.fitrepCount) : null} />
            <ParsedField label="Trait avg" value={parsedData.fitrepAverage ? parsedData.fitrepAverage.toFixed(2) : null} />
            <ParsedField label="EP / MP / P" value={
              parsedData.earlyPromotes != null
                ? `${parsedData.earlyPromotes} EP · ${parsedData.mustPromotes ?? 0} MP · ${parsedData.promotables ?? 0} P`
                : null
            } />
          </div>
          <div style={{ ...RIGHT, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start' }}>
            <div>
              <label style={LABEL_STYLE}>Total FITREPs</label>
              <input type="number" min="0" value={data.fitrepCount || ''} onChange={e => updateField('fitrepCount', parseInt(e.target.value) || 0)} style={INP_STYLE} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Trait Average</label>
              <input type="number" step="0.01" min="1" max="5" value={data.fitrepAverage || ''} onChange={e => updateField('fitrepAverage', parseFloat(e.target.value) || 0)} placeholder="e.g. 4.08" style={INP_STYLE} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Early Promotes</label>
              <input type="number" min="0" value={data.earlyPromotes || ''} onChange={e => updateField('earlyPromotes', parseInt(e.target.value) || 0)} style={INP_STYLE} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Must Promotes</label>
              <input type="number" min="0" value={data.mustPromotes || ''} onChange={e => updateField('mustPromotes', parseInt(e.target.value) || 0)} style={INP_STYLE} />
            </div>
          </div>
        </div>

        {/* ─── Qualifications ─── */}
        <SectionBand title="Qualifications" />
        <div style={{ ...SPLIT, borderBottom: 'none' }}>
          <div style={LEFT}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 2 }}>Board cert</div>
              <div style={PARSED_VAL}>
                {parsedData.certificationCode === 'K' ? 'K code — Board Certified'
                  : parsedData.certificationCode === 'J' ? 'J code — Board Eligible'
                  : <span style={PARSED_EMPTY}>—</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>AQDs</div>
              {parsedData.aqds && parsedData.aqds.length > 0
                ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {parsedData.aqds.map(a => (
                      <span key={a} style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 3, background: 'rgba(27,54,93,0.08)', color: NAVY }}>{a}</span>
                    ))}
                  </div>
                : <span style={PARSED_EMPTY}>None detected</span>
              }
            </div>
          </div>
          <div style={RIGHT}>
            {/* Board cert */}
            <div style={{ marginBottom: 12 }}>
              <label style={LABEL_STYLE}>Board Certification</label>
              <div style={{ display: 'flex', gap: 16 }}>
                {([['K', 'Certified'] as const, ['J', 'Eligible'] as const]).map(([code, label]) => (
                  <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="boardCert" checked={data.certificationCode === code}
                      onChange={() => { updateField('boardCertified', code === 'K'); updateField('certificationCode', code); }}
                      style={{ accentColor: NAVY }} />
                    {code} code <span style={{ color: '#94A3B8', fontSize: 11 }}>— {label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* AQD chips */}
            <div style={{ marginBottom: 12 }}>
              <label style={LABEL_STYLE}>AQDs held — click to toggle</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {COMMON_AQDS.map(aqd => {
                  const active = data.aqds.includes(aqd.code);
                  return (
                    <button key={aqd.code} onClick={() => toggleAQD(aqd.code)} title={aqd.name} style={{
                      fontSize: 11, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                      background: active ? NAVY : '#fff', color: active ? '#fff' : '#64748B',
                      border: active ? `1px solid ${NAVY}` : '1px solid #CBD5E1', transition: 'all 0.1s',
                    }}>
                      {aqd.code}
                    </button>
                  );
                })}
                {extraAqds.map(code => (
                  <button key={code} onClick={() => toggleAQD(code)} style={{
                    fontSize: 11, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                    background: NAVY, color: '#fff', border: `1px solid ${NAVY}`,
                  }}>
                    {code}
                  </button>
                ))}
              </div>
            </div>

            {/* Checkboxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={data.jpmeComplete} onChange={e => updateField('jpmeComplete', e.target.checked)}
                  style={{ accentColor: NAVY, width: 14, height: 14 }} />
                JPME Complete
                {jpmeSource && (
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: 'rgba(27,54,93,0.08)', color: NAVY }}>
                    from {jpmeSource}
                  </span>
                )}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={data.commandTour} onChange={e => updateField('commandTour', e.target.checked)}
                  style={{ accentColor: NAVY, width: 14, height: 14 }} />
                Command Tour
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={data.jointDuty} onChange={e => updateField('jointDuty', e.target.checked)}
                  style={{ accentColor: NAVY, width: 14, height: 14 }} />
                Joint Duty Assignment
              </label>
            </div>

            {/* Billet + deployments */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 10, borderTop: '1px solid #F1F5F9' }}>
              <div>
                <label style={LABEL_STYLE}>Current Billet</label>
                <input type="text" value={data.currentBillet} onChange={e => updateField('currentBillet', e.target.value)}
                  placeholder="e.g. Dept Head, FM" style={INP_STYLE} />
              </div>
              <div>
                <label style={LABEL_STYLE}>Deployments</label>
                <input type="number" min="0" value={data.deployments} onChange={e => updateField('deployments', parseInt(e.target.value) || 0)} style={INP_STYLE} />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid #F1F5F9', marginTop: 16 }}>
        <button onClick={onBack} style={{ padding: '8px 20px', border: '1px solid #CBD5E1', background: '#fff', borderRadius: 4, fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
          Back to Upload
        </button>
        <div style={{ textAlign: 'right' }}>
          {!canProceed && (
            <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 6 }}>Current rank and FITREP average required to continue</div>
          )}
          <button onClick={() => onDataConfirmed(data)} disabled={!canProceed} style={{
            padding: '8px 20px', borderRadius: 4, fontSize: 13, fontWeight: 700,
            cursor: canProceed ? 'pointer' : 'not-allowed',
            background: canProceed ? NAVY : '#CBD5E1', color: '#fff', border: 'none',
            boxShadow: canProceed ? '0 2px 8px rgba(27,54,93,0.3)' : 'none',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            Continue to Analysis
            <CheckCircle style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
