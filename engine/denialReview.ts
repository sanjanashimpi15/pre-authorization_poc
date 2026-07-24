import { analyzeDenialEOB, DenialAnalysis } from '../services/geminiService';

export interface DenialItem {
    id: string;
    patientName: string;
    policyNumber: string;
    tpaName: string;
    insurerName: string;
    claimAmount: number;
    denialDate: string;
    eobText: string;
    // Analysis results
    analysis?: DenialAnalysis;
    priorityScore?: number;
    status: 'Pending Review' | 'Appeal Generated' | 'Appeal Submitted' | 'Claim Overturned' | 'Claim Sustained';
    daysSinceDenial: number;
}

export const MOCK_DENIALS: DenialItem[] = [
    {
        id: "DEN-2026-001",
        patientName: "Arun Mehra",
        policyNumber: "POL-77182-9",
        tpaName: "Medi Assist TPA",
        insurerName: "Star Health Insurance",
        claimAmount: 85000,
        denialDate: "2026-07-01",
        daysSinceDenial: 4,
        status: "Pending Review",
        eobText: `CLAIM REJECTION ADVICE
Insurer: Star Health / TPA: Medi Assist
We regret to inform you that the cashless claim request for patient Arun Mehra has been rejected.
REASON FOR REJECTION: Pre-existing Disease (PED) Exclusion - Clause 3.2.
Auditor Observations: Clinical charts show history of Diabetes Mellitus Type 2. The policy waiting period for Pre-Existing Diseases is 36 months. Since this policy is in its 18th month, the claim is disallowed in full.
Financial Summary: Total Disallowed: INR 85,000.`
    },
    {
        id: "DEN-2026-002",
        patientName: "Sushma Swaraj",
        policyNumber: "POL-99281-2",
        tpaName: "Paramount Health Services TPA",
        insurerName: "HDFC Ergo",
        claimAmount: 220000,
        denialDate: "2026-06-25",
        daysSinceDenial: 10,
        status: "Pending Review",
        eobText: `EXPLANATION OF BENEFITS / REJECTION DETAIL
Payer Ref: HDFC Ergo / Paramount TPA
Procedure: Total Knee Replacement (TKR) Unilateral - patient Sushma Swaraj.
Verdict: Claim Denied.
Justification: Medical Necessity not established. Clinical records fail to document any trial of conservative therapies (such as physiotherapy, intra-articular injections, or long-term NSAID medication) before electing for major knee replacement surgery.
Disallowed Amount: INR 2,20,000.`
    },
    {
        id: "DEN-2026-003",
        patientName: "Karan Johar",
        policyNumber: "POL-88273-0",
        tpaName: "MDIndia Health Insurance TPA",
        insurerName: "Niva Bupa",
        claimAmount: 32000,
        denialDate: "2026-07-03",
        daysSinceDenial: 2,
        status: "Pending Review",
        eobText: `DISALLOWANCE REPORT
MDIndia TPA / Niva Bupa Co.
Claim ref: Karan Johar, admitted for Acute Gastroenteritis.
Disallowed Item: Full Room Rent & Proportional Charges.
Reason: Room rent occupied (Private Ward at INR 6,000/day) exceeds the policy capping limit of 1% of Sum Insured (Sum Insured is INR 3,00,000, capping room rent at INR 3,00,000 * 0.01 = INR 3,000/day).
Deduction Details: Proportional deduction of 50% applied to all diagnostic, doctor fees, and nursing charges.
Amount Deducted: INR 32,000.`
    }
];

export const calculatePriorityScore = (claimAmount: number, overturnProbability: number, daysSinceDenial: number): number => {
    // Priority Score = (Claim Amount * Overturn Probability) / (Days Since Denial + 1)
    // We multiply overturn probability to prioritize high-value claims we can actually win
    // We divide by days since denial to highlight newer denials or we can configure it to raise priority for older ones.
    // Let's make older claims have higher urgency:
    // UrgencyMultiplier = 1 + (daysSinceDenial * 0.1)
    const urgencyMultiplier = 1 + (daysSinceDenial * 0.05);
    return Math.round(claimAmount * overturnProbability * urgencyMultiplier);
};

export const runDenialReview = async (denial: DenialItem): Promise<DenialItem> => {
    const analysis = await analyzeDenialEOB(denial.eobText);
    const score = calculatePriorityScore(denial.claimAmount, analysis.overturnProbability, denial.daysSinceDenial);
    
    return {
        ...denial,
        analysis,
        priorityScore: score
    };
};

export const runAllDenialReviews = async (denials: DenialItem[]): Promise<DenialItem[]> => {
    const reviewed = await Promise.all(denials.map(d => runDenialReview(d)));
    // Sort by priority score descending
    return reviewed.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
};
