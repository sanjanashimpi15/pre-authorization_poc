import { ClinicalProtocol } from './types';

export const CLINICAL_PROTOCOLS: ClinicalProtocol[] = [
  {
    id: 'GEN-ACS-001',
    title: 'Acute Coronary Syndrome (ACS) Management',
    metadata: {
      version: '2.1.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-08-15',
      authors: ['Cardiology Guidelines Committee'],
      institution: 'General Medical Council / AHA Adapted',
      jurisdiction: ['General Practice'],
      scope: 'Initial management of suspected NSTE-ACS or STEMI in emergency settings.',
      'use_if_conditions': ['Chest pain suggestive of ischemia', 'New ST-segment changes', 'Elevated Troponin'],
      canonical_sources: [
        { name: 'AHA/ACC Guidelines' },
        { name: 'ESC Guidelines' },
      ],
      reviewer_signoff: [{ name: 'Dr. S. Patel (Cardiology)', date: '2024-08-10', comments: 'Aligned with 2024 updates' }],
    },
    preconditions: ['Patient is hemodynamically stable enough for initial assessment.'],
    settings: ['Primary', 'Emergency', 'Secondary'],
    stepwise_actions: [
      { id: 'acs-step1', timing: 'Immediate (0-10 min)', title: 'Initial Assessment & MONA', is_critical: true, actions: [
        'Assess ABCs. Obtain 12-lead ECG within 10 minutes.',
        'Administer Aspirin 300mg chewed (unless allergic).',
        'Administer Nitroglycerin 0.4mg SL every 5 min (max 3 doses) for chest pain (Contraindication: PDE5 inhibitors, Right Ventricular Infarction).',
        'Administer Oxygen ONLY if SpO2 < 90% or respiratory distress.',
        'Administer Morphine/Fentanyl if pain persists despite nitrates (Caution in unstable angina).'
      ]},
      { id: 'acs-step2', timing: '10-30 min', title: 'Risk Stratification & Antiplatelet', is_critical: true, actions: [
        'Identify STEMI on ECG (>1mm ST elevation in 2 contiguous leads). If STEMI: Activate Cath Lab immediately.',
        'If NSTE-ACS: Calculate GRACE or TIMI score.',
        'Administer P2Y12 Inhibitor (Clopidogrel 300-600mg loading or Ticagrelor 180mg) based on local protocol.',
        'Start Anticoagulation (Enoxaparin 1mg/kg SC or Heparin infusion).'
      ]},
      { id: 'acs-step3', timing: 'Ongoing', title: 'Secondary Prevention', is_critical: false, actions: [
        'High-intensity Statin (Atorvastatin 80mg).',
        'Beta-blocker (Metoprolol) within 24h if no heart failure/shock.',
        'ACE Inhibitor if LVEF < 40%, HTN, or DM.'
      ]}
    ],
    dosing_table: [
      { drug_name: 'Aspirin', brand_names_india: ['Disprin', 'Ecosprin'], available_strengths: ['75mg', '150mg', '300mg'], formula: '300mg Loading', route: 'Oral (Chewed)', dilution_instructions: 'N/A', administration_details: 'Must be chewed for rapid absorption.', max_dose: '300mg', monitoring: ['Bleeding risk'], contraindications: ['Active GI bleed', 'Severe allergy'] },
      { drug_name: 'Nitroglycerin', brand_names_india: ['Sorbitrate', 'Nitrocontin'], available_strengths: ['0.4mg', '0.5mg'], formula: '0.4mg SL', route: 'Sublingual', dilution_instructions: 'N/A', administration_details: 'Repeat every 5 mins x 3.', max_dose: '1.2mg', monitoring: ['BP (Hold if SBP < 90)'], contraindications: ['PDE5 inhibitors (Viagra) in last 24h', 'Severe aortic stenosis', 'RV Infarction'] },
      { drug_name: 'Atorvastatin', brand_names_india: ['Atorva', 'Storvas'], available_strengths: ['10mg', '20mg', '40mg', '80mg'], formula: '80mg', route: 'Oral', dilution_instructions: 'N/A', administration_details: 'Single dose.', max_dose: '80mg', monitoring: ['LFTs (long term)'], contraindications: ['Active liver disease'] }
    ],
    monitoring_template: {
      title: 'ACS Monitoring',
      parameters: [
          { parameter: 'ECG', frequency: 'Repeat every 15-30 mins if initial is non-diagnostic but pain persists.'},
          { parameter: 'Troponin', frequency: '0h, 1h, and 3h (High Sensitivity).'},
          { parameter: 'BP & HR', frequency: 'Every 15 mins.'},
      ],
      alert_triggers: [
          { condition: 'Development of new ST elevation', action: 'Activate STEMI protocol immediately.'},
          { condition: 'Hypotension (SBP < 90)', action: 'Stop Nitrates/Morphine. Start fluids. Consider cardiogenic shock.'},
      ]
    },
    contraindications_general: ['Avoid NSAIDs (except Aspirin).'],
    escalation_triggers: [
      { condition: 'STEMI identified on ECG.', action: 'Transfer for primary PCI within 120 mins or administer Thrombolytics if PCI unavailable.', requires_confirmation: true },
      { condition: 'Refractory Ischemia or Electrical Instability.', action: 'Urgent invasive strategy (Angiography).', requires_confirmation: true }
    ],
    references: [{ citation: '2023 AHA/ACC Guideline for the Management of ACS.' }]
  },
  {
    id: 'GEN-SEPSIS-001',
    title: 'Sepsis-3 Management Protocol (Adult)',
    metadata: {
      version: '3.0.0',
      date_effective: '2023-06-01',
      last_reviewed: '2024-07-15',
      authors: ['Surviving Sepsis Campaign'],
      institution: 'General Hospital',
      jurisdiction: ['International'],
      scope: 'Early recognition and management of Sepsis and Septic Shock.',
      'use_if_conditions': ['Suspected infection', 'qSOFA score ≥ 2', 'Organ dysfunction (SOFA score increase ≥ 2)'],
      canonical_sources: [ { name: 'Surviving Sepsis Campaign Guidelines 2021' } ],
      reviewer_signoff: [{ name: 'Dr. A. Critical Care', date: '2024-07-12', comments: 'Approved' }],
    },
    preconditions: ['Suspected or confirmed infection.'],
    settings: ['Emergency', 'ICU', 'Ward'],
    stepwise_actions: [
      { id: 'sep-step1', timing: 'Hour-1 Bundle', title: 'Initial Resuscitation', is_critical: true, actions: [
        'Measure Lactate level. Remeasure if initial lactate > 2 mmol/L.',
        'Obtain Blood Cultures BEFORE administering antibiotics.',
        'Administer Broad-spectrum Antibiotics (e.g., Piperacillin-Tazobactam + Vancomycin) based on local antibiogram.',
        'Administer 30 mL/kg Crystalloid for hypotension or lactate ≥ 4 mmol/L.',
        'Apply Vasopressors if hypotensive during or after fluid resuscitation to maintain MAP ≥ 65 mmHg.'
      ]},
      { id: 'sep-step2', timing: 'Ongoing', title: 'Source Control', is_critical: true, actions: [
        'Identify anatomical source of infection (Lungs, Urine, Abdomen, Skin).',
        'Implement source control intervention (drainage, debridement, device removal) as soon as medically feasible.'
      ]},
      { id: 'sep-step3', timing: '6-Hour Goals', title: 'Hemodynamic Optimization', is_critical: false, actions: [
        'Re-assess volume status and tissue perfusion.',
        'Target MAP ≥ 65 mmHg.',
        'Normalize Lactate.'
      ]}
    ],
    dosing_table: [
      { drug_name: 'Norepinephrine', brand_names_india: ['Adrenor', 'Norad'], available_strengths: ['2mg/mL', '4mg/2mL'], formula: '0.01-3.0 mcg/kg/min', route: 'IV Infusion (Central Line preferred)', dilution_instructions: 'Dilute 4mg in 50mL D5W.', administration_details: 'Titrate to MAP ≥ 65 mmHg. First line vasopressor.', max_dose: 'Titrate to effect', monitoring: ['Continuous BP (Arterial line preferred)'], reversal_agent: 'N/A' },
      { drug_name: 'Piperacillin-Tazobactam', brand_names_india: ['Pipzo', 'Tazar'], available_strengths: ['4.5g'], formula: '4.5g IV q6h', route: 'IV', dilution_instructions: 'Dilute in 100mL NS.', administration_details: 'Extended infusion (over 3-4 hours) preferred for severe sepsis.', max_dose: '18g/day', monitoring: ['Renal Function'], contraindications: ['Penicillin Allergy'] }
    ],
    monitoring_template: {
        title: 'Sepsis Monitoring',
        parameters: [
            { parameter: 'MAP (Mean Arterial Pressure)', frequency: 'Continuous', normal_range: '> 65 mmHg' },
            { parameter: 'Lactate', frequency: 'Every 2-4 hours until normal', normal_range: '< 2 mmol/L' },
            { parameter: 'Urine Output', frequency: 'Hourly', normal_range: '> 0.5 mL/kg/hr' },
        ],
        alert_triggers: [
            { condition: 'MAP < 65 despite fluids', action: 'Start Norepinephrine.' },
            { condition: 'Lactate rising', action: 'Re-assess volume status and adequacy of cardiac output.' }
        ]
    },
    contraindications_general: ['Caution with large volume fluids in Heart Failure / ESRD.'],
    escalation_triggers: [
      { condition: 'Septic Shock (Refractory hypotension despite fluids and vasopressors).', action: 'Start Hydrocortisone 200mg/day IV. Add Vasopressin.', requires_confirmation: true },
      { condition: 'Respiratory failure (ARDS).', action: 'Intubate and ventilate with lung-protective strategy.', requires_confirmation: true }
    ],
    references: [{ citation: 'Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock 2021.' }]
  },
  {
    id: 'GEN-ANAPH-001',
    title: 'Anaphylaxis Emergency Management',
    metadata: {
      version: '1.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-07-15',
      authors: ['Emergency Medicine Alliance'],
      institution: 'General Hospital',
      jurisdiction: ['General Practice'],
      scope: 'Acute management of severe allergic reaction.',
      'use_if_conditions': ['Acute onset illness (minutes to hours) involving skin/mucosa AND respiratory compromise OR reduced BP.'],
      canonical_sources: [ { name: 'Resuscitation Council UK' }, { name: 'WAO Guidelines' } ],
      reviewer_signoff: [{ name: 'Dr. E. Room', date: '2024-07-14', comments: 'Standard protocol' }],
    },
    preconditions: ['Sudden onset hypersensitivity reaction.'],
    settings: ['Primary', 'Emergency', 'Community'],
    stepwise_actions: [
      { id: 'ana-step1', timing: 'Immediate', title: 'Adrenaline (Epinephrine)', is_critical: true, actions: [
        'Remove allergen if possible.',
        'Administer Adrenaline IM into mid-outer thigh immediately. Do not delay.',
        'Adult Dose: 0.5 mg (0.5 mL of 1:1000).',
        'Child (6-12y): 0.3 mg.',
        'Child (<6y): 0.15 mg.',
        'Call for Ambulance / Resuscitation Team.'
      ]},
      { id: 'ana-step2', timing: 'Immediate', title: 'Position & Airway', is_critical: true, actions: [
        'Lie patient flat with legs raised. Do NOT stand the patient up (risk of empty ventricle syndrome/death).',
        'If breathing difficult, sit up slightly but keep legs raised if possible.',
        'Give High-flow Oxygen.'
      ]},
      { id: 'ana-step3', timing: '5 Minutes', title: 'Re-Assess', is_critical: false, actions: [
        'If no improvement after 5 minutes, repeat Adrenaline IM dose.',
        'Establish IV access. Give Fluid Challenge (500-1000mL Crystalloid) for hypotension.',
        'Consider nebulized Salbutamol for bronchospasm.'
      ]}
    ],
    dosing_table: [
      { drug_name: 'Adrenaline (Epinephrine)', brand_names_india: ['Vasocon', 'Adrenaline'], available_strengths: ['1mg/mL (1:1000)'], formula: '0.5 mg IM', route: 'IM (Anterolateral Thigh)', dilution_instructions: 'Do NOT dilute for IM use.', administration_details: 'Use 1:1000 concentration.', max_dose: 'Repeat every 5 mins as needed', monitoring: ['BP', 'HR', 'Airway'], contraindications: ['None in cardiac arrest/anaphylaxis'] },
      { drug_name: 'Hydrocortisone', brand_names_india: ['Primacort', 'Efcorlin'], available_strengths: ['100mg'], formula: '200mg IV', route: 'IV/IM', dilution_instructions: 'Reconstitute with sterile water.', administration_details: 'Second line. Prevents biphasic reaction.', max_dose: '200mg', monitoring: [], contraindications: [] }
    ],
    monitoring_template: {
        title: 'Post-Anaphylaxis Monitoring',
        parameters: [
            { parameter: 'BP, HR, SpO2', frequency: 'Every 5 mins until stable.' },
            { parameter: 'Airway patency', frequency: 'Continuous.' }
        ],
        alert_triggers: [
            { condition: 'Stridor or Wheeze', action: 'Prepare for difficult airway/intubation. Repeat Adrenaline.' }
        ]
    },
    contraindications_general: ['Antihistamines and Steroids are SECOND LINE. Never delay Adrenaline for these.'],
    escalation_triggers: [
      { condition: 'Refractory Hypotension or Cardiac Arrest.', action: 'Start IV Adrenaline Infusion (Specialist only). CPR if arrest.', requires_confirmation: true }
    ],
    references: [{ citation: 'Resuscitation Council UK: Emergency treatment of anaphylactic reactions.' }]
  },
  {
    id: 'GEN-STROKE-001',
    title: 'Acute Ischemic Stroke Protocol',
    metadata: {
      version: '1.0.0',
      date_effective: '2023-05-01',
      last_reviewed: '2024-07-15',
      authors: ['Neurology Department'],
      institution: 'General Hospital',
      jurisdiction: ['General Practice'],
      scope: 'Immediate management of suspected acute stroke.',
      'use_if_conditions': ['Sudden onset neurological deficit (FAST positive)', 'Last known well time < 24 hours'],
      canonical_sources: [ { name: 'AHA/ASA Guidelines' } ],
      reviewer_signoff: [{ name: 'Dr. N. Neuro', date: '2024-07-10', comments: 'Initial protocol approved' }],
    },
    preconditions: ['Blood glucose checked (exclude hypoglycemia).'],
    settings: ['Emergency', 'Tertiary'],
    stepwise_actions: [
      { id: 'str-step1', timing: 'Immediate (0-10 min)', title: 'Triage & Stability', is_critical: true, actions: [
        'Assess ABCs. Maintain O2 > 94%.',
        'Check Fingerstick Glucose. Treat if < 60 mg/dL.',
        'Determine "Last Known Well" time precisely.',
        'Perform NIHSS score.',
        'Order CT Brain Non-Contrast STAT (Door-to-CT goal < 20 mins).'
      ]},
      { id: 'str-step2', timing: 'CT Result Review', title: 'Reperfusion Decision', is_critical: true, actions: [
        '**If CT shows Hemorrhage:** Follow Intracranial Hemorrhage protocol. No Thrombolysis.',
        '**If CT negative for bleed:**',
        '- If Last Known Well < 4.5 hours: Evaluate for IV Thrombolysis (Alteplase/Tenecteplase).',
        '- If Large Vessel Occlusion (LVO) suspected (High NIHSS): Evaluate for Mechanical Thrombectomy (window up to 24h).'
      ]},
      { id: 'str-step3', timing: 'Management', title: 'BP Control', is_critical: false, actions: [
        'Before Thrombolysis: BP must be < 185/110 mmHg.',
        'If no Thrombolysis: Permissive hypertension allowed (up to 220/120) to maintain perfusion, unless other organ damage.',
        'Keep head of bed flat or 30 degrees.'
      ]}
    ],
    dosing_table: [
      { drug_name: 'Alteplase (tPA)', brand_names_india: ['Actilyse'], available_strengths: ['50mg'], formula: '0.9 mg/kg', route: 'IV', dilution_instructions: 'Reconstitute per instructions.', administration_details: '10% as bolus over 1 min, remaining 90% infusion over 60 mins.', max_dose: '90 mg', monitoring: ['Neuro checks q15min', 'BP q15min'], contraindications: ['Bleeding diathesis', 'Recent surgery', 'Hemorrhage on CT', 'BP > 185/110'] },
      { drug_name: 'Labetalol', brand_names_india: ['Labebet'], available_strengths: ['5mg/mL'], formula: '10-20mg IV', route: 'IV Push', dilution_instructions: 'N/A', administration_details: 'Give over 1-2 mins. May repeat.', max_dose: '300mg', monitoring: ['BP'], contraindications: ['Bradycardia', 'Heart block'] }
    ],
    monitoring_template: {
        title: 'Post-Thrombolysis Monitoring',
        parameters: [
            { parameter: 'BP', frequency: 'q15min x 2h, then q30min x 6h, then q1h x 16h.' },
            { parameter: 'Neurological Status', frequency: 'Same as BP.' }
        ],
        alert_triggers: [
            { condition: 'Sudden headache, nausea, vomiting, or worsening NIHSS', action: 'STOP infusion immediately. Stat CT Head. Check Fibrinogen.' }
        ]
    },
    contraindications_general: ['Do not give Aspirin/Heparin for 24 hours after tPA.'],
    escalation_triggers: [
      { condition: 'Worsening deficits.', action: 'Stat imaging to rule out hemorrhagic conversion.', requires_confirmation: true }
    ],
    references: [{ citation: '2019 AHA/ASA Guidelines for the Early Management of Patients with Acute Ischemic Stroke.' }]
  }
];