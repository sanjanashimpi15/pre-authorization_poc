/**
 * config/icd10Database.ts  — compatibility shim
 *
 * The original icd10Database.ts (which contained a 255-condition enriched dataset)
 * was merged into data/icd10Codes.json and deleted as redundant.
 * This shim recreates the public API surface that hooks/useICDSuggestion,
 * services/medicalNecessityService, and components/PreAuthWizard/AdmissionCostStep
 * still import, bridging to the surviving icd_costs_database.json (100 conditions)
 * plus the live icdService for code lookup.
 *
 * If a richer enrichment is needed for a condition (admission_criteria, etc.) you
 * can add it to the ICDCondition objects below; all callers guard with ?? [] / ?? false.
 */

import icdCostsRaw from './icd_costs_database.json';
import { lookupICD } from '../services/icdService';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ICDCondition {
    icd_code: string;
    condition_name: string;
    specialty: string;
    is_surgical: boolean;
    los: {
        typical: number;     // avg LOS in days
        icu_days: number;    // ICU days
        min: number;
        max: number;
    };
    pmjay_eligible: boolean;
    pmjay_package?: {
        hbp_code: string;
        package_name?: string;
        package_rate_inr: number;
    };
    admission_criteria: string[];
    expected_procedures: string[];
    tpa_query_triggers: string[];
    must_include_docs: string[];
}

export interface ICDSuggestion {
    condition: ICDCondition;
    matchScore: number;
}

// ── Internal data layer ───────────────────────────────────────────────────────

type RawCondition = {
    id: string;
    icd_code: string;
    condition: string;
    specialty: string;
    is_surgical: boolean;
    los: { min: number; max: number; avg: number; icu: number };
    pmjay: { eligible: boolean; hbp_code?: string; rate?: number };
    private: Record<string, number>;
};

function mapCondition(raw: RawCondition): ICDCondition {
    return {
        icd_code: raw.icd_code,
        condition_name: raw.condition,
        specialty: raw.specialty,
        is_surgical: raw.is_surgical,
        los: {
            typical: raw.los.avg,
            icu_days: raw.los.icu,
            min: raw.los.min,
            max: raw.los.max,
        },
        pmjay_eligible: raw.pmjay.eligible,
        pmjay_package: raw.pmjay.eligible && raw.pmjay.hbp_code
            ? {
                hbp_code: raw.pmjay.hbp_code,
                package_name: raw.condition,
                package_rate_inr: raw.pmjay.rate ?? 0,
            }
            : undefined,
        // Enrichment fields not in icd_costs_database — return safe defaults
        admission_criteria: [],
        expected_procedures: [],
        tpa_query_triggers: [],
        must_include_docs: [],
    };
}

const CONDITIONS: ICDCondition[] = (
    (icdCostsRaw as any).conditions as RawCondition[]
).map(mapCondition);

// ── Exported API ──────────────────────────────────────────────────────────────

/** Look up a condition by its ICD-10 code (case-insensitive). */
export function getConditionByCode(code: string): ICDCondition | undefined {
    if (!code) return undefined;
    const upper = code.toUpperCase();
    return CONDITIONS.find(c => c.icd_code.toUpperCase() === upper);
}

/** Fuzzy-match a condition by name/diagnosis text. */
export function getConditionByName(name: string): ICDCondition | undefined {
    if (!name) return undefined;
    const q = name.toLowerCase();
    // Exact match first
    const exact = CONDITIONS.find(c => c.condition_name.toLowerCase() === q);
    if (exact) return exact;
    // Contains match
    return CONDITIONS.find(c => c.condition_name.toLowerCase().includes(q) || q.includes(c.condition_name.toLowerCase().split(' ').slice(0, 2).join(' ')));
}

/**
 * Suggest conditions matching a free-text query.
 * Returns at most `limit` results sorted by match quality.
 */
export function suggestICD(query: string, limit = 10): ICDSuggestion[] {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();

    // Score each condition
    const scored = CONDITIONS.map(c => {
        const name = c.condition_name.toLowerCase();
        const code = c.icd_code.toLowerCase();
        let score = 0;
        if (code === q) score = 100;
        else if (name === q) score = 95;
        else if (code.startsWith(q)) score = 80;
        else if (name.startsWith(q)) score = 75;
        else if (name.includes(q)) score = 60;
        else if (code.includes(q)) score = 50;
        else {
            // Word-level partial match
            const words = q.split(/\s+/).filter(Boolean);
            const matchedWords = words.filter(w => name.includes(w) || code.includes(w));
            score = matchedWords.length > 0 ? (matchedWords.length / words.length) * 40 : 0;
        }
        return { condition: c, matchScore: score };
    });

    return scored
        .filter(s => s.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit);
}

export interface ICD10Entry {
    code: string;
    description: string;
    commonName?: string;
    specialty?: string;
}

export function searchICD10(query: string): ICD10Entry[] {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const seen = new Set<string>();
    const results: ICD10Entry[] = [];
    
    for (const c of CONDITIONS) {
        const hit = c.icd_code.toLowerCase().includes(q)
            || c.condition_name.toLowerCase().includes(q)
            || c.specialty.toLowerCase().includes(q);
            
        if (hit && !seen.has(c.icd_code)) {
            seen.add(c.icd_code);
            results.push({
                code: c.icd_code,
                description: c.condition_name,
                commonName: c.condition_name,
                specialty: c.specialty
            });
        }
        if (results.length >= 12) break;
    }
    return results;
}

