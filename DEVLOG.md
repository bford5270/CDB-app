# CDB App — Dev Log

Session-by-session notes on what changed and why.

---

## 2026-05-24

### Parsing accuracy overhaul (3-phase plan)

Background: PDF parsing of the three government forms (ODC, OSR, PSR) was producing
unreliable structured data — garbled rank histories, missed AQDs, and incorrect FITREP
columns. Root cause: pdf.js text extraction destroys tabular column structure, all three
forms were competing for a single character budget in one Claude call, and the model
(Haiku) had limited headroom for complex structured extraction.

Three-phase fix:

**Phase 1 — Grid-aware column detection** (`src/app/utils/pdfUtils.ts`)
Replaced naive space-join extraction with a two-pass algorithm: collect all text item
X positions per page, cluster them into column bands (15px tolerance), assign each
item to its nearest band, emit rows as pipe-separated values. Pages with ≥3 detected
bands use columnar output; single-column pages fall back to space-join. This preserves
the column relationships the PSR grid depends on.
Commit: feat(parse): grid-aware column detection in pdfUtils — pipe-separated tabular rows

**Phase 2 — Three separate Claude calls** (`api/ask.js`)
Replaced the single monolithic Claude call with three focused calls: (1) ODC — identity,
rank history, AQDs, board cert, clearance; (2) OSR — education and additional AQDs;
(3) PSR — full FITREP table. OSR and PSR run in parallel after ODC. Removed per-doc
character limits (was 5000/3500/7000 chars). Upgraded parsing model to claude-sonnet-4-6;
Q&A remains on Haiku. Isolated failure handling: bad PSR parse no longer destroys ODC
results. AQDs from ODC and OSR are deduplicated on merge.
Commit: feat(parse): split document parsing into 3 focused Claude calls

**Phase 3 — Anthropic native PDF support** (`pdfUtils.ts`, `DocumentUpload.tsx`,
`DocumentParser.tsx`, `api/ask.js`)
(see next entry)
