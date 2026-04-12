# CLAUDE.md — Navy Medical Corps Career Development Board App

This file is the primary reference for Claude Code when working in this
repository. Read it fully before editing anything.

---

## Project Purpose

This is a web application that helps Navy Medical Corps officers prepare for
**Career Development Boards (CDBs)**. Officers upload their service record
documents (ODC, OSR, PSR), the app uses Claude to extract and analyze the
data, and it produces a structured career assessment with:

- FITREP trend analysis and issue flags
- Promotion timeline visualization
- Security clearance status and recommendations
- Career opportunity mapping by rank
- AQD (Additional Qualification Designator) gap analysis
- Additional Work Experience (AWE) recommendations
- AI-generated action plans grounded in reference documents
- A letter-to-the-board recommendation when record issues are detected
- Q&A chatbot grounded in uploaded CDB reference PDFs

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 6 |
| Styling | Tailwind CSS 4 (via `@tailwindcss/vite`) |
| UI Primitives | shadcn/ui (Radix UI), Lucide icons |
| Backend (serverless) | Vercel Functions in `/api/` (ES modules, Node 22) |
| AI | Anthropic Claude API — `claude-haiku-4-5-20251001` for parsing & Q&A, `claude-3-5-sonnet-20241022` for PSR-only parsing |
| Database | Supabase (PostgreSQL + Storage) |
| PDF parsing | `pdfjs-dist` (client-side) |
| HTTP proxy (dev) | `undici` ProxyAgent (sandbox outbound routing) |

---

## Repository Structure

```
CDB-app/
├── CLAUDE.md                        ← You are here
├── README.md
├── index.html                        ← Vite entry point
├── vite.config.ts                    ← Proxies /api → localhost:3001
├── vercel.json                       ← Production deployment config
├── dev-api-server.mjs                ← Local dev server for /api endpoints
├── .env.local                        ← ANTHROPIC_API_KEY (git-ignored)
│
├── api/                              ← Vercel Serverless Functions
│   ├── pii-scrubber.js               ← Strips SSN/DoD ID/phone/email/IP
│   ├── parse-documents.js            ← Unified ODC+OSR+PSR AI parser
│   ├── parse-psr.js                  ← Legacy PSR-only AI parser
│   └── ask.js                        ← Q&A + parse-documents dual-mode
│
├── public/
│   ├── fy26-courses.json             ← FY26 course catalog + AQDs + AWEs
│   ├── default-references.json       ← Pre-loaded reference doc summaries
│   └── pdf.worker.min.mjs            ← pdf.js worker (do not modify)
│
└── src/app/
    ├── App.tsx                       ← 4-step workflow orchestration
    ├── components/
    │   ├── DocumentUpload.tsx         ← Step 1: upload ODC/OSR/PSR files
    │   ├── DocumentParser.tsx         ← Step 1: calls /api/parse-documents
    │   ├── VerifyParsedData.tsx       ← Step 2: review + confirm officer data
    │   ├── AnalysisResults.tsx        ← Step 3: FITREP, clearance, career analysis
    │   ├── PersonalizedActionPlan.tsx ← Step 4: AI action plan (courses/AQDs/AWEs)
    │   ├── ResourcesQA.tsx            ← Persistent Q&A chatbot (all steps)
    │   ├── PromotionTimeline.tsx      ← Rank progression visualization
    │   ├── PSRAnalysis.tsx            ← FITREP analysis (AI + regex fallback)
    │   ├── ActionPlan.tsx             ← Rule-based timeline (older component)
    │   ├── AQDSelector.tsx / AQDRecommendations.tsx
    │   ├── CoursesRecommendations.tsx
    │   ├── RankHistoryForm.tsx / OfficerDataForm.tsx
    │   ├── ClearanceAndCertification.tsx
    │   ├── ReferenceDocumentManager.tsx
    │   └── ui/                        ← shadcn/ui primitives (do not modify)
    └── utils/
        ├── parsingUtils.ts            ← Core types + OfficerData interfaces
        ├── supabaseClient.ts          ← Supabase client + DocumentRecord type
        └── pdfUtils.ts                ← PDF text extraction (pdf.js wrapper)
```

---

## 4-Step User Workflow

```
Step 1: Upload & Parse
  └─ DocumentUpload → DocumentParser → /api/parse-documents (Claude)
                                              ↓
Step 2: Verify Record
  └─ VerifyParsedData (user corrects errors)
                                              ↓
Step 3: Career Analysis
  └─ AnalysisResults (FITREP deep-dive, clearance, promotion timeline, AWEs)
                                              ↓
Step 4: Action Plan
  └─ PersonalizedActionPlan (AI recommendations: courses, AQDs, AWEs)

All steps: ResourcesQA (Q&A chatbot, always visible at bottom)
```

---

## Key Data Types

The canonical officer record type flows through the entire app as
`ParsedOfficerData` (defined in `VerifyParsedData.tsx`):

```typescript
{
  name?: string
  currentRank: string           // LT | LCDR | CDR | CAPT
  rankHistory: RankDate[]       // [{ rank, date: "YYYY-MM-DD" }]
  designator?: string           // 4-digit, e.g. "2300"
  yearGroup?: string
  boardCertified: boolean | null
  certificationCode: 'J' | 'K' | null
  clearanceLevel: 'Secret' | 'Top Secret' | 'None' | ''
  clearanceDate: string         // YYYY-MM
  aqds: string[]                // ['FMF', 'SW', '67A', ...]
  fitrepAverage: number
  fitrepCount: number
  earlyPromotes: number
  mustPromotes: number
  promotables: number
  psrTrend: 'improving' | 'stable' | 'declining' | 'insufficient_data'
  psrIssues: string[]
  belowRSAverageCount: number
  belowRSAveragePercentage: number
  fitreps: FitrepRecord[]       // Full per-report data array
  hasUndergrad: boolean
  hasMedicalSchool: boolean
  warnings: string[]
}
```

---

## API Endpoints

### POST /api/parse-documents

Parses one or more raw document texts with Claude.

**Request:** `{ odc?: string, osr?: string, psr?: string }`

**Response:** Full `ParsedOfficerData`-shaped JSON.

**Model:** `claude-haiku-4-5-20251001` (fast, sufficient for structured extraction)

**PII:** All three document texts are passed through `scrubPII()` before the
Claude call.

---

### POST /api/parse-psr

Legacy PSR-only parser used by `PSRAnalysis.tsx` as fallback.

**Request:** `{ text: string }`

**Response:** `{ totalFitreps, gradedFitreps, averageIndividual, epCount, mpCount, pCount, prCount, spCount, trend, issues, belowRSAverageCount, belowRSAveragePercentage, fitreps[] }`

**Model:** `claude-3-5-sonnet-20241022` (higher accuracy for complex PSR layouts)

---

### POST /api/ask

Dual-mode endpoint:

**Mode 1** — `{ action: 'parse-documents', odc?, osr?, psr? }`
Same behavior as `/api/parse-documents` (legacy route kept for compatibility).

**Mode 2** — Q&A:
```json
{
  "question": "string",
  "context": "concatenated extracted_text from Supabase documents",
  "documentCount": 3,
  "officerRecord": "structured fitrep summary string"
}
```
Response: `{ answer: string, documentsSearched: number }`

The Q&A prompt enforces strict two-source grounding: officer record facts vs.
reference document facts are never blended.

---

## PII Scrubbing

`api/pii-scrubber.js` exports `scrubPII(text)` and `scrubObject(obj)`.

Applied in **all three API endpoints** before any text reaches Anthropic.

**Scrubbed:** SSN (formatted and 9-digit), DoD ID (10-digit), US phone numbers,
email addresses, IPv4 addresses.

**Intentionally kept:** names, station names, dates, scores — required for
accurate parsing.

---

## Supabase Schema

The app expects these tables/buckets in Supabase:

```sql
-- Table: documents
CREATE TABLE documents (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  file_path   text NOT NULL,
  file_type   text,
  file_size   bigint,
  extracted_text text,
  created_at  timestamptz DEFAULT now()
);

-- Storage bucket: documents (public read, authenticated write)
```

The `extracted_text` column stores PDF-extracted text for Q&A RAG. Documents
without `extracted_text` are uploaded but not searchable.

Supabase credentials are hardcoded in `src/app/utils/supabaseClient.ts`
(anon key — safe to expose, protected by RLS).

---

## Course Catalog (public/fy26-courses.json)

The catalog is the data source for `PersonalizedActionPlan.tsx`. Top-level
structure:

```json
{
  "fiscalYear": "FY26",
  "courses": [ ... ],        // Leadership / service school courses
  "aqds": { ... },           // AQD codes and requirements
  "aweOpportunities": [ ... ],// Additional Work Experience billets
  "careerMilestones": { ... } // Recommended actions by rank
}
```

**AWE Opportunities** are broadening assignments beyond normal clinical duty:
assistant professor, researcher/PI, BUMED staff, joint duty, CIP fellowship,
GME program director, health policy fellowship, etc. They are indexed by
`eligibleRanks` and `aweType` for filtering in the action plan.

---

## Local Development

### Prerequisites
- Node 22+
- `.env.local` with `ANTHROPIC_API_KEY=sk-ant-api03-...`

### Start

```bash
# Terminal 1 — API server (port 3001)
node dev-api-server.mjs

# Terminal 2 — Vite frontend (port 5173)
./node_modules/.bin/vite --host 0.0.0.0
```

Vite proxies all `/api/*` requests to `http://localhost:3001`.

### Why not `vercel dev`?

`vercel dev` requires Vercel account authentication which is not available in
all environments. `dev-api-server.mjs` is a lightweight replacement that
imports and serves the same `/api/*.js` handler functions.

### Proxy note (sandbox)

If running in a sandboxed environment with `GLOBAL_AGENT_HTTP_PROXY` set,
`dev-api-server.mjs` patches `global.fetch` via `undici.ProxyAgent` so that
outbound Anthropic API calls route through the proxy. Node.js native `fetch`
does not respect this variable natively.

---

## Coding Conventions

### Imports
- Use named exports for components: `export function ComponentName`
- API modules use `export default async function handler(req, res)`
- Shared types live in `VerifyParsedData.tsx` (ParsedOfficerData) and
  `parsingUtils.ts` (OfficerData, FitrepEntry, PSRSummary)

### Styling
- Tailwind utility classes only — no custom CSS files except `src/styles/index.css`
- Color palette: `blue-{600,800,900}` (primary), `green` (strengths/positive),
  `yellow/amber` (warnings), `red` (critical), `gray` (neutral)
- Cards use `bg-white border border-gray-200 rounded-lg`

### API calls (frontend)
Always call internal APIs at `/api/...` — Vite proxies this in dev; Vercel
routes it in production. Never hardcode `localhost:3001`.

### AI prompt discipline
- Parse endpoints must request JSON-only output (no markdown fences)
- Strip fences before `JSON.parse()` as a defensive measure
- Q&A endpoint enforces two-source grounding with explicit per-source citation rules
- System prompt and user message must be separate (never concatenate them)

### PII
- **Never** send raw document text to Anthropic without first calling `scrubPII()`
- The PII banner in `App.tsx` is a consent gate — do not remove or hide it

---

## Career Analysis Concepts

### Promotion Timeline
Medical Corps officers commission as LT (O-3) and progress: LT → LCDR → CDR → CAPT.
Typical time-in-grade before in-zone: ~7 years each step.
Board dates are maintained in `PromotionTimeline.tsx` (`calculatePromotionTimeline()`).

### FITREP Analysis (PSR)
- Promotion recommendations ranked: EP > MP > P > PR > SP
- **Leftward movement**: any step down in consecutive graded reports — flagged as PSR issue
- **Trend**: recent 3 vs oldest 3 recs (improving / stable / declining / insufficient_data)
- **Below RS average**: individual average < reporting senior's cumulative average
- **Letter to the Board**: recommended when `psrTrend === 'declining'`, >30% below RS average,
  or any PSR issues detected

### AQDs
- **67A** Executive Medicine — required for command track (needs Master's + O4+)
- **67B** Expeditionary Medicine — requires warfare qual + JPME I
- **FMF/SW/AW/SS/EXW** — warfare qualifications (operational credibility)
- **JS7/JS8** — joint service qualifications
- **6OC** — Clinical Investigator Program completion

### AWEs (Additional Work Experiences)
Broadening billets outside normal clinical duty. Key categories:
- **Academic** — assistant/associate professor at USUHS or affiliated programs
- **Research** — principal investigator at NMRC, WRAIR, or CDMRP-funded programs
- **Policy** — BUMED staff, OPNAV N093, DHA J-staff, health policy fellowship
- **Operational** — OCONUS/deployed tour, MEU/ship Medical Officer, SOCOM
- **Education** — GME residency program director, NMLPDC faculty
- **Joint** — Joint duty assignment (required for O7+ consideration)
- **Command Prep** — executive officer, department head, MTF deputy commander

AWE recommendations are tailored by current rank and career track in
`PersonalizedActionPlan.tsx`.

---

## Common Tasks

### Add a new course to the catalog
Edit `public/fy26-courses.json`, add to the `courses` array. Match the
existing schema: `id`, `name`, `category`, `targetRank`, `sessions[]`, etc.

### Add a new AWE type
Edit `public/fy26-courses.json`, add to `aweOpportunities[]`. Fields:
`id`, `name`, `aweType`, `description`, `eligibleRanks`, `benefits`,
`howToApply`, `contact`.

### Change the AI model
Three places: `api/ask.js` (both parse and Q&A modes), `api/parse-documents.js`,
`api/parse-psr.js`. Prefer `claude-haiku-4-5-20251001` for structured extraction
(cost/speed) and `claude-sonnet-4-6` or newer for complex Q&A.

### Add a new field to officer record
1. Add to `ParsedOfficerData` in `VerifyParsedData.tsx`
2. Add to `handleParsedDataAccepted` in `App.tsx`
3. Add to the AI system prompt in `api/parse-documents.js` / `api/ask.js`
4. Display in `AnalysisResults.tsx` and/or `PersonalizedActionPlan.tsx`

### Deploy to production
Push to `main` — Vercel auto-deploys. API functions in `/api/` are deployed as
Vercel Serverless Functions. Set `ANTHROPIC_API_KEY` in Vercel environment
variables (not committed to git).

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env.local` / Vercel | Claude API authentication |
| `GLOBAL_AGENT_HTTP_PROXY` | Sandbox only | Routes `fetch` through undici ProxyAgent |
| Supabase URL + anonKey | `supabaseClient.ts` (hardcoded) | Database + storage access |

---

## Branch Convention

Feature work: `claude/<description>-<id>`
Current active branch: `claude/improve-qa-fitrep-analysis-9bjt4`

---

## Known Limitations / Future Work

- Office document formats (DOCX, PPTX) are uploaded to Supabase but text
  extraction requires server-side processing — currently returns a placeholder
- PSR regex fallback in `PSRAnalysis.tsx` is brittle on heavily garbled PDFs;
  the AI parser via `/api/parse-psr` is the preferred path
- Supabase credentials are in client code (anon key only — acceptable for
  public read; write is protected by RLS policies)
- `progressings` field (PR count) is tracked in state but not all render paths
  display it — add to `AnalysisResults.tsx` FITREP table when needed
