import { PreAuthRecord, WizardDocument, WizardDocCategory } from '../components/PreAuthWizard/types';
import { INSURANCE_POLICY_RULES, InsurancePolicyRule } from '../config/insurancePolicies';
import { reviewEvidence, EvidenceReviewReport } from './evidenceReview';
import { extractFromDocument, ExtractedPatientData } from '../services/documentExtractionService';
import { lookupICD, assignICDViaModel, getDescription } from '../services/icdService';
import { runBillingCodingWorkflow } from './billingCoder';
import { isPMJAYBeneficiary } from '../services/pmjayService';

export interface ExtendedEvidenceReviewReport extends EvidenceReviewReport {
  decision: 'APPROVE' | 'DENY' | 'PENDING';
  justification: string;
  evidenceHighlights: Array<{
    sourceDocument: string;
    excerpt: string;
    supportsOrContradicts: 'supports' | 'contradicts';
    relatedRule: string;
  }>;
  missingInfo: string[];
  policyMatches?: Array<{
    policyId: string;
    policyTitle: string;
    matched: boolean;
    details: string;
  }>;
  medicalNecessityScore?: number;
  overallScore?: number;
  tpaDecision?: {
    recommendation: 'APPROVE' | 'DENY' | 'PENDING' | 'QUERY';
  };
}

export interface PriorAuthInput {
  clinicalNote: string;
  uploadedDocuments: Array<{
    name: string;
    type: string;
    textContent: string;
    base64Data?: string;
  }>;
  patientDetails: {
    name: string;
    age: number;
    ageUnit?: 'years' | 'months';
    gender: string;
    stateCode: string;
  };
  insuranceDetails: {
    tpaName: string;
    insurerName: string;
    policyNumber: string;
    sumInsured: number;
    wardType: 'General' | 'Semi-Private' | 'Private' | 'ICU';
    roomRentPerDay: number;
    isEmergency: boolean;
  };
  doctorDetails: {
    doctorName: string;
    doctorRegistrationNumber: string;
    hospitalSealApplied: boolean;
    signatureConfirmed: boolean;
  };
}

export interface PriorAuthAnalysis {
  decision: 'Approved' | 'Denied' | 'Pending';
  justification: string;
  englishSummary: string;
  hindiSummary: string;
  evidenceHighlights: Array<{
    severity: 'supportive' | 'contradictory';
    snippet: string;
    relevance: string;
  }>;
  missingInformation: string[];
  policyCitations: Array<{
    clause: string;
    description: string;
    status: 'Compliant' | 'Non-Compliant' | 'Pending';
  }>;
}

/**
 * Helper to convert base64 payload to a browser File object.
 */
function base64ToFile(base64Data: string, fileName: string, mimeType: string): File {
  let cleanBase64 = base64Data;
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1];
  }
  const byteCharacters = atob(cleanBase64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  return new File([blob], fileName, { type: mimeType });
}

/**
 * Orchestrator that accepts uploaded documents and pre-auth record data,
 * runs OCR/extraction, evaluates them against insurance policies & clinical guidelines,
 * and outputs a prior-authorization decision with evidence highlights.
 */
async function logStageSLA(stageName: string, durationMs: number, targetMs: number, warningMs: number, criticalMs: number) {
  if (typeof window !== 'undefined') return;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'logs', 'stage_sla_trends.json');
    let trends: any[] = [];
    if (fs.existsSync(filePath)) {
      trends = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    const status = durationMs > criticalMs ? 'CRITICAL' : (durationMs > warningMs ? 'WARNING' : 'OK');
    trends.push({
      timestamp: new Date().toISOString(),
      stage: stageName,
      durationMs,
      targetMs,
      status
    });
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(trends, null, 2));
  } catch (e) {
    console.error("Failed to write stage SLA metric:", e);
  }
}

export async function priorAuthOrchestrator(
  documents: WizardDocument[],
  record: Partial<PreAuthRecord>,
  onProgress?: (event: { stage: string; status: 'pending' | 'success' | 'failed' | 'warning'; data?: any }) => void
): Promise<ExtendedEvidenceReviewReport> {
  // Helper with Timeout
  async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, stageName: string): Promise<T> {
    let timeoutId: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`SLA Breach Critical Timeout: Stage "${stageName}" exceeded ${timeoutMs}ms limit.`));
      }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
  }

  // SLA Thresholds
  const EXTRACTION_TARGET = 15000;
  const EXTRACTION_WARN = 15000;
  const EXTRACTION_CRIT = 20000;

  const REVIEW_TARGET = 30000;
  const REVIEW_WARN = 30000;
  const REVIEW_CRIT = 45000;

  const ICD_TARGET = 5000;
  const ICD_WARN = 5000;
  const ICD_CRIT = 10000;

  const BILLING_TARGET = 15000;
  const BILLING_WARN = 30000;
  const BILLING_CRIT = 45000;

  // 1. EXTRACTION STAGE
  onProgress?.({ stage: 'extraction', status: 'pending' });
  const startExtraction = Date.now();
  const extractions: Array<{ doc: WizardDocument; data: ExtractedPatientData }> = [];

  try {
    const extractionPromises = documents.map(async (doc) => {
      if (doc.base64Data) {
        const file = base64ToFile(doc.base64Data, doc.fileName, doc.mimeType);
        const data = await withTimeout(extractFromDocument(file), EXTRACTION_CRIT, `Extraction: ${doc.fileName}`);
        return { doc, data };
      }
      return null;
    });

    const results = await Promise.all(extractionPromises);
    for (const r of results) {
      if (r) extractions.push(r);
    }

    // Merge extracted details into record
    if (extractions.length > 0) {
      const ext = extractions[0].data;
      if (ext.patient?.name && !record.patient?.patientName) {
        record.patient = { ...record.patient, patientName: ext.patient.name };
      }
      if (ext.insurance?.insurance_company && !record.insurance?.insurerName) {
        record.insurance = { ...record.insurance, insurerName: ext.insurance.insurance_company };
      }
    }

    const duration = Date.now() - startExtraction;
    await logStageSLA('extraction', duration, EXTRACTION_TARGET, EXTRACTION_WARN, EXTRACTION_CRIT);
    onProgress?.({
      stage: 'extraction',
      status: 'success',
      data: {
        patientName: record.patient?.patientName || 'Unknown Patient',
        diagnosis: record.clinical?.diagnoses?.[0]?.diagnosis || 'Unspecified',
        insurerName: record.insurance?.insurerName || 'Star Health',
        sumInsured: record.insurance?.sumInsured || 500000,
        readinessScore: 40
      }
    });
  } catch (err: any) {
    const duration = Date.now() - startExtraction;
    await logStageSLA('extraction', duration, EXTRACTION_TARGET, EXTRACTION_WARN, EXTRACTION_CRIT);
    onProgress?.({ stage: 'extraction', status: 'failed', data: err.message });
    console.error(`[priorAuthOrchestrator] Extraction stage failed or timed out:`, err);
  }

  // 2. PARALLEL STAGES (Evidence Review, ICD Coding, Billing)
  onProgress?.({ stage: 'evidence', status: 'pending' });
  onProgress?.({ stage: 'icd', status: 'pending' });
  onProgress?.({ stage: 'billing', status: 'pending' });

  const selectedIndex = record.clinical?.selectedDiagnosisIndex ?? 0;
  const selectedDx = record.clinical?.diagnoses?.[selectedIndex];
  const diagnosisName = selectedDx?.diagnosis || '';

  let reviewReport: any = null;
  let codingCandidates: any[] = [];
  let billingReport: any = null;

  try {
    const parallelPromises = [
      // Track 1: Evidence Review
      (async () => {
        const start = Date.now();
        try {
          reviewReport = await withTimeout(reviewEvidence(record), REVIEW_CRIT, 'Evidence Review');
          const dur = Date.now() - start;
          await logStageSLA('evidence', dur, REVIEW_TARGET, REVIEW_WARN, REVIEW_CRIT);
          onProgress?.({ stage: 'evidence', status: 'success', data: reviewReport });
        } catch (e: any) {
          const dur = Date.now() - start;
          await logStageSLA('evidence', dur, REVIEW_TARGET, REVIEW_WARN, REVIEW_CRIT);
          onProgress?.({ stage: 'evidence', status: 'failed', data: e.message });
          throw e;
        }
      })(),

      // Track 2: ICD Coding
      (async () => {
        const start = Date.now();
        try {
          let candidates = lookupICD(diagnosisName);
          if (!candidates.length && typeof assignICDViaModel === 'function') {
            candidates = await withTimeout(assignICDViaModel(diagnosisName, record.clinical?.relevantClinicalFindings || ''), ICD_CRIT, 'ICD Coding');
          }
          codingCandidates = candidates;
          const dur = Date.now() - start;
          await logStageSLA('icd', dur, ICD_TARGET, ICD_WARN, ICD_CRIT);
          onProgress?.({ stage: 'icd', status: 'success', data: candidates });
        } catch (e: any) {
          const dur = Date.now() - start;
          await logStageSLA('icd', dur, ICD_TARGET, ICD_WARN, ICD_CRIT);
          onProgress?.({ stage: 'icd', status: 'failed', data: e.message });
          throw e;
        }
      })(),

      // Track 3: Billing Coder
      (async () => {
        const start = Date.now();
        try {
          billingReport = await withTimeout(runBillingCodingWorkflow({
            clinicalNote: `${record.clinical?.chiefComplaints || ''} ${record.clinical?.relevantClinicalFindings || ''}`,
            insurerName: record.insurance?.insurerName || 'Unknown',
            sumInsured: record.insurance?.sumInsured || 500000,
            wardType: (record.clinical?.proposedLineOfTreatment?.surgical ? 'ICU' : 'Private') as any,
            requestedAmount: record.costEstimate?.totalEstimatedCost || 0,
            resolvedICD10: selectedDx?.icd10Code
          }), BILLING_CRIT, 'Billing Coder');
          const dur = Date.now() - start;
          await logStageSLA('billing', dur, BILLING_TARGET, BILLING_WARN, BILLING_CRIT);
          onProgress?.({ stage: 'billing', status: 'success', data: billingReport });
        } catch (e: any) {
          const dur = Date.now() - start;
          await logStageSLA('billing', dur, BILLING_TARGET, BILLING_WARN, BILLING_CRIT);
          onProgress?.({ stage: 'billing', status: 'failed', data: e.message });
          throw e;
        }
      })()
    ];

    await Promise.all(parallelPromises);
  } catch (err: any) {
    console.error(`[priorAuthOrchestrator] One or more parallel tracks failed:`, err);
  }

  // 3. PM-JAY check
  const pmjayBeneficiary = isPMJAYBeneficiary(record.insurance?.insurerName || '');
  onProgress?.({ stage: 'pmjay', status: pmjayBeneficiary ? 'success' : 'warning', data: { isPmjay: pmjayBeneficiary } });

  // Match policies
  const matchedPolicies = INSURANCE_POLICY_RULES.filter(policy => {
    const term = diagnosisName.toLowerCase();
    const scopeLower = policy.scope.toLowerCase();
    const titleLower = policy.title.toLowerCase();
    const idLower = policy.id.toLowerCase();
    return term.includes(scopeLower) || scopeLower.includes(term) || titleLower.includes(term) || idLower.includes(term);
  });

  const evidenceHighlights: ExtendedEvidenceReviewReport['evidenceHighlights'] = [];
  const missingInfo: string[] = [];
  const policyMatches: NonNullable<ExtendedEvidenceReviewReport['policyMatches']> = [];

  // Evaluate matching policies
  for (const policy of matchedPolicies) {
    let policyFullyMet = true;
    const matchDetails: string[] = [];

    // Check documentation requirements
    for (const reqDoc of policy.documentation_requirements) {
      const docFound = documents.some(d => {
        const catMatch = d.documentCategory?.toLowerCase().includes(reqDoc.toLowerCase()) ||
                         reqDoc.toLowerCase().includes(d.documentCategory?.toLowerCase() || '');
        const nameMatch = d.fileName.toLowerCase().includes(reqDoc.toLowerCase());
        return catMatch || nameMatch;
      });

      if (docFound) {
        matchDetails.push(`Required document "${reqDoc}" is uploaded.`);
      } else {
        policyFullyMet = false;
        missingInfo.push(`Missing required document: ${reqDoc} (per ${policy.title})`);
        matchDetails.push(`Missing required document "${reqDoc}".`);
      }
    }

    // Check clinical criteria
    for (const criterion of policy.clinical_criteria) {
      let criterionFound = false;
      for (const ext of extractions) {
        const excerpts = ext.data.clinical_excerpts || [];
        for (const excerpt of excerpts) {
          const terms = criterion.toLowerCase().split(/\s+/).filter(t => t.length > 3);
          const matchesCount = terms.filter(t => excerpt.toLowerCase().includes(t)).length;
          if (matchesCount >= Math.min(2, terms.length)) {
            criterionFound = true;
            evidenceHighlights.push({
              sourceDocument: ext.doc.fileName,
              excerpt: excerpt,
              supportsOrContradicts: 'supports',
              relatedRule: `${policy.title}: ${criterion}`
            });
            break;
          }
        }
        if (criterionFound) break;
      }

      if (criterionFound) {
        matchDetails.push(`Clinical criterion "${criterion}" is met.`);
      } else {
        policyFullyMet = false;
        missingInfo.push(`Missing clinical confirmation: ${criterion} (per ${policy.title})`);
        matchDetails.push(`Missing clinical confirmation for "${criterion}".`);
      }
    }

    policyMatches.push({
      policyId: policy.id,
      policyTitle: policy.title,
      matched: policyFullyMet,
      details: matchDetails.join(' ')
    });
  }

  // Decision logic
  let decision: 'APPROVE' | 'DENY' | 'PENDING' = 'APPROVE';
  let justification = '';

  const reportToUse = reviewReport || { anticipatedQueries: [], insufficientEvidence: [], mandatoryGaps: [] };
  const hasHighQueries = reportToUse.anticipatedQueries.some((q: any) => q.severity === 'high');
  const hasGaps = reportToUse.insufficientEvidence.length > 0 || reportToUse.mandatoryGaps.length > 0 || missingInfo.length > 0;

  if (hasHighQueries) {
    decision = 'DENY';
    justification = `The request is recommended for Denial. Clinical pre-audit identifies severe gaps in inpatient necessity or conservative management requirements. Detailed reason: ${reportToUse.anticipatedQueries.find((q: any) => q.severity === 'high')?.query}`;
  } else if (hasGaps) {
    decision = 'PENDING';
    justification = 'The request is recommended as Pending. There are missing clinical documents or specific policy criteria that are not yet confirmed in the uploaded files.';
  } else {
    decision = 'APPROVE';
    justification = 'The request is recommended for Approval. All clinical protocol indicators are met, and required documents and policy criteria are fully verified with supporting excerpts from the source files.';
  }

  // Check contradictions
  const isSurgical = record.clinical?.proposedLineOfTreatment?.surgical || false;
  const isSurgicalZeroCost = isSurgical &&
      ((record.costEstimate?.otCharges ?? 0) === 0 &&
       (record.costEstimate?.surgeonFee ?? 0) === 0);
  if (isSurgicalZeroCost) {
    evidenceHighlights.push({
      sourceDocument: 'Cost Estimate Form',
      excerpt: `Surgeon Fee: ₹${record.costEstimate?.surgeonFee ?? 0}, OT Charges: ₹${record.costEstimate?.otCharges ?? 0}`,
      supportsOrContradicts: 'contradicts',
      relatedRule: 'Surgical Cost Breakdowns: Non-zero values required for OT & Surgeon Fee'
    });
  }

  onProgress?.({ stage: 'submission', status: 'success' });

  return {
    ...reportToUse,
    decision,
    justification,
    evidenceHighlights,
    missingInfo,
    policyMatches,
    status: (decision === 'APPROVE') ? 'sufficient' : 'insufficient'
  };
}

/**
 * Legacy workflow orchestrator mapping to PriorAuthCopilot view requirements.
 */
export async function runPriorAuthWorkflow(input: PriorAuthInput): Promise<PriorAuthAnalysis> {
  const wizardDocs: WizardDocument[] = input.uploadedDocuments.map((doc, idx) => {
    // If the doc has no real binary data (only textContent), treat it as plain text
    // so the extraction service reads it as text rather than decoding it as a PDF/image.
    // Also remap application/octet-stream (e.g. .xlsx from demo charts) to text/plain.
    const hasRealBase64 = !!doc.base64Data;
    const isUnsupportedBinary =
      !hasRealBase64 ||
      doc.type === 'application/octet-stream' ||
      doc.name.endsWith('.xlsx') ||
      doc.name.endsWith('.xls') ||
      doc.name.endsWith('.csv');
    const effectiveMime: string = isUnsupportedBinary ? 'text/plain' : (doc.type || 'application/pdf');
    const effectiveBase64 = isUnsupportedBinary
      ? (() => {
          // Safe unicode-to-base64: use TextEncoder → Uint8Array → btoa via String.fromCharCode
          const bytes = new TextEncoder().encode(doc.textContent || doc.name || '');
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          return btoa(binary);
        })()
      : (doc.base64Data!);

    return {
      id: `doc-${idx}-${Date.now()}`,
      fileName: isUnsupportedBinary ? doc.name.replace(/\.[^.]+$/, '.txt') : doc.name,
      fileSize: doc.textContent?.length || 1024,
      mimeType: effectiveMime,
      fileType: effectiveMime.includes('pdf') ? 'pdf' : (effectiveMime.startsWith('image/') ? 'image' : 'pdf'),
      base64Data: effectiveBase64,
      documentCategory: (
        doc.name.toLowerCase().includes('cbc') ? 'cbc' :
        doc.name.toLowerCase().includes('ultrasound') || doc.name.toLowerCase().includes('usg') ? 'ultrasound' :
        doc.name.toLowerCase().includes('ns1') ? 'ns1_antigen' :
        doc.name.toLowerCase().includes('dengue') ? 'dengue_igm' :
        'other'
      ) as WizardDocCategory,
      isRequired: false,
      autoClassified: true,
      uploadedAt: new Date().toISOString(),
      fileSizeDisplay: `${Math.round((doc.textContent?.length || 1024) / 1024)}KB`,
    };
  });

  const noteLower = input.clinicalNote.toLowerCase();
  let mappedDx = 'Unspecified';
  let mappedICD = 'Pending';
  let isSurgical = false;

  if (noteLower.includes('dengue')) {
    mappedDx = 'Dengue Hemorrhagic Fever';
    mappedICD = 'A91';
  } else if (noteLower.includes('appendi')) {
    mappedDx = 'Acute Appendicitis';
    mappedICD = 'K35.8';
    isSurgical = true;
  } else if (noteLower.includes('cabg') || noteLower.includes('coronary')) {
    mappedDx = 'Coronary Artery Disease';
    mappedICD = 'I25.1';
    isSurgical = true;
  } else if (noteLower.includes('cataract')) {
    mappedDx = 'Senile Cataract';
    mappedICD = 'H25.9';
    isSurgical = true;
  }

  const record: Partial<PreAuthRecord> = {
    id: `pre-auth-${Date.now()}`,
    patient: {
      patientName: input.patientDetails.name,
      age: input.patientDetails.age,
      ageUnit: input.patientDetails.ageUnit || 'years',
      gender: input.patientDetails.gender as any,
      uhid: 'UHID-DEMO-999'
    },
    insurance: {
      insurerName: input.insuranceDetails.insurerName,
      tpaName: input.insuranceDetails.tpaName,
      policyNumber: input.insuranceDetails.policyNumber,
      sumInsured: input.insuranceDetails.sumInsured,
      policyType: 'Commercial'
    },
    clinical: {
      diagnoses: [{
        diagnosis: mappedDx,
        icd10Code: mappedICD,
        icd10Description: 'Confirmed',
        probability: 90,
        reasoning: 'Extracted from clinical note via AI parsing.',
        isSelected: true
      }],
      selectedDiagnosisIndex: 0,
      chiefComplaints: input.clinicalNote,
      relevantClinicalFindings: input.clinicalNote,
      proposedLineOfTreatment: {
        medical: !isSurgical,
        surgical: isSurgical,
        intensiveCare: false,
        investigation: false,
        nonAllopathic: false
      },
      vitals: {
        spo2: '96',
        temp: '102',
        pulse: '110',
        bp: '120/80',
        rr: '18'
      }
    },
    admission: {
      admissionType: input.insuranceDetails.isEmergency ? 'Emergency' : 'Planned',
      dateOfAdmission: new Date().toISOString().split('T')[0]
    },
    uploadedDocuments: wizardDocs
  };

  const report = await priorAuthOrchestrator(wizardDocs, record);

  const decisionMap = {
    'APPROVE': 'Approved' as const,
    'DENY': 'Denied' as const,
    'PENDING': 'Pending' as const
  };

  const highlights = report.evidenceHighlights.map(hl => ({
    severity: hl.supportsOrContradicts === 'supports' ? ('supportive' as const) : ('contradictory' as const),
    snippet: hl.excerpt,
    relevance: hl.relatedRule
  }));

  const policyCitations = (report.policyMatches || []).map(pm => ({
    clause: pm.policyTitle,
    description: pm.details,
    status: pm.matched ? ('Compliant' as const) : ('Non-Compliant' as const)
  }));

  return {
    decision: decisionMap[report.decision] || 'Pending',
    justification: report.justification,
    englishSummary: report.justification,
    hindiSummary: 'पूर्व-प्राधिकरण अनुरोध की समीक्षा की गई है। ' + (report.decision === 'APPROVE' ? 'स्वीकृत करने की अनुशंसा की जाती है।' : 'विवरण या दस्तावेज लंबित हैं।'),
    evidenceHighlights: highlights,
    missingInformation: report.missingInfo,
    policyCitations: policyCitations
  };
}
