/**
 * medicalNecessityGenerator.ts
 * Task B: Generates TPA-ready medical necessity statements from
 * clinical data + ICD database condition details.
 */
import { ICDCondition } from '../config/icd10Database';
import { ClinicalDetails, SeverityAssessment, WizardVitals } from '../components/PreAuthWizard/types';

// ── Severity mapping ─────────────────────────────────────────────────────────
function mapSeverityScore(s: SeverityAssessment): { label: string; score: number } {
    const avg = (s.phenoIntensity + s.urgencyQuotient + s.deteriorationVelocity) / 3;
    if (avg >= 0.75 || s.overallRisk === 'Critical') return { label: 'CRITICAL', score: Math.round(avg * 10) };
    if (avg >= 0.5 || s.overallRisk === 'High') return { label: 'HIGH', score: Math.round(avg * 10) };
    if (avg >= 0.3 || s.overallRisk === 'Moderate') return { label: 'MODERATE', score: Math.round(avg * 10) };
    return { label: 'LOW', score: Math.round(avg * 10) };
}

// ── Vitals abnormality detector ──────────────────────────────────────────────
function getAbnormalVitals(vitals: WizardVitals): string[] {
    const flags: string[] = [];
    if (vitals.spo2 && parseInt(vitals.spo2) < 94)
        flags.push(`SpO₂ ${vitals.spo2}% (hypoxia — below 94% threshold for inpatient oxygen therapy)`);
    if (vitals.pulse && (parseInt(vitals.pulse) > 100 || parseInt(vitals.pulse) < 50))
        flags.push(`Heart Rate ${vitals.pulse}/min (${parseInt(vitals.pulse) > 100 ? 'tachycardia' : 'bradycardia'} requiring continuous monitoring)`);
    if (vitals.temp && parseFloat(vitals.temp) > 100.4)
        flags.push(`Temperature ${vitals.temp}°F (significant febrile illness)`);
    if (vitals.rr && parseInt(vitals.rr) > 25)
        flags.push(`Respiratory Rate ${vitals.rr}/min (tachypnoea — respiratory compromise)`);
    if (vitals.bp) {
        const [sys, dia] = vitals.bp.split('/').map(Number);
        if (sys && (sys > 180 || sys < 80))
            flags.push(`Blood Pressure ${vitals.bp} mmHg (${sys > 180 ? 'hypertensive emergency' : 'hypotension — haemodynamic instability'})`);
        if (dia && dia > 120)
            flags.push(`Diastolic BP ${dia} mmHg (hypertensive crisis criterion)`);
    }
    return flags;
}

// ── Admission criteria matcher ────────────────────────────────────────────────
function matchAdmissionCriteria(condition: ICDCondition, clinical: Partial<ClinicalDetails>): string[] {
    const crit = condition.admission_criteria;
    const vitals = clinical.vitals;
    const matched: string[] = [];

    for (const c of crit) {
        const cl = c.toLowerCase();
        if (cl.includes('spo2') && vitals?.spo2 && parseInt(vitals.spo2) < 94) { matched.push(c); continue; }
        if (cl.includes('iv') || cl.includes('intravenous') || cl.includes('monitoring')) { matched.push(c); continue; }
        if (cl.includes('opd') || cl.includes('outpatient')) { matched.push(c); continue; }
        if (cl.includes('sepsis') && (clinical.chiefComplaints?.toLowerCase().includes('fever') || clinical.chiefComplaints?.toLowerCase().includes('sepsis'))) { matched.push(c); continue; }
        if (cl.includes('respiratory') && clinical.proposedLineOfTreatment?.intensiveCare) { matched.push(c); continue; }
    }

    // Always include first 2 universal criteria
    const universal = crit.slice(0, 2);
    const all = [...new Set([...matched, ...universal])].slice(0, 5);
    return all;
}

// ── Strength evaluator ────────────────────────────────────────────────────────
export type NecessityStrength = 'strong' | 'moderate' | 'weak';

function evaluateStrength(
    abnormalVitals: string[],
    matchedCriteria: string[],
    severity: SeverityAssessment,
    hasDocuments: boolean
): { strength: NecessityStrength; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    if (abnormalVitals.length >= 2) { score += 3; reasons.push(`${abnormalVitals.length} objective vital sign abnormalities documented`); }
    else if (abnormalVitals.length === 1) { score += 1; reasons.push('1 vital sign abnormality documented'); }

    if (matchedCriteria.length >= 3) { score += 2; reasons.push(`Meets ${matchedCriteria.length} admission criteria`); }
    else if (matchedCriteria.length >= 1) { score += 1; reasons.push(`Meets ${matchedCriteria.length} admission criterion`); }

    if (severity.overallRisk === 'Critical' || severity.overallRisk === 'High') { score += 2; reasons.push(`${severity.overallRisk} severity designation`); }
    if (severity.mustNotMiss) { score += 1; reasons.push('Must-not-miss differential documented'); }
    if (hasDocuments) { score += 1; reasons.push('Supporting documents attached'); }

    const strength: NecessityStrength = score >= 6 ? 'strong' : score >= 3 ? 'moderate' : 'weak';
    return { strength, reasons };
}

// ── Main generator ────────────────────────────────────────────────────────────
export interface GeneratedNecessity {
    text: string;
    strength: NecessityStrength;
    strengthReasons: string[];
    admissionCriteriaMatched: string[];
    abnormalVitals: string[];
    tpaQueryRisks: string[];
    mustIncludeDocs: string[];
    suggestedLos: { min: number; typical: number; note: string };
}

export function generateMedicalNecessity(
    clinical: Partial<ClinicalDetails>,
    condition: ICDCondition,
    patientName?: string,
    hasDocuments = false,
): GeneratedNecessity {
    const primaryDx = clinical.diagnoses?.find(d => d.isSelected) ?? clinical.diagnoses?.[0];
    const severity = clinical.severity ?? {
        phenoIntensity: 0.5, urgencyQuotient: 0.5, deteriorationVelocity: 0.4,
        overallRisk: 'Moderate' as const, mustNotMiss: false,
    };
    const vitals = clinical.vitals ?? { bp: '', pulse: '', temp: '', spo2: '', rr: '' };

    const abnormalVitals = getAbnormalVitals(vitals);
    const matchedCriteria = matchAdmissionCriteria(condition, clinical);
    const { label: severityLabel, score: severityScore } = mapSeverityScore(severity);
    const { strength, reasons } = evaluateStrength(abnormalVitals, matchedCriteria, severity, hasDocuments);

    const treatmentLines: string[] = [];
    if (clinical.proposedLineOfTreatment?.medical) treatmentLines.push('medical management');
    if (clinical.proposedLineOfTreatment?.surgical) treatmentLines.push('surgical intervention');
    if (clinical.proposedLineOfTreatment?.intensiveCare) treatmentLines.push('intensive care monitoring');
    if (clinical.proposedLineOfTreatment?.investigation) treatmentLines.push('in-hospital investigations');

    const associatedCodeStr = condition.associated_codes.slice(0, 3)
        .map(a => `${a.code} (${a.description})`)
        .join(', ');

    const vitalsStr = [
        vitals.bp ? `BP: ${vitals.bp} mmHg` : '',
        vitals.pulse ? `Pulse: ${vitals.pulse}/min` : '',
        vitals.spo2 ? `SpO₂: ${vitals.spo2}%` : '',
        vitals.temp ? `Temp: ${vitals.temp}°F` : '',
        vitals.rr ? `RR: ${vitals.rr}/min` : '',
    ].filter(Boolean).join(' | ');

    const pmjayNote = condition.pmjay_eligible
        ? `This condition is eligible for PMJAY (Ayushman Bharat) coverage.`
        : '';

    const text = `
PRE-AUTHORIZATION — MEDICAL NECESSITY STATEMENT

Patient${patientName ? `: ${patientName}` : ''} presents with ${condition.condition_name} (ICD-10-CM 2024: ${condition.primary_code} — ${condition.primary_description}), ${clinical.natureOfIllness ?? 'Acute'} in nature, with duration of ${clinical.durationOfPresentAilment ?? 'recent onset'}.

CLINICAL PRESENTATION:
${clinical.chiefComplaints ? `Chief Complaints: ${clinical.chiefComplaints}` : ''}
${vitalsStr ? `Vitals at Admission: ${vitalsStr}` : ''}
${clinical.relevantClinicalFindings ? `Relevant Findings: ${clinical.relevantClinicalFindings}` : ''}
${clinical.historyOfPresentIllness ? `History: ${clinical.historyOfPresentIllness}` : ''}
${clinical.treatmentTakenSoFar ? `Prior OPD Treatment: ${clinical.treatmentTakenSoFar} — without adequate response.` : ''}

OBJECTIVE SEVERITY INDICATORS — Clinical Severity: ${severityLabel} (Score: ${severityScore}/10):
${abnormalVitals.length > 0
            ? abnormalVitals.map(v => `• ${v}`).join('\n')
            : '• Clinical assessment indicates inpatient monitoring required'}

HOSPITALIZATION IS MEDICALLY NECESSARY BECAUSE:
${matchedCriteria.map(c => `• ${c}`).join('\n')}
${clinical.reasonForHospitalisation ? `\nAdditional Justification: ${clinical.reasonForHospitalisation}` : ''}

OPD MANAGEMENT IS NOT APPROPRIATE: The patient's clinical condition requires ${treatmentLines.join(', ') || 'continuous monitoring and IV therapy'}, which cannot be safely administered in an outpatient setting.

PROPOSED TREATMENT PLAN:
${condition.expected_procedures.slice(0, 5).map(p => `• ${p}`).join('\n')}

EXPECTED LENGTH OF STAY: ${condition.los.min}–${condition.los.typical} days${condition.los.icu_days > 0 ? ` (including up to ${condition.los.icu_days} ICU day(s))` : ''}.
${condition.los.note ? `Clinical Note: ${condition.los.note}` : ''}

ASSOCIATED/SECONDARY DIAGNOSES: ${associatedCodeStr || 'None documented at this time'}.

INDIA-SPECIFIC CONTEXT: ${condition.india_notes}
${pmjayNote}

DOCUMENTATION CHECKLIST (must be attached):
${condition.must_include_docs.slice(0, 6).map(d => `☐ ${d}`).join('\n')}

This statement is generated based on objective clinical data and ICD-10-CM 2024 coding standards, in accordance with IRDAI pre-authorization guidelines and TPA requirements.

Treating Physician Declaration: I confirm that the above clinical details are accurate and that hospitalization is medically necessary for the stated condition.
`.trim();

    return {
        text,
        strength,
        strengthReasons: reasons,
        admissionCriteriaMatched: matchedCriteria,
        abnormalVitals,
        tpaQueryRisks: condition.tpa_query_triggers,
        mustIncludeDocs: condition.must_include_docs,
        suggestedLos: { min: condition.los.min, typical: condition.los.typical, note: condition.los.note },
    };
}
