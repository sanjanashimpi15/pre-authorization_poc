/**
 * Feedback loop helper for the NEXUS TPA Review pilot.
 * Stores events in localStorage under 'nexus_feedback_logs' to track review efficacy.
 */
export function logFeedbackEvent(caseId: string, eventType: 'submitted_insufficient' | 'queried_insufficient' | 'approved_insufficient', details?: any) {
  const logPrefix = `[NEXUS FEEDBACK LOOP]`;
  console.log(`${logPrefix} Case ID: ${caseId} | Event: ${eventType}`, details || '');

  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const logs = JSON.parse(localStorage.getItem('nexus_feedback_logs') || '[]');
    logs.push({
      caseId,
      eventType,
      details,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('nexus_feedback_logs', JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to save feedback log:', e);
  }
}
