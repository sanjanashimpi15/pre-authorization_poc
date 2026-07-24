/**
 * engine/claimHealthScanner.ts
 *
 * Claim Health Layer - Proactive Claim Risk Monitoring
 * Continuously evaluates claims in the background before submission
 * to predict outcomes and flag missing documentation early.
 */

import { PreAuthRecord } from '../components/PreAuthWizard/types';
import { EvidenceReviewReport } from './evidenceReview';

export interface ClaimHealthScore {
    overallReadiness: number; // 0-100
    approvalProbability: number; // 0-100%
    riskFactors: string[];
    criticalGaps: string[];
    lastScannedAt: string;
}

/**
 * Simulates a background worker scanning an active claim for risks.
 */
export async function scanClaimRiskBackground(
    record: PreAuthRecord, 
    latestReviewReport?: EvidenceReviewReport
): Promise<ClaimHealthScore> {
    
    let approvalProbability = 90; // Base probability
    const riskFactors: string[] = [];
    const criticalGaps: string[] = [];
    
    // 1. Missing Document Risks
    if (latestReviewReport && latestReviewReport.missingEvidence) {
        latestReviewReport.missingEvidence.forEach(gap => {
            if (gap.impact === 'blocker') {
                approvalProbability -= 15;
                criticalGaps.push(gap.item);
            } else {
                approvalProbability -= 5;
                riskFactors.push(gap.item);
            }
        });
    }

    // 2. High-Risk TPA / History Checks
    if (record.insurance?.tpaName?.toLowerCase().includes("medi assist")) {
        // Example logic: certain TPAs are historically stricter on certain diagnoses
        if (record.clinical?.diagnoses?.some(d => d.icd10Code?.startsWith('H'))) {
            riskFactors.push("TPA has high denial rate for Cataract day-care without visual acuity charts.");
            approvalProbability -= 10;
        }
    }

    // 3. Proportional Deduction Risk
    const sumInsured = record.insurance?.sumInsured || 500000;
    const roomRentRequested = 8000; // Mocked value
    const normalCap = sumInsured * 0.01;
    
    if (roomRentRequested > normalCap) {
        riskFactors.push(`Room rent (₹${roomRentRequested}) exceeds 1% cap (₹${normalCap}). Proportional deductions highly likely.`);
    }

    // Bound probability 0-100
    approvalProbability = Math.max(0, Math.min(100, approvalProbability));
    
    // Readiness is a function of missing gaps
    const overallReadiness = Math.max(0, 100 - (criticalGaps.length * 20) - (riskFactors.length * 5));

    return {
        overallReadiness,
        approvalProbability,
        riskFactors,
        criticalGaps,
        lastScannedAt: new Date().toISOString()
    };
}

/**
 * A mock cron-job wrapper that would run this across all active pending claims.
 */
export async function runBackgroundFleetScan(activeRecords: PreAuthRecord[]): Promise<void> {
    for (const record of activeRecords) {
        const score = await scanClaimRiskBackground(record);
        console.log(`[ClaimHealth] Case ${record.id} -> Probability: ${score.approvalProbability}%. Gaps: ${score.criticalGaps.length}`);
        
        // In a real system, we would persist this to the DB and broadcast via WebSockets to the UI
    }
}
