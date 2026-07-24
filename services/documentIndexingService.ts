/**
 * services/documentIndexingService.ts
 *
 * Builds the page index and evidence map for the Intelligent Document Processing
 * pipeline (Screen 3). Consumes results already produced by documentClassificationService
 * and documentExtractionService — does not make any additional AI calls.
 */

import { isEvidenceCitationPlausible } from './evidenceGroundingService';
import { ExtractedPatientData } from './documentExtractionService';
import { DocumentPageEntry, EvidenceMapEntry } from './masterPatientRecord';

export function summarizeOcrText(text: string, maxLen = 140): string {
    const cleaned = (text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '(no readable text detected on this page)';
    if (cleaned.length <= maxLen) return cleaned;
    return cleaned.slice(0, maxLen).trim() + '…';
}

/**
 * Builds one page-index entry per OCR'd page of a document.
 * thumbnails[i] is expected to correspond to page (i + 1).
 */
export function buildPageIndexForDocument(params: {
    documentName: string;
    documentType: string;
    docConfidence: number; // 0-1
    ocrPages: Record<string, string>;
    thumbnails?: string[];
    // Optional per-page classification results (see classifyPagesBatch). When a page
    // has an entry here, it's used instead of the blanket whole-document `documentType`.
    // Pages with no entry (or when this param is omitted entirely) fall back to the
    // existing blanket-type behavior — fully backward-compatible.
    pageDocumentTypes?: Record<number, string>;
}): DocumentPageEntry[] {
    const { documentName, documentType, docConfidence, ocrPages, thumbnails, pageDocumentTypes } = params;
    const pageNumbers = Object.keys(ocrPages).map(Number).sort((a, b) => a - b);

    return pageNumbers.map(pageNumber => ({
        pageNumber,
        documentName,
        documentType: pageDocumentTypes?.[pageNumber] ?? documentType,
        ocrConfidence: docConfidence,
        summary: summarizeOcrText(ocrPages[String(pageNumber)]),
        thumbnailUrl: thumbnails?.[pageNumber - 1],
    }));
}

/**
 * Finds which page's OCR text plausibly contains the given field value, reusing
 * the same citation-overlap heuristic Aegis uses for appeal evidence grounding.
 * Falls back to the document's first page if no page can be confidently matched.
 */
export function locateFieldPage(fieldValue: string, ocrPages: Record<string, string>): number {
    const pageNumbers = Object.keys(ocrPages).map(Number).sort((a, b) => a - b);
    for (const pageNumber of pageNumbers) {
        if (isEvidenceCitationPlausible(fieldValue, ocrPages[String(pageNumber)])) {
            return pageNumber;
        }
    }
    return pageNumbers[0] ?? 1;
}

const EXTRACTED_FIELDS: Array<{ label: string; get: (d: ExtractedPatientData) => string | number | null | undefined }> = [
    { label: 'Patient Name', get: d => d.patient?.name },
    { label: 'Age / DOB', get: d => d.patient?.age },
    { label: 'Gender', get: d => d.patient?.gender },
    { label: 'Contact Number', get: d => d.patient?.phone },
    { label: 'Address', get: d => d.patient?.address },
    { label: 'Insurance Company', get: d => d.insurance?.insurance_company },
    { label: 'TPA Name', get: d => d.insurance?.tpa_name },
    { label: 'Policy Number', get: d => d.insurance?.policy_number },
    { label: 'Sum Insured', get: d => d.insurance?.sum_insured },
];

/**
 * Every field the extraction pipeline populated gets one evidence-map entry
 * tying it back to the source document, page number, and confidence.
 */
export function buildEvidenceMapForDocument(params: {
    documentName: string;
    extracted: ExtractedPatientData;
    ocrPages: Record<string, string>;
    docConfidence: number; // 0-1
}): EvidenceMapEntry[] {
    const { documentName, extracted, ocrPages, docConfidence } = params;
    const entries: EvidenceMapEntry[] = [];

    for (const field of EXTRACTED_FIELDS) {
        const rawValue = field.get(extracted);
        if (rawValue === null || rawValue === undefined || rawValue === '') continue;
        const value = String(rawValue);
        entries.push({
            field: field.label,
            value,
            documentName,
            pageNumber: locateFieldPage(value, ocrPages),
            confidence: docConfidence,
        });
    }

    return entries;
}
