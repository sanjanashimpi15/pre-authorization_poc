import { DocumentRequirement, DocumentCategory } from '../types';

/**
 * Strictly validates an ICD-10 code string before prefix extraction.
 *
 * Returns the code unchanged if it is already well-formed, or an empty string
 * if it is malformed or requires transformation. Rules:
 *   1. Must be a non-empty string with NO leading or trailing whitespace.
 *      (A code with whitespace was never properly confirmed via WHO lookup.)
 *   2. First character must be an uppercase ASCII letter (A-Z).
 *   3. Second and third characters must be ASCII digits (0-9).
 *   4. Position 3 (if present) must be '.' or a digit — never a space, symbol,
 *      or any other character.
 *
 * NOTE: We do NOT silently normalize (trim / uppercase) the input.
 * A code that needs normalization to pass is a code that was never properly
 * confirmed through the icdService validator, and should fail safe.
 */
function normalizeIcdCode(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    // Reject immediately if there is any leading or trailing whitespace
    if (raw !== raw.trim()) return '';
    // Must start with uppercase letter + 2 digits (strict — no case folding)
    if (!/^[A-Z][0-9]{2}/.test(raw)) return '';
    // Validate the 4th character if present — must be '.' or digit
    if (raw.length > 3 && !/^[0-9.]$/.test(raw[3])) return '';
    return raw;
}

// Maps ICD-10 codes (or diagnosis categories) to required documents
const diagnosisDocumentMap: Record<string, DocumentCategory[]> = {
    // Respiratory
    'J18': ['chest_xray', 'cbc', 'abg'],           // Pneumonia
    'J12': ['chest_xray', 'cbc', 'covid_test'],    // Viral pneumonia
    'J44': ['chest_xray', 'cbc', 'abg', 'ecg'],    // COPD

    // Cardiac
    'I21': ['ecg', 'cbc', 'lft', 'kft'],           // MI
    'I50': ['ecg', 'chest_xray', 'cbc'],           // Heart failure

    // Infectious
    'A41': ['blood_culture', 'cbc', 'lft', 'kft'], // Sepsis
    'A90': ['ns1_antigen', 'cbc', 'dengue_igm'],   // Dengue Fever

    // Gastrointestinal
    'K35': ['usg_abdomen', 'cbc', 'urine_routine'], // Acute appendicitis

    // Musculoskeletal / Joint
    'M17': ['xray_knee', 'cbc'],                   // Knee Osteoarthritis (TKR)

    // Stroke / Intracerebral Hemorrhage
    'I60': ['ct_scan', 'mri', 'cbc'],              // Ruptured aneurysm SAH
    'I61': ['ct_scan', 'mri', 'cbc'],              // Intracerebral hemorrhage
    'I63': ['ct_scan', 'mri', 'cbc'],              // Cerebral stroke

    // Renal / Kidney Failure
    'N17': ['kft', 'cbc', 'urine_routine'],        // Acute kidney injury
    'N18': ['kft', 'cbc', 'urine_routine'],        // Chronic kidney disease / ESRD

    // Oncology / Neoplasms
    'C34': ['ct_scan', 'mri', 'cbc'],              // Lung cancer
    'C49': ['ct_scan', 'mri', 'cbc'],              // Retroperitoneal Sarcoma
    'C32': ['ct_scan', 'other', 'cbc'],            // Larynx cancer
    'C25': ['ct_scan', 'mri', 'cbc'],              // Pancreatic cancer

    // Burns
    'T31': ['cbc', 'other'],                       // Burns (requires burn assessment chart)

    // Default for unknown
    'default': ['cbc'],
};

const documentDetails: Record<DocumentCategory, { displayName: string; description: string }> = {
    'chest_xray': { displayName: 'Chest X-Ray', description: 'PA view chest radiograph' },
    'xray_knee': { displayName: 'Knee X-Ray', description: 'Bilateral weight-bearing AP/Lateral radiograph' },
    'cbc': { displayName: 'CBC Report', description: 'Complete blood count with differential' },
    'abg': { displayName: 'ABG Report', description: 'Arterial blood gas analysis' },
    'ecg': { displayName: 'ECG', description: '12-lead electrocardiogram' },
    'ct_scan': { displayName: 'CT Scan', description: 'Computed tomography report' },
    'mri': { displayName: 'MRI', description: 'Magnetic resonance imaging report' },
    'ultrasound': { displayName: 'Ultrasound', description: 'Ultrasonography report' },
    'blood_culture': { displayName: 'Blood Culture', description: 'Blood culture and sensitivity' },
    'urine_routine': { displayName: 'Urine Routine', description: 'Urine analysis report' },
    'lft': { displayName: 'LFT', description: 'Liver function tests' },
    'kft': { displayName: 'KFT', description: 'Kidney function tests' },
    'covid_test': { displayName: 'COVID-19 Test', description: 'RT-PCR or Rapid Antigen Test' },
    'ns1_antigen': { displayName: 'Dengue NS1 Antigen', description: 'Rapid test for early Dengue detection' },
    'dengue_igm': { displayName: 'Dengue IgM', description: 'Antibody test for Dengue' },
    'usg_abdomen': { displayName: 'USG Abdomen / Pelvis', description: 'Abdominal ultrasonography' },
    'other': { displayName: 'Other Document', description: 'Additional supporting document' },
};

export const getRequiredDocuments = (diagnosisOrIcd10: string): DocumentRequirement[] => {
    let category = 'default';

    // Normalize first — rejects codes with trailing whitespace/special chars
    const normalized = normalizeIcdCode(diagnosisOrIcd10);

    // Check if it's a valid, normalized ICD-10 code format (e.g., A90, J18.9, M17.0)
    if (normalized) {
        category = normalized.substring(0, 3);
    } else {
        // Fallback explicit text matching
        const lowerDiag = diagnosisOrIcd10.toLowerCase();
        if (lowerDiag.includes('dengue')) category = 'A90';
        else if (lowerDiag.includes('appendicitis')) category = 'K35';
        else if (lowerDiag.includes('pneumonia')) category = 'J18';
        else if (lowerDiag.includes('sepsis')) category = 'A41';
        else if (lowerDiag.includes('myocardial') || lowerDiag.includes('mi')) category = 'I21';
        else if (lowerDiag.includes('osteoarthritis') || lowerDiag.includes('knee') || lowerDiag.includes('tkr')) category = 'M17';
        else if (lowerDiag.includes('stroke') || lowerDiag.includes('hemorrhage') || lowerDiag.includes('infarct') || lowerDiag.includes('sah')) category = 'I61';
        else if (lowerDiag.includes('renal') || lowerDiag.includes('kidney') || lowerDiag.includes('nephro') || lowerDiag.includes('aki') || lowerDiag.includes('esrd')) category = 'N17';
        else if (lowerDiag.includes('cancer') || lowerDiag.includes('sarcoma') || lowerDiag.includes('neoplasm') || lowerDiag.includes('malignant') || lowerDiag.includes('carcinoma')) category = 'C34';
        else if (lowerDiag.includes('burn') || lowerDiag.includes('scald')) category = 'T31';
    }

    const requiredCategories = diagnosisDocumentMap[category] || diagnosisDocumentMap['default'];

    return requiredCategories.map((cat, index) => {
        // CBC is a routine pre-op investigation, not a critical TPA auto-reject trigger
        const isRequired = cat === 'cbc' ? false : (index < 2);
        return {
            category: cat,
            displayName: documentDetails[cat].displayName,
            isRequired,
            description: documentDetails[cat].description,
        };
    });
};

export const isIcdMapped = (diagnosisOrIcd10: string): boolean => {
    let category = 'default';

    // Normalize first — rejects codes with trailing whitespace/special chars
    const normalized = normalizeIcdCode(diagnosisOrIcd10);

    if (normalized) {
        category = normalized.substring(0, 3);
    } else {
        const lowerDiag = diagnosisOrIcd10.toLowerCase();
        if (lowerDiag.includes('dengue')) category = 'A90';
        else if (lowerDiag.includes('appendicitis')) category = 'K35';
        else if (lowerDiag.includes('pneumonia')) category = 'J18';
        else if (lowerDiag.includes('sepsis')) category = 'A41';
        else if (lowerDiag.includes('myocardial') || lowerDiag.includes('mi')) category = 'I21';
        else if (lowerDiag.includes('osteoarthritis') || lowerDiag.includes('knee') || lowerDiag.includes('tkr')) category = 'M17';
        else if (lowerDiag.includes('stroke') || lowerDiag.includes('hemorrhage') || lowerDiag.includes('infarct') || lowerDiag.includes('sah')) category = 'I61';
        else if (lowerDiag.includes('renal') || lowerDiag.includes('kidney') || lowerDiag.includes('nephro') || lowerDiag.includes('aki') || lowerDiag.includes('esrd')) category = 'N17';
        else if (lowerDiag.includes('cancer') || lowerDiag.includes('sarcoma') || lowerDiag.includes('neoplasm') || lowerDiag.includes('malignant') || lowerDiag.includes('carcinoma')) category = 'C34';
        else if (lowerDiag.includes('burn') || lowerDiag.includes('scald')) category = 'T31';
    }
    return category !== 'default' && diagnosisDocumentMap[category] !== undefined;
};

/**
 * Matches a filename to a document category
 */
export const guessDocumentCategory = (filename: string): DocumentCategory => {
    const lower = filename.toLowerCase();

    if (lower.includes('knee') && (lower.includes('xray') || lower.includes('x-ray') || lower.includes('film'))) return 'xray_knee';
    if (lower.includes('xray') || lower.includes('x-ray') || lower.includes('cxr')) return 'chest_xray';
    if (lower.includes('cbc') || lower.includes('blood count')) return 'cbc';
    if (lower.includes('abg') || lower.includes('blood gas')) return 'abg';
    if (lower.includes('ecg') || lower.includes('ekg')) return 'ecg';
    if (lower.includes('ct') || lower.includes('scan')) return 'ct_scan';
    if (lower.includes('mri')) return 'mri';
    if (lower.includes('usg') || lower.includes('ultrasound')) return 'ultrasound';
    if (lower.includes('culture')) return 'blood_culture';
    if (lower.includes('urine')) return 'urine_routine';
    if (lower.includes('lft') || lower.includes('liver')) return 'lft';
    if (lower.includes('kft') || lower.includes('kidney') || lower.includes('renal')) return 'kft';
    if (lower.includes('covid') || lower.includes('rtpcr')) return 'covid_test';
    if (lower.includes('ns1') || lower.includes('antigen')) return 'ns1_antigen';
    if (lower.includes('igm') || lower.includes('mac')) return 'dengue_igm';
    if (lower.includes('usg abdomen') || lower.includes('pelvis')) return 'usg_abdomen';

    return 'other';
};
