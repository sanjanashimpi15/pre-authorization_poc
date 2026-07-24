import { getGoogleGenerativeAIClient, getOpenRouterClient } from './apiKeys';
import { MODEL_DOCUMENT, MODEL_DOCUMENT_OPENROUTER, AI_PROVIDER } from '../config/modelConfig';
import { classifyGeminiError } from '../utils/geminiErrorClassifier';

/**
 * The 8 categories we classify into before running full extraction.
 * Keep this list in sync with `document_type` in documentExtractionService.ts.
 */
export const DOCUMENT_CATEGORIES = [
    'hospital_registration',
    'insurance_card',
    'policy_document',
    'id_card',
    'lab_report',
    'prescription',
    'discharge_summary',
    'investigation_report',
] as const;

export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number] | 'unknown';

export interface ClassificationResult {
    category: DocumentCategory;
    confidence: number; // 0-1
    reasoning?: string;
}

// Confidence below this triggers "needs manual review" instead of auto-extraction.
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.6;

const FEW_SHOT_EXAMPLES = `
Examples:

Text: "STAR HEALTH AND ALLIED INSURANCE CO LTD - Policy No: P/123456 - Sum Insured: 5,00,000 - Valid till 2027"
{"category": "insurance_card", "confidence": 0.95, "reasoning": "Contains policy number, insurer name, and sum insured — a policy/insurance identity card."}

Text: "COMPLETE BLOOD COUNT - Hemoglobin: 13.2 g/dL - WBC: 7200/uL - Platelet count: 250000/uL"
{"category": "lab_report", "confidence": 0.97, "reasoning": "Structured lab values with units — a diagnostic lab report."}

Text: "Rx: Tab. Metformin 500mg BD, Tab. Atorvastatin 10mg OD x 30 days"
{"category": "prescription", "confidence": 0.93, "reasoning": "Drug names, dosages, and frequency — a prescription."}

Text: "ABC HOSPITAL - PATIENT REGISTRATION FORM - UHID: 000123 - Admission Date: 12/03/2026"
{"category": "hospital_registration", "confidence": 0.9, "reasoning": "UHID and admission fields are hospital intake form markers."}

Text: "asdkj 23kljasd blurry scan unclear text fragments"
{"category": "unknown", "confidence": 0.15, "reasoning": "Text is largely unreadable/garbled, no identifiable document markers."}
`;

const CLASSIFICATION_PROMPT_TEMPLATE = (docText: string) => `
You are a document classifier for an Indian hospital/TPA insurance workflow.
Classify the following document into EXACTLY ONE of these categories:
${DOCUMENT_CATEGORIES.join(', ')}, or "unknown" if it clearly doesn't fit any of them.

Respond with confidence 0-1 reflecting how certain you are the category is correct
given the visible text/structure. Use LOW confidence (below 0.5) if the document is
blurry, garbled, mostly empty, cut off, or ambiguous between categories.

${FEW_SHOT_EXAMPLES}

Return ONLY valid JSON (no markdown fences, no preamble) in this exact shape:
{"category": "<one of the categories above>", "confidence": <0-1 number>, "reasoning": "<one short sentence>"}

Document to classify:
${docText}
`;

/**
 * Cheap, fast, temperature-0 classification pass. Intended to run BEFORE the
 * full extraction prompt so we can bail out early (and cheaply) on documents
 * that are the wrong type, unreadable, or otherwise low-confidence — instead
 * of silently running the expensive extraction prompt and populating a form
 * with garbage.
 *
 * For images/PDFs we pass the same inline multimodal payload as extraction
 * (a single fast pass over the document); for plain text we just pass the text.
 */
export async function classifyDocument(
    file: File
): Promise<ClassificationResult> {
    const isText = file.type === 'text/plain' || file.name.endsWith('.txt');

    try {
        const client = getGoogleGenerativeAIClient();
        const model = client.getGenerativeModel({
            model: MODEL_DOCUMENT,
            generationConfig: { temperature: 0 },
        } as any);

        let payload: any[];

        if (isText) {
            const arrBuf = await file.arrayBuffer();
            const textContent = new TextDecoder('utf-8').decode(new Uint8Array(arrBuf));
            payload = [CLASSIFICATION_PROMPT_TEMPLATE(textContent)];
        } else {
            const base64Data = await fileToBase64(file);
            payload = [
                CLASSIFICATION_PROMPT_TEMPLATE('(see attached document)'),
                { inlineData: { data: base64Data, mimeType: file.type } },
            ];
        }

        const result = await model.generateContent(payload);
        const responseText = result.response.text().trim();

        let jsonStr = responseText;
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
        }

        const parsed = JSON.parse(jsonStr);
        const category: DocumentCategory = DOCUMENT_CATEGORIES.includes(parsed.category)
            ? parsed.category
            : 'unknown';
        const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));

        return { category, confidence, reasoning: parsed.reasoning };
    } catch (error: any) {
        const kind = classifyGeminiError(error);
        if (kind === 'quota_exceeded' || kind === 'service_unavailable') {
            // Distinct from a genuinely low-confidence document — the caller needs to
            // know Gemini itself is unavailable, not silently treat this as "unreadable".
            console.error('[documentClassificationService] Gemini unavailable:', error);
            const taggedError: any = new Error(error?.message || 'Gemini classification call failed.');
            taggedError.geminiErrorKind = kind;
            throw taggedError;
        }
        console.error('[documentClassificationService] Classification failed:', error);
        // Fail closed: treat other classification errors as "needs manual review",
        // never silently proceed to extraction.
        return { category: 'unknown', confidence: 0, reasoning: 'Classification call failed.' };
    }
}

export interface PageClassification {
    document_type: DocumentCategory;
    confidence: number; // 0-1
}

// Ordered most-distinctive-first so a page matching multiple categories' keywords
// lands on the more specific one (e.g. "report" alone would false-positive on almost
// anything, so Lab Report is checked last).
const PAGE_KEYWORD_RULES: Array<{ label: string; keywords: string[] }> = [
    { label: 'ID Card', keywords: ['aadhaar', 'government of india', 'unique identification'] },
    { label: 'Prescription', keywords: ['prescription', 'medication', 'dosage'] },
    { label: 'Clinical/Discharge', keywords: ['discharge summary', 'diagnosis', 'admission'] },
    { label: 'Progress Notes', keywords: ['progress notes', 'clinical findings'] },
    { label: 'Insurance Form', keywords: ['policy number', 'insured', 'sum insured', 'tpa'] },
    { label: 'Lab Report', keywords: ['investigation', 'lab', 'report'] },
];

/**
 * Deterministic, zero-AI-call page classifier — keyword/pattern matching over
 * already-captured OCR text. No network call, cannot fail live, near-instant.
 * Same output shape as classifyPagesBatch (the AI version it replaces at the call
 * site in documentExtractionService.ts) so all downstream wiring is unaffected.
 */
export function classifyPagesByKeywords(ocrPages: Record<string, string>): Record<number, { document_type: string; confidence: number }> {
    const out: Record<number, { document_type: string; confidence: number }> = {};

    for (const [pageStr, text] of Object.entries(ocrPages)) {
        const page = Number(pageStr);
        if (!Number.isFinite(page)) continue;
        const lower = (text || '').toLowerCase();

        let matched: { label: string; hitCount: number } | null = null;
        for (const rule of PAGE_KEYWORD_RULES) {
            const hitCount = rule.keywords.filter(kw => lower.includes(kw)).length;
            if (hitCount > 0) {
                matched = { label: rule.label, hitCount };
                break; // first matching rule wins — rules are ordered most-distinctive-first
            }
        }

        out[page] = matched
            ? { document_type: matched.label, confidence: matched.hitCount >= 2 ? 0.9 : 0.7 }
            : { document_type: 'Unclassified', confidence: 0 };
    }

    return out;
}

const PAGE_BATCH_CLASSIFICATION_PROMPT = (pagesText: string) => `
You are a document classifier for an Indian hospital/TPA insurance workflow.
Below is OCR text from MULTIPLE pages of one uploaded file. Pages may belong to
different underlying document types (e.g. a patient form, then a lab report,
then an ID card) — classify EACH page independently into EXACTLY ONE of these
categories: ${DOCUMENT_CATEGORIES.join(', ')}, or "unknown" if a page clearly
doesn't fit any of them (this includes pages that are photos/images with little
or no readable text — classify those as "unknown" with low confidence rather
than guessing).

Return ONLY valid JSON (no markdown fences, no preamble): an array with one
object per page, in this exact shape:
[{"page": <page number>, "document_type": "<category>", "confidence": <0-1 number>}, ...]

Pages:
${pagesText}
`;

/**
 * Lightweight, additive per-page classification pass. Reuses OCR text already
 * captured in ocrPages — no new OCR/multimodal calls, one batched text-only
 * call for the whole document regardless of page count. Best-effort: any
 * failure here must never block or alter the existing whole-document
 * classification/extraction pipeline, so callers should treat a thrown error
 * as "no per-page data available" rather than a fatal error.
 */
export async function classifyPagesBatch(
    ocrPages: Record<string, string>
): Promise<Record<number, PageClassification>> {
    const pageNumbers = Object.keys(ocrPages).map(Number).sort((a, b) => a - b);
    if (pageNumbers.length === 0) return {};

    const pagesText = pageNumbers
        .map(p => `--- Page ${p} ---\n${(ocrPages[String(p)] || '').slice(0, 3000)}`)
        .join('\n\n');

    const client = AI_PROVIDER === 'openrouter' ? getOpenRouterClient() : getGoogleGenerativeAIClient();
    const model = client.getGenerativeModel({ model: AI_PROVIDER === 'openrouter' ? MODEL_DOCUMENT_OPENROUTER : MODEL_DOCUMENT });

    const result = await model.generateContent(
        [{ text: PAGE_BATCH_CLASSIFICATION_PROMPT(pagesText) }],
        { forceJson: AI_PROVIDER === 'openrouter', maxTokens: 2048 }
    );
    const responseText = result.response.text().trim();

    let jsonStr = responseText;
    if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error('classifyPagesBatch: expected a JSON array response.');

    const out: Record<number, PageClassification> = {};
    for (const entry of parsed) {
        const page = Number(entry?.page);
        if (!Number.isFinite(page)) continue;
        const category: DocumentCategory = DOCUMENT_CATEGORIES.includes(entry?.document_type)
            ? entry.document_type
            : 'unknown';
        out[page] = {
            document_type: category,
            confidence: Math.max(0, Math.min(1, Number(entry?.confidence ?? 0))),
        };
    }
    return out;
}

async function fileToBase64(f: File): Promise<string> {
    if (typeof FileReader === 'undefined') {
        const arrBuf = await f.arrayBuffer();
        const bytes = new Uint8Array(arrBuf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(f);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
    });
}