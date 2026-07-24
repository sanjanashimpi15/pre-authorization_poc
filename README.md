# Aivana — India TPA Insurance Copilot

> **Automates prior authorization, medical coding, claims scrubbing, and denial appeals for Indian TPAs and hospitals — turning a multi-day manual workflow into a near-real-time AI-assisted pipeline.**

---

## What It Does

Aivana is a three-layer AI copilot for Indian health insurance operations:

| Layer | Name | Responsibility |
|---|---|---|
| 🏥 Clinical Evidence Review | **Fairway Health** | Validates hospital clinical notes against medical necessity criteria for standard Indian disease profiles (Dengue, Typhoid, Cataract, LSCS, etc.) |
| ⚖️ Denial Appeals | **Aegis** | Generates legal and medical appeal letters defending clinical decisions and matching claims evidence to denial reasons |
| 🧾 Medical Coding & Billing | **Taiga** | Autonomous ICD-10/CPT coding with CCI edit scrubbing, surgical unbundling detection, and IRDA room rent cap enforcement |

---

## Who Uses It

**Primary users:** TPA desk officers, hospital insurance coordinators, and medical coders (internal ops/claims teams).

**Secondary touchpoint:** Policyholders/patients — through the QR intake flow at hospital admission.

---

## Insurance Lifecycle Coverage

| Stage | Covered |
|---|---|
| Quoting / Underwriting | ❌ |
| **Prior Authorization** | ✅ Full 5-tab PA gateway with Fairway clinical necessity scoring |
| **Claims Processing** | ✅ Document ingestion, OCR, ICD-10 coding, scrubbing |
| **Denial Appeals** | ✅ Aegis appeal letter generation |
| **Fraud / Scrubbing** | ✅ CCI unbundling, room rent cap validation, ICD-10 chapter locks |
| Policy Servicing | ❌ |
| Customer Support | ❌ |

---

## 12-Screen Pipeline

```
Screen 1   Patient QR Intake          Patient self-registers via QR → case auto-created
Screen 2   Patient Details            OCR-extracted demographics + insurance fields
Screen 3   Document Upload            PDF/image upload with Gemini OCR extraction
Screen 4   AI Document Classification Document type identification (discharge, lab, policy, etc.)
Screen 5   Extracted Information      Structured fields from all uploaded documents
Screen 6   Prior Auth Gateway         5-tab PA form → Fairway clinical score → TPA submission
Screen 7   Evidence Explorer          Citation-level evidence grounding per claim field
Screen 8   Policy Capping             IRDA room rent cap enforcement + proportional deductions
Screen 9   TPA Query Prediction       Predicted TPA queries with pre-emptive responses
Screen 10  Workflow Timeline          End-to-end audit trail
Screen 11  Claim Packet Preview       Final submission-ready packet
Screen 12  Analytics & Accuracy       Benchmark scores, grounding metrics, ICD accuracy
```

---

## AI Stack

- **Model provider:** Google Gemini exclusively (`@google/genai` SDK)
- **Models used:**
  - `gemini-2.5-flash` — text reasoning, structured JSON extraction, clinical scoring
  - `gemini-2.0-flash` — document OCR, insurance card image scanning
- **Pattern:** Prompt engineering + structured output (no fine-tuning, no RAG)
- **Fallback:** Multi-API-key rotation for reliability

No OpenAI, Anthropic, or other providers are used. Switching would require a full service rewrite.

---

## Indian Compliance Rules (Coded In)

- **Room Rent Cap:** Normal ward ≤ 1% of Policy Sum Insured/day; ICU ≤ 2%/day
- **Proportional Deductions:** If actual room rent exceeds cap, all associated charges (doctor fees, diagnostics, nursing) are proportionally reduced before calculating `cashlessApproved` and `patientShare`
- **ICD-10 Chapter Locks:**
  - Ophthalmology/Cataract → `H` codes only
  - Maternity/LSCS → `O` or `Z` codes only
  - Gynecology/Hysterectomy → `D`, `N`, or `Z` codes only
  - Orthopedics/TKR → `M` codes only
- **Ambiguous inputs:** Map to `Pending ICD-10` — block auto-submission until manual review
- **Daycare/short stays:** Stays under 24 hours exempt from extension audits

---

## Technical Stack

```
Frontend    React + TypeScript + Vite
Styling     Tailwind CSS (custom opd-* design tokens)
AI          @google/genai (Gemini SDK)
Storage     IndexedDB (browser-local, masterPatientRecord service)
Backend     None — fully client-side SPA
Vector DB   None — document context sent inline to Gemini
Auth        None (POC stage)
```

### What runs today (after `npm install && npm run dev`):

The full 12-screen pipeline is functional:
- Patient QR scan → self-registration → case creation in IndexedDB
- Insurance card photo upload → Gemini OCR → auto-fill policy fields
- PDF/image document upload → OCR extraction → structured patient record
- Prior Authorization gateway with Fairway clinical necessity scoring
- ICD-10 coding with chapter-lock validation
- IRDA room rent cap calculation with proportional deductions
- Adversarial audit loop (`scripts/continuousAdversarialAuditor.ts`) against a golden benchmark registry

---

## Setup

### Prerequisites
- Node.js 18+
- A Google Gemini API key ([get one here](https://aistudio.google.com/))

### Install & Run

```bash
git clone https://github.com/abhisheknahire89/insaurancesft-AIvana.git
cd insaurancesft-AIvana
npm install
cp .env.example .env   # add your VITE_GEMINI_API_KEY
npm run dev
```

App runs at `http://localhost:5175`

### Environment Variables

```env
VITE_GEMINI_API_KEY=your_key_here
VITE_GEMINI_API_KEY_2=optional_fallback_key
VITE_DEMO_MODE=false
```

---

## Patient QR Intake Flow

1. Hospital desk opens **Screen 1** → a unique session QR is generated
2. Patient scans QR on their phone → lands on a clean mobile registration form (same app, `?register=TOKEN`)
3. Patient fills name, age, mobile, insurance details, chief complaints
4. Patient can **photo their insurance card** → Gemini reads insurer, TPA, policy number, sum insured, member ID automatically
5. On submit → `PatientCaseRecord` is written to IndexedDB → appears in the **Live Patient Waiting Room** on the hospital desk with stage `Profile Filled`
6. Desk officer clicks **Load into Pipeline** → case flows through Screens 2–12

---

## Data

| Type | Description |
|---|---|
| Patient records | Name, age, gender, UHID, contact, address |
| Insurance details | Insurer, TPA, policy number, sum insured, room rent limits |
| Clinical | Diagnosis, ICD-10 codes, chief complaints, HoPi, vitals |
| Documents | Discharge summaries, lab reports, policy documents (PDF/image) |
| Claims | Billing items, room rent, surgeon fees, investigation costs |

**Sensitivity:** High — PII, health info, financial info. All data is **browser-local (IndexedDB)** — no server, no external data storage. Documents are sent to Gemini API for OCR/analysis only.

**Current data:** Mix of synthetic demo cases (Dengue, Cataract, LSCS, Pneumonia, Appendicitis) and real anonymized documents during testing.

---

## Evaluation

The `continuousAdversarialAuditor.ts` runs a benchmark loop:
- **36+ case registry** with expected outputs (`scratch/adversarial_registry/`)
- Metrics: compliance score, ICD-10 accuracy, grounding score, clinical necessity score
- Failure cases logged to `scratch/adversarial_failures/`
- Audit reports generated per run (`scratch/audit_report_*.md`)

---

## Known Gaps (POC Stage)

- No backend → no multi-user, no shared state across devices
- Patient QR flow requires a hosted URL for real mobile handoff (currently localhost-only)
- No authentication or role-based access
- Denial Queue appeal loop not yet integrated with insurer API
- README was behind the code — this file is now the source of truth

---

## Roadmap

- [ ] Firebase/Supabase backend for multi-user + persistent state
- [ ] Hosted deployment (Vercel / Firebase Hosting)
- [ ] Real insurer API integration (HL7 FHIR / TPA portal APIs)
- [ ] IRDAI data localization compliance
- [ ] Role-based access (TPA officer, hospital admin, auditor)
- [ ] WhatsApp/SMS notification for patient registration confirmation

---

## Repository

| Remote | URL | Role |
|---|---|---|
| `origin` | https://github.com/abhisheknahire89/insaurancesft-AIvana | **Main** |
| `backup` | https://github.com/abhisheknahire89/V1-TAP | Mirror |

---

*Built with Gemini AI · Designed for Indian healthcare TPA workflows · IRDA-aware*
