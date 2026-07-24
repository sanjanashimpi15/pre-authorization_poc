/**
 * engine/continuousLearningLoop.ts
 *
 * Taiga Layer - Continuous Learning Loop
 * Captures human corrections to AI-suggested ICD-10 and CPT codes
 * and stores them to be used as few-shot prompt injections in future runs.
 */

export interface CodeCorrection {
    caseId: string;
    originalAiCode: string;
    humanCorrectedCode: string;
    clinicalContext: string; // Key terms from the clinical note
    reasonForCorrection?: string;
    timestamp: string;
}

// In-memory cache for fast, synchronous prompt injection
let fewShotDatabase: CodeCorrection[] = [];

/**
 * Initializes the learning loop by syncing all past corrections from the SQLite database.
 */
export async function syncCorrectionsFromDb(): Promise<void> {
    try {
        const res = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getAllCorrections' })
        });
        if (res.ok) {
            const data = await res.json();
            if (data && data.corrections) {
                fewShotDatabase = data.corrections;
                console.log(`[Taiga Learning Loop] Synced ${fewShotDatabase.length} corrections from SQLite.`);
            }
        }
    } catch (err) {
        console.error("Failed to sync corrections from SQLite database:", err);
    }
}

// Trigger initial sync in browser context
if (typeof window !== 'undefined') {
    syncCorrectionsFromDb();
}

/**
 * Endpoint to capture a human correction.
 * Triggered when a medical coder overrides the AI's suggestion in the UI.
 */
export async function captureCodingCorrection(correction: Omit<CodeCorrection, 'timestamp'>): Promise<void> {
    const entry: CodeCorrection = {
        ...correction,
        timestamp: new Date().toISOString()
    };
    
    fewShotDatabase.push(entry);
    console.log(`[Taiga Learning Loop] Captured correction for case ${entry.caseId}: ${entry.originalAiCode} -> ${entry.humanCorrectedCode}`);
    
    try {
        await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'saveCorrection',
                args: entry
            })
        });
    } catch (err) {
        console.error("Failed to save correction to SQLite database:", err);
    }
}

/**
 * Retrieves relevant few-shot examples for the Qwen prompt based on the current clinical context.
 */
export function getFewShotExamplesForPrompt(clinicalNote: string): string[] {
    const noteLower = clinicalNote.toLowerCase();
    
    // Simple heuristic: find past corrections that share keywords with the current note
    const relevantCorrections = fewShotDatabase.filter(c => {
        if (!c.clinicalContext) return false;
        const keywords = c.clinicalContext.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        return keywords.length > 0 ? keywords.some(kw => noteLower.includes(kw)) : false;
    });

    return relevantCorrections.map(c => 
        `Example: Clinical Context: "${c.clinicalContext}". Incorrect AI Code: ${c.originalAiCode}. Correct Human Code: ${c.humanCorrectedCode}.`
    );
}
