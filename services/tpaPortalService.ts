/**
 * tpaPortalService.ts
 *
 * Simulated transactional service integration for submitting claims
 * and appeals directly to TPA and insurer portals.
 *
 * Checks for a confirmation receipt / reference ID.
 * Returns failure if the record ID or patient name contains "fail" for testing.
 */

import { PreAuthRecord } from '../components/PreAuthWizard/types';

export interface TpaSubmissionResult {
    success: boolean;
    receiptId?: string;
    error?: string;
}

export async function submitPreAuthToTPA(record: PreAuthRecord): Promise<TpaSubmissionResult> {
    // Simulate API request network latency
    await new Promise(resolve => setTimeout(resolve, 1500));

    const checkText = `${record.id} ${record.patient?.patientName || ''}`.toLowerCase();
    
    // Explicit failure mode triggered during testing/verification
    if (checkText.includes('fail')) {
        return {
            success: false,
            error: 'TPA Portal Gateway Timeout (504): Verification check failed to retrieve response. Insurer backend unresponsive.'
        };
    }

    return {
        success: true,
        receiptId: `TPA-REC-${Math.floor(100000 + Math.random() * 900000)}`
    };
}
