/**
 * Aivana Audit Log
 *
 * Append-only, immutable event log for all pre-auth case actions.
 *
 * Phase 1 (pilot): localStorage-backed.
 * Phase 2 (paid): swap the storage adapter below for a DB call
 *   without touching any call sites — the interface is stable.
 *
 * Every event includes a stable ID, timestamp, caseId, userId, and
 * a strongly-typed payload. Events must NEVER be deleted or edited.
 */

// Simple UUID generator fallback + native crypto support to avoid dependency resolution issues
const uuidv4 = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// ============================================
// TYPES
// ============================================

export type AuditEventType =
  | 'case_created'
  | 'icd_assigned'
  | 'icd_overridden'
  | 'evidence_reviewed'
  | 'part_c_generated'
  | 'submitted_sufficient'
  | 'submitted_insufficient'
  | 'tpa_response_received'
  | 'document_uploaded'
  | 'document_removed'
  | 'enhancement_reviewed';

export interface AuditEntry {
  id: string;          // uuid v4, stable across sessions
  caseId: string;
  eventType: AuditEventType;
  timestamp: string;   // ISO 8601, UTC
  userId: string;      // 'system' for now; real user IDs in Phase 1 auth
  payload: Record<string, unknown>;
}

// Payload types (documented but not enforced at runtime — type safety at call sites)
export interface IcdAssignedPayload {
  code: string;
  description: string;
  matchMethod: 'synonym' | 'exact' | 'contains' | 'ai_fallback';
  confidence: 'high' | 'medium' | 'low';
  diagnosisText: string;
}

export interface IcdOverriddenPayload {
  previousCode: string;
  newCode: string;
  diagnosisText: string;
  reason?: string;
}

export interface EvidenceReviewedPayload {
  status: 'sufficient' | 'insufficient';
  gapCount: number;
  mandatoryGapCount: number;
  insufficientItems: string[];
}

export interface SubmittedPayload {
  submittabilityStatus: 'complete' | 'pending_documents';
  icdCode: string;
  diagnosisName: string;
  missingItems?: string[];   // populated for submitted_insufficient
  totalEstimatedCost: number;
}

export interface TpaResponsePayload {
  tpaResponseStatus: 'approved' | 'denied' | 'query' | 'partial_approved';
  approvedAmount?: number;
  denialReason?: string;
  queryDetails?: string;
  respondedAt: string;
}

export interface EnhancementReviewedPayload {
  status: 'sufficient' | 'pending_documents';
  gapCount: number;
  insufficientItems: string[];
  originalApprovalRef: string;
  additionalAmountRequested: number;
}

// ============================================
// STORAGE ADAPTER
// (Replace this section for Phase 2 DB migration)
// ============================================

const STORAGE_KEY = 'aivana_audit_log';

function readAll(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AuditEntry[];
  } catch {
    console.error('[AuditLog] Failed to read audit log from localStorage.');
    return [];
  }
}

function persistAll(entries: AuditEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error('[AuditLog] Failed to persist audit log:', e);
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Appends an immutable event to the audit log.
 * Never throws — logs to console on storage failure.
 */
export function logEvent(
  caseId: string,
  eventType: AuditEventType,
  payload: Record<string, unknown>,
  userId = 'system'
): AuditEntry {
  const entry: AuditEntry = {
    id: uuidv4(),
    caseId,
    eventType,
    timestamp: new Date().toISOString(),
    userId,
    payload,
  };

  const all = readAll();
  all.push(entry);
  persistAll(all);

  // Always log to console for debugging during pilot
  console.log(`[AuditLog] ${entry.timestamp} | ${eventType} | case:${caseId}`, payload);

  return entry;
}

/**
 * Returns all audit entries for a specific case, in chronological order.
 */
export function getCaseLog(caseId: string): AuditEntry[] {
  return readAll()
    .filter(e => e.caseId === caseId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Returns the entire audit log across all cases.
 * Use for admin review or feedback loop analysis (Track A4).
 */
export function getAllLogs(): AuditEntry[] {
  return readAll().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Returns summary stats useful for pilot ROI measurement.
 * Answers: how many cases were submitted with gaps? What were the most common gaps?
 */
export function getAuditStats(): {
  totalCases: number;
  submittedSufficient: number;
  submittedInsufficient: number;
  icdAiAssignments: number;
  icdOverrides: number;
  topMissingItems: Array<{ item: string; count: number }>;
} {
  const all = readAll();

  const caseIds = new Set(all.map(e => e.caseId));
  const sufficientEvents = all.filter(e => e.eventType === 'submitted_sufficient');
  const insufficientEvents = all.filter(e => e.eventType === 'submitted_insufficient');
  const aiAssignments = all.filter(e => e.eventType === 'icd_assigned' && (e.payload as any).matchMethod === 'ai_fallback');
  const overrides = all.filter(e => e.eventType === 'icd_overridden');

  // Tally missing items across all insufficient submissions
  const missingCounts: Record<string, number> = {};
  insufficientEvents.forEach(e => {
    const items = (e.payload as any).missingItems ?? [];
    items.forEach(item => {
      missingCounts[item] = (missingCounts[item] ?? 0) + 1;
    });
  });

  const topMissingItems = Object.entries(missingCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([item, count]) => ({ item, count }));

  return {
    totalCases: caseIds.size,
    submittedSufficient: sufficientEvents.length,
    submittedInsufficient: insufficientEvents.length,
    icdAiAssignments: aiAssignments.length,
    icdOverrides: overrides.length,
    topMissingItems,
  };
}
