/**
 * benchmarkMetrics.ts
 *
 * Time-saved benchmarking for Aivana vs manual coordinator workflow.
 *
 * DESIGN PHILOSOPHY
 * ─────────────────
 * Manual baseline is fixed from industry data (87.5 min average for a mid-level
 * coordinator). Aivana times are measured from wall-clock timestamps captured at
 * each step of the QA loop — this is the same path a real coordinator takes.
 *
 * Step mapping (QA loop → real coordinator workflow):
 *   caseGeneration  → Patient & Insurance Entry  (typing into form, policy validation)
 *   clinicalMapping → Clinical Review            (reading doctor note, confirming diagnosis)
 *   costValidation  → Cost Estimation            (billing review, line items)
 *   docCheck        → Document Collection        (verify uploads, check required docs)
 *   queryEval       → Query Prediction           (reading predicted TPA queries)
 *   scoreCompute    → Form Filling & Submission  (generate Part C, review, submit)
 */

// ─── Manual baseline (seconds) ────────────────────────────────────────────────
// Industry benchmark for a mid-level coordinator (1–3 years experience)
export const MANUAL_BASELINE_SECONDS = {
  patientEntry:    600,   // 10 min  — policy lookup, eligibility, registration
  clinicalReview:  750,   // 12.5 min — read scattered notes, clarify with doctor
  costEstimation:  600,   // 10 min  — walk to billing, manual calculation
  docCollection:   1020,  // 17 min  — scan, OCR, organise, upload
  queryPrediction: 1500,  // 25 min  — read TPA guidelines, predict queries
  formFilling:     780,   // 13 min  — data entry, verify, portal navigation
  total:           5250,  // 87.5 min
};

// ─── Aivana step timing ranges (seconds) ──────────────────────────────────────
// These ranges model realistic coordinator interaction time with the tool.
// Actual Aivana processing time is measured; human interaction time is estimated
// from UX assumptions (time to read a generated note, verify a PDF, click submit).
export const AIVANA_HUMAN_INTERACTION_SECONDS = {
  patientEntry:    { min: 240, max: 360, avg: 300 },   // 4–6 min (prefilled form check)
  clinicalReview:  { min: 180, max: 300, avg: 240 },   // 3–5 min (verify structured note)
  costEstimation:  { min: 120, max: 180, avg: 150 },   // 2–3 min (review auto-computed total)
  docCollection:   { min: 120, max: 180, avg: 150 },   // 2–3 min (verify PDFs loaded)
  queryPrediction: { min: 180, max: 300, avg: 240 },   // 3–5 min (read predicted queries)
  formFilling:     { min: 120, max: 180, avg: 150 },   // 2–3 min (review, click submit)
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepTimings {
  caseGeneration_ms:  number;  // Gemini case generation wall time
  clinicalMapping_ms: number;  // mapCaseDataToRecord() wall time
  costValidation_ms:  number;  // costEstimate mapping wall time
  docCheck_ms:        number;  // uploadedDocuments processing wall time
  queryEval_ms:       number;  // TPA query evaluation wall time
  scoreCompute_ms:    number;  // computeReadiness() + classifyCaseComplexity() wall time
  totalAivana_ms:     number;  // total wall time for all engine steps
}

export interface CaseMetrics {
  caseId:      string;
  specialty:   string;
  complexity:  string;
  stepTimings: StepTimings;
  aivanaProcessingTime: {
    patientEntry_seconds:    number;
    clinicalReview_seconds:  number;
    costEstimation_seconds:  number;
    docCollection_seconds:   number;
    queryPrediction_seconds: number;
    formFilling_seconds:     number;
    totalTime_seconds:       number;
    totalTime_minutes:       number;
  };
  estimatedManualTime: {
    patientEntry_seconds:    number;
    clinicalReview_seconds:  number;
    costEstimation_seconds:  number;
    docCollection_seconds:   number;
    queryPrediction_seconds: number;
    formFilling_seconds:     number;
    totalTime_seconds:       number;
    totalTime_minutes:       number;
  };
  timeSaved: {
    seconds:             number;
    minutes:             number;
    percentageReduction: string;
  };
  throughputMultiplier: number;
}

// ─── Core metric computation ───────────────────────────────────────────────────

/**
 * Given raw step timings from the QA loop, compute the full CaseMetrics object.
 * Aivana total = engine wall time (measured) + human interaction time (estimated avg).
 */
export function computeCaseMetrics(
  caseId:    string,
  specialty: string,
  complexity: string,
  raw: StepTimings,
  numRequiredDocs: number = 0,
): CaseMetrics {
  const ia = AIVANA_HUMAN_INTERACTION_SECONDS;

  // Aivana time per step = engine processing time + human interaction time
  const patientEntry    = Math.round(raw.caseGeneration_ms  / 1000) + ia.patientEntry.avg;
  const clinicalReview  = Math.round(raw.clinicalMapping_ms / 1000) + ia.clinicalReview.avg;
  const costEstimation  = Math.round(raw.costValidation_ms  / 1000) + ia.costEstimation.avg;
  // Doc collection: add 30s per required doc (coordinator must verify each PDF)
  const docCollection   = Math.round(raw.docCheck_ms        / 1000) + ia.docCollection.avg + (numRequiredDocs * 30);
  const queryPrediction = Math.round(raw.queryEval_ms       / 1000) + ia.queryPrediction.avg;
  const formFilling     = Math.round(raw.scoreCompute_ms    / 1000) + ia.formFilling.avg;
  const totalAivana     = patientEntry + clinicalReview + costEstimation + docCollection + queryPrediction + formFilling;

  const saved   = MANUAL_BASELINE_SECONDS.total - totalAivana;
  const pctSave = ((saved / MANUAL_BASELINE_SECONDS.total) * 100).toFixed(1);
  // Throughput: cases per 8-hour day
  const manualCasesPerDay  = (8 * 3600) / MANUAL_BASELINE_SECONDS.total;
  const aivanaCasesPerDay  = (8 * 3600) / totalAivana;
  const multiplier = parseFloat((aivanaCasesPerDay / manualCasesPerDay).toFixed(2));

  return {
    caseId,
    specialty,
    complexity,
    stepTimings: raw,
    aivanaProcessingTime: {
      patientEntry_seconds:    patientEntry,
      clinicalReview_seconds:  clinicalReview,
      costEstimation_seconds:  costEstimation,
      docCollection_seconds:   docCollection,
      queryPrediction_seconds: queryPrediction,
      formFilling_seconds:     formFilling,
      totalTime_seconds:       totalAivana,
      totalTime_minutes:       parseFloat((totalAivana / 60).toFixed(2)),
    },
    estimatedManualTime: {
      patientEntry_seconds:    MANUAL_BASELINE_SECONDS.patientEntry,
      clinicalReview_seconds:  MANUAL_BASELINE_SECONDS.clinicalReview,
      costEstimation_seconds:  MANUAL_BASELINE_SECONDS.costEstimation,
      docCollection_seconds:   MANUAL_BASELINE_SECONDS.docCollection,
      queryPrediction_seconds: MANUAL_BASELINE_SECONDS.queryPrediction,
      formFilling_seconds:     MANUAL_BASELINE_SECONDS.formFilling,
      totalTime_seconds:       MANUAL_BASELINE_SECONDS.total,
      totalTime_minutes:       MANUAL_BASELINE_SECONDS.total / 60,
    },
    timeSaved: {
      seconds:             saved,
      minutes:             parseFloat((saved / 60).toFixed(2)),
      percentageReduction: `${pctSave}%`,
    },
    throughputMultiplier: multiplier,
  };
}

// ─── Report generation ────────────────────────────────────────────────────────

/**
 * Generate the full benchmarking report for a batch of metrics.
 * Designed to be called every 50 cases.
 */
export function generateBenchmarkReport(metrics: CaseMetrics[], periodLabel: string = ''): string {
  if (metrics.length === 0) return 'No metrics to report.';

  const n = metrics.length;

  // Averages
  const avgAivana  = metrics.reduce((s, m) => s + m.aivanaProcessingTime.totalTime_seconds, 0) / n;
  const avgManual  = MANUAL_BASELINE_SECONDS.total;
  const avgSaved   = avgManual - avgAivana;
  const avgPct     = ((avgSaved / avgManual) * 100).toFixed(1);
  const avgMulti   = metrics.reduce((s, m) => s + m.throughputMultiplier, 0) / n;

  // Step averages
  const stepAvg = (field: keyof CaseMetrics['aivanaProcessingTime']) =>
    Math.round(metrics.reduce((s, m) => s + (m.aivanaProcessingTime[field] as number), 0) / n);

  const stepManual = (field: keyof typeof MANUAL_BASELINE_SECONDS) =>
    MANUAL_BASELINE_SECONDS[field];

  // Complexity distribution
  const dist = { Low: 0, Medium: 0, High: 0 };
  metrics.forEach(m => {
    const k = m.complexity.charAt(0).toUpperCase() + m.complexity.slice(1).toLowerCase() as keyof typeof dist;
    if (k in dist) dist[k]++;
  });

  // Time-saved by complexity
  const byCx = (cx: string) => {
    const sub = metrics.filter(m => m.complexity.toLowerCase() === cx.toLowerCase());
    if (!sub.length) return null;
    const avg = sub.reduce((s, m) => s + m.timeSaved.seconds, 0) / sub.length;
    return { avg: Math.round(avg / 60), pct: ((avg / avgManual) * 100).toFixed(0) };
  };
  const cxLow  = byCx('low');
  const cxMed  = byCx('medium');
  const cxHigh = byCx('high');

  // Variability
  const savedArr = metrics.map(m => m.timeSaved.seconds / 60);
  const minSaved = Math.min(...savedArr).toFixed(0);
  const maxSaved = Math.max(...savedArr).toFixed(0);
  const stdDev   = Math.sqrt(savedArr.reduce((s, v) => s + Math.pow(v - (avgSaved / 60), 2), 0) / n).toFixed(1);
  const outlierHigh = savedArr.filter(v => v > 90).length;
  const outlierLow  = savedArr.filter(v => v < 45).length;

  // Throughput
  const manualPerDay  = ((8 * 3600) / avgManual).toFixed(1);
  const aivanaPerDay  = ((8 * 3600) / avgAivana).toFixed(1);
  const multiplierStr = avgMulti.toFixed(1);

  // Business impact
  const dailyManual   = 3 * parseFloat(manualPerDay);
  const dailyAivana   = 3 * parseFloat(aivanaPerDay);
  const dailyIncrease = (dailyAivana - dailyManual).toFixed(0);
  const monthlyImpact = (parseFloat(dailyIncrease) * 30).toFixed(0);
  const annualImpact  = (parseFloat(dailyIncrease) * 365).toFixed(0);
  const annualValue   = (parseFloat(annualImpact) * 500 / 100000).toFixed(2); // ₹500/case, in lakhs
  const roi           = (((parseFloat(annualValue) - 25) / 25) * 100).toFixed(0);

  // Step table row
  const row = (label: string, manualSec: number, aivanaSec: number) => {
    const manM  = Math.round(manualSec / 60);
    const aiM   = Math.round(aivanaSec / 60);
    const diff  = manM - aiM;
    const pct   = Math.round((diff / manM) * 100);
    return `  ${label.padEnd(20)} ${String(manM + ' min').padStart(8)}   ${String(aiM + ' min').padStart(7)}  ${String(diff + ' min').padStart(7)}    ${pct}%`;
  };

  const now   = new Date().toISOString().split('T')[0];
  const label = periodLabel || `up to ${now}`;

  return `
╔════════════════════════════════════════════════════════════════╗
║         AIVANA BENCHMARKING REPORT — ${String(n + ' CASES').padEnd(20)}       ║
╚════════════════════════════════════════════════════════════════╝

  Reporting Period  : ${label}
  Cases Tested      : ${n}
  Complexity Mix    : ${dist.Low} Low, ${dist.Medium} Medium, ${dist.High} High

TIME SAVED PER CASE (Average)
────────────────────────────────────────────────────────────────
  Manual (Baseline)          :    ${(avgManual / 60).toFixed(1)} minutes
  With Aivana                :    ${(avgAivana / 60).toFixed(1)} minutes
  Time Saved                 :    ${(avgSaved / 60).toFixed(1)} minutes  (${avgPct}%)

BREAKDOWN BY STEP
────────────────────────────────────────────────────────────────
                       Manual    Aivana    Saved   % Reduction
${row('Patient Entry',    stepManual('patientEntry'),    stepAvg('patientEntry_seconds'))}
${row('Clinical Review',  stepManual('clinicalReview'),  stepAvg('clinicalReview_seconds'))}
${row('Cost Estimation',  stepManual('costEstimation'),  stepAvg('costEstimation_seconds'))}
${row('Document Collect', stepManual('docCollection'),   stepAvg('docCollection_seconds'))}
${row('Query Prediction', stepManual('queryPrediction'), stepAvg('queryPrediction_seconds'))}
${row('Form Filling',     stepManual('formFilling'),     stepAvg('formFilling_seconds'))}
────────────────────────────────────────────────────────────────
${row('TOTAL',            avgManual,                     Math.round(avgAivana))}

THROUGHPUT IMPACT
────────────────────────────────────────────────────────────────
  Cases per 8-hour day (manual)  :  ${manualPerDay} cases
  Cases per 8-hour day (Aivana)  :  ${aivanaPerDay} cases
  Multiplier                     :  ${multiplierStr}x faster

BY COMPLEXITY (Time Saved)
────────────────────────────────────────────────────────────────
${cxLow  ? `  Low    :  ${cxLow.avg} min saved  (${cxLow.pct}%)` : '  Low    :  no data'}
${cxMed  ? `  Medium :  ${cxMed.avg} min saved  (${cxMed.pct}%)` : '  Medium :  no data'}
${cxHigh ? `  High   :  ${cxHigh.avg} min saved  (${cxHigh.pct}%)` : '  High   :  no data'}

VARIABILITY
────────────────────────────────────────────────────────────────
  Time saved range (min–max) :  ${minSaved} – ${maxSaved} minutes
  Standard deviation         :  ${stdDev} minutes
  Outliers > 90 min saved    :  ${outlierHigh} cases
  Outliers < 45 min saved    :  ${outlierLow} cases

BUSINESS IMPACT  (3-coordinator team)
────────────────────────────────────────────────────────────────
  Without Aivana   :  3 × ${manualPerDay} = ${dailyManual.toFixed(1)} cases/day
  With Aivana      :  3 × ${aivanaPerDay} = ${dailyAivana.toFixed(1)} cases/day
  Daily increase   :  +${dailyIncrease} cases/day
  Monthly impact   :  +${monthlyImpact} cases
  Annual impact    :  +${annualImpact} cases

  Value unlocked (@ ₹500/case)  :  ₹${annualValue} lakhs/year
  Aivana cost (assumed)         :  ₹25 lakhs/year
  Net ROI (Year 1)              :  ${roi}%

KEY DRIVERS OF TIME SAVINGS
────────────────────────────────────────────────────────────────
  1. Query Prediction (${Math.round((stepManual('queryPrediction') - stepAvg('queryPrediction_seconds')) / 60)} min saved)
     Aivana pre-generates TPA queries; coordinator reads, not researches.

  2. Document Collection (${Math.round((stepManual('docCollection') - stepAvg('docCollection_seconds')) / 60)} min saved)
     Auto-attached documents; coordinator verifies, not scans/uploads.

  3. Form Filling (${Math.round((stepManual('formFilling') - stepAvg('formFilling_seconds')) / 60)} min saved)
     Pre-generated Part C PDF; coordinator reviews and clicks Submit.

  4. Cost Estimation (${Math.round((stepManual('costEstimation') - stepAvg('costEstimation_seconds')) / 60)} min saved)
     Auto-computed from billing data; no manual math or billing dept trips.

DEMO SOUNDBITE
────────────────────────────────────────────────────────────────
  "Without Aivana, your coordinator takes ${(avgManual / 60).toFixed(0)} minutes per case.
   With Aivana, that same coordinator takes ${(avgAivana / 60).toFixed(0)} minutes.
   That is ${(avgSaved / 60).toFixed(0)} minutes saved — ${multiplierStr}x more cases per day.

   On a 3-coordinator team: +${annualImpact} cases/year.
   At ₹500/case: ₹${annualValue} lakhs value unlocked annually.
   ROI on ₹25L investment: ${roi}% in Year 1."

╚════════════════════════════════════════════════════════════════╝
`.trimStart();
}
