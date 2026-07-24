/**
 * ============================================================
 * FAILURE INTELLIGENCE ENGINE
 * ============================================================
 * Implements a permanent, append-only forensic failure store.
 * Every failed case becomes a learning opportunity and is
 * automatically promoted into the regression test suite if
 * it meets the risk threshold.
 *
 * Files written:
 *   logs/failure_intelligence.jsonl   — permanent append-only log
 *   logs/regression_suite.json        — promoted regression cases
 * ============================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

// ─── Path Resolution ───────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const FAILURE_LOG_PATH = path.join(LOGS_DIR, 'failure_intelligence.jsonl');
const REGRESSION_SUITE_PATH = path.join(LOGS_DIR, 'regression_suite.json');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type RegressionRisk = 'critical' | 'high' | 'medium' | 'low';
export type FailureModule =
  | 'extraction'
  | 'review'
  | 'coding'
  | 'enhancement'
  | 'billing'
  | 'appeal'
  | 'denialReview'
  | 'appeal_hub'
  | 'partC';

/** A single forensic failure record — permanent, never discarded. */
export interface FailureRecord {
  /** Deterministic hash of (caseId + module + batchId) for deduplication */
  id: string;
  capturedAt: string;
  batchId: number;
  caseId: string | number;

  // ── Clinical Context ────────────────────────────────────────────────────────
  module: FailureModule;
  diagnosis: string;
  difficulty: 'easy' | 'medium' | 'high' | 'extreme';
  focusCategory: string;
  insurerName: string;

  // ── Evidence Forensics ──────────────────────────────────────────────────────
  expectedOutput: any;
  actualOutput: any;
  confidence: number;           // 0-100 (lower = engine was less certain)
  evidenceUsed: string[];       // Evidence the engine correctly cited
  missingEvidence: string[];    // Evidence that should have been used but wasn't
  hallucinatedEvidence: string[]; // Evidence fabricated by the engine

  // ── Root Cause Analysis ─────────────────────────────────────────────────────
  reasonForFailure: string;     // Human-readable failure note from Gemini verdict
  rootCause: RootCause;         // Computed structured root cause
  recommendedFix: string;       // Highest priority actionable recommendation

  // ── Risk Classification ─────────────────────────────────────────────────────
  regressionRisk: RegressionRisk;
  priorityScore: number;         // 0-100 composite priority

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  promotedToRegression: boolean; // true once added to regression_suite.json
  resolved: boolean;             // toggled manually when the root cause is fixed
  resolvedAt?: string;
  resolvedBy?: string;
  caseCount: number;             // how many times this same root cause appeared
}

/** Structured root cause taxonomy */
export interface RootCause {
  category: RootCauseCategory;
  code: string;             // Short machine-readable code, e.g. 'CHAPTER_LOCK_VIOLATION'
  description: string;
  affectedField?: string;   // e.g. 'icd10Code', 'cashlessApproved'
  errorTypes: string[];     // The raw specificErrorTypes from verdict
}

export type RootCauseCategory =
  | 'HALLUCINATION'           // Engine invented data not in source
  | 'CHAPTER_LOCK_VIOLATION'  // Wrong ICD-10 chapter (e.g. Cataract → Pneumonia)
  | 'EVIDENCE_LINKAGE_FAILURE'// Appeal or review missed extracted evidence
  | 'COST_CALCULATION_ERROR'  // Billing math wrong (>20% deviation)
  | 'EVIDENCE_FABRICATION'    // Present=true for non-existent lab reports
  | 'SPECIFICITY_LOSS'        // Generic code used instead of specific (K37 vs K35.30)
  | 'STATUS_MISMATCH'         // Incorrect eligibility status (approved vs insufficient)
  | 'ENTITY_EXTRACTION_FAIL'  // Patient/policy field incorrectly extracted
  | 'CLINICAL_REASONING_FAIL' // Logical contradiction in clinical reasoning
  | 'DATE_ARITHMETIC_ERROR'   // Temporal drift in dates
  | 'CROSS_MODULE_DESYNC'     // Two modules return contradictory outputs
  | 'LLM_JSON_PARSE_FAIL'     // JSON parsing failure from LLM output
  | 'UNKNOWN';                // Unclassified

// ─── Root Cause Computation ────────────────────────────────────────────────────

/** Maps known error type strings to structured root cause categories */
const ERROR_TYPE_MAP: Array<{ patterns: string[]; category: RootCauseCategory; code: string }> = [
  {
    patterns: ['chapter lock violation', 'chapter_lock', 'icd mapping failure', 'wrong chapter', 'chapter mismatch'],
    category: 'CHAPTER_LOCK_VIOLATION',
    code: 'CHAPTER_LOCK_VIOLATION'
  },
  {
    patterns: ['hallucination', 'fabricat', 'invented', 'not in source', 'non-existent', 'fabricated evidence citation'],
    category: 'HALLUCINATION',
    code: 'CLINICAL_HALLUCINATION'
  },
  {
    patterns: ['evidence_linkage_failure', 'evidence citation failure', 'citation_linkage_failure', 'failed evidence mapping', 'evidence_lookup_failure', 'missed evidence', 'no matching confirmed evidence'],
    category: 'EVIDENCE_LINKAGE_FAILURE',
    code: 'APPEAL_EVIDENCE_MISS'
  },
  {
    patterns: ['cost', 'financial', 'billing', 'cashless', 'room rent', 'proportional deduction', 'cost_calculation_error', 'cost_mismatch', 'cost deviation', 'cost variance'],
    category: 'COST_CALCULATION_ERROR',
    code: 'BILLING_MATH_ERROR'
  },
  {
    patterns: ['clinical fact fabrication', 'evidence hallucination', 'fabricated', 'present: true', 'hallucinated lab'],
    category: 'EVIDENCE_FABRICATION',
    code: 'CLINICAL_FACT_FABRICATION'
  },
  {
    patterns: ['specificity', 'icd_specificity_error', 'granularity mismatch', 'top-1 accuracy fail', 'top-1 icd mismatch', 'specific code', 'parent category', 'generic code'],
    category: 'SPECIFICITY_LOSS',
    code: 'ICD_SPECIFICITY_LOSS'
  },
  {
    patterns: ['status mismatch', 'eligibility_status_mismatch', 'eligibility status mismatch', 'incorrect status', 'expected approved', 'expected denied'],
    category: 'STATUS_MISMATCH',
    code: 'ELIGIBILITY_STATUS_MISMATCH'
  },
  {
    patterns: ['extraction', 'entity extraction', 'field extraction', 'missing field', 'rebranding_mismatch', 'provider_mismatch', 'data substitution'],
    category: 'ENTITY_EXTRACTION_FAIL',
    code: 'ENTITY_EXTRACTION_FAILURE'
  },
  {
    patterns: ['logic contradiction', 'clinical reasoning', 'internal inconsistency', 'contradictory', 'logic mismatch'],
    category: 'CLINICAL_REASONING_FAIL',
    code: 'REASONING_CONTRADICTION'
  },
  {
    patterns: ['date', 'temporal', 'year drift', '2026', 'date arithmetic'],
    category: 'DATE_ARITHMETIC_ERROR',
    code: 'DATE_DRIFT'
  },
  {
    patterns: ['data silos', 'cross-module', 'module sync', 'module mismatch', 'internal mismatch'],
    category: 'CROSS_MODULE_DESYNC',
    code: 'CROSS_MODULE_DESYNC'
  },
  {
    patterns: ['json', 'parse', 'syntax error', 'expected', 'position'],
    category: 'LLM_JSON_PARSE_FAIL',
    code: 'LLM_JSON_PARSE_FAIL'
  }
];

export function computeRootCause(
  module: FailureModule,
  reasonForFailure: string,
  errorTypes: string[],
  verdictNotes: string
): RootCause {
  const allText = [reasonForFailure, verdictNotes, ...errorTypes].join(' ').toLowerCase();

  for (const entry of ERROR_TYPE_MAP) {
    if (entry.patterns.some(p => allText.includes(p))) {
      return {
        category: entry.category,
        code: entry.code,
        description: `[${module.toUpperCase()}] ${entry.category.replace(/_/g, ' ').toLowerCase()} detected`,
        errorTypes
      };
    }
  }

  return {
    category: 'UNKNOWN',
    code: 'UNCLASSIFIED',
    description: `[${module.toUpperCase()}] Unclassified failure`,
    errorTypes
  };
}

// ─── Regression Risk Computation ───────────────────────────────────────────────

export function computeRegressionRisk(
  module: FailureModule,
  rootCause: RootCause,
  confidence: number
): RegressionRisk {
  // Critical: Safety-impacting failures with zero tolerance
  if (
    (module === 'coding' && rootCause.category === 'CHAPTER_LOCK_VIOLATION') ||
    (module === 'appeal' && rootCause.category === 'EVIDENCE_LINKAGE_FAILURE') ||
    (module === 'review' && rootCause.category === 'EVIDENCE_FABRICATION') ||
    rootCause.category === 'HALLUCINATION'
  ) {
    return 'critical';
  }

  // High: Major functional failures affecting claim outcome
  if (
    (module === 'billing' && rootCause.category === 'COST_CALCULATION_ERROR') ||
    (module === 'coding' && rootCause.category === 'SPECIFICITY_LOSS') ||
    (module === 'review' && rootCause.category === 'STATUS_MISMATCH') ||
    rootCause.category === 'CROSS_MODULE_DESYNC' ||
    confidence < 30
  ) {
    return 'high';
  }

  // Medium: Recoverable issues with partial impact
  if (
    module === 'extraction' ||
    rootCause.category === 'ENTITY_EXTRACTION_FAIL' ||
    (module === 'partC' && rootCause.category === 'COST_CALCULATION_ERROR') ||
    confidence < 60
  ) {
    return 'medium';
  }

  return 'low';
}

// ─── Priority Score Computation ────────────────────────────────────────────────

const MODULE_RISK_WEIGHT: Record<string, number> = {
  coding: 1.0,
  billing: 0.9,
  review: 0.85,
  appeal: 0.8,
  extraction: 0.7,
  denialReview: 0.65,
  appeal_hub: 0.65,
  partC: 0.6,
  enhancement: 0.5
};

export function computePriorityScore(
  module: FailureModule,
  difficulty: string,
  regressionRisk: RegressionRisk,
  isSlaBreach: boolean,
  recurrenceCount: number
): number {
  const difficultyWeight = difficulty === 'extreme' ? 1.0
    : difficulty === 'high' ? 0.8
    : difficulty === 'medium' ? 0.5
    : 0.3;

  const moduleWeight = MODULE_RISK_WEIGHT[module] ?? 0.6;

  const riskWeight = regressionRisk === 'critical' ? 1.0
    : regressionRisk === 'high' ? 0.7
    : regressionRisk === 'medium' ? 0.4
    : 0.2;

  const recurrenceBonus = Math.min(recurrenceCount / 5, 1.0); // caps at 1.0 when seen 5+ times
  const slaBonus = isSlaBreach ? 10 : 0;

  const score = Math.round(
    difficultyWeight * 30
    + moduleWeight * 40 * riskWeight
    + recurrenceBonus * 20
    + slaBonus
  );

  return Math.min(100, score);
}

// ─── Recurrence Tracking ───────────────────────────────────────────────────────

/** Counts how many times a root cause code has been seen before in the existing log */
export function countRootCauseRecurrence(rootCauseCode: string): number {
  if (!fs.existsSync(FAILURE_LOG_PATH)) return 0;
  let count = 0;
  const lines = fs.readFileSync(FAILURE_LOG_PATH, 'utf-8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const rec = JSON.parse(line) as FailureRecord;
      if (rec.rootCause?.code === rootCauseCode) count++;
    } catch {
      // skip malformed lines
    }
  }
  return count;
}

// ─── Core API ──────────────────────────────────────────────────────────────────

export interface AppendFailureInput {
  batchId: number;
  caseId: string | number;
  module: FailureModule;
  diagnosis: string;
  difficulty: string;
  focusCategory: string;
  insurerName: string;
  expectedOutput: any;
  actualOutput: any;
  confidence: number;
  evidenceUsed: string[];
  missingEvidence: string[];
  hallucinatedEvidence: string[];
  reasonForFailure: string;
  errorTypes: string[];
  recommendedFix: string;
  isSlaBreach?: boolean;
  caseLatencyMs?: number;
}

/**
 * Append a single failure record to the permanent JSONL failure log.
 * Automatically computes rootCause, regressionRisk, and priorityScore.
 * Auto-promotes to regression suite if risk is 'critical' or 'high'.
 * Returns the full FailureRecord written.
 */
export function appendFailureRecord(input: AppendFailureInput): FailureRecord {
  const rootCause = computeRootCause(
    input.module,
    input.reasonForFailure,
    input.errorTypes,
    input.reasonForFailure
  );

  const recurrenceCount = countRootCauseRecurrence(rootCause.code);
  const regressionRisk = computeRegressionRisk(input.module, rootCause, input.confidence);
  const priorityScore = computePriorityScore(
    input.module,
    input.difficulty,
    regressionRisk,
    input.isSlaBreach ?? false,
    recurrenceCount
  );

  // Deterministic ID — same failure in same batch/case/module won't create duplicates
  const idSource = `${input.batchId}::${input.caseId}::${input.module}::${rootCause.code}`;
  const id = createHash('sha256').update(idSource).digest('hex').slice(0, 16);

  const record: FailureRecord = {
    id,
    capturedAt: new Date().toISOString(),
    batchId: input.batchId,
    caseId: input.caseId,
    module: input.module,
    diagnosis: input.diagnosis,
    difficulty: input.difficulty as any,
    focusCategory: input.focusCategory || 'all',
    insurerName: input.insurerName || 'Unknown',
    expectedOutput: input.expectedOutput,
    actualOutput: input.actualOutput,
    confidence: input.confidence,
    evidenceUsed: input.evidenceUsed,
    missingEvidence: input.missingEvidence,
    hallucinatedEvidence: input.hallucinatedEvidence,
    reasonForFailure: input.reasonForFailure,
    rootCause,
    recommendedFix: input.recommendedFix,
    regressionRisk,
    priorityScore,
    promotedToRegression: false,
    resolved: false,
    caseCount: recurrenceCount + 1
  };

  // Append to permanent JSONL log (never truncated, never discarded)
  fs.appendFileSync(FAILURE_LOG_PATH, JSON.stringify(record) + '\n', 'utf-8');

  // Auto-promote critical and high-risk failures to regression suite
  if (regressionRisk === 'critical' || regressionRisk === 'high') {
    record.promotedToRegression = true;
    promoteToRegressionSuite(record);
  }

  return record;
}

// ─── Regression Suite Management ──────────────────────────────────────────────

/** The permanent regression test suite — loaded and merged with new promotions */
export interface RegressionSuite {
  lastUpdated: string;
  totalEntries: number;
  entries: RegressionEntry[];
}

export interface RegressionEntry {
  failureId: string;
  caseId: string | number;
  module: FailureModule;
  diagnosis: string;
  rootCauseCode: string;
  regressionRisk: RegressionRisk;
  priorityScore: number;
  reasonForFailure: string;
  recommendedFix: string;
  capturedAt: string;
  resolved: boolean;
}

function promoteToRegressionSuite(record: FailureRecord): void {
  let suite: RegressionSuite = { lastUpdated: '', totalEntries: 0, entries: [] };

  if (fs.existsSync(REGRESSION_SUITE_PATH)) {
    try {
      suite = JSON.parse(fs.readFileSync(REGRESSION_SUITE_PATH, 'utf-8')) as RegressionSuite;
    } catch {
      // start fresh if corrupted
    }
  }

  // Deduplicate by failureId
  const existingIds = new Set(suite.entries.map(e => e.failureId));
  if (existingIds.has(record.id)) return;

  const entry: RegressionEntry = {
    failureId: record.id,
    caseId: record.caseId,
    module: record.module,
    diagnosis: record.diagnosis,
    rootCauseCode: record.rootCause.code,
    regressionRisk: record.regressionRisk,
    priorityScore: record.priorityScore,
    reasonForFailure: record.reasonForFailure,
    recommendedFix: record.recommendedFix,
    capturedAt: record.capturedAt,
    resolved: false
  };

  suite.entries.push(entry);
  // Keep sorted by priorityScore descending
  suite.entries.sort((a, b) => b.priorityScore - a.priorityScore);
  suite.totalEntries = suite.entries.length;
  suite.lastUpdated = new Date().toISOString();

  fs.writeFileSync(REGRESSION_SUITE_PATH, JSON.stringify(suite, null, 2), 'utf-8');
}

/** Load all failure records from the permanent JSONL log */
export function loadAllFailures(): FailureRecord[] {
  if (!fs.existsSync(FAILURE_LOG_PATH)) return [];
  return fs.readFileSync(FAILURE_LOG_PATH, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line) as FailureRecord; }
      catch { return null; }
    })
    .filter((r): r is FailureRecord => r !== null);
}

/** Load the regression suite */
export function loadRegressionSuite(): RegressionSuite {
  if (!fs.existsSync(REGRESSION_SUITE_PATH)) {
    return { lastUpdated: '', totalEntries: 0, entries: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(REGRESSION_SUITE_PATH, 'utf-8')) as RegressionSuite;
  } catch {
    return { lastUpdated: '', totalEntries: 0, entries: [] };
  }
}

// ─── Failure Analytics Helpers ─────────────────────────────────────────────────

export interface FailureDigest {
  totalFailures: number;
  unresolvedFailures: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  topRootCauses: Array<{ code: string; count: number; description: string }>;
  topModules: Array<{ module: string; count: number }>;
  topDiagnoses: Array<{ diagnosis: string; count: number }>;
  avgPriorityScore: number;
  promotedToRegression: number;
}

/** Compute a summary digest from all failure records */
export function computeFailureDigest(failures: FailureRecord[]): FailureDigest {
  const unresolved = failures.filter(f => !f.resolved);

  const rootCauseCounts: Record<string, { count: number; description: string }> = {};
  const moduleCounts: Record<string, number> = {};
  const diagnosisCounts: Record<string, number> = {};
  let sumPriority = 0;

  for (const f of failures) {
    const code = f.rootCause?.code ?? 'UNKNOWN';
    if (!rootCauseCounts[code]) rootCauseCounts[code] = { count: 0, description: f.rootCause?.description ?? code };
    rootCauseCounts[code].count++;

    moduleCounts[f.module] = (moduleCounts[f.module] || 0) + 1;
    diagnosisCounts[f.diagnosis] = (diagnosisCounts[f.diagnosis] || 0) + 1;
    sumPriority += f.priorityScore;
  }

  return {
    totalFailures: failures.length,
    unresolvedFailures: unresolved.length,
    criticalCount: failures.filter(f => f.regressionRisk === 'critical').length,
    highCount: failures.filter(f => f.regressionRisk === 'high').length,
    mediumCount: failures.filter(f => f.regressionRisk === 'medium').length,
    lowCount: failures.filter(f => f.regressionRisk === 'low').length,
    topRootCauses: Object.entries(rootCauseCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([code, { count, description }]) => ({ code, count, description })),
    topModules: Object.entries(moduleCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([module, count]) => ({ module, count })),
    topDiagnoses: Object.entries(diagnosisCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([diagnosis, count]) => ({ diagnosis, count })),
    avgPriorityScore: failures.length > 0 ? Math.round(sumPriority / failures.length) : 0,
    promotedToRegression: failures.filter(f => f.promotedToRegression).length
  };
}
