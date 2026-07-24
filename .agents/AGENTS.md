# Project Rules: India TPA Insurance Copilot (Fairway Health + Aegis + Taiga)

This repository implements a prior authorization, claims scrubbing, and denial appeals automation platform tailored specifically for the Indian healthcare ecosystem, combining the capabilities of Fairway Health, Aegis, and Taiga.

## 1. Product Identity & Architecture

- **Fairway Health Layer (Clinical Evidence Review)**: Validates hospital clinical notes against medical necessity criteria for standard Indian disease profiles (Dengue, Typhoid, Cataract, LSCS, etc.).
- **Aegis Layer (Denial Appeals)**: Generates legal and medical appeal letters defending clinical decisions and matching claims evidence (including comorbidities like hypertension or diabetes) to deny reasons.
- **Taiga Layer (Medical Coding & Billing)**: Autonomous ICD-10/CPT coding with built-in scrubbers validating surgical unbundling (CCI edits) and calculating room rent capped deductions.

## 2. Indian Healthcare & TPA Compliance Guidelines

- **Room Rent Caps**: Hospital stay room charges must be validated against policy room caps. Typically:
  - Normal Ward: Capped at **1%** of the Policy Sum Insured per day.
  - ICU Ward: Capped at **2%** of the Policy Sum Insured per day.
- **Proportional Deductions**: If the actual room rent exceeds the policy cap, proportional deductions must be applied to all associated hospital charges (doctor fees, diagnostics, nursing, etc.) before calculating `cashlessApproved` and `patientShare`.
- **Stay Duration Audits**:
  - Hospital stay extensions must be clinically justified with delay reasons.
  - Daycare/short stays under **24 hours** (e.g. 18-hour or 12-hour observation) are exempt from stay extension reviews and must not trigger clinical query flags.

## 3. Medical Coding Guardrails (ICD-10 Chapter Locks)

- All mapped ICD-10 codes must match the clinical category of the diagnosis text:
  - **Ophthalmology / Cataract**: Must map only to `H` codes.
  - **Maternity / LSCS / Delivery**: Must map only to `O` or `Z` codes.
  - **Gynecology / Hysterectomy / Fibroids**: Must map only to `D`, `N`, or `Z` codes.
  - **Orthopedics / Osteoarthritis / TKR**: Must map only to `M` codes.
- **Ambiguous Inputs**: Vague terms (like "body pain" or "unknown condition") must not map to specific systems. Instead, return a `Pending ICD-10` code requiring manual doctor/coder review.
- **Low-Confidence holds**: Any mapping generated via AI fallback with `confidence: 'low'` must block claim automatic submission until manual confirmation is completed.
