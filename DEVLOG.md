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
(see next entry)

**Phase 3 — Anthropic native PDF support** (`pdfUtils.ts`, `DocumentUpload.tsx`,
`DocumentParser.tsx`, `api/ask.js`)
(see next entry)
