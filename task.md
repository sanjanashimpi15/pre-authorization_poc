# Foundation Tasks & Codebase Cleanup Checklist

## Task 1 & 5: Security & Serverless Proxy
- [x] Overwrite `services/apiKeys.ts` with browser-proxying fetch logic & startup key verification checks
- [x] Overwrite `utils/insuranceEfficiencyAnalysis.ts` to remove hardcoded API keys
- [x] Update `DEPLOYMENT_GUIDE.md` to remove hardcoded keys and replace with placeholder
- [x] Create `.env.local.example` with template environment variables
- [x] Update `.gitignore` to explicitly ignore `.env` file
- [x] Create `api/gemini.ts` Vercel serverless function
- [x] Update `vite.config.ts` to add configureServer local middleware proxy for `/api/gemini`
- [x] Update `vercel.json` rewrite configuration to prevent routing `/api/*` to `/index.html`

## Task 2: Centralize Gemini Models
- [x] Create `config/modelConfig.ts` with centralized model names
- [x] Update `services/geminiService.ts` to import and use `MODEL_TEXT` & `MODEL_DOCUMENT`
- [x] Update `services/documentExtractionService.ts` to import and use `MODEL_DOCUMENT`
- [x] Update `services/evidenceExtractionService.ts` to import and use `MODEL_DOCUMENT`
- [x] Update `services/voiceDictationService.ts` to import and use `MODEL_TEXT`
- [x] Update `utils/insuranceEfficiencyAnalysis.ts` to use `MODEL_TEXT`
- [x] Update `services/api.ts` to import and use `MODEL_TTS`
- [x] Update `hooks/useSpeechRecognition.ts` to import and use `MODEL_AUDIO`
- [x] Update `hooks/useVedaSession.ts` to import and use `MODEL_AUDIO`
- [x] Update `scripts/geminiChecker.ts` to use `MODEL_TEXT`
- [x] Update `scripts/dynamicCaseGenerator.ts` to use `MODEL_TEXT`
- [x] Update `engine/layers/05_llmInterface.ts` to use `MODEL_TEXT`

## Task 3: MedGemma custom endpoint & VITE_DEMO_MODE support
- [x] Overwrite `services/llmClient.ts` to support `VITE_MEDGEMMA_ENDPOINT_URL`, fall back to Gemini reasoning, and enforce `DEMO_FALLBACKS` only under `VITE_DEMO_MODE=true`

## Task 4: Duplicate Files Cleanup
- [x] Delete identical duplicate suffix-2 files (45 files)
- [x] Delete root `auth.txt` file
- [x] Delete `components/cost claculator uses ICD databases` and its twin
- [x] Delete diverged duplicate suffix-2 files (8 files) after user approval

## Phase 2: Audit Extension & Pipeline Latency Timing
- [x] Task 1: Resolve duplicate appeal module divergence (untested vs tested modules)
- [x] Task 2: Specific KPI / metrics assignment for all 9 modules
- [x] Task 3: Add denialReview, appeal_hub, and partC modules to continuousMultiAudit.ts loop
- [x] Task 4: Create singleCasePipeline.ts script for latency timing of all 9 stages
- [x] Run the extended continuous audit loop & analyze results
- [x] Run the single-case pipeline timing simulation and report wall-clock metrics

## Phase 3: Premium Light-Mode Design System Refactoring
- [x] Update `index.html` with Google Lora font, Tailwind config, and CSS utilities
- [x] Replace static `ClaimWorkflowTimelineView` inside `components/InsuranceModule.tsx` with `<WorkflowOrchestrator />`
- [x] Run dev server verification to ensure the simulator compiles and loads without errors
- [x] Remove `bg-black` class wrapper in `App.tsx`
- [x] Refactor `InsuranceModule.tsx` UI
- [x] Refactor `PreAuthDashboard/CaseList.tsx` UI (remove Spline and make light mode)
- [x] Refactor `PreAuthDashboard/CaseWorkspace.tsx` UI
- [x] Refactor `PreAuthDashboard/StatusBadge.tsx` UI
- [ ] Refactor `PreAuthWizard` files (`index.tsx`, `PatientInsuranceStep.tsx`, `ClinicalDetailsStep.tsx`, `AdmissionCostStep.tsx`, `ClaimReadinessRail.tsx`, `DocumentsGenerateStep.tsx`)
- [ ] Refactor TPA Platform views (`PriorAuthCopilot.tsx`, `DenialHub.tsx`, `BillingCoderView.tsx`, `WorkflowOrchestrator.tsx`)
- [ ] Refactor PostSubmission view (`DenialQueue.tsx`)
- [x] Refactor `AuthModal.tsx` login UI
- [ ] Refactor Scribe and Sidebar layouts (`Sidebar.tsx`, `VedaSessionView.tsx`)


