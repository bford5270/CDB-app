// Regression tests for the deterministic half of the document parser.
//
// These run on the JSON the model is asked to return, so they need no API key.
// They cover everything downstream of the Claude call: award normalization,
// service-school code decoding, FITREP summary grouping, and the merge that
// assembles ExtractedOfficerData. What they deliberately do NOT cover is whether
// the model reliably finds these fields in a real document — that is prompt
// fidelity and needs a key plus real ODC/OSR/PSR records.
//
// Run with: npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// SERVICE_SCHOOL_CODES resolves public/ against cwd, as it does on Vercel.
process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'));

const {
  decodeServiceSchools,
  normalizeAwards,
  computePsrAnalytics,
  mergeResults,
} = await import('../api/_lib/recordPipeline.js');

// ── fixtures ────────────────────────────────────────────────────────────────
// Shaped exactly as the three parse prompts specify their JSON.

const odcResult = () => ({
  name: 'DOE, JOHN A', rank: 'CDR', designator: '2100', yearGroup: '10',
  rankHistory: [
    { rank: 'LT', date: '2016-05-01' },
    { rank: 'LCDR', date: '2020-09-01' },
    { rank: 'CDR', date: '2024-09-01' },
  ],
  boardCertified: true, certificationCode: 'K', clinicalSpecialty: 'Family Medicine',
  subspecialtyCodes: ['16Q0K', '16Q1T'],
  selectedForNextRank: null, clearanceLevel: 'SS', clearanceDate: '2023-04',
  aqds: ['67A', '6FA'], warnings: [],
  confidence: { rankHistory: 'high', aqds: 'high' },
});

const osrResult = () => ({
  hasUndergrad: true, hasMedicalSchool: true,
  rankHistory: [{ rank: 'CDR', date: '2024-09-01' }],
  aqds: ['JS7', '67A'],
  specialQualifications: ['NMQSLA GRAD', 'JPME PHASE1'],
  serviceSchools: [
    { code: '082', name: 'COMBAT CASE CA' },
    { code: '04c', name: 'MEDXELLENCE' },   // lowercase on purpose
    { code: 'ZZ9', name: '' },              // not in the lookup
    { code: '', name: 'AROC' },             // name only, no code
  ],
  awards: [
    { name: 'NAVY COMMENDATION MEDAL', count: 2, isUnitAward: false },
    { name: 'NAM', count: 1, isUnitAward: false },
    { name: 'NAM', count: 1, isUnitAward: false }, // repeat as a separate row
    { name: 'MERITORIOUS UNIT COMMENDATION', isUnitAward: true },
  ],
});

// Career with a PCS to a new reporting senior, then a promotion at a third command.
const psrResult = () => ({
  fitreps: [
    { payGrade: 'O4', station: 'NMRTC PORTSMOUTH', rsName: 'BRAVO', startDate: '2021-06-01', endDate: '2022-05-31', individualAverage: 4.40, rsAverage: 4.10, promotionRec: 'EP', reportType: 'RG' },
    { payGrade: 'O4', station: 'USS EXAMPLE',      rsName: 'SMITH', startDate: '2022-06-01', endDate: '2023-05-31', individualAverage: 3.50, rsAverage: 4.05, promotionRec: 'P',  reportType: 'RG' },
    { payGrade: 'O5', station: 'NMRTC SAN DIEGO',  rsName: 'JONES', startDate: '2024-01-01', endDate: '2024-12-31', individualAverage: 3.80, rsAverage: 4.10, promotionRec: 'MP', reportType: 'RG' },
    { payGrade: 'O5', station: 'NMRTC SAN DIEGO',  rsName: 'JONES', startDate: '2025-01-01', endDate: '2025-12-31', individualAverage: 4.20, rsAverage: 4.00, promotionRec: 'EP', reportType: 'RG' },
  ],
  warnings: [], confidence: { psrData: 'high' },
});

const merged = () => mergeResults(odcResult(), osrResult(), psrResult());

// ── awards ──────────────────────────────────────────────────────────────────

describe('awards', () => {
  test('sums repeat awards whether given as a count or as separate rows', () => {
    const out = merged();
    assert.deepEqual(out.awards, [
      { name: 'NAVY COMMENDATION MEDAL', count: 2 },
      { name: 'NAM', count: 2 },
    ]);
  });

  test('separates unit citations and warns, since the OSR lists personal awards only', () => {
    const out = merged();
    assert.deepEqual(out.unitAwardsFound, ['MERITORIOUS UNIT COMMENDATION']);
    assert.ok(out.warnings.some(w => w.includes('Unit citation')));
  });

  test('detects a unit award by name even when the model does not flag it', () => {
    const { awards, unitAwards } = normalizeAwards([
      { name: 'Battle "E"' },
      { name: 'NAVY UNIT COMMENDATION' },
      { name: 'MSM' },
    ]);
    assert.deepEqual(awards, [{ name: 'MSM', count: 1 }]);
    assert.equal(unitAwards.length, 2);
  });

  test('tolerates malformed input', () => {
    for (const bad of [null, undefined, 'junk', [null], [{}], [{ count: 3 }]]) {
      assert.deepEqual(normalizeAwards(bad).awards, []);
    }
  });
});

// ── service school codes ────────────────────────────────────────────────────

describe('service school codes', () => {
  test('normalizes case and resolves a known code to its course name', () => {
    const { serviceSchools } = decodeServiceSchools([{ code: '04c', name: 'MEDXELLENCE' }]);
    assert.equal(serviceSchools[0].code, '04C');
    assert.equal(serviceSchools[0].resolvedName, 'MedXellence Course');
  });

  test('keeps an unknown code rather than dropping it, and warns', () => {
    const out = merged();
    const unknown = out.serviceSchools.find(s => s.code === 'ZZ9');
    assert.equal(unknown.resolvedName, null);
    assert.ok(out.warnings.some(w => w.includes('ZZ9')));
  });

  test('keeps a row that has a name but no code', () => {
    const { serviceSchools } = decodeServiceSchools([{ code: '', name: 'AROC' }]);
    assert.equal(serviceSchools.length, 1);
    assert.equal(serviceSchools[0].code, null);
    assert.equal(serviceSchools[0].printedName, 'AROC');
  });

  test('de-duplicates identical rows', () => {
    const { serviceSchools } = decodeServiceSchools([{ code: '082' }, { code: '082' }]);
    assert.equal(serviceSchools.length, 1);
  });

  // This is what makes a code-only row visible to the "already completed" matcher.
  test('folds decoded names into specialQualifications without losing OSR labels', () => {
    const out = merged();
    assert.ok(out.specialQualifications.includes('Combat Casualty Care Course (C4)'));
    assert.ok(out.specialQualifications.includes('MedXellence Course'));
    assert.ok(out.specialQualifications.includes('NMQSLA GRAD'));
  });

  test('tolerates malformed input', () => {
    for (const bad of [null, undefined, 'junk', [null], [{}]]) {
      assert.deepEqual(decodeServiceSchools(bad).serviceSchools, []);
    }
  });
});

// ── subspecialty codes ──────────────────────────────────────────────────────

describe('subspecialty codes', () => {
  test('retains the raw codes alongside the derived specialty and cert flag', () => {
    const out = merged();
    assert.deepEqual(out.subspecialtyCodes, ['16Q0K', '16Q1T']);
    assert.equal(out.clinicalSpecialty, 'Family Medicine');
    assert.equal(out.certificationCode, 'K');
  });

  test('defaults to an empty array when the ODC parse omits them', () => {
    const odc = odcResult();
    delete odc.subspecialtyCodes;
    assert.deepEqual(mergeResults(odc, osrResult(), psrResult()).subspecialtyCodes, []);
  });
});

// ── summary groups ──────────────────────────────────────────────────────────

describe('summary groups', () => {
  test('opens a group per reporting senior / rank / station change and names the cause', () => {
    const out = merged();
    assert.equal(out.summaryGroups.length, 3);
    assert.deepEqual(out.summaryGroups.map(g => g.resetReason), [
      '',
      'new reporting senior + new duty station',
      'new reporting senior + change of rank + new duty station',
    ]);
  });

  test('tags every FITREP with its group and tallies below-average per group', () => {
    const out = merged();
    assert.deepEqual(out.fitreps.map(f => f.summaryGroupIndex), [0, 1, 2, 2]);
    assert.deepEqual(
      out.summaryGroups.map(g => `${g.belowRSCount}/${g.gradedCount}`),
      ['0/1', '1/1', '1/2'],
    );
  });

  // The regression this work existed to fix.
  test('does not report leftward movement across a PCS reset', () => {
    const out = merged();
    assert.ok(!out.psrIssues.some(i => i.includes('Leftward')));
  });

  test('still reports leftward movement inside one group', () => {
    const { psrIssues } = computePsrAnalytics([
      { payGrade: 'O4', station: 'NMRTC SD', rsName: 'SMITH', startDate: '2022-01-01', endDate: '2022-12-31', individualAverage: 4.4, rsAverage: 4.0, promotionRec: 'EP', reportType: 'RG' },
      { payGrade: 'O4', station: 'NMRTC SD', rsName: 'SMITH', startDate: '2023-01-01', endDate: '2023-12-31', individualAverage: 3.5, rsAverage: 4.0, promotionRec: 'P',  reportType: 'RG' },
    ]);
    assert.ok(psrIssues.some(i => i.includes('Leftward')));
  });

  test('a concurrent report does not split the regular-report chain', () => {
    const { summaryGroups } = computePsrAnalytics([
      { payGrade: 'O4', station: 'NMRTC SD', rsName: 'SMITH', startDate: '2022-01-01', endDate: '2022-12-31', individualAverage: 4.4, rsAverage: 4.0, promotionRec: 'EP', reportType: 'RG' },
      { payGrade: 'O4', station: 'JTF ALPHA', rsName: 'BRAVO', startDate: '2022-06-01', endDate: '2023-05-31', individualAverage: 4.2, rsAverage: 4.0, promotionRec: 'MP', reportType: 'CC' },
      { payGrade: 'O4', station: 'NMRTC SD', rsName: 'SMITH', startDate: '2023-01-01', endDate: '2023-12-31', individualAverage: 4.5, rsAverage: 4.0, promotionRec: 'EP', reportType: 'RG' },
    ]);
    assert.equal(summaryGroups.length, 2);
    assert.equal(summaryGroups.filter(g => !g.concurrent)[0].reportCount, 2);
    assert.equal(summaryGroups.filter(g => g.concurrent).length, 1);
  });

  test('a rank change at the same command opens a group', () => {
    const { summaryGroups } = computePsrAnalytics([
      { payGrade: 'O4', station: 'NMRTC SD', rsName: 'SMITH', startDate: '2023-01-01', endDate: '2023-12-31', individualAverage: 4.4, rsAverage: 4.0, promotionRec: 'EP', reportType: 'RG' },
      { payGrade: 'O5', station: 'NMRTC SD', rsName: 'SMITH', startDate: '2024-01-01', endDate: '2024-12-31', individualAverage: 3.9, rsAverage: 4.2, promotionRec: 'P',  reportType: 'RG' },
    ]);
    assert.equal(summaryGroups.length, 2);
    assert.equal(summaryGroups[1].resetReason, 'change of rank');
  });

  test('empty input yields no groups and no crash', () => {
    const out = computePsrAnalytics([]);
    assert.deepEqual(out.summaryGroups, []);
    assert.equal(out.psrTrend, 'insufficient_data');
  });
});

// ── merge ───────────────────────────────────────────────────────────────────

describe('merge', () => {
  test('de-duplicates AQDs across ODC and OSR', () => {
    assert.deepEqual([...merged().aqds].sort(), ['67A', '6FA', 'JS7']);
  });

  test('carries promotion-recommendation counts through', () => {
    const out = merged();
    assert.deepEqual(
      [out.fitrepCount, out.earlyPromotes, out.mustPromotes, out.promotables],
      [4, 2, 1, 1],
    );
  });

  test('falls back to OSR rank dates when ODC dates fail the sanity check', () => {
    const odc = odcResult();
    odc.confidence.rankHistory = 'low';
    const out = mergeResults(odc, osrResult(), psrResult());
    assert.deepEqual(out.rankHistory, [{ rank: 'CDR', date: '2024-09-01' }]);
    assert.ok(out.warnings.some(w => w.includes('sourced from OSR')));
  });

  test('survives empty parse results from all three documents', () => {
    const out = mergeResults({}, {}, {});
    assert.deepEqual(out.awards, []);
    assert.deepEqual(out.serviceSchools, []);
    assert.deepEqual(out.subspecialtyCodes, []);
    assert.deepEqual(out.summaryGroups, []);
    assert.equal(out.fitrepCount, 0);
  });
});
