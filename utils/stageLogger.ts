/**
 * stageLogger.ts
 *
 * Lightweight, privacy-safe logger to record the timestamp when a case
 * reaches specific stages. Used for bottleneck/delay analysis.
 * Stores entries in localStorage in a simple array that can easily be
 * formatted as CSV for export.
 *
 * Guaranteed NO PII (patient identifying information) is logged here —
 * strictly caseId, stage, and timestamp.
 */

const STAGE_LOG_KEY = 'aivana_stage_timestamps';

export type CaseStage =
  | 'documents_uploaded'
  | 'ai_review_complete'
  | 'submitted'
  | 'submission_unconfirmed'
  | 'response_received'
  | 'final_outcome_approved'
  | 'final_outcome_denied';

export interface StageLogEntry {
  caseId: string;
  stage: CaseStage;
  timestamp: string; // ISO String
}

export function logStageTimestamp(caseId: string, stage: CaseStage): void {
  try {
    if (typeof localStorage === 'undefined') {
      console.log(`[StageLogger] [Mock/SSR Storage] Recorded stage: "${stage}" for case: "${caseId}"`);
      return;
    }
    const raw = localStorage.getItem(STAGE_LOG_KEY);
    const logs: StageLogEntry[] = raw ? JSON.parse(raw) : [];
    
    logs.push({
      caseId,
      stage,
      timestamp: new Date().toISOString()
    });
    
    localStorage.setItem(STAGE_LOG_KEY, JSON.stringify(logs));
    console.log(`[StageLogger] Recorded stage: "${stage}" for case: "${caseId}"`);
  } catch (e) {
    console.error('[StageLogger] Failed to record stage timestamp:', e);
  }
}

/**
 * Returns all stage logs.
 */
export function getStageLogs(): StageLogEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STAGE_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Formats all stage logs as a raw CSV string.
 */
export function exportStageLogsCSV(): string {
  const logs = getStageLogs();
  const headers = ['CaseID', 'Stage', 'Timestamp'];
  const rows = logs.map(l => [l.caseId, l.stage, l.timestamp]);
  
  return [
    headers.join(','),
    ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
  ].join('\n');
}
