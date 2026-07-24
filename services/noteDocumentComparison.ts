/**
 * services/noteDocumentComparison.ts
 *
 * Deterministic (no AI call) field-by-field corroboration check: for each of the 5
 * fields, given the already-known DOCUMENT value, check whether the clinical note
 * corroborates it. Never independently parses "who is the patient" etc. from the
 * note in isolation — always compares against the known document value.
 *
 * Replaces an earlier AI-based version (local Ollama qwen2.5vl:3b, text-only) that
 * was tested three different ways tonight (multi-field array, one-shot-example
 * array, single-field calls) and consistently produced wrong results — including
 * claiming values were null when they were plainly present in the note text, and
 * getting missing_in_document/missing_in_note backwards. That's a real capability
 * limit of the 3B local model on this task, not a prompt-wording problem.
 */

import { normalizeInsurerName } from './documentExtractionService';

export interface NoteComparisonItem {
    field: string;
    status: 'match' | 'mismatch' | 'missing_in_document' | 'missing_in_note';
    note_value: string | null;
    document_value: string | null;
}

interface ComparisonDocumentData {
    patient?: { patientName?: string | null; age?: number | null; gender?: string | null };
    insurance?: { policyNumber?: string | null; insurerName?: string | null };
}

function normalizeForMatch(s: string): string {
    return s.toLowerCase().replace(/[.\-']/g, '').replace(/\s+/g, ' ').trim();
}

function checkPatientName(noteText: string, documentValue: string | null | undefined): NoteComparisonItem {
    const docValue = documentValue || null;
    if (!docValue) {
        return { field: 'patient_name', status: 'missing_in_document', note_value: null, document_value: null };
    }
    const normName = normalizeForMatch(docValue);
    const normText = normalizeForMatch(noteText);
    let found = normText.includes(normName);
    if (!found) {
        // Token-overlap fallback for minor variation (e.g. "A Paramesh" vs "A. Paramesh")
        const tokens = normName.split(' ').filter(t => t.length >= 2);
        if (tokens.length > 0) {
            const hits = tokens.filter(t => normText.includes(t)).length;
            found = hits / tokens.length >= 0.5;
        }
    }
    return found
        ? { field: 'patient_name', status: 'match', note_value: docValue, document_value: docValue }
        : { field: 'patient_name', status: 'missing_in_note', note_value: null, document_value: docValue };
}

function extractAgeFromNote(noteText: string): number | null {
    const m = noteText.match(/(\d{1,3})\s*(?:years?|yrs?|yo|y\/o)\b/i) || noteText.match(/\bage\s*[:\-]?\s*(\d{1,3})\b/i);
    return m ? parseInt(m[1], 10) : null;
}

function checkAge(noteText: string, documentValue: number | null | undefined): NoteComparisonItem {
    const docValue = typeof documentValue === 'number' ? documentValue : null;
    const noteAge = extractAgeFromNote(noteText);
    if (docValue === null && noteAge === null) {
        return { field: 'age', status: 'missing_in_document', note_value: null, document_value: null };
    }
    if (docValue === null) {
        return { field: 'age', status: 'missing_in_document', note_value: String(noteAge), document_value: null };
    }
    if (noteAge === null) {
        return { field: 'age', status: 'missing_in_note', note_value: null, document_value: String(docValue) };
    }
    return noteAge === docValue
        ? { field: 'age', status: 'match', note_value: String(noteAge), document_value: String(docValue) }
        : { field: 'age', status: 'mismatch', note_value: String(noteAge), document_value: String(docValue) };
}

function extractGenderFromNote(noteText: string): string | null {
    if (/\bfemale\b/i.test(noteText) || /\bF\b/.test(noteText)) return 'Female';
    if (/\bmale\b/i.test(noteText) || /\bM\b/.test(noteText)) return 'Male';
    return null;
}

function checkGender(noteText: string, documentValue: string | null | undefined): NoteComparisonItem {
    const docValue = documentValue || null;
    const noteGender = extractGenderFromNote(noteText);
    if (!docValue && !noteGender) {
        return { field: 'gender', status: 'missing_in_document', note_value: null, document_value: null };
    }
    if (!docValue) {
        return { field: 'gender', status: 'missing_in_document', note_value: noteGender, document_value: null };
    }
    if (!noteGender) {
        return { field: 'gender', status: 'missing_in_note', note_value: null, document_value: docValue };
    }
    return noteGender.toLowerCase() === docValue.toLowerCase()
        ? { field: 'gender', status: 'match', note_value: noteGender, document_value: docValue }
        : { field: 'gender', status: 'mismatch', note_value: noteGender, document_value: docValue };
}

function checkPolicyNumber(noteText: string, documentValue: string | null | undefined): NoteComparisonItem {
    const docValue = documentValue || null;
    // Same length/format bounds as the extraction regex in documentExtractionService.ts's
    // applyHeuristicFallbacks: /[A-Za-z0-9-]{5,30}/
    const candidates = noteText.match(/[A-Za-z0-9-]{5,30}/g) || [];
    const normalize = (s: string) => s.replace(/[\s-]/g, '').toUpperCase();

    if (!docValue) {
        return { field: 'policy_number', status: 'missing_in_document', note_value: null, document_value: null };
    }
    const docNorm = normalize(docValue);
    const found = candidates.some(c => normalize(c) === docNorm);
    return found
        ? { field: 'policy_number', status: 'match', note_value: docValue, document_value: docValue }
        : { field: 'policy_number', status: 'missing_in_note', note_value: null, document_value: docValue };
}

// Same alias keywords as normalizeInsurerName in documentExtractionService.ts — detects
// presence in free text (normalizeInsurerName only normalizes an already-known string,
// it doesn't search for aliases in a document).
const INSURER_ALIASES: Array<[string, string]> = [
    ['star', 'Star Health and Allied Insurance Co Ltd'],
    ['reliance', 'Reliance General Insurance'],
    ['chola', 'Cholamandalam MS General Insurance Co Ltd'],
    ['royal sundaram', 'Royal Sundaram General Insurance Co Ltd'],
    ['manipal', 'ManipalCigna Health Insurance Company Limited'],
    ['cigna', 'ManipalCigna Health Insurance Company Limited'],
    ['care', 'Care Health Insurance'],
    ['religare', 'Care Health Insurance'],
    ['hdfc', 'HDFC ERGO General Insurance Co Ltd'],
    ['niva', 'Niva Bupa Health Insurance'],
    ['max bupa', 'Niva Bupa Health Insurance'],
    ['icici', 'ICICI Lombard General Insurance Co Ltd'],
    ['sbi', 'SBI General Insurance'],
    ['aditya', 'Aditya Birla Health Insurance Co Ltd'],
    ['tata', 'Tata AIG General Insurance Co Ltd'],
    ['bajaj', 'Bajaj Allianz General Insurance Co Ltd'],
    ['new india', 'New India Assurance Co Ltd'],
    ['national', 'National Insurance Co Ltd'],
    ['united', 'United India Insurance Co Ltd'],
    ['oriental', 'Oriental Insurance Co Ltd'],
];

function detectInsurerAliasInText(text: string): string | null {
    const lower = text.toLowerCase();
    for (const [keyword, canonical] of INSURER_ALIASES) {
        if (lower.includes(keyword)) return canonical;
    }
    return null;
}

function checkInsurerName(noteText: string, documentValue: string | null | undefined): NoteComparisonItem {
    const docValue = documentValue ? normalizeInsurerName(documentValue) : null;
    const noteInsurer = detectInsurerAliasInText(noteText);
    if (!docValue && !noteInsurer) {
        return { field: 'insurer_name', status: 'missing_in_document', note_value: null, document_value: null };
    }
    if (!docValue) {
        return { field: 'insurer_name', status: 'missing_in_document', note_value: noteInsurer, document_value: null };
    }
    if (!noteInsurer) {
        return { field: 'insurer_name', status: 'missing_in_note', note_value: null, document_value: docValue };
    }
    return noteInsurer === docValue
        ? { field: 'insurer_name', status: 'match', note_value: noteInsurer, document_value: docValue }
        : { field: 'insurer_name', status: 'mismatch', note_value: noteInsurer, document_value: docValue };
}

export function compareNoteToDocument(noteText: string, documentData: ComparisonDocumentData): NoteComparisonItem[] {
    return [
        checkPatientName(noteText, documentData.patient?.patientName),
        checkAge(noteText, documentData.patient?.age),
        checkGender(noteText, documentData.patient?.gender),
        checkPolicyNumber(noteText, documentData.insurance?.policyNumber),
        checkInsurerName(noteText, documentData.insurance?.insurerName),
    ];
}

export async function compareNoteToDocumentWithAI(noteText: string, documentData: ComparisonDocumentData): Promise<NoteComparisonItem[]> {
    // 1. Run deterministic checks first
    const items = compareNoteToDocument(noteText, documentData);

    // 2. If AI_PROVIDER is sarvam, run semantic consistency checks via Sarvam completions
    try {
        const { AI_PROVIDER, MODEL_SARVAM_TEXT } = await import('../config/modelConfig');
        if (AI_PROVIDER === 'sarvam') {
            const { getSarvamTextClient } = await import('./apiKeys');
            const client = getSarvamTextClient();
            const model = client.getGenerativeModel({ model: MODEL_SARVAM_TEXT });

            const prompt = `You are a clinical consistency auditor. Compare the treating doctor's clinical notes against the structured document evidence.
Check for discrepancies in patient identity, diagnoses, symptoms, treatments, or cost parameters.

Clinical Notes:
"""
${noteText}
"""

Extracted Document Evidence:
- Patient Name: ${documentData.patient?.patientName || 'Not Extracted'}
- Age: ${documentData.patient?.age || 'Not Extracted'}
- Gender: ${documentData.patient?.gender || 'Not Extracted'}
- Insurer Name: ${documentData.insurance?.insurerName || 'Not Extracted'}
- Policy Number: ${documentData.insurance?.policyNumber || 'Not Extracted'}

Identify any direct contradictions, conflicts, or mismatches. Return a JSON array of mismatch objects.
Each object MUST strictly contain:
- "field": the field name (e.g., "patient_name", "diagnosis", "treatment", "insurer_name", "policy_number")
- "status": "mismatch"
- "note_value": the value stated in the clinical note
- "document_value": the value in the document evidence
- "reason": clear description of the contradiction

Format output ONLY as valid JSON array. Do not wrap in markdown block (do not use \`\`\`json). If there are no mismatches, return [].`;

            const response = await model.generateContent([{ text: prompt }], { forceJson: true });
            const text = response.response.text().trim();
            const aiMismatches = JSON.parse(text);
            if (Array.isArray(aiMismatches)) {
                for (const mismatch of aiMismatches) {
                    const existingIdx = items.findIndex(item => item.field === mismatch.field);
                    if (existingIdx !== -1) {
                        items[existingIdx] = {
                            field: mismatch.field,
                            status: 'mismatch',
                            note_value: mismatch.note_value || items[existingIdx].note_value,
                            document_value: mismatch.document_value || items[existingIdx].document_value
                        };
                    } else {
                        items.push({
                            field: mismatch.field,
                            status: 'mismatch',
                            note_value: mismatch.note_value || null,
                            document_value: mismatch.document_value || null
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.warn("[noteDocumentComparison] Sarvam consistency comparison failed, falling back to deterministic:", e);
    }

    return items;
}
