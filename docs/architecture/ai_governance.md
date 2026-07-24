# AI Governance Framework

Because Aivana operates in a highly regulated healthcare and financial ecosystem, Generative AI cannot be treated as a black box. This AI Governance Framework establishes the policies and automated guardrails that constrain the AI's behavior.

---

## 1. The "Human-in-the-Loop" (HITL) Fallback
AI is never granted absolute authority over financial transactions unless explicitly opted-in by the hospital.
- **Confidence Thresholds**: Every AI generation (e.g., Fairway extracting a diagnosis) returns a confidence score (0.0 to 1.0). If the score falls below `0.85`, the MCO automatically pauses the claim and routes it to the Notification Service, requiring human review.
- **Override Tracking**: If a human overrules the AI, the Audit Service records the diff. This data is fed back into the Analytics Platform to continuously monitor the model's "Drift" (when the AI starts diverging from human intuition).

## 2. Prompt Approval & Rollback
Prompts are treated as medical policy code.
- **Four-Eyes Principle**: A Prompt Engineer cannot publish a prompt directly to production. The Prompt Registry requires a second reviewer (often a licensed medical coder) to approve the PR.
- **1-Click Rollback**: If a prompt degrades performance in production, the Registry allows an Admin to instantly revert to the previous version. The AI Gateway applies this rollback within 5 milliseconds.

## 3. Golden Datasets & Offline Evaluation
Before any new model (e.g., upgrading from Gemini 1.5 to 2.0) or prompt is deployed, it must pass the Replay Engine.
- **Dataset Curation**: Aivana maintains 50+ "Golden Datasets" curated by expert medical coders. These datasets contain highly complex edge-cases (e.g., "Patient with Dengue, Diabetes, and Hypertension, staying for 8 days in ICU").
- **LLM-as-a-Judge**: Because output phrasing varies, the Replay Engine uses an evaluator LLM to grade the candidate LLM's output against the Golden baseline, scoring it on Accuracy, Tone, and Completeness.

## 4. Hallucination Prevention
Aivana employs three layers of hallucination defense:
1. **Grounding (Evidence Graph Service)**: The AI is physically prevented from asserting a clinical fact unless it can map that fact to a bounding box on an uploaded PDF.
2. **Self-Consistency**: For high-risk extractions (like ICD-10 coding), the AI Gateway queries the LLM three times with slightly different temperature settings. If the LLM returns three different codes, the Gateway flags it as a hallucination.
3. **Deterministic Verification**: If the LLM generates a deduction amount of ₹5,000, Taiga runs a deterministic math check (`Total Bill - Allowed`). If Taiga's math yields ₹4,500, the LLM output is rejected.

## 5. Medical Validation Guardrails
Aegis Appeals are legal/medical documents. We cannot allow an LLM to invent medical treatments.
- **Ontology Enforcement**: The AI Gateway validates all generated medical terms against a localized SNOMED-CT or ICD-10 database. If the LLM invents a disease (e.g., "Super Dengue"), the output schema validation fails and the request is rejected.

## 6. Output Validation (Zod/JSONSchema)
The AI Gateway forces the LLM to return strict JSON.
- If the LLM returns invalid JSON (e.g., missing a bracket or inventing a new field), the Gateway intercepts the error, appends the error message to the prompt, and asks the LLM to fix its own syntax.
- If it fails 3 times, the Gateway returns a standard `INS-7002` error to the calling service, preventing corrupted data from entering the database.

## 7. Cost & Token Monitoring
LLMs are expensive. A run-away loop could bankrupt the platform.
- **Hard Limits**: The AI Gateway enforces a hard limit on `max_tokens`.
- **Budget Alerts**: The Feature Store aggregates token usage per hospital. If Hospital A exceeds $500 in LLM costs in one day, the Analytics Platform triggers a P1 alert to the Aivana infrastructure team to investigate potential abuse or prompt injection.

## 8. Bias and Toxicity Testing
Even though medical claims are clinical, biases can creep in.
- **Demographic Scrubbing**: Prompts are designed to be blind to patient gender, religion, and caste unless medically relevant (e.g., Maternity claims).
- **Tone Checking**: Aegis appeals must be professional. A lightweight classifier checks outbound appeal letters for aggressive or legally threatening language before they are sent to the TPA.

## 9. Regulatory Compliance
- **Explainability Mandate**: Every AI decision must be explainable. The Explainability Service generates the "Reason Graph" so a hospital can see exactly which PDF page and which policy rule drove the AI's conclusion.
- **Opt-Out**: Hospitals can use the Hospital Configuration Service (HCS) to completely disable Generative AI features (falling back to 100% human-driven workflows powered by Aivana's deterministic rules).
