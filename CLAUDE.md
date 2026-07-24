# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Aivana — an India-specific TPA (Third Party Administrator) health insurance copilot. It automates prior authorization, medical coding (ICD-10), claims scrubbing, and denial appeals for Indian hospitals/TPAs. Three product layers share one codebase:

- **Fairway** — clinical evidence review (does the note justify the diagnosis/admission?)
- **Aegis** — denial appeal generation (matches claim evidence to insurer denial reasons)
- **Taiga** — ICD-10/CPT coding, CCI-edit scrubbing, IRDA room-rent cap enforcement

See `.agents/AGENTS.md` for the compliance rules (room rent caps, ICD-10 chapter locks) that most engine code encodes — read it before touching `engine/` or `utils/costCalculator.ts`. `README.md` has a fuller product walkthrough (12-screen pipeline) but is stale on the backend/architecture section — this file supersedes it there.

## Commands

```bash
npm run dev              # Vite dev server at :3000 (README says 5175 — dev server is actually port 3000, see vite.config.ts)
npm run build             # vite build
npm run preview           # preview production build

# Test / audit / eval scripts (all tsx, no unit-test framework e.g. jest/vitest is configured)
npm run test:battery              # scripts/testBattery.ts — golden-case regression battery
npm run test:billing-math         # scripts/testBillingMath.ts — room-rent cap / proportional deduction math
npm run test:audit                # scripts/continuousAudit.ts — long-running single-module audit loop
npm run test:audit:short          # same, capped batch (AUDIT_BATCH=50, AUDIT_DURATION_MINS=30)
npm run test:multi:audit          # scripts/continuousMultiAudit.ts — audits all 9 engine modules together
npm run test:multi:audit:short    # SINGLE_RUN=true, one pass instead of continuous loop
npm run test:planted              # scripts/plantedErrorCheck.ts — verifies known-bad inputs are caught
npm run test:adversarial          # scripts/qa/adversarialSafetyQA.ts
npm run test:quality:gate         # scripts/qualityGate.ts — pass/fail gate, likely used pre-merge
npm run test:concurrency:stress   # scripts/stressTestConcurrency.ts
npm run failures:dashboard        # scripts/failureIntelligenceDashboard.ts
npm run failures:critical         # ...--risk critical
npm run failures:report           # ...--export

# Run a single script directly (any script under scripts/ or scratch/ can be run this way)
npx tsx scripts/singleCasePipeline.ts
```

There's no configured linter (no ESLint config found) and no `tsc --noEmit` script — `tsconfig.json` has `noEmit: true` but nothing wires it into `npm run`. If you need a type-check, run `npx tsc --noEmit` directly.

## Environment

Copy `.env` / create `.env.local` with:
```
VITE_GEMINI_API_KEY=...          # required — app throws a startup error banner without it
VITE_GEMINI_API_KEY_2=...        # optional fallback
VITE_DEMO_MODE=false             # true enables canned DEMO_FALLBACKS responses (data/demoFallbacks.ts)
DATABASE_URL=...                 # optional — Neon Postgres, enables real /api/auth/* (else vite dev mock-auths everyone)
JWT_SECRET=...                   # required if DATABASE_URL is set
VITE_QWEN_ENDPOINT_URL=...       # optional — routes Fairway reasoning to a self-hosted Qwen/MedGemma/Ollama endpoint instead of Gemini
VITE_QWEN_API_KEY=...            # bearer token for hosted Qwen endpoints (e.g. Cerebras)
```

## Architecture

### Two backends, both thin proxies over Vite/Vercel

There is no persistent server process. Two parallel mechanisms serve the same `/api/*` routes:

- **Local dev**: `vite.config.ts` has a `localApiPlugin` that intercepts `/api/gemini`, `/api/db`, `/api/auth/*`, `/api/users/*` in Vite's dev middleware and calls the handler modules directly (via `ssrLoadModule`), or falls back to hardcoded mock responses for auth if `DATABASE_URL` isn't set.
- **Production (Vercel)**: the same handlers under `api/` are deployed as serverless functions; `vercel.json` rewrites `/api/*` to itself and everything else to `index.html` (SPA).

Key API handlers:
- `api/gemini.ts` — proxies Gemini calls server-side so the API key never reaches the browser (`services/apiKeys.ts` does the client-side half: browser code always calls `fetch('/api/gemini', ...)`, Node scripts call the Gemini SDK directly).
- `api/db.ts` — a `better-sqlite3` key/value-ish store (`patient_cases`, `patients`, `icd_corrections`, `generated_packets` tables) at `prior_auth_poc.db` locally / `/tmp` on Vercel (ephemeral in prod — don't treat it as durable).
- `api/auth/login.ts`, `api/auth/signup.ts`, `api/users/me.ts` — real auth against Neon Postgres (bcrypt + JWT) when `DATABASE_URL`/`JWT_SECRET` are set.

Client-side persistence is **also** IndexedDB (`services/storageService.ts` — Dexie-free raw IndexedDB; `services/masterPatientRecord.ts` — Dexie-based `PatientCaseRecord` store, the actual source of truth the UI reads/writes for the 12-screen pipeline). So patient data can live in browser IndexedDB, SQLite, and/or Postgres depending on what's configured — check which store a given service/component actually calls before assuming persistence.

### AI: Gemini only, with a MedGemma/Qwen escape hatch

- All model names are centralized in `config/modelConfig.ts` (`MODEL_TEXT`, `MODEL_DOCUMENT`, `MODEL_TTS`, `MODEL_AUDIO`) — never hardcode a model string in a service.
- `services/llmClient.ts` (`queryMedGemma`) is the entry point for Fairway's clinical-sufficiency reasoning: if `VITE_QWEN_ENDPOINT_URL` (or the legacy `VITE_MEDGEMMA_ENDPOINT_URL`) is set, it calls that OpenAI-chat-compatible endpoint first and falls back to Gemini on failure/timeout; otherwise it goes straight to Gemini. This is the only place that fallback logic lives — don't duplicate it.
- `services/apiKeys.ts` is the only place that should construct a `GoogleGenAI`/`GoogleGenerativeAI` client. It branches on `isBrowser`: browser code proxies through `/api/gemini`, Node/script code calls the SDK directly with a retry-on-429/503 wrapper.

### `engine/` — the reasoning/workflow pipelines

Two distinct things live under `engine/`, don't conflate them:

1. **`engine/layers/02_..12_*.ts` + `engine/workflow.ts`** (`runNexusWorkflow`) — a numbered-stage pipeline (normalize → PHI scrub → ontology map → knowledge retrieval → clinical domain logic → LLM query → DDx → output compose → guardrails → audit) used specifically for the conversational/voice "Veda" assistant path (`services/geminiService.ts` → `streamChatResponse`). This is a generator-based chat pipeline, separate from the claim pipeline below.
2. **Claim-processing engines** — `evidenceReview.ts`, `enhancementReview.ts`, `billingCoder.ts`, `denialReview.ts`, `denialAppealGenerator.ts`, `appealGenerator.ts`, `partCGenerator.ts`, `priorAuthWorkflow.ts`, `claimHealthScanner.ts` — each is one stage of the actual insurance workflow (evidence sufficiency → enhancement suggestions → ICD/CPT billing codes → denial classification → appeal letter → Part C generation). These are the "9 modules" exercised together by `scripts/continuousMultiAudit.ts` and individually by `scripts/testBattery.ts`.

`config/` holds the compliance-critical static data these engines pull from: `insurancePolicies.ts`, `icd10Database.ts` + `data/icd10*.json`, `mandatoryItems.ts`, `rateCard.ts`, `tpaRegistry.ts`, `hospitalConfig.ts`, `icd_costs_database.json`. `utils/costCalculator.ts` is where the room-rent-cap / proportional-deduction math from `.agents/AGENTS.md` §2 is actually implemented — that's the file to check when a billing number looks wrong.

### UI structure

`App.tsx` → `AuthProvider` (`contexts/AuthContext.tsx`, wraps `utils/api.ts` axios client) → `InsuranceModule.tsx` (~3000 lines — the orchestrator for the whole 12-screen patient pipeline: intake, document upload/OCR, PA gateway, evidence explorer, policy capping, TPA query prediction, workflow timeline, claim packet, analytics). Sub-areas are split into:
- `components/PreAuthWizard/` — the multi-tab prior-auth form itself
- `components/PreAuthDashboard/` — case list + case workspace views
- `components/TpaPlatform/` — TPA-facing views (`PriorAuthCopilot`, `DenialHub`, `BillingCoderView`, `WorkflowOrchestrator`)
- `components/PostSubmission/` — post-submission denial queue

### Evaluation / adversarial audit loop

This project is unusually eval-heavy for its size — treat `scripts/` and `scratch/` as first-class, not throwaway:
- `scripts/continuousAdversarialAuditor.ts` / `continuousMultiAudit.ts` generate synthetic cases (`scripts/dynamicCaseGenerator.ts`, Gemini-driven), run them through the real engine modules, and grade output with `scripts/geminiChecker.ts` (an LLM-as-judge) plus deterministic checks.
- Golden/failing cases and audit output live in `scratch/adversarial_registry/` (expected outputs), `scratch/adversarial_failures/` (regressions), and `scratch/audit_report_*.md` (per-run reports) — these are read/written by the scripts above, not meant to be hand-edited.
- `logs/multi_module_audit.log` / `multi_module_raw.log` are the running audit logs; large `run_summary_*` files under `logs/` are generated reports.
- `scratch/` also contains a large number of one-off investigation scripts (`test_*.ts`, `analyze_*.ts`, `audit_report_*.md`) from prior debugging sessions — useful as precedent/examples but not part of the maintained surface; don't assume they still run cleanly.

### Compliance rules to keep in mind when editing engine/billing code

(Full detail in `.agents/AGENTS.md`.)
- Room rent: normal ward capped at 1%/day of Sum Insured, ICU at 2%/day; exceeding the cap triggers **proportional deduction** across all associated charges before computing `cashlessApproved`/`patientShare`.
- ICD-10 chapter locks by specialty: Ophthalmology/Cataract → `H` only; Maternity/LSCS → `O`/`Z` only; Gynecology/Hysterectomy → `D`/`N`/`Z` only; Orthopedics/TKR → `M` only. Ambiguous diagnosis text must map to `Pending ICD-10`, not a guessed code.
- Any AI-generated ICD mapping with `confidence: 'low'` must block auto-submission pending manual review.
- Daycare/short stays under 24 hours are exempt from stay-extension query flags.
