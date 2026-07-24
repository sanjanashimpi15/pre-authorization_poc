import { PreAuthRecord, MedicalNecessityStatement, CostEstimate } from '../components/PreAuthWizard/types';
import { scoreNecessityStrength } from '../utils/strengthScorer';
import { getConditionByCode, getConditionByName } from '../config/icd10Database';
import { calculateCost, findConditionByICD } from './costEstimationService';
import { calculateTotals } from '../utils/costCalculator';
import { generatePartC, generatePartCText } from '../engine/partCGenerator';
import { validateCode } from './icdService';

/**
 * If the cost estimate is all zeros, auto-calculate from ICD cost database.
 * This is the FIX for the "LOS=0, Cost=₹0" bug.
 */
function enrichCostFromICD(record: Partial<PreAuthRecord>): Partial<CostEstimate> {
    const cost = record.costEstimate;
    // If costs are already populated, return as-is
    if (cost && (cost.totalEstimatedCost ?? 0) > 0) {
        return cost;
    }

    const selectedDx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
    const icdCode = selectedDx?.icd10Code;
    if (!icdCode) return cost ?? {};

    const roomCategory = record.admission?.roomCategory ?? 'General Ward';
    const isPMJAY = record.insurance?.policyType?.toLowerCase().includes('pmjay') ||
        record.insurance?.policyType?.toLowerCase().includes('ayushman') || false;

    console.log(`[CostFix] Auto-calculating costs from ICD database for ${icdCode}, room=${roomCategory}, PMJAY=${isPMJAY}`);

    const est = calculateCost(icdCode, roomCategory, isPMJAY);

    console.log(`[CostFix] Result: LOS=${est.los.total_days}, Total=₹${est.total_estimated}`, est.breakdown);

    const enriched = calculateTotals({
        roomRentPerDay: est.breakdown.room_rent / Math.max(1, est.los.ward_days),
        expectedRoomDays: est.los.ward_days,
        nursingChargesPerDay: est.breakdown.nursing_charges / Math.max(1, est.los.ward_days),
        icuChargesPerDay: est.los.icu_days > 0 ? est.breakdown.icu_charges / est.los.icu_days : 0,
        expectedIcuDays: est.los.icu_days,
        otCharges: est.breakdown.ot_charges,
        surgeonFee: est.breakdown.surgeon_fee,
        anesthetistFee: est.breakdown.anesthetist_fee,
        consultantFee: est.breakdown.consultant_fee,
        investigationsEstimate: est.breakdown.investigations,
        medicinesEstimate: est.breakdown.medicines,
        consumablesEstimate: est.breakdown.consumables,
        miscCharges: est.breakdown.miscellaneous,
        ...(est.source === 'PMJAY' && est.pmjay_details ? {
            isPackageRate: true,
            packageName: est.pmjay_details.package_name,
            packageAmount: est.pmjay_details.package_rate,
        } : {}),
    }, record.insurance?.sumInsured ?? 0);

    return enriched;
}

/**
 * Auto-generates a medical necessity statement from collected data.
 */
export const generateMedicalNecessity = (record: Partial<PreAuthRecord>): MedicalNecessityStatement => {
    const patient = record.patient;
    const clinical = record.clinical;
    const admission = record.admission;
    // ✅ FIX: Auto-enrich cost from ICD database if totalEstimatedCost is 0
    const cost = enrichCostFromICD(record);

    const selectedDx = clinical?.diagnoses?.[clinical.selectedDiagnosisIndex ?? 0];
    const vitals = clinical?.vitals;

    const abnormalFindings: string[] = [];
    const vfList = clinical?.voiceCapturedFindings ?? [];
    vfList.filter(f => f.interpretation !== 'normal').forEach(f => {
        abnormalFindings.push(`• ${f.testName}: ${f.result}`);
    });

    const severityPoints: string[] = [];
    const sev = clinical?.severity;
    if (sev) {
        if (sev.phenoIntensity > 0.7) severityPoints.push('Severe symptom presentation');
        if (sev.urgencyQuotient > 0.7) severityPoints.push('Time-critical intervention required');
        if (sev.deteriorationVelocity > 0.7) severityPoints.push('High risk of rapid deterioration');
    }
    const spo2 = vitals?.spo2 ? parseInt(vitals.spo2) : null;
    if (spo2 !== null && spo2 < 94) severityPoints.push(`Hypoxia (SpO2 ${spo2}%)`);

    const opdContra: string[] = [
        ...(clinical?.reasonForHospitalisation ? [clinical.reasonForHospitalisation] : []),
        ...(spo2 !== null && spo2 < 94 ? ['Oxygen requirement cannot be safely met at home'] : []),
        'Need for continuous inpatient monitoring and IV management',
    ];

    const treatmentLines: string[] = [];
    const plt = clinical?.proposedLineOfTreatment;
    if (plt?.medical) treatmentLines.push('Medical management');
    if (plt?.surgical) treatmentLines.push('Surgical management');
    if (plt?.intensiveCare) treatmentLines.push('Intensive care');
    if (plt?.investigation) treatmentLines.push('Investigation');

    // ── ICD Database enrichment (255-condition database) ────────────────────
    const icdCondition = selectedDx?.icd10Code
        ? getConditionByCode(selectedDx.icd10Code)
        : selectedDx?.diagnosis
            ? getConditionByName(selectedDx.diagnosis)
            : undefined;

    let icdEnrichment = '';
    if (icdCondition) {
        const admissionCriteria = (icdCondition.admission_criteria ?? []).slice(0, 5);
        const procedures = (icdCondition.expected_procedures ?? []).slice(0, 5);
        const tpaRisks = (icdCondition.tpa_query_triggers ?? []).slice(0, 3);
        const mustDocs = (icdCondition.must_include_docs ?? []).slice(0, 5);
        const los = icdCondition.los;
        const pmjayNote = icdCondition.pmjay_eligible ? 'Eligible for PMJAY (Ayushman Bharat) coverage.' : '';
        icdEnrichment = `

CONDITION-SPECIFIC ADMISSION CRITERIA (ICD-10-CM 2024: ${icdCondition.primary_code}):
${admissionCriteria.map((c: string) => `• ${c}`).join('\n') || '• Clinical severity warrants inpatient monitoring'}

EXPECTED INVESTIGATIONS & PROCEDURES:
${procedures.map((p: string) => `• ${p}`).join('\n')}

EXPECTED LENGTH OF STAY: ${los.min}\u2013${los.typical} days${los.icu_days > 0 ? ` (up to ${los.icu_days} ICU days)` : ''}.
${los.note ? `Clinical Note: ${los.note}` : ''}

INDIA-SPECIFIC CONTEXT: ${icdCondition.india_notes} ${pmjayNote}

DOCUMENTATION THAT MUST BE ATTACHED:
${mustDocs.map((d: string) => `\u2610 ${d}`).join('\n')}

\u26A0\uFE0F COMMON TPA QUERY TRIGGERS (preemptively addressed):
${tpaRisks.map((t: string) => `• ${t}`).join('\n')}`;
    }

    const text = `MEDICAL NECESSITY STATEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Patient: ${patient?.patientName ?? 'N/A'}, ${patient?.age ?? '?'}${patient?.ageUnit === 'months' ? ' months' : ' years'}, ${patient?.gender ?? 'N/A'}
Diagnosis: ${selectedDx?.diagnosis ?? 'N/A'} (ICD-10: ${selectedDx?.icd10Code && validateCode(selectedDx.icd10Code) ? selectedDx.icd10Code : 'Pending ICD-10'})
Diagnostic Confidence: ${selectedDx ? `${Math.round((selectedDx.probability ?? 0.85) * 100)}%` : 'N/A'}

CLINICAL PRESENTATION:
${clinical?.historyOfPresentIllness || clinical?.chiefComplaints || 'As documented in attached clinical notes.'}

CHIEF COMPLAINTS:
${clinical?.chiefComplaints || 'N/A'}
Duration: ${clinical?.durationOfPresentAilment || 'N/A'}
Nature of Illness: ${clinical?.natureOfIllness || 'N/A'}

RELEVANT CLINICAL FINDINGS:
${clinical?.relevantClinicalFindings || 'As documented.'}

${abnormalFindings.length > 0 ? `KEY ABNORMAL FINDINGS:\n${abnormalFindings.join('\n')}` : ''}

VITAL SIGNS AT PRESENTATION:
BP: ${vitals?.bp || 'N/R'} mmHg | Pulse: ${vitals?.pulse || 'N/R'}/min | Temp: ${vitals?.temp || 'N/R'}°F
SpO2: ${vitals?.spo2 || 'N/R'}% | RR: ${vitals?.rr || 'N/R'}/min

SEVERITY ASSESSMENT:
Overall Risk: ${sev?.overallRisk ?? 'Moderate'}
${severityPoints.map(s => `• ${s}`).join('\n') || '• Moderate severity requiring inpatient care'}

MEDICAL NECESSITY JUSTIFICATION:
Hospitalization is medically necessary due to:
${severityPoints.map(s => `• ${s}`).join('\n') || '• Clinical severity requiring supervised inpatient care'}

WHY OPD MANAGEMENT IS NOT APPROPRIATE:
${opdContra.filter(Boolean).map(c => `• ${c}`).join('\n')}

${clinical?.treatmentTakenSoFar ? `PRIOR TREATMENT:\n${clinical.treatmentTakenSoFar}\n` : ''}

PROPOSED MANAGEMENT:
${treatmentLines.length > 0 ? treatmentLines.map(l => `• ${l}`).join('\n') : '• Medical management'}
• Admission: ${admission?.admissionType ?? 'N/A'} - ${admission?.roomCategory ?? 'General Ward'}
• Expected Length of Stay: ${(() => {
            let los = admission?.expectedLengthOfStay ?? 0;
            let ward = admission?.expectedDaysInRoom ?? 0;
            let icu = admission?.expectedDaysInICU ?? 0;
            if (los === 0 && selectedDx?.icd10Code) {
                const icdCond = findConditionByICD(selectedDx.icd10Code);
                if (icdCond) { los = icdCond.los.avg; ward = icdCond.los.avg - icdCond.los.icu; icu = icdCond.los.icu; }
            }
            return `${los} days (${ward} ward + ${icu} ICU days)`;
        })()}
• Total Estimated Cost: ₹${(cost?.totalEstimatedCost ?? 0).toLocaleString('en-IN')}
${icdEnrichment}`;

    const { strength, reasons } = scoreNecessityStrength(record);

    return {
        generatedText: text.trim(),
        wasEdited: false,
        strength,
        strengthReasons: reasons,
        generatedAt: new Date().toISOString(),
    };
};

export const generateIRDAITextFromRecord = (record: Partial<PreAuthRecord>): string => {
    const partC = generatePartC(record, null);
    return generatePartCText(partC);
};
