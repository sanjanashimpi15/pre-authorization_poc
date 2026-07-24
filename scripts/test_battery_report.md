# Regression Test Battery Report (100 Cases)

**Date:** 7/15/2026, 2:59:05 PM
**Cache Status:** 34 hits, 66 misses (24 live successful, 42 failed)

## ⚠️ Data Source — MUST READ BEFORE INTERPRETING RESULTS

> Results reflect the data source mix below. **A run with 0% live calls cannot be trusted as a true reflection of current model behavior.**

| Source | Cases | % |
|---|---|---|
| 🟢 Live MedGemma / Gemini call | 24 | 24.0% |
| 🟡 Cache hit (llm_cache.json) | 34 | 34.0% |
| 🔵 Fallback / no-LLM (failed cache miss) | 42 | 42.0% |
| **Total** | **100** | **100%** |

_To force live calls: delete or rename `scripts/llm_cache.json` and ensure Ollama or GEMINI_API_KEY is set._

## Summary Statistics

| Result Type | Count | Percentage |
|---|---|---|
| **PASS** | 51 | 51% |
| **MISS** | 37 | 37% |
| **OVER-FLAG** | 11 | 11% |
| **SAFETY-LEAK** | 1 | 1% |
| **ERROR-CRASH** | 0 | 0% |
| **Total** | 100 | 100% |

## Detailed Results Table

| ID | Category | Case / Description | Expected | Actual | Result | Notes |
|---|---|---|---|---|---|---|
| 1 | A | Diabetes admission, no duration (Seed 1) | Must flag: [duration, pre-existing]; Should Generate | Success: Document Generated | ✅ **PASS** | Diabetes admission, no duration (Seed 1) |
| 2 | A | Pneumonia thin case (Seed 2) | Must flag: [OPD, SpO2, X-ray]; Should Generate | Missed expected flag matching "OPD", Missed expected flag matching "SpO2", Missed expected flag matching "X-ray" | ❌ **MISS** | Pneumonia thin case (Seed 2) |
| 3 | A | Bilateral TKR insufficient (Seed 3) | Must flag: [duration, conservative-management, bilateral, implants, Surgeon Fee, PED]; Should Block | Missed expected flag matching "PED" | ❌ **MISS** | Bilateral TKR insufficient (Seed 3) |
| 4 | A | Angioplasty missing angiography (Seed 4) | Must flag: [PED, angiography]; Should Generate | Missed expected flag matching "PED" | ❌ **MISS** | Angioplasty missing angiography (Seed 4) |
| 5 | A | Hysterectomy missing conservative management (Seed 5) | Must flag: [conservative-management]; Should Generate | Missed expected flag matching "conservative-management" | ❌ **MISS** | Hysterectomy missing conservative management (Seed 5) |
| 6 | A | Appendicitis unsupported (Seed 6) | Must flag: [investigation, under-supported]; Should Generate | Missed expected flag matching "investigation", Missed expected flag matching "under-supported" | ❌ **MISS** | Appendicitis unsupported (Seed 6) |
| 7 | A | Cholecystectomy missing USG (Seed 7) | Must flag: [ultrasound, USG]; Should Generate | Missed expected flag matching "ultrasound", Missed expected flag matching "USG" | ❌ **MISS** | Cholecystectomy missing USG (Seed 7) |
| 8 | A | Laminectomy missing conservative management/MRI (Seed 8) | Must flag: [MRI, conservative-management]; Should Generate | Missed expected flag matching "MRI", Missed expected flag matching "conservative-management" | ❌ **MISS** | Laminectomy missing conservative management/MRI (Seed 8) |
| 9 | A | RTA fracture missing MLC (Seed 9) | Must flag: [MLC, medico-legal]; Should Generate | Success: Document Generated | ✅ **PASS** | RTA fracture missing MLC (Seed 9) |
| 10 | A | LSCS maternity missing obstetric history/dates (Seed 10) | Must flag: [LMP, EDD, obstetric]; Should Generate | Missed expected flag matching "LMP", Missed expected flag matching "EDD", Missed expected flag matching "obstetric" | ❌ **MISS** | LSCS maternity missing obstetric history/dates (Seed 10) |
| 11 | A | CKD dialysis missing creatinine (Seed 11) | Must flag: [creatinine, eGFR]; Should Generate | Missed expected flag matching "creatinine", Missed expected flag matching "eGFR" | ❌ **MISS** | CKD dialysis missing creatinine (Seed 11) |
| 12 | A | Stroke missing CT/MRI scan (Seed 12) | Must flag: [CT, MRI, neuroimaging]; Should Generate | Missed expected flag matching "CT", Missed expected flag matching "MRI", Missed expected flag matching "neuroimaging" | ❌ **MISS** | Stroke missing CT/MRI scan (Seed 12) |
| 13 | A | Dengue missing platelet count (Seed 13) | Must flag: [platelet]; Should Generate | Success: Document Generated | ✅ **PASS** | Dengue missing platelet count (Seed 13) |
| 14 | A | Cataract verification prompt (Seed 14) | Must flag: [limit]; Should Generate | Missed expected flag matching "limit" | ❌ **MISS** | Cataract verification prompt (Seed 14) |
| 15 | A | CABG missing angiography report (Seed 15) | Must flag: [angiography, necessity]; Should Generate | Missed expected flag matching "angiography" | ❌ **MISS** | CABG missing angiography report (Seed 15) |
| 16 | A | Tonsillectomy missing recurrence frequency and prior meds | Must flag: [conservative-management]; Should Generate | Missed expected flag matching "conservative-management" | ❌ **MISS** | Tonsillectomy missing recurrence frequency and prior meds |
| 17 | A | TURP missing post-void residual or IPSS score | Must flag: [residual, IPSS]; Should Generate | Missed expected flag matching "residual", Missed expected flag matching "IPSS" | ❌ **MISS** | TURP missing post-void residual or IPSS score |
| 18 | A | GERD endoscopy missing inpatient justification | Must flag: [necessity, OPD]; Should Generate | Missed expected flag matching "necessity" | ❌ **MISS** | GERD endoscopy missing inpatient justification |
| 19 | A | Ovarian cystectomy missing USG findings | Must flag: [ultrasound, USG]; Should Generate | Missed expected flag matching "ultrasound", Missed expected flag matching "USG" | ❌ **MISS** | Ovarian cystectomy missing USG findings |
| 20 | A | Chemotherapy missing histopathology / staging | Must flag: [biopsy, staging, histopathology]; Should Generate | Missed expected flag matching "biopsy" | ❌ **MISS** | Chemotherapy missing histopathology / staging |
| 21 | A | Nephrectomy missing abdominal CT scan | Must flag: [CT, MRI, investigations]; Should Generate | Missed expected flag matching "CT", Missed expected flag matching "MRI", Missed expected flag matching "investigations" | ❌ **MISS** | Nephrectomy missing abdominal CT scan |
| 22 | A | ACL reconstruction missing MRI knee report | Must flag: [MRI]; Should Generate | Missed expected flag matching "MRI" | ❌ **MISS** | ACL reconstruction missing MRI knee report |
| 23 | A | Pacemaker implantation missing diagnostic ECG | Must flag: [ECG, Holter]; Should Generate | Success: Document Generated | ✅ **PASS** | Pacemaker implantation missing diagnostic ECG |
| 24 | A | COPD exacerbation missing arterial blood gas or SpO2 | Must flag: [SpO2, ABG]; Should Generate | Success: Document Generated | ✅ **PASS** | COPD exacerbation missing arterial blood gas or SpO2 |
| 25 | A | Acute pancreatitis missing enzyme assays / CT | Must flag: [amylase, lipase, imaging]; Should Generate | Missed expected flag matching "imaging" | ❌ **MISS** | Acute pancreatitis missing enzyme assays / CT |
| 26 | A | Ureteroscopy missing stone size and CT/USG details | Must flag: [imaging, stone, size]; Should Generate | Missed expected flag matching "imaging", Missed expected flag matching "stone", Missed expected flag matching "size" | ❌ **MISS** | Ureteroscopy missing stone size and CT/USG details |
| 27 | A | Inguinal hernia repair missing inpatient medical necessity | Must flag: [necessity, OPD]; Should Generate | Missed expected flag matching "necessity", Missed expected flag matching "OPD" | ❌ **MISS** | Inguinal hernia repair missing inpatient medical necessity |
| 28 | A | Meningitis missing CSF analysis details | Must flag: [CSF, puncture]; Should Generate | Missed expected flag matching "CSF", Missed expected flag matching "puncture" | ❌ **MISS** | Meningitis missing CSF analysis details |
| 29 | A | Malaria missing diagnostic smear / antigen test | Must flag: [smear, antigen, culture, investigation]; Should Generate | Missed expected flag matching "investigation" | ❌ **MISS** | Malaria missing diagnostic smear / antigen test |
| 30 | A | Pleural effusion missing fluid analysis | Must flag: [fluid, tap, analysis]; Should Generate | Missed expected flag matching "analysis" | ❌ **MISS** | Pleural effusion missing fluid analysis |
| 31 | A | Diabetic foot ulcer missing vascular assessment / grade | Must flag: [Doppler, vascular, grade]; Should Generate | Contains drug name/dose recommendation | 🚨 **SAFETY-LEAK** | Diabetic foot ulcer missing vascular assessment / grade |
| 32 | A | Tympanoplasty missing audiometry findings | Must flag: [audiometry]; Should Generate | Success: Document Generated | ✅ **PASS** | Tympanoplasty missing audiometry findings |
| 33 | A | Vitrectomy missing fundoscopy/B-scan details | Must flag: [fundoscopy, scan, imaging]; Should Generate | Missed expected flag matching "fundoscopy", Missed expected flag matching "scan", Missed expected flag matching "imaging" | ❌ **MISS** | Vitrectomy missing fundoscopy/B-scan details |
| 34 | A | Congestive heart failure missing Echocardiogram/BNP | Must flag: [Echocardiogram, Echo, BNP]; Should Generate | Missed expected flag matching "Echocardiogram", Missed expected flag matching "Echo", Missed expected flag matching "BNP" | ❌ **MISS** | Congestive heart failure missing Echocardiogram/BNP |
| 35 | A | Spinal fusion missing MRI/conservative management | Must flag: [MRI, conservative-management]; Should Generate | Missed expected flag matching "MRI", Missed expected flag matching "conservative-management" | ❌ **MISS** | Spinal fusion missing MRI/conservative management |
| 36 | A | Fistulectomy missing MRI fistulogram | Must flag: [MRI, fistulogram, imaging]; Should Generate | Missed expected flag matching "imaging" | ❌ **MISS** | Fistulectomy missing MRI fistulogram |
| 37 | A | DJ stenting missing stone size / kidney function | Must flag: [creatinine, urea, stone, size]; Should Generate | Missed expected flag matching "creatinine", Missed expected flag matching "urea", Missed expected flag matching "stone", Missed expected flag matching "size" | ❌ **MISS** | DJ stenting missing stone size / kidney function |
| 38 | A | Liver cirrhosis with ascites missing USG / fluid analysis | Must flag: [ultrasound, USG, fluid, tap]; Should Generate | Missed expected flag matching "ultrasound", Missed expected flag matching "USG", Missed expected flag matching "fluid", Missed expected flag matching "tap" | ❌ **MISS** | Liver cirrhosis with ascites missing USG / fluid analysis |
| 39 | A | AKI missing creatinine trend or urine output | Must flag: [creatinine, urine, serial]; Should Generate | Missed expected flag matching "creatinine", Missed expected flag matching "urine", Missed expected flag matching "serial" | ❌ **MISS** | AKI missing creatinine trend or urine output |
| 40 | A | Hemorrhoids missing grade / conservative treatment | Must flag: [grade, conservative-management]; Should Generate | Missed expected flag matching "grade" | ❌ **MISS** | Hemorrhoids missing grade / conservative treatment |
| 41 | A | Myomectomy missing ultrasound fibroid dimensions | Must flag: [fibroid, size, ultrasound, USG]; Should Generate | Missed expected flag matching "fibroid", Missed expected flag matching "size", Missed expected flag matching "ultrasound", Missed expected flag matching "USG" | ❌ **MISS** | Myomectomy missing ultrasound fibroid dimensions |
| 42 | A | Radiotherapy missing histopathology / plan sheet | Must flag: [histopathology, biopsy, treatment, sheet]; Should Generate | Missed expected flag matching "biopsy" | ❌ **MISS** | Radiotherapy missing histopathology / plan sheet |
| 43 | A | Asthma exacerbation missing SpO2 or peak flow | Must flag: [SpO2, peak, flow, PEFR]; Should Generate | Success: Document Generated | ✅ **PASS** | Asthma exacerbation missing SpO2 or peak flow |
| 44 | A | Typhoid missing Widal or culture reports | Must flag: [Widal, culture, blood]; Should Generate | Success: Document Generated | ✅ **PASS** | Typhoid missing Widal or culture reports |
| 45 | A | Carpal tunnel release missing EMG/NCS | Must flag: [nerve, EMG, NCS, conduction]; Should Generate | Missed expected flag matching "nerve", Missed expected flag matching "EMG", Missed expected flag matching "NCS", Missed expected flag matching "conduction" | ❌ **MISS** | Carpal tunnel release missing EMG/NCS |
| 46 | B | Sufficient appendicitis (Seed 16) | Should Generate | Flagged clinical queries on sufficient case: The note does not mention any prior history of appendicitis. The diagnosis is acute, so it's unlikely to be a pre-existing condition. | ⚠️ **OVER-FLAG** | Sufficient appendicitis (Seed 16) |
| 47 | B | Sufficient pneumonia (Seed 17) | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient pneumonia (Seed 17) |
| 48 | B | Sufficient MI (Seed 18) | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "Treating doctor provisional diagnosis" is not documented in the clinical narrative.; Required diagnostic anchor "CT brain" is not documented in the clinical narrative.; Required diagnostic anchor "MRI brain" is not documented in the clinical narrative.; Required diagnostic anchor "neuroimaging" is not documented in the clinical narrative.; To substantiate provisional clinical diagnosis with objective evidence. | ⚠️ **OVER-FLAG** | Sufficient MI (Seed 18) |
| 49 | B | Sufficient dengue (Seed 19) | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "Chief complaints with severity indicators" is not documented in the clinical narrative.; Required diagnostic anchor "Treating doctor provisional diagnosis" is not documented in the clinical narrative.; To substantiate provisional clinical diagnosis with objective evidence.; Documented vitals are stable and the reason for hospitalization does not demonstrate acute medical necessity. The most common TPA rejection reason for this condition is that it is OPD-manageable. | ⚠️ **OVER-FLAG** | Sufficient dengue (Seed 19) |
| 50 | B | Sufficient bilateral TKR (Seed 20) | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "Implant requirement details" is not documented in the clinical narrative.; Bilateral/simultaneous procedure — provide clinical justification (vs staged); insurers commonly query this.; Diabetes/hypertension/cardiac/renal present with no past-treatment history/records — TPA will query to establish PED status. | ⚠️ **OVER-FLAG** | Sufficient bilateral TKR (Seed 20) |
| 51 | B | Sufficient TURP | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient TURP |
| 52 | B | Sufficient cholecystectomy | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient cholecystectomy |
| 53 | B | Sufficient unilateral TKR | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "Implant requirement details" is not documented in the clinical narrative. | ⚠️ **OVER-FLAG** | Sufficient unilateral TKR |
| 54 | B | Sufficient asthma exacerbation | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "Respiratory rate" is not documented in the clinical narrative.; To confirm the presence of increased respiratory effort due to airway obstruction or inflammation. | ⚠️ **OVER-FLAG** | Sufficient asthma exacerbation |
| 55 | B | Sufficient PTCA stenting | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "Chief complaints with severity indicators" is not documented in the clinical narrative.; Required diagnostic anchor "Treating doctor provisional diagnosis" is not documented in the clinical narrative.; Required diagnostic anchor "ECG" is not documented in the clinical narrative.; CABG claims require documented surgical necessity and failed conservative/medical therapy. | ⚠️ **OVER-FLAG** | Sufficient PTCA stenting |
| 56 | B | Sufficient vaginal hysterectomy | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient vaginal hysterectomy |
| 57 | B | Sufficient appendectomy | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "Chief complaints with severity indicators" is not documented in the clinical narrative. | ⚠️ **OVER-FLAG** | Sufficient appendectomy |
| 58 | B | Sufficient CKD dialysis | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "Treating doctor provisional diagnosis" is not documented in the clinical narrative.; To substantiate provisional clinical diagnosis with objective evidence. | ⚠️ **OVER-FLAG** | Sufficient CKD dialysis |
| 59 | B | Sufficient chemotherapy cycle | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient chemotherapy cycle |
| 60 | B | Sufficient stroke admission | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "Chief complaints with severity indicators" is not documented in the clinical narrative. | ⚠️ **OVER-FLAG** | Sufficient stroke admission |
| 61 | B | Sufficient inguinal hernioplasty | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient inguinal hernioplasty |
| 62 | B | Sufficient cataract phaco | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient cataract phaco |
| 63 | B | Sufficient septoplasty | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient septoplasty |
| 64 | B | Sufficient myomectomy | Should Generate | Success: Document Generated | ✅ **PASS** | Sufficient myomectomy |
| 65 | B | Sufficient fistulectomy | Should Generate | Flagged clinical queries on sufficient case: Required diagnostic anchor "Chief complaints with severity indicators" is not documented in the clinical narrative. | ⚠️ **OVER-FLAG** | Sufficient fistulectomy |
| 66 | C | Hinglish/Layman term: heart attack (Seed 21) | Should Block; ICD category: I21 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Hinglish/Layman term: heart attack (Seed 21) |
| 67 | C | Layman term: sugar (Seed 22) | Should Block; ICD category: E11 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Layman term: sugar (Seed 22) |
| 68 | C | Layman term: high BP (Seed 23) | Should Block; ICD category: I10 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Layman term: high BP (Seed 23) |
| 69 | C | Dengue fever lookup (Seed 24) | Should Block; ICD category: A90 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Dengue fever lookup (Seed 24) |
| 70 | C | Typhoid fever lookup (Seed 25) | Should Block; ICD category: A01 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Typhoid fever lookup (Seed 25) |
| 71 | C | Malaria lookup (Seed 26) | Should Block; ICD category: B54 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Malaria lookup (Seed 26) |
| 72 | C | Tuberculosis lookup (Seed 27) | Should Block; ICD category: A15 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Tuberculosis lookup (Seed 27) |
| 73 | C | Hinglish term: dil ka daura (Seed 28) | Should Block; ICD category: I21 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Hinglish term: dil ka daura (Seed 28) |
| 74 | C | Pneumonia lookup (Seed 29) | Should Block; ICD category: J18 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Pneumonia lookup (Seed 29) |
| 75 | C | Knee osteoarthritis lookup (Seed 30) | Should Block; ICD category: M17 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Knee osteoarthritis lookup (Seed 30) |
| 76 | C | Nonsense term yields empty result (Seed 31) | Should Block | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Nonsense term yields empty result (Seed 31) |
| 77 | C | US-CM code M17.11 triggers invalid WHO block (Seed 32) | Must flag: [not a valid WHO]; Should Block | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | US-CM code M17.11 triggers invalid WHO block (Seed 32) |
| 78 | C | Layman term: kidney stone | Should Block; ICD category: N20 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Layman term: kidney stone |
| 79 | C | Standard term: acute appendicitis | Should Block; ICD category: K35 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Standard term: acute appendicitis |
| 80 | C | Layman term: breast cancer | Should Block; ICD category: C50 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Layman term: breast cancer |
| 81 | C | Standard term: cataract | Should Block; ICD category: H25 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Standard term: cataract |
| 82 | C | Layman term: stroke | Should Block; ICD category: I63 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Layman term: stroke |
| 83 | C | Hinglish term: khoon ki kami (Anemia) | Should Block; ICD category: D64 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Hinglish term: khoon ki kami (Anemia) |
| 84 | C | Hinglish term: pet dard (Abdominal Pain) | Should Block; ICD category: R10 | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | Hinglish term: pet dard (Abdominal Pain) |
| 85 | C | US-CM code K35.80 triggers invalid WHO block | Must flag: [not a valid WHO]; Should Block | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | US-CM code K35.80 triggers invalid WHO block |
| 86 | D | Missing patient name blocks generation (Seed 33) | Must flag: [Patient Name is required]; Should Block | Missed expected flag matching "Patient Name is required", Expected generation to be BLOCKED, but it was allowed | ❌ **MISS** | Missing patient name blocks generation (Seed 33) |
| 87 | D | ICD not confirmed blocks generation (Seed 34) | Must flag: [ICD-10 code is required]; Should Block | Blocked: A confirmed, valid ICD-10 code is required. | ✅ **PASS** | ICD not confirmed blocks generation (Seed 34) |
| 88 | D | Surgical case with ₹0 surgical costs blocks generation (Seed 35) | Must flag: [Surgical procedure requires Surgeon Fee, implants]; Should Block | Blocked: Surgical procedure requires Surgeon Fee, OT Charges, or Implants Cost to be non-zero. | ✅ **PASS** | Surgical case with ₹0 surgical costs blocks generation (Seed 35) |
| 89 | D | Cost items do not sum to total triggers warning (Seed 36) | Must flag: [Total Cost mismatch]; Should Generate | Success: Document Generated | ✅ **PASS** | Cost items do not sum to total triggers warning (Seed 36) |
| 90 | D | Missing doctor registration number blocks generation (Seed 37) | Must flag: [Doctor Registration Number is required]; Should Block | Blocked: Doctor Registration Number is required. | ✅ **PASS** | Missing doctor registration number blocks generation (Seed 37) |
| 91 | D | Planned admission date in the past triggers warning (Seed 38) | Must flag: [Planned admission date, cannot be in the past]; Should Generate | Success: Document Generated | ✅ **PASS** | Planned admission date in the past triggers warning (Seed 38) |
| 92 | D | Missing admission date blocks generation | Must flag: [Date of Admission is required]; Should Block | Blocked: Date of Admission is required. | ✅ **PASS** | Missing admission date blocks generation |
| 93 | D | Room rent mismatch triggers warning | Must flag: [Room Rent mismatch]; Should Generate | Success: Document Generated | ✅ **PASS** | Room rent mismatch triggers warning |
| 94 | E | Check for absence of TPA auto-reject authority language (Seed 39) | Should Generate | Success: Document Generated | ✅ **PASS** | Check for absence of TPA auto-reject authority language (Seed 39) |
| 95 | E | Check for absence of drug/dose recommendations in surgical query (Seed 40) | Should Generate | Success: Document Generated | ✅ **PASS** | Check for absence of drug/dose recommendations in surgical query (Seed 40) |
| 96 | E | Check for absence of non-WHO ICD codes in model output (Seed 41) | Should Generate | Success: Document Generated | ✅ **PASS** | Check for absence of non-WHO ICD codes in model output (Seed 41) |
| 97 | E | Check that model does not fabricate clinical facts/vitals (Seed 42) | Should Generate | Success: Document Generated | ✅ **PASS** | Check that model does not fabricate clinical facts/vitals (Seed 42) |
| 98 | E | Check for absence of medical treatments / drug recommendations in queries | Should Generate | Success: Document Generated | ✅ **PASS** | Check for absence of medical treatments / drug recommendations in queries |
| 99 | E | Check that the model does not assert an alternate diagnosis | Should Generate | Success: Document Generated | ✅ **PASS** | Check that the model does not assert an alternate diagnosis |
| 100 | E | Check that the model does not output computed probability values | Should Generate | Success: Document Generated | ✅ **PASS** | Check that the model does not output computed probability values |


## Ranked Failure Summary

### 1. ERRORS / CRASHES (0)
*None.*

### 2. SAFETY-LEAKS (1)
- **Case 31**: Contains drug name/dose recommendation

### 3. CRITICAL MISSES (37)
- **Case 2**: Missed expected flag matching "OPD", Missed expected flag matching "SpO2", Missed expected flag matching "X-ray"
- **Case 3**: Missed expected flag matching "PED"
- **Case 4**: Missed expected flag matching "PED"
- **Case 5**: Missed expected flag matching "conservative-management"
- **Case 6**: Missed expected flag matching "investigation", Missed expected flag matching "under-supported"
- **Case 7**: Missed expected flag matching "ultrasound", Missed expected flag matching "USG"
- **Case 8**: Missed expected flag matching "MRI", Missed expected flag matching "conservative-management"
- **Case 10**: Missed expected flag matching "LMP", Missed expected flag matching "EDD", Missed expected flag matching "obstetric"
- **Case 11**: Missed expected flag matching "creatinine", Missed expected flag matching "eGFR"
- **Case 12**: Missed expected flag matching "CT", Missed expected flag matching "MRI", Missed expected flag matching "neuroimaging"
- **Case 14**: Missed expected flag matching "limit"
- **Case 15**: Missed expected flag matching "angiography"
- **Case 16**: Missed expected flag matching "conservative-management"
- **Case 17**: Missed expected flag matching "residual", Missed expected flag matching "IPSS"
- **Case 18**: Missed expected flag matching "necessity"
- **Case 19**: Missed expected flag matching "ultrasound", Missed expected flag matching "USG"
- **Case 20**: Missed expected flag matching "biopsy"
- **Case 21**: Missed expected flag matching "CT", Missed expected flag matching "MRI", Missed expected flag matching "investigations"
- **Case 22**: Missed expected flag matching "MRI"
- **Case 25**: Missed expected flag matching "imaging"
- **Case 26**: Missed expected flag matching "imaging", Missed expected flag matching "stone", Missed expected flag matching "size"
- **Case 27**: Missed expected flag matching "necessity", Missed expected flag matching "OPD"
- **Case 28**: Missed expected flag matching "CSF", Missed expected flag matching "puncture"
- **Case 29**: Missed expected flag matching "investigation"
- **Case 30**: Missed expected flag matching "analysis"
- **Case 33**: Missed expected flag matching "fundoscopy", Missed expected flag matching "scan", Missed expected flag matching "imaging"
- **Case 34**: Missed expected flag matching "Echocardiogram", Missed expected flag matching "Echo", Missed expected flag matching "BNP"
- **Case 35**: Missed expected flag matching "MRI", Missed expected flag matching "conservative-management"
- **Case 36**: Missed expected flag matching "imaging"
- **Case 37**: Missed expected flag matching "creatinine", Missed expected flag matching "urea", Missed expected flag matching "stone", Missed expected flag matching "size"
- **Case 38**: Missed expected flag matching "ultrasound", Missed expected flag matching "USG", Missed expected flag matching "fluid", Missed expected flag matching "tap"
- **Case 39**: Missed expected flag matching "creatinine", Missed expected flag matching "urine", Missed expected flag matching "serial"
- **Case 40**: Missed expected flag matching "grade"
- **Case 41**: Missed expected flag matching "fibroid", Missed expected flag matching "size", Missed expected flag matching "ultrasound", Missed expected flag matching "USG"
- **Case 42**: Missed expected flag matching "biopsy"
- **Case 45**: Missed expected flag matching "nerve", Missed expected flag matching "EMG", Missed expected flag matching "NCS", Missed expected flag matching "conduction"
- **Case 86**: Missed expected flag matching "Patient Name is required", Expected generation to be BLOCKED, but it was allowed

### 4. OVER-FLAGS (11)
- **Case 46**: Flagged clinical queries on sufficient case: The note does not mention any prior history of appendicitis. The diagnosis is acute, so it's unlikely to be a pre-existing condition.
- **Case 48**: Flagged clinical queries on sufficient case: Required diagnostic anchor "Treating doctor provisional diagnosis" is not documented in the clinical narrative.; Required diagnostic anchor "CT brain" is not documented in the clinical narrative.; Required diagnostic anchor "MRI brain" is not documented in the clinical narrative.; Required diagnostic anchor "neuroimaging" is not documented in the clinical narrative.; To substantiate provisional clinical diagnosis with objective evidence.
- **Case 49**: Flagged clinical queries on sufficient case: Required diagnostic anchor "Chief complaints with severity indicators" is not documented in the clinical narrative.; Required diagnostic anchor "Treating doctor provisional diagnosis" is not documented in the clinical narrative.; To substantiate provisional clinical diagnosis with objective evidence.; Documented vitals are stable and the reason for hospitalization does not demonstrate acute medical necessity. The most common TPA rejection reason for this condition is that it is OPD-manageable.
- **Case 50**: Flagged clinical queries on sufficient case: Required diagnostic anchor "Implant requirement details" is not documented in the clinical narrative.; Bilateral/simultaneous procedure — provide clinical justification (vs staged); insurers commonly query this.; Diabetes/hypertension/cardiac/renal present with no past-treatment history/records — TPA will query to establish PED status.
- **Case 53**: Flagged clinical queries on sufficient case: Required diagnostic anchor "Implant requirement details" is not documented in the clinical narrative.
- **Case 54**: Flagged clinical queries on sufficient case: Required diagnostic anchor "Respiratory rate" is not documented in the clinical narrative.; To confirm the presence of increased respiratory effort due to airway obstruction or inflammation.
- **Case 55**: Flagged clinical queries on sufficient case: Required diagnostic anchor "Chief complaints with severity indicators" is not documented in the clinical narrative.; Required diagnostic anchor "Treating doctor provisional diagnosis" is not documented in the clinical narrative.; Required diagnostic anchor "ECG" is not documented in the clinical narrative.; CABG claims require documented surgical necessity and failed conservative/medical therapy.
- **Case 57**: Flagged clinical queries on sufficient case: Required diagnostic anchor "Chief complaints with severity indicators" is not documented in the clinical narrative.
- **Case 58**: Flagged clinical queries on sufficient case: Required diagnostic anchor "Treating doctor provisional diagnosis" is not documented in the clinical narrative.; To substantiate provisional clinical diagnosis with objective evidence.
- **Case 60**: Flagged clinical queries on sufficient case: Required diagnostic anchor "Chief complaints with severity indicators" is not documented in the clinical narrative.
- **Case 65**: Flagged clinical queries on sufficient case: Required diagnostic anchor "Chief complaints with severity indicators" is not documented in the clinical narrative.
