# Tasks — AI Pipeline targeted architectural change: Groq Structured Extraction

- `[x]` 1. Config & Client Setup
  - `[x]` Add `'groq'` provider type & `MODEL_GROQ` constant in `modelConfig.ts`
  - `[x]` Add `getGroqClient()` and `proxyGroq(...)` in `services/apiKeys.ts`
  - `[x]` Implement server-side proxy handler in `api/groq.ts` with 3-attempt retry loop
- `[x]` 2. Extraction Pipeline Migration & Robust Chunking Fallback
  - `[x]` Add conditional branching for `AI_PROVIDER === 'groq'` in `documentExtractionService.ts`
  - `[x]` Implement page-based document chunking (under 20,000 chars per request) to stay within the 6,000 TPM limit
  - `[x]` Implement structured JSON reconciliation/merging logic to assemble the master JSON
- `[x]` 3. E2E & Verification Suite
  - `[x]` Run side-by-side schema compatibility test script
  - `[x]` Re-run the full diagnosis E2E tests (all 5 test diagnoses)
  - `[x]` Re-run the note-vs-document comparison test
  - `[x]` Run `scratch/reverify_rail_fix.cjs` (all 4 states pass)
  - `[x]` Run Vite production build with zero errors
