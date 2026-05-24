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
For PDFs ≤1.5 MB, `extractBase64FromPDF()` reads raw bytes and base64-encodes them
(runs in parallel with text extraction in DocumentUpload — no added latency). The base64
payload travels alongside the text in the POST body. On the backend, `callClaude()` builds
a native `document` content block when base64 is present (adding `anthropic-beta:
pdfs-2024-09-25`), falling back to text otherwise. Claude reads the actual PDF structure
— including tabular form fields — bypassing lossy text extraction entirely for supported
PDFs. Text extraction is retained for the Q&A/Notion path and as fallback.
Commit: feat(parse): Anthropic native PDF support — send PDFs as document blocks

### Bug fixes — rank date accuracy + PSR MP detection (2026-05-24 continued)

Four bugs identified by comparing actual PDFs against parsed output:

**ODC rank dates wrong** (MMDDYY misread as YYMMDD)
Root cause: Haiku reads ODC's `090124` as YY=09/MM=01/DD=24 (→ Jan 24 2009) instead of
MM=09/DD=01/YY=24 (→ Sep 1 2024). Prompt already had the rule but no concrete examples
matching the actual data. Added explicit examples with the officer's actual date strings
(`090124→2024-09-01`, `052112→2012-05-21`) and a bold warning: "if dates cluster around
2005–2012, you swapped MM and YY — re-parse."

**OSR as rank-date fallback**
OSR shows the same promotion dates in YYMMDD format (240901 / 180901 / 120521). YYMMDD
is unambiguous: month>12 is impossible, so there's no format ambiguity. Added a new
`rankHistory` field to the OSR prompt (YYMMDD examples included). In `mergeResults`, when
`odcResult.confidence.rankHistory === 'low'` (set by the 90-day sanity check in
`validateParsed`), the merge now substitutes OSR's rank dates and adds a warning to the
UI. Critically, `validateParsed` is now called on `odcResult` immediately after the ODC
call (before `mergeResults`) so the confidence flag is available in time to trigger the
fallback.
Commit: fix(parse): ODC rank dates + OSR fallback + PSR MP detection

**PSR MP never detected**
Root cause: pdf.js column band extraction places "M" and "P" in adjacent pipe-separated
columns; Claude reads only the right-side "P" and returns Promotable instead of Must
Promote. Prompt additions: explain the column-split artifact ("M|P"→"MP", "E|P"→"EP"),
instruct Claude that when reading native PDF, the promotion rec is the X mark's column
position in the 5-column SP|PR|P|MP|EP checkbox grid (column 4 = MP, column 5 = EP).

**PSR date "undefined" in UI**
Root cause: `formatDate` called `months[parseInt(undefined)-1]` which silently returned
`undefined` in a template string. Fixed by guarding `parts.length < 2` and validating
monthIdx range before indexing.

**RSCA coloring convention**
User preference: `individualAverage` cell should be red/green based on whether it's
above or below the RS average; `rsAverage` column shows a plain gray number. Fixed by
swapping which `<td>` receives the conditional color styling.

### Net result of all three phases
- Text extraction now preserves column structure via pipe-separated output (Phase 1)
- Each form gets its own focused, full-budget Claude call on Sonnet (Phase 2)
- PDFs ≤1.5 MB bypass text extraction entirely and let Claude read native structure (Phase 3)
- Failure in one form's parse no longer corrupts the others (Phase 2 isolation)
