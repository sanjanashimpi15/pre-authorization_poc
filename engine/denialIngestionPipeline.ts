/**
 * engine/denialIngestionPipeline.ts
 *
 * Aegis Health Layer - Denial Ingestion & Outcome Tracking
 * 
 * Simulates connecting directly to payer portals to pull denial letters,
 * and tracking appeal outcomes to learn from previous successes/failures.
 */

export interface DenialLetter {
    letterId: string;
    preAuthRef: string;
    patientName: string;
    tpaName: string;
    denialDate: string;
    rawText: string;
    extractedReasons: string[];
}

export interface AppealOutcomeRecord {
    appealId: string;
    preAuthRef: string;
    tpaName: string;
    denialReasons: string[];
    citedEvidence: string[];
    outcome: 'successful' | 'partial_success' | 'failed' | 'pending';
    amountRecovered: number;
    lessonsLearned?: string[];
}

// Mock Database for tracked outcomes
const outcomeDatabase: AppealOutcomeRecord[] = [];

/**
 * Connects to a simulated payer portal and pulls new denial letters.
 */
export async function pullDenialLettersFromPortal(tpaName: string): Promise<DenialLetter[]> {
    console.log(`[DenialIngestionPipeline] Connecting to ${tpaName} portal...`);
    
    // Simulate network delay and RPA/API fetching
    await new Promise(resolve => setTimeout(resolve, 1500));

    return [
        {
            letterId: `DEN-${Date.now()}`,
            preAuthRef: "PA-10029",
            patientName: "Rahul Sharma",
            tpaName: tpaName,
            denialDate: new Date().toISOString(),
            rawText: "The claim is denied because the hospital stay is not medically necessary for the stated diagnosis. Missing positive NS1 antigen test for Dengue.",
            extractedReasons: [
                "Hospital stay not medically necessary",
                "Missing positive NS1 antigen test"
            ]
        }
    ];
}

/**
 * Tracks the outcome of an appeal for continuous learning.
 */
export async function trackAppealOutcome(record: AppealOutcomeRecord): Promise<void> {
    outcomeDatabase.push(record);
    console.log(`[OutcomeTracker] Appeal ${record.appealId} outcome logged: ${record.outcome}`);
    
    if (record.outcome === 'successful') {
        // Here we could trigger a background job to reinforce the Qwen prompt 
        // with this successful appeal as a few-shot example.
        console.log(`[OutcomeTracker] Learning: Successful appeal for reasons: ${record.denialReasons.join(', ')}`);
    }
}

/**
 * Retrieves past successful arguments for a specific TPA and denial reason.
 */
export function getLearnedLessonsForDenial(tpaName: string, denialReasonKeyword: string): string[] {
    return outcomeDatabase
        .filter(record => 
            record.tpaName === tpaName && 
            record.outcome === 'successful' &&
            record.denialReasons.some(r => r.toLowerCase().includes(denialReasonKeyword.toLowerCase()))
        )
        .flatMap(record => record.citedEvidence);
}
