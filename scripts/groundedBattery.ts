import { TestCase } from './testBattery';

export interface GroundedTestCase extends TestCase {
  realGap: string;
  sourceReasoning: string;
}

const generateGroundedCases = (): GroundedTestCase[] => {
  const cases: GroundedTestCase[] = [];
  let idCounter = 1000; // Start at 1000 to differentiate from testBattery

  const templates = [
    {
      condition: 'Dengue Fever',
      code: 'A97.0', // WHO code for Dengue without warning signs
      clinical: {
        cc: 'High grade fever, body ache for 4 days',
        hpi: 'Patient presented with high fever, myalgia, and retro-orbital pain.',
        findings: 'Platelets 90,000. LFTs mildly elevated.'
      },
      gaps: [
         { gapField: 'missing_ns1', modifier: (c: any) => c.uploadedDocuments = ['doctor_notes'], realGap: 'Missing NS1 Antigen or IgM serology to confirm Dengue.', reasoning: 'TPA Medical Necessity / IRDAI norms: Dengue diagnosis requires specific serological confirmation (NS1/IgM) to authorize inpatient management.' },
         { gapField: 'no_gaps', modifier: (c: any) => c.uploadedDocuments = ['blood_test_reports', 'doctor_notes'], realGap: 'None', reasoning: 'Control case. Should not overflag if blood tests are present.' }
      ]
    },
    {
      condition: 'Typhoid Fever',
      code: 'A01.0',
      clinical: {
        cc: 'Fever with chills and abdominal pain for 5 days',
        hpi: 'Fever step-ladder pattern. Weakness, loose stools.',
        findings: 'Abdomen soft but tender.'
      },
      gaps: [
        { gapField: 'missing_widal', modifier: (c: any) => { c.additionalClinicalNotes = 'Blood culture pending.'; }, realGap: 'Missing Widal test or Blood culture report confirming enteric fever.', reasoning: 'TPA Diagnostic standard: Typhoid requires Widal or culture confirmation. Purely clinical diagnosis is often rejected for inpatient auth.' },
        { gapField: 'opd_management', modifier: (c: any) => { c.reasonForHospitalisation = 'Patient preferred IV antibiotics'; c.vitals = { bp: '120/80', pulse: '80', temp: '99', spo2: '98', rr: '18' }; }, realGap: 'Lack of medical necessity for hospitalization (can be managed on OPD basis).', reasoning: 'IRDAI Active Treatment norm: Stable vitals and no severe complications mean oral antibiotics on OPD basis is standard of care.' }
      ]
    },
    {
      condition: 'Ischemic Heart Disease / Planned CABG',
      code: 'I25.1',
      clinical: {
        cc: 'Exertional angina for 2 months',
        hpi: 'Known diabetic, presenting with chest pain on exertion. Planned for CABG.',
        findings: 'ECG shows T wave inversions.'
      },
      gaps: [
        { gapField: 'missing_cag', modifier: (c: any) => c.uploadedDocuments = ['ecg'], realGap: 'Missing Coronary Angiography (CAG) report.', reasoning: 'Surgical Necessity: CABG cannot be authorized without a CAG report showing severe multi-vessel blockages.' },
        { gapField: 'missing_duration', modifier: (c: any) => c.duration = undefined, realGap: 'Missing exact duration of angina symptoms to check waiting periods.', reasoning: 'Pre-Existing Disease (PED): IHD is a classic lifestyle disease subject to 24-48 month waiting periods. Duration is mandatory.' }
      ]
    },
    {
      condition: 'Senile Cataract',
      code: 'H25.9',
      clinical: {
        cc: 'Painless progressive vision loss in Right Eye',
        hpi: 'Patient complains of blurry vision for 6 months.',
        findings: 'Right eye mature cataract.'
      },
      gaps: [
        { gapField: 'missing_iol', modifier: (c: any) => c.uploadedDocuments = ['doctor_notes'], realGap: 'Missing A-scan / IOL power calculation report.', reasoning: 'Standard TPA Surgery Check: Lens power report is mandatory to prove the surgery is planned and to check lens cost sub-limits.' },
        { gapField: 'no_gaps', modifier: (c: any) => c.uploadedDocuments = ['lens_power_report', 'visual_acuity_test'], realGap: 'None', reasoning: 'Control case. Should not overflag if lens power report is present.' }
      ]
    },
    {
       condition: 'Chronic Kidney Disease - Maintenance Hemodialysis',
       code: 'N18.5',
       clinical: {
         cc: 'Scheduled dialysis session',
         hpi: 'Known CKD stage 5 on twice weekly maintenance hemodialysis.',
         findings: 'Patient stable, AV fistula intact.'
       },
       gaps: [
         { gapField: 'missing_rft', modifier: (c: any) => c.uploadedDocuments = ['doctor_notes'], realGap: 'Missing recent Renal Function Test (RFT) / Creatinine and Urea levels.', reasoning: 'Necessity Check: Insurers require recent RFTs to justify the ongoing frequency of dialysis sessions.' }
       ]
    },
    {
       condition: 'Acute Appendicitis',
       code: 'K35.8',
       clinical: {
         cc: 'Severe Right Iliac Fossa pain for 1 day',
         hpi: 'Sudden onset abdominal pain, vomiting, fever.',
         findings: 'Rebound tenderness at McBurney point. Leukocytosis.'
       },
       gaps: [
         { gapField: 'missing_usg', modifier: (c: any) => c.uploadedDocuments = ['doctor_notes'], realGap: 'Missing USG Abdomen or CT scan report confirming appendicitis.', reasoning: 'Diagnostic standard: Surgical removal requires imaging confirmation to rule out other acute abdomen causes.' }
       ]
    },
    {
       condition: 'Osteoarthritis - Planned TKR',
       code: 'M17.1',
       clinical: {
         cc: 'Severe knee pain right side',
         hpi: 'Patient unable to walk without support. Planned for Total Knee Replacement.',
         findings: 'Crepitus present. Reduced ROM.'
       },
       gaps: [
         { gapField: 'missing_xray', modifier: (c: any) => c.uploadedDocuments = ['doctor_notes'], realGap: 'Missing X-ray Knee (AP/Lat) report showing severe joint space narrowing (Kellgren-Lawrence grading).', reasoning: 'Surgical Necessity: TKR is heavily scrutinized. Severe radiological OA must be documented.' },
         { gapField: 'missing_conservative', modifier: (c: any) => c.treatmentTakenSoFar = 'None', realGap: 'Missing history of failed conservative management (physiotherapy, analgesics, intra-articular injections).', reasoning: 'IRDAI / Medical Standard: Joint replacements are often rejected if conservative management hasn\'t been tried and failed first.' }
       ]
    },
    {
       condition: 'Acute Gastroenteritis',
       code: 'A09.9',
       clinical: {
         cc: 'Loose stools and vomiting x 2 days',
         hpi: 'Multiple episodes of watery diarrhea.',
         findings: 'Mild dehydration. Vitals stable.'
       },
       gaps: [
         { gapField: 'opd_management', modifier: (c: any) => { c.reasonForHospitalisation = 'Patient wants IV fluids'; c.vitals = { bp: '110/70', pulse: '88', temp: '98.6', spo2: '99', rr: '16' }; }, realGap: 'Lack of medical necessity for hospitalization; no signs of severe dehydration, AKI, or hemodynamic instability.', reasoning: 'TPA Rejection Pattern: AGE is the #1 rejected condition for OPD management. Insurers require objective signs of severe dehydration (tachycardia, hypotension, elevated creatinine) to authorize.' }
       ]
    },
    {
       condition: 'Maternity - LSCS',
       code: 'O82.9',
       clinical: {
         cc: 'Labour pains / Planned LSCS',
         hpi: 'G2P1L1, 38 weeks gestation. Previous LSCS.',
         findings: 'FHR 140.'
       },
       gaps: [
         { gapField: 'missing_lmp_edd', modifier: (c: any) => { c.maternity = { isMaternity: true }; }, realGap: 'Missing LMP (Last Menstrual Period) and EDD (Expected Date of Delivery).', reasoning: 'Policy Checks: Maternity waiting periods (9-36 months) are strict. LMP and EDD are mandatory to calculate conception date relative to policy inception.' }
       ]
    },
    {
       condition: 'Uterine Fibroids - Planned Hysterectomy',
       code: 'D25.9',
       clinical: {
         cc: 'Heavy menstrual bleeding, pelvic pain',
         hpi: 'Patient experiencing menorrhagia for several months.',
         findings: 'Enlarged bulky uterus on palpation.'
       },
       gaps: [
         { gapField: 'missing_usg', modifier: (c: any) => c.uploadedDocuments = ['doctor_notes'], realGap: 'Missing USG Pelvis report detailing fibroid size and location.', reasoning: 'Surgical Necessity: Hysterectomy for fibroids requires objective imaging of fibroid burden.' }
       ]
    }
  ];

  // We have 10 base templates. Let's create multiple variants to reach ~60 cases.
  // We'll loop through the templates 6 times, slightly altering the inputs.
  
  for (let i = 0; i < 6; i++) {
    for (const tmpl of templates) {
      for (const gap of tmpl.gaps) {
        
        // Base case setup
        const tc: GroundedTestCase = {
          id: idCounter++,
          category: 'A',
          diagnosis: tmpl.condition,
          code: tmpl.code,
          chiefComplaints: tmpl.clinical.cc,
          hpi: tmpl.clinical.hpi + (i > 0 ? ` Variant ${i}.` : ''),
          relevantClinicalFindings: tmpl.clinical.findings,
          expected: {
             mustFlag: [], // the engine might use these internally, but our Gemini check will look at realGap
             mustNotFlag: [],
             shouldGenerate: true
          },
          notes: `Grounded Case: ${tmpl.condition} - ${gap.gapField}`,
          realGap: gap.realGap,
          sourceReasoning: gap.reasoning
        };

        // Apply gap modifier
        gap.modifier(tc);

        // Add to array
        cases.push(tc);
      }
    }
  }

  return cases;
};

export const groundedCases = generateGroundedCases();
