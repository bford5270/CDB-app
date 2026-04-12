import {
  AlertCircle, CheckCircle, TrendingUp, TrendingDown, Minus,
  Award, BookOpen, Anchor, Users, Target, Clock, Shield, FileText, BarChart3, Mail
} from 'lucide-react';
import type { ParsedOfficerData } from './VerifyParsedData';
import { PromotionTimeline } from './PromotionTimeline';

interface AnalysisResultsProps {
  officerData: ParsedOfficerData;
}

interface Gap {
  category: string;
  severity: 'critical' | 'important' | 'recommended';
  description: string;
  recommendation: string;
  icon: any;
}

interface Strength {
  category: string;
  description: string;
  icon: any;
}

const RANK_ORDER = ['ENS', 'LTJG', 'LT', 'LCDR', 'CDR', 'CAPT'];
const rankGTE = (a: string, b: string) => RANK_ORDER.indexOf(a) >= RANK_ORDER.indexOf(b);

// Warfare/Operational AQD codes — proper ODC codes (LA7/BX2 per Schofer) plus legacy display codes
const WARFARE_AQDS = ['LA7', 'BX2', 'FMF', 'SW', 'AW', 'SS', 'EXW', 'SCW'];
const OPERATIONAL_AQDS = ['6OC', '6OD', '6OE', '6OF', '6OG', '6OH'];

function getDateOfRank(officerData: ParsedOfficerData): string {
  const rank = officerData.currentRank;
  const matches = officerData.rankHistory.filter(r => r.rank === rank);
  if (!matches.length) return '';
  return matches.sort((a, b) => b.date.localeCompare(a.date))[0].date;
}

function clearanceAgeYears(clearanceDate: string): number | null {
  if (!clearanceDate) return null;
  try {
    const d = new Date(clearanceDate.length === 7 ? clearanceDate + '-01' : clearanceDate);
    if (isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  } catch { return null; }
}

function fmtDate(iso: string): string {
  if (!iso) return '?';
  try {
    const d = new Date(iso.length === 7 ? iso + '-01' : iso);
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  } catch { return iso; }
}

function scoreColor(score: number) {
  if (score >= 4.5) return 'text-green-700 bg-green-50 border-green-300';
  if (score >= 4.0) return 'text-blue-700 bg-blue-50 border-blue-300';
  if (score >= 3.5) return 'text-yellow-700 bg-yellow-50 border-yellow-300';
  return 'text-red-700 bg-red-50 border-red-300';
}

function recColor(rec: string) {
  if (rec === 'EP') return 'bg-green-100 text-green-800 border border-green-300';
  if (rec === 'MP') return 'bg-blue-100 text-blue-800 border border-blue-300';
  if (rec === 'P')  return 'bg-yellow-100 text-yellow-800 border border-yellow-300';
  if (rec === 'PR' || rec === 'SP') return 'bg-red-100 text-red-800 border border-red-300';
  return 'bg-gray-100 text-gray-600';
}

function analyzeRecord(o: ParsedOfficerData): { gaps: Gap[]; strengths: Strength[]; score: number } {
  const gaps: Gap[] = [];
  const strengths: Strength[] = [];
  let score = 100;
  const rank = o.currentRank;
  const hasWarfare = WARFARE_AQDS.some(q => o.aqds.includes(q));

  // Board certification — K=certified, J=eligible not certified, T=in training
  const certCode = o.certificationCode;
  if (certCode === 'K' || o.boardCertified === true) {
    strengths.push({ category: 'Board Certified (K Code)', description: 'Board certification demonstrates clinical excellence — essential for O-5 promotion.', icon: Award });
  } else if (certCode === 'T') {
    // In training — appropriate for LT/early LCDR, flag if approaching LCDR board
    if (rankGTE(rank, 'LCDR')) {
      gaps.push({ category: 'Board Certification', severity: 'critical',
        description: 'Still showing T code (In Training) at LCDR or above — board certification expected',
        recommendation: 'Complete residency and sit for your specialty board exam immediately. K code is expected by O-4 board. Contact your specialty board for eligibility date.',
        icon: Award });
      score -= 15;
    } else {
      gaps.push({ category: 'Board Certification', severity: 'recommended',
        description: 'T code (In Training) — in residency, not yet board eligible',
        recommendation: 'Complete residency and pursue board certification (K code) as soon as eligible. Board certification is expected by O-4.',
        icon: Award });
      score -= 5;
    }
  } else if (certCode === 'J' || (o.boardCertified === false && !certCode)) {
    if (rankGTE(rank, 'LCDR')) {
      gaps.push({ category: 'Board Certification', severity: 'critical',
        description: 'J code (Board Eligible, not yet certified) — critical gap at LCDR and above',
        recommendation: 'Board certification (K code) is essential for O-5 selection. Schedule your specialty board exam immediately. Contact the relevant specialty board for the next exam cycle.',
        icon: Award });
      score -= 20;
    } else {
      gaps.push({ category: 'Board Certification', severity: 'important',
        description: 'J code — board eligible but not yet certified. Certification expected by O-4.',
        recommendation: 'Schedule your specialty board exam. Board certification (K code) is a competitive differentiator for O-4 and required by O-5.',
        icon: Award });
      score -= 10;
    }
  }

  // FITREP average
  if (o.fitrepAverage > 0 && o.fitrepAverage < 4.0) {
    gaps.push({ category: 'FITREP Performance', severity: 'critical',
      description: `Overall FITREP average of ${o.fitrepAverage.toFixed(2)} is below the competitive threshold of 4.0`,
      recommendation: 'Target 4.5+ average for CDR board competitiveness. Seek high-visibility assignments, document accomplishments, and communicate impact to reporting senior.',
      icon: Award });
    score -= 20;
  } else if (o.fitrepAverage >= 4.5) {
    strengths.push({ category: 'FITREP Performance', description: `Exceptional FITREP average of ${o.fitrepAverage.toFixed(2)} — demonstrates consistent high performance.`, icon: Award });
  }

  // Declining trend
  if (o.psrTrend === 'declining') {
    gaps.push({ category: 'FITREP Trend', severity: 'critical',
      description: 'Declining FITREP trend detected — recent reports are lower than earlier reports',
      recommendation: 'Address root causes with your reporting senior. A letter to the board should be considered to explain any extenuating circumstances. Reverse trend immediately.',
      icon: TrendingDown });
    score -= 15;
  } else if (o.psrTrend === 'improving') {
    strengths.push({ category: 'FITREP Trend', description: 'Improving trend — recent reports show stronger performance than earlier ones.', icon: TrendingUp });
  }

  // Warfare qual
  if (!hasWarfare && rankGTE(rank, 'LCDR')) {
    gaps.push({ category: 'Warfare Qualification', severity: 'important',
      description: 'No warfare qualification AQD on record (BX2/FMF, LA7/SW, AW, SS)',
      recommendation: 'Warfare qualifications demonstrate operational commitment. Pursue BX2 (FMF MDO) via a Marine unit tour, or LA7 (Surface Warfare MDO) via surface ship assignment. Contact your detailer 9–18 months before PRD to request an operational billet.',
      icon: Anchor });
    score -= 10;
  } else if (hasWarfare) {
    const quals = WARFARE_AQDS.filter(q => o.aqds.includes(q));
    strengths.push({ category: 'Warfare Qualification', description: `Warfare qual(s): ${quals.join(', ')} — demonstrates operational medicine competency.`, icon: Anchor });
  }

  // Joint duty
  if (!o.jointDuty && rankGTE(rank, 'CDR')) {
    gaps.push({ category: 'Joint Duty', severity: 'critical',
      description: 'No joint duty assignment completed — required for senior leadership',
      recommendation: 'Joint duty (Joint Staff, COCOM, inter-service MTF) is increasingly required for senior positions. JPME Phase I via Joint Forces Staff College (DL) is an immediate step.',
      icon: Users });
    score -= 15;
  } else if (!o.jointDuty && rankGTE(rank, 'LCDR')) {
    gaps.push({ category: 'Joint Duty', severity: 'important',
      description: 'No joint duty assignment — begin planning for this requirement',
      recommendation: 'Complete JPME Phase I (distance learning). Seek joint duty billet at next PCS opportunity.',
      icon: Users });
    score -= 10;
  } else if (o.jointDuty) {
    strengths.push({ category: 'Joint Duty', description: 'Joint duty experience — demonstrates versatility and inter-service leadership.', icon: Users });
  }

  // Command / department head
  if (!o.commandTour && rank === 'CDR') {
    gaps.push({ category: 'Leadership / Command', severity: 'critical',
      description: 'No command or major department head tour on record for CDR',
      recommendation: 'Command or department head is highly valued for CAPT selection. Target: Division/Department Head at major MTF, SMO/Medical Director, or DIO/GME Director.',
      icon: Target });
    score -= 15;
  } else if (!o.commandTour && rank === 'LCDR') {
    gaps.push({ category: 'Leadership / Department Head', severity: 'important',
      description: 'No department head or leadership tour approaching CDR board',
      recommendation: 'Seek department head positions at MTFs. Document leadership of people and resources in your FITREP.',
      icon: Target });
    score -= 10;
  } else if (o.commandTour) {
    strengths.push({ category: 'Command / Leadership Tour', description: 'Command or department head experience — demonstrates proven leadership capability.', icon: Target });
  }

  // OMO tour
  if (rank === 'LCDR' && !o.commandTour && (o.operationalTours ?? 0) === 0) {
    gaps.push({ category: 'Operational Medicine (OMO) Tour', severity: 'important',
      description: 'No OMO tour documented — important for CDR board competitiveness',
      recommendation: 'OMO tours (small deck SMO, CVN staff, USMC Battalion Surgeon, Fleet Surgeon) are highly valued. These typically occur at the 6–12 year mark.',
      icon: Anchor });
    score -= 10;
  }

  // Deployments
  if ((o.deployments ?? 0) === 0 && rankGTE(rank, 'LCDR')) {
    gaps.push({ category: 'Deployment Experience', severity: 'important',
      description: 'No deployment experience on record',
      recommendation: 'Pursue operational assignments including ship duty, expeditionary medicine, or forward-deployed hospitals.',
      icon: Anchor });
    score -= 10;
  } else if ((o.deployments ?? 0) >= 2) {
    strengths.push({ category: 'Deployments', description: `${o.deployments} deployments — strong operational experience.`, icon: Anchor });
  }

  // Education
  if (!o.hasMedicalSchool && !o.hasUndergrad) {
    gaps.push({ category: 'Education', severity: 'important',
      description: 'No education records confirmed in system',
      recommendation: 'Ensure medical degree and undergraduate education are documented in your OSR. Submit corrections via askmncc@navy.mil.',
      icon: BookOpen });
  }

  return { gaps, strengths, score: Math.max(0, score) };
}

export function AnalysisResults({ officerData: o }: AnalysisResultsProps) {
  const dateOfRank = getDateOfRank(o);
  const { gaps, strengths, score } = analyzeRecord(o);
  const rank = o.currentRank;

  // Letter to board logic
  const psrIssues = o.warnings?.filter(w =>
    /leftward|gap|consecutive|declining|below/i.test(w)
  ) ?? [];
  const belowRSPct = o.belowRSAveragePercentage ?? 0;
  const needsLetterToBoard =
    (o.psrTrend === 'declining') ||
    belowRSPct > 30 ||
    psrIssues.length > 0;

  // Career opportunities by rank — targets aligned with Schofer (The Wealthy Captain, Ch. 3)
  // CDR targets reflect jobs that produce CAPTs: Residency Director, Dept Head large MTF,
  // Director/CMO/OIC, BUMED staff, Specialty Leader, Detailer, senior operational leader
  const hasWarfareQual = WARFARE_AQDS.some(q => o.aqds.includes(q));
  const careerData: Record<string, { current: string[]; target: string[]; aqdsToGet: string[] }> = {
    LT:   { current: ['GMO', 'Battalion/Squadron Surgeon', "Ship's Medical Officer", 'Clinic Staff Physician'],
             target: ['Department Head', 'OMO Tour (small deck SMO)', 'Group/Wing UMO'],
             aqdsToGet: [
               ...(hasWarfareQual ? [] : ['BX2 (FMF MDO) or LA7 (Surface Warfare MDO) — warfare qual']),
               'JS7 (JPME Phase I) — start distance learning now',
             ] },
    LCDR: { current: ['Department Head', 'Group/Wing UMO', 'OMO Tour', 'MTF Staff Physician'],
             target: ['Senior Dept Head / XO', 'Executive OMO (SMO CVN/LHA)', 'BUMED Staff', 'Milestone position (apply now)'],
             aqdsToGet: [
               ...(hasWarfareQual ? [] : ['BX2 (FMF MDO) or LA7 (Surface Warfare MDO)']),
               'JS7 (JPME Phase I) — required for joint duty',
               '67A (Executive Medicine) — required for command track (O4+, needs Master\'s)',
             ] },
    CDR:  { current: ['Senior Dept Head', 'XO/SMO', 'BUMED Staff', 'Residency Program Director', 'Milestone position'],
             // Per Schofer: these are the jobs that produce CAPTs
             target: [
               'Residency Program Director (most common path to O6)',
               'Dept Head / Director at large MTF (≥500 personnel, ≥$5M budget)',
               'CMO / Director / OIC (any significant command)',
               'BUMED Staff or Specialty Leader',
               'Senior Detailer (Medical Corps)',
               'Senior operational leader (Fleet Surgeon, SOCOM, COCOM staff)',
             ],
             aqdsToGet: ['JS7/JS8 (Joint duty — required for senior flag consideration)'] },
    CAPT: { current: ['CO of MTF', 'Fleet Surgeon', 'BUMED Division Director', 'COCOM Surgeon'],
             target: ['Flag officer consideration (RDML)', 'Senior executive billet'],
             aqdsToGet: [] },
  };
  const career = careerData[rank] ?? careerData['LCDR'];

  const scoreLabel = score >= 85 ? 'Highly Competitive' : score >= 70 ? 'Competitive' : score >= 50 ? 'Needs Improvement' : 'Significant Gaps';
  const scoreColor2 = score >= 85 ? 'text-green-600' : score >= 70 ? 'text-yellow-600' : 'text-red-600';

  const severityBg = (s: string) =>
    s === 'critical' ? 'border-red-200 bg-red-50' :
    s === 'important' ? 'border-orange-200 bg-orange-50' :
    'border-yellow-200 bg-yellow-50';

  const severityBadge = (s: string) =>
    s === 'critical' ? 'bg-red-100 text-red-800' :
    s === 'important' ? 'bg-orange-100 text-orange-800' :
    'bg-yellow-100 text-yellow-800';

  const fitreps = o.fitreps ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Career Development Analysis</h2>
        <p className="text-gray-600">Navy Medical Corps career progression assessment for {rank || 'officer'}</p>
      </div>

      {/* Promotion Timeline */}
      {rank && dateOfRank && (
        <PromotionTimeline currentRank={rank} dateOfRank={dateOfRank} />
      )}

      {/* Overall Score */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Overall Record Assessment</h3>
          <p className="text-gray-600 text-sm mt-1">Competitiveness for next promotion board</p>
        </div>
        <div className="text-center">
          <div className={`text-5xl font-bold ${scoreColor2}`}>{score}</div>
          <div className="text-sm font-medium text-gray-600 mt-1">{scoreLabel}</div>
        </div>
      </div>

      {/* ── FITREP DEEP DIVE ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-bold text-gray-900">FITREP Analysis</h3>
        </div>

        {/* Stats row */}
        {(() => {
          const prCount = fitreps.filter(f => f.promotionRec === 'PR').length;
          return (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                { label: 'Total FITREPs', value: o.fitrepCount || 0, highlight: '' },
                { label: 'Avg Score',     value: o.fitrepAverage > 0 ? o.fitrepAverage.toFixed(2) : '—', highlight: '' },
                { label: 'Early Promote', value: o.earlyPromotes ?? 0, highlight: (o.earlyPromotes ?? 0) > 0 ? 'text-green-600' : '' },
                { label: 'Must Promote',  value: o.mustPromotes ?? 0, highlight: '' },
                { label: 'Promotable',    value: o.promotables ?? 0, highlight: '' },
                { label: 'Progressing',   value: prCount, highlight: prCount > 0 ? 'text-amber-600' : '' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                  <div className={`text-2xl font-bold text-blue-600 ${s.highlight}`}>{s.value}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Trend */}
        <div className={`flex items-center gap-3 rounded-lg p-3 border ${
          o.psrTrend === 'improving' ? 'bg-green-50 border-green-200' :
          o.psrTrend === 'declining' ? 'bg-red-50 border-red-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          {o.psrTrend === 'improving' ? <TrendingUp className="w-5 h-5 text-green-600" /> :
           o.psrTrend === 'declining' ? <TrendingDown className="w-5 h-5 text-red-600" /> :
           <Minus className="w-5 h-5 text-blue-600" />}
          <span className="text-sm font-medium">
            Trend: <strong>{o.psrTrend ?? 'insufficient data'}</strong>
            {o.belowRSAverageCount != null && o.belowRSAverageCount > 0 &&
              ` · Below RS average in ${o.belowRSAverageCount} report(s) (${belowRSPct}%)`}
          </span>
        </div>

        {/* Per-FITREP timeline */}
        {fitreps.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2 pr-3">Grade</th>
                  <th className="pb-2 pr-3">Period</th>
                  <th className="pb-2 pr-3">Station</th>
                  <th className="pb-2 pr-3 text-center">Score</th>
                  <th className="pb-2 pr-3 text-center">RS Avg</th>
                  <th className="pb-2 text-center">Rec</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...fitreps].reverse().map((f, i) => {
                  const belowRS = f.rsAverage > 0 && f.individualAverage < f.rsAverage;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 pr-3 font-medium text-gray-700">{f.payGrade}</td>
                      <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                        {fmtDate(f.startDate)} – {fmtDate(f.endDate)}
                      </td>
                      <td className="py-2 pr-3 text-gray-600 max-w-[160px] truncate">{f.station || '—'}</td>
                      <td className="py-2 pr-3 text-center">
                        {f.individualAverage > 0 ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${scoreColor(f.individualAverage)}`}>
                            {f.individualAverage.toFixed(2)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-center text-gray-600 text-xs">
                        {f.rsAverage > 0 ? f.rsAverage.toFixed(2) : '—'}
                        {belowRS && <span className="ml-1 text-amber-600 font-bold" title="Below RS average">⚠</span>}
                      </td>
                      <td className="py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${recColor(f.promotionRec)}`}>
                          {f.promotionRec || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No individual FITREP records parsed. Upload PSR and re-run analysis for a per-report breakdown.</p>
        )}

        {/* PSR Issues */}
        {psrIssues.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> PSR Issues Detected
            </h4>
            <ul className="space-y-1">
              {psrIssues.map((issue, i) => (
                <li key={i} className="text-sm text-red-800">• {issue}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Letter to the Board */}
        {needsLetterToBoard && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Mail className="w-6 h-6 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-amber-900 text-base mb-2">Letter to the Board Recommended</h4>
                <p className="text-sm text-amber-800 mb-3">
                  Based on the issues identified in your record, submitting a <strong>personal statement to the selection board</strong> is strongly recommended.
                  A letter to the board is a one-page statement you submit directly to the promotion board (typically <strong>10 days before it convenes</strong>)
                  that allows you to address anything adverse or unusual in your record in your own words.
                </p>
                <div className="text-sm text-amber-900 font-semibold mb-1">Reasons warranting a letter in your record:</div>
                <ul className="text-sm text-amber-800 space-y-1 mb-3">
                  {o.psrTrend === 'declining' && <li>• Declining FITREP trend — explain any extenuating circumstances (PCS turbulence, unit issues, personal hardship)</li>}
                  {belowRSPct > 30 && <li>• Below RS average in {belowRSPct}% of reports — provide context and trajectory</li>}
                  {psrIssues.map((issue, i) => <li key={i}>• {issue}</li>)}
                </ul>
                <div className="text-sm text-amber-900 font-semibold mb-1">What to include:</div>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>• Brief factual explanation of circumstances (no excuses, just context)</li>
                  <li>• What actions you took to address or improve the situation</li>
                  <li>• Your commitment and trajectory going forward</li>
                  <li>• Keep it to one page — concise and professional</li>
                  <li>• Submit <strong>directly</strong> to the selection board via MyNavy HR (mynavyhr.navy.mil → Career Tools → Selection Boards) — do <strong>not</strong> route through your chain of command (per MILPERSMAN 1420-010)</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SECURITY CLEARANCE ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-bold text-gray-900">Security Clearance</h3>
        </div>
        {o.clearanceLevel && o.clearanceLevel !== 'None' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${
                o.clearanceLevel === 'Top Secret' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {o.clearanceLevel}
              </span>
              {o.clearanceDate && (
                <span className="text-sm text-gray-600">
                  Investigation date: <strong>{fmtDate(o.clearanceDate)}</strong>
                  {(() => {
                    const age = clearanceAgeYears(o.clearanceDate);
                    if (age === null) return null;
                    if (age > 5) return <span className="ml-2 text-red-600 font-semibold">⚠ {Math.floor(age)} years old — reinvestigation may be required</span>;
                    if (age > 4) return <span className="ml-2 text-amber-600 font-semibold">Approaching 5-year reinvestigation threshold</span>;
                    return <span className="ml-2 text-green-600">Current</span>;
                  })()}
                </span>
              )}
            </div>
            {rankGTE(rank, 'LCDR') && o.clearanceLevel !== 'Top Secret' && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <strong>Consider upgrading to Top Secret.</strong> TS clearance opens significantly more billets at LCDR and above, particularly joint, BUMED staff, and senior OMO positions.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
            <strong>No clearance on record.</strong> A minimum Secret clearance is required for most billets.
            {rankGTE(rank, 'LCDR') && ' This is a significant gap at your rank — initiate an SF-86 immediately through your security manager.'}
          </div>
        )}
      </div>

      {/* ── CAREER OPPORTUNITIES ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-6 h-6 text-blue-600" />
          <h3 className="text-xl font-bold text-gray-900">Career Opportunities</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Current Billets ({rank})</h4>
            <ul className="space-y-1">
              {career.current.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />{b}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Target for Next Rank</h4>
            <ul className="space-y-1">
              {career.target.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <TrendingUp className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />{b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* AQDs */}
        <div className="mt-5 pt-5 border-t border-gray-100">
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">AQDs &amp; Service Schools</h4>
          <div className="flex flex-wrap gap-2 mb-3">
            {o.aqds.length > 0
              ? o.aqds.map(a => (
                  <span key={a} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-mono font-bold">{a}</span>
                ))
              : <span className="text-sm text-gray-500 italic">No AQDs on record</span>
            }
          </div>
          {career.aqdsToGet.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recommended to pursue:</p>
              <ul className="space-y-1">
                {career.aqdsToGet.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <BookOpen className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />{a}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* ── MILESTONE POSITIONS ── shown for LCDR/CDR per Schofer guidance ── */}
      {(rank === 'LCDR' || rank === 'CDR') && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-6 h-6 text-indigo-600" />
            <h3 className="text-xl font-bold text-indigo-900">Milestone Positions</h3>
          </div>
          <p className="text-sm text-indigo-800 mb-4">
            Per CAPT Joel Schofer, MD (The Wealthy Captain): <em>"Applying for a Milestone, getting slated, and doing well
            may be the most successful path in Navy Medicine."</em> Milestone billets are competitive assignments managed by
            the Corps Chief's Office that provide the broadening, visibility, and leadership experience boards look for when
            selecting for O6.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide mb-2">What Milestone Positions Are</h4>
              <ul className="space-y-1 text-sm text-indigo-800">
                <li className="flex items-start gap-2"><span className="text-indigo-500 font-bold mt-0.5">•</span>Screened, competitive billets identified as high-development assignments</li>
                <li className="flex items-start gap-2"><span className="text-indigo-500 font-bold mt-0.5">•</span>Include: BUMED staff, Specialty Leader, Detailer, GME Director, senior OMO</li>
                <li className="flex items-start gap-2"><span className="text-indigo-500 font-bold mt-0.5">•</span>Managed by the Corps Chief's Office — contact BUMED M1 for the current list</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-indigo-700 uppercase tracking-wide mb-2">How to Pursue</h4>
              <ul className="space-y-1 text-sm text-indigo-800">
                <li className="flex items-start gap-2"><span className="text-indigo-500 font-bold mt-0.5">1.</span>Contact your detailer <strong>9–18 months before PRD</strong> to express interest</li>
                <li className="flex items-start gap-2"><span className="text-indigo-500 font-bold mt-0.5">2.</span>Build a strong package: stellar FITREPs, board cert (K code), warfare qual, JPME</li>
                <li className="flex items-start gap-2"><span className="text-indigo-500 font-bold mt-0.5">3.</span>Have a mentor (ideally a CAPT or Flag) who knows the current landscape</li>
                <li className="flex items-start gap-2"><span className="text-indigo-500 font-bold mt-0.5">4.</span>Apply proactively — do not wait for the Corps Chief to come to you</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── STRENGTHS ── */}
      {strengths.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <h3 className="text-xl font-bold text-gray-900">Record Strengths</h3>
          </div>
          <div className="grid gap-3">
            {strengths.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                  <Icon className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-green-900">{s.category}</h4>
                    <p className="text-green-800 text-sm mt-0.5">{s.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── GAPS ── */}
      {gaps.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-6 h-6 text-orange-600" />
            <h3 className="text-xl font-bold text-gray-900">Identified Gaps &amp; Recommendations</h3>
          </div>
          <div className="grid gap-4">
            {gaps.map((g, i) => {
              const Icon = g.icon;
              return (
                <div key={i} className={`border rounded-xl p-5 ${severityBg(g.severity)}`}>
                  <div className="flex items-start gap-3">
                    <Icon className="w-5 h-5 text-gray-700 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold text-gray-900">{g.category}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${severityBadge(g.severity)}`}>
                          {g.severity}
                        </span>
                      </div>
                      <p className="text-gray-800 text-sm mb-3">{g.description}</p>
                      <div className="bg-white/60 rounded-lg p-3 border border-gray-200">
                        <p className="text-xs font-semibold text-gray-600 mb-1">RECOMMENDATION</p>
                        <p className="text-sm text-gray-800">{g.recommendation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
