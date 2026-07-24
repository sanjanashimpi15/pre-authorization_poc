import { generateAppealLetterAI } from '../services/geminiService';
import { DenialItem } from './denialReview';

export interface AppealPackage {
    denialId: string;
    letterContent: string;
    suggestedAttachments: string[];
    irdaCitations: string[];
    generatedAt: string;
}

export const generateAppealPackage = async (
    denial: DenialItem,
    clinicalJustification: string,
    doctorName: string,
    doctorReg: string
): Promise<AppealPackage> => {
    const denialCode = denial.analysis?.denialCode || 'Exclusion';
    const denialReason = denial.analysis?.denialReason || denial.eobText.substring(0, 100);

    const letter = await generateAppealLetterAI({
        patientName: denial.patientName,
        policyNumber: denial.policyNumber,
        tpaName: denial.tpaName,
        denialCode,
        denialReason,
        clinicalJustification,
        doctorName,
        doctorReg
    });

    // Match attachments dynamically based on denial category
    const attachments: string[] = ['Copy of Rejection Letter (EOB)'];
    const citations: string[] = [];

    if (denial.analysis?.category === 'Clinical Necessity') {
        attachments.push('Daily Nursing Chart showing vitals', 'Treating doctor clinical daily summaries', 'Relevant lab and radiology reports');
        citations.push('IRDAI Master Circular (2024) Sec 12: Clinical necessity overriding general waiting caps.');
    } else if (denial.analysis?.category === 'Pre-Existing Disease') {
        attachments.push('Patient medical declaration form at inception', 'Treating consultant testimony confirming first diagnosis date', 'Continuity of cover certificate from previous insurer');
        citations.push('IRDAI/HLT/REG/CIR/2024/039: 36-month cap on Pre-Existing Disease waiting periods.');
    } else if (denial.analysis?.category === 'Coding / Billing') {
        attachments.push('Itemized bill breakdown from hospital billing desk', 'Signed CPT/ICD coding mapping statement');
        citations.push('IRDAI/HLT/REG/2016/58: Prohibitions against ICU proportional deductions.');
    } else {
        attachments.push('Treating physician clinical statement', 'Copy of standard pre-auth approval');
        citations.push('IRDAI TAT Standards (1-hour response mandate).');
    }

    return {
        denialId: denial.id,
        letterContent: letter,
        suggestedAttachments: attachments,
        irdaCitations: citations,
        generatedAt: new Date().toISOString()
    };
};
