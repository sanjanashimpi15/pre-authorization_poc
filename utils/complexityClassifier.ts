import { PreAuthRecord, CaseComplexity } from '../components/PreAuthWizard/types';

/**
 * Deterministically classifies case complexity based on diagnoses, comorbidities,
 * ICU stays, trauma status, and proposed line of treatment.
 *
 * FIX (2026-07-03):
 *  - Knee/OA cases are now only Medium when the case IS surgical (TKR/arthroplasty).
 *    Conservative medical management of OA is Low.
 *  - Added invasive procedure keywords (catheterization, RHC, ERCP, bronchoscopy,
 *    angiography, etc.) which always resolve to Medium regardless of primary ICD.
 *  - ICU flag now also checks proposedLineOfTreatment.intensiveCare field,
 *    not just room category string.
 */
export const classifyCaseComplexity = (record: Partial<PreAuthRecord>): {
    complexity: CaseComplexity;
    reason: string;
} => {
    const diagnoses = record.clinical?.diagnoses ?? [];
    const selectedIdx = record.clinical?.selectedDiagnosisIndex ?? 0;
    const selectedDx = diagnoses[selectedIdx];
    const dxName = (selectedDx?.diagnosis || '').toLowerCase();
    const isSurgical = record.clinical?.proposedLineOfTreatment?.surgical === true;
    const isICUPlanned = record.clinical?.proposedLineOfTreatment?.intensiveCare === true;

    // 1. Check room category upgrade or respiratory distress
    const roomCategory = record.admission?.roomCategory || '';
    const isICURoom = roomCategory.includes('ICU') || roomCategory.includes('ICCU') || roomCategory.includes('NICU');

    // Check SpO2 distress
    const spo2 = record.clinical?.vitals?.spo2 ? parseInt(record.clinical.vitals.spo2, 10) : null;
    const hasRespDistress = spo2 !== null && spo2 < 90;

    // 2. Check Comorbidities
    const pmh = record.admission?.pastMedicalHistory;
    let comorbidityCount = 0;
    if (pmh) {
        if (pmh.diabetes?.present) comorbidityCount++;
        if (pmh.hypertension?.present) comorbidityCount++;
        if (pmh.heartDisease?.present) comorbidityCount++;
        if (pmh.kidney?.present) comorbidityCount++;
        if (pmh.liver?.present) comorbidityCount++;
        if (pmh.asthma?.present) comorbidityCount++;
        if (pmh.cancer?.present) comorbidityCount++;
    }

    // 3. Check Trauma / Medico-legal (RTA, etc.)
    const isTrauma = record.clinical?.injuryDetails?.isInjury === true;

    // ── HIGH COMPLEXITY RULES ──────────────────────────────────────────────────
    if (isICURoom || isICUPlanned || hasRespDistress) {
        return {
            complexity: 'High',
            reason: isICURoom ? `ICU stay requested (${roomCategory}).`
                : isICUPlanned ? 'Intensive care admission planned.'
                : 'Acute respiratory distress (SpO2 < 90%).'
        };
    }
    if (comorbidityCount >= 2) {
        return {
            complexity: 'High',
            reason: `Multiple comorbid conditions present (${comorbidityCount} comorbidities).`
        };
    }
    if (isTrauma) {
        return {
            complexity: 'High',
            reason: 'Accident / injury case requiring Medico-Legal compliance checks.'
        };
    }

    // ── MEDIUM COMPLEXITY RULES ────────────────────────────────────────────────

    // Invasive interventional / diagnostic procedures → always Medium, regardless of diagnosis.
    // Examples: Right Heart Catheterization, ERCP, bronchoscopy, PTBD, angiography.
    const invasiveProcedureKeywords = [
        // Invasive cardiac procedures
        'catheter', 'catheterization', 'rhc', 'right heart',
        'angiography', 'angioplasty', 'ptca', 'cabg',
        'stent', 'coronary', 'pacemaker', 'ablation',
        'embolization', 'thrombolysis',
        // Acute coronary syndromes — always Medium (monitoring, enzyme trending, likely cathlab)
        'angina', 'acs', 'acute coronary', 'nstemi', 'stemi',
        // Invasive GI / pulmonary / other procedures
        'ercp', 'ptbd', 'bronchoscopy', 'colonoscopy', 'biopsy',
    ];
    const isInvasiveProcedure = invasiveProcedureKeywords.some(kw => dxName.includes(kw));
    if (isInvasiveProcedure) {
        return {
            complexity: 'Medium',
            reason: 'Invasive interventional or diagnostic procedure requiring additional review.'
        };
    }

    // Oncology / malignancy → always at least Medium (biopsy, staging, multi-specialty coordination)
    const oncologyKeywords = [
        'malignant', 'malignancy', 'neoplasm', 'cancer', 'carcinoma',
        'tumour', 'tumor', 'lymphoma', 'leukaemia', 'leukemia',
        'sarcoma', 'melanoma', 'metastasis', 'metastatic',
    ];
    if (oncologyKeywords.some(kw => dxName.includes(kw))) {
        return {
            complexity: 'Medium',
            reason: 'Oncology / malignancy case requiring biopsy, staging, and multi-specialty review.'
        };
    }

    // Major surgical ortho/neuro/general cases — ONLY Medium when the case IS surgical.
    // Medical management of e.g. knee OA, hip OA is routine → Low.
    const surgicalMediumConditions = [
        'acl', 'menisc', 'ligament', 'arthroscopy',
        'spine', 'laminectomy', 'discectomy', 'fusion',
        'hysterectomy', 'myomectomy', 'fistula',
        'leiomyoma', 'fibroid', 'laparotomy',         // OBGYN surgical
        'nephrectomy', 'ureter', 'dj stent',
    ];
    const isSurgicalMedium = isSurgical && surgicalMediumConditions.some(cond => dxName.includes(cond));
    if (isSurgicalMedium) {
        return {
            complexity: 'Medium',
            reason: 'Standard elective surgical procedure requiring anchor check.'
        };
    }

    // Joint replacement / major arthroplasty — Medium only when surgical.
    const isJointReplacement = isSurgical && (
        dxName.includes('replacement') || dxName.includes('arthroplasty') ||
        dxName.includes('tkr') || dxName.includes('thr')
    );
    if (isJointReplacement) {
        return {
            complexity: 'Medium',
            reason: 'Major joint replacement surgery requiring implant and cost review.'
        };
    }

    // Dialysis → Medium (ongoing, complex monitoring regardless of procedure type).
    if (dxName.includes('dialysis') || dxName.includes('haemodialysis') || dxName.includes('hemodialysis')) {
        return {
            complexity: 'Medium',
            reason: 'Renal replacement therapy requiring special cost and duration review.'
        };
    }

    // ── LOW COMPLEXITY (Fast-Track Lane) ──────────────────────────────────────
    // Routine medical treatment, conservative ortho/joint management, cataract,
    // normal delivery, appendicitis, gastroenteritis, viral fever, etc.
    return {
        complexity: 'Low',
        reason: 'Routine medical treatment or low-risk fast-track procedure.'
    };
};
