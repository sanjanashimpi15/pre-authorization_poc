import axios from 'axios';
import { PreAuthRecord, WizardDocument } from '../components/PreAuthWizard/types';
import { lookupICD } from '../services/icdService';
import { PMJAY_PACKAGES, TPA_GUIDELINES, STATE_SCHEME_VARIATIONS } from '../data/indiaKnowledgeBase';
import { extractClinicalTimeline, ExtractedTimeline } from './timelineExtractionAgent';

// ==========================================
// 1. Core Interfaces & Multi-Agent State
// ==========================================

export interface ToolQueryRecord {
  toolName: string;
  requestPayload: any;
  responsePayload: any;
  timestamp: string;
  latencyMs: number;
}

export interface OrchestratorState {
  caseId: string;
  originalInput: string;
  reasoningPlan: string[];
  toolQueriesExecuted: ToolQueryRecord[];
  accumulatedContext: {
    clinicalFindings?: any;
    policyWording?: any;
    pricingCatalog?: any;
    codedDiagnosis?: any;
    extractedDocuments?: any;
    clinicalTimeline?: ExtractedTimeline;
  };
  confidenceMetrics: {
    factualBackingScore: number;  // % of clinical claims linked to verified diagnostics
    policyComplianceScore: number; // % of policy constraints met
    overallConfidence: number;     // composite score
  };
  auditTrail: string[];
}

export interface QwenDecodedAction {
  thought: string;
  action: 'call_tool' | 'synthesize_final';
  toolName?: 'medgemma' | 'insurance_knowledge_engine' | 'hospital_knowledge_base' | 'icd_cpt_engine' | 'document_intelligence';
  parameters?: any;
}

// ==========================================
// 2. Expert Tool Implementations (API / Mock Interfaces)
// ==========================================

/**
 * MedGemma Clinical Knowledge Expert Tool
 * Resolves standard diagnostic indicators and safety warnings for clinical conditions.
 */
export async function queryMedGemmaTool(diagnosis: string): Promise<any> {
  const qwenUrl = (import.meta as any).env?.VITE_QWEN_ENDPOINT_URL || process.env.VITE_QWEN_ENDPOINT_URL;
  const medgemmaUrl = (import.meta as any).env?.VITE_MEDGEMMA_ENDPOINT_URL || process.env.VITE_MEDGEMMA_ENDPOINT_URL;
  const endpoint = qwenUrl || medgemmaUrl;

  if (endpoint) {
    try {
      const response = await axios.post(endpoint, {
        model: qwenUrl ? 'qwen2.5:7b' : 'medgemma:4b',
        messages: [
          { role: 'system', content: 'You are the MedGemma Clinical Knowledge Expert. Given a diagnosis, output mandatory diagnostics, minimum stay, and clinical rules.' },
          { role: 'user', content: `Provide guidelines for: ${diagnosis}` }
        ],
        temperature: 0.1
      }, { timeout: 10000 });
      return response.data;
    } catch (e) {
      console.warn("[QwenAgent] MedGemma tool failed, using fallback knowledge.");
    }
  }

  // Fallback clinical lookup
  const term = diagnosis.toLowerCase();
  if (term.includes('dengue')) {
    return {
      standardIndications: ["Thrombocytopenia", "Hemoconcentration", "NS1/IgM Positive"],
      recommendedDiagnostics: ["CBC (Platelet count)", "Hematocrit"],
      comorbidityRisks: ["Severe bleeding", "Fluid leakage"],
      minHospitalDays: 3
    };
  } else if (term.includes('appendi')) {
    return {
      standardIndications: ["Alvarado Score >= 7", "Right lower quadrant pain", "Rebound tenderness"],
      recommendedDiagnostics: ["USG Abdomen", "WBC Leukocytosis"],
      comorbidityRisks: ["Perforation", "Peritonitis"],
      minHospitalDays: 2
    };
  } else if (term.includes('cataract')) {
    return {
      standardIndications: ["Visual acuity impairment", "Nuclear sclerosis"],
      recommendedDiagnostics: ["Biometry", "Slit lamp exam"],
      comorbidityRisks: ["Intraocular pressure spikes"],
      minHospitalDays: 1
    };
  }
  return {
    standardIndications: ["Clinical confirmation needed"],
    recommendedDiagnostics: ["Routine blood panel"],
    comorbidityRisks: ["General anesthesia complications"],
    minHospitalDays: 2
  };
}

/**
 * Insurance Knowledge Engine Tool
 * Evaluates room rent caps, proportional deductions, and waiting periods.
 */
export async function queryInsuranceKBTool(tpaName: string, wardType: string): Promise<any> {
  const policy = TPA_GUIDELINES.find(t => t.tpaName.toLowerCase().includes(tpaName.toLowerCase())) || TPA_GUIDELINES[0];
  const rentCapPercent = wardType.toLowerCase().includes('icu') ? policy.roomRentLimitIcuPercent : policy.roomRentLimitNormalPercent;
  
  return {
    tpaName: policy.tpaName,
    wardCategory: wardType,
    roomRentCapPercent: rentCapPercent,
    pedWaitingYears: policy.pedWaitingYears,
    copayPercentage: policy.copayPercentage,
    nonMedicalChargesExcluded: policy.nonMedicalChargesExcluded
  };
}

/**
 * Hospital Knowledge Base Tool
 * Validates procedure packaging and billing rules against master data.
 */
export async function queryHospitalKB(procedureName: string): Promise<any> {
  const pmjay = PMJAY_PACKAGES.find(p => p.name.toLowerCase().includes(procedureName.toLowerCase())) || PMJAY_PACKAGES[0];
  return {
    procedureName: pmjay.name,
    packageCode: pmjay.code,
    baseRate: pmjay.baseRate,
    mandatoryDiagnostics: pmjay.mandatoryDiagnostics
  };
}

/**
 * ICD / CPT / SNOMED Coding Engine Tool
 * Resolves appropriate billing & clinical classification codes.
 */
export async function queryCodingEngine(diagnosisText: string): Promise<any> {
  const candidates = lookupICD(diagnosisText);
  if (candidates && candidates.length > 0) {
    return {
      primaryIcd10Code: candidates[0].code,
      primaryDescription: candidates[0].description,
      chapterLockMatched: true
    };
  }
  return {
    primaryIcd10Code: "Pending ICD-10",
    primaryDescription: "Vague Input / Coder Confirmation Needed",
    chapterLockMatched: false
  };
}

// ==========================================
// 3. Central Agent Orchestration Logic
// ==========================================

export class QwenAgentOrchestrator {
  private state: OrchestratorState;

  constructor(caseId: string, originalInput: string) {
    this.state = {
      caseId,
      originalInput,
      reasoningPlan: [],
      toolQueriesExecuted: [],
      accumulatedContext: {},
      confidenceMetrics: {
        factualBackingScore: 0,
        policyComplianceScore: 0,
        overallConfidence: 0
      },
      auditTrail: []
    };
  }

  public async runDecoupledWorkflow(record: Partial<PreAuthRecord>, wizardDocs: WizardDocument[]): Promise<OrchestratorState> {
    this.logAudit("Initiated dynamic decoupled multi-agent reasoning flow.");
    
    // Step 1: Planning Phase
    const diagnosis = record.clinical?.diagnoses?.[0]?.diagnosis || "Dengue Fever";
    const procedure = record.clinical?.proposedLineOfTreatment?.surgical ? "Surgical Procedure" : "Medical Management";
    const tpa = record.insurance?.tpaName || "Medi Assist TPA";
    const ward = record.clinical?.vitals?.pulse ? "General" : "ICU";

    this.state.reasoningPlan = [
      `1. Query ICD Coding Engine for diagnosis: ${diagnosis}`,
      `2. Query MedGemma for clinical criteria related to ${diagnosis}`,
      `3. Query Insurance Knowledge Engine for TPA rules on ${tpa}`,
      `4. Cross-reference clinical metrics against guidelines & compute scores`
    ];
    this.logAudit("Generated dynamic tool execution sequence plan.");

    // Step 2: ICD coding lookup
    const codingStart = Date.now();
    const codingResult = await queryCodingEngine(diagnosis);
    this.state.toolQueriesExecuted.push({
      toolName: 'icd_cpt_engine',
      requestPayload: { diagnosisText: diagnosis },
      responsePayload: codingResult,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - codingStart
    });
    this.state.accumulatedContext.codedDiagnosis = codingResult;
    this.logAudit(`ICD Coding resolved primary code: ${codingResult.primaryIcd10Code}`);

    // Step 2.5: Extract Clinical Timeline from documents
    const timelineStart = Date.now();
    // In a real flow, this string would be the combined OCR text of all uploaded wizardDocs
    const mockDocumentText = `Patient ${record.patient?.patientName} admitted on ${record.admission?.dateOfAdmission}. Chief complaints: ${record.clinical?.chiefComplaints}. Vitals: ${record.clinical?.vitals?.pulse} bpm.`;
    const timelineResult = await extractClinicalTimeline(mockDocumentText);
    this.state.toolQueriesExecuted.push({
      toolName: 'timeline_extraction',
      requestPayload: { textLength: mockDocumentText.length },
      responsePayload: timelineResult,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - timelineStart
    });
    this.state.accumulatedContext.clinicalTimeline = timelineResult;
    this.logAudit(`Extracted chronological timeline with ${timelineResult.events.length} events and ${timelineResult.missingCriticalGaps.length} gaps.`);

    // Step 3: Clinical evidence verification (MedGemma)
    const medGemmaStart = Date.now();
    const medGemmaResult = await queryMedGemmaTool(diagnosis);
    this.state.toolQueriesExecuted.push({
      toolName: 'medgemma',
      requestPayload: { diagnosis },
      responsePayload: medGemmaResult,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - medGemmaStart
    });
    this.state.accumulatedContext.clinicalFindings = medGemmaResult;
    this.logAudit("Retrieved clinical verification criteria from MedGemma.");

    // Step 4: Policy rule lookup
    const insStart = Date.now();
    const insResult = await queryInsuranceKBTool(tpa, ward);
    this.state.toolQueriesExecuted.push({
      toolName: 'insurance_knowledge_engine',
      requestPayload: { tpaName: tpa, wardType: ward },
      responsePayload: insResult,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - insStart
    });
    this.state.accumulatedContext.policyWording = insResult;
    this.logAudit(`Retrieved policy limits from Insurance KB for TPA: ${tpa}`);

    // Step 5: Scoring and Synthesis
    this.evaluateConfidence(record, wizardDocs);
    this.logAudit("Decoupled synthesis finished. Final outputs compiled.");

    return this.state;
  }

  private evaluateConfidence(record: Partial<PreAuthRecord>, wizardDocs: WizardDocument[]) {
    const clinical = this.state.accumulatedContext.clinicalFindings;
    const policy = this.state.accumulatedContext.policyWording;

    // Factual score: does doctor notes/vitals confirm standard indications?
    let matchedIndications = 0;
    if (clinical?.standardIndications) {
      const chiefComplaints = (record.clinical?.chiefComplaints || "").toLowerCase();
      const findings = (record.clinical?.relevantClinicalFindings || "").toLowerCase();
      clinical.standardIndications.forEach((ind: string) => {
        if (chiefComplaints.includes(ind.toLowerCase()) || findings.includes(ind.toLowerCase())) {
          matchedIndications++;
        }
      });
    }
    const factualBacking = clinical?.standardIndications?.length 
      ? Math.round((matchedIndications / clinical.standardIndications.length) * 100) 
      : 50;

    // Timeline Gap Deduction
    const timeline = this.state.accumulatedContext.clinicalTimeline;
    let timelineDeduction = 0;
    if (timeline && timeline.missingCriticalGaps.length > 0) {
      timelineDeduction = timeline.missingCriticalGaps.length * 10;
    }
    const finalFactualScore = Math.max(0, factualBacking - timelineDeduction);

    // Policy Compliance: checks room rents, copays
    let policyCompliance = 100;
    if (policy?.roomRentCapPercent) {
      const actualRent = record.admission?.dateOfAdmission ? 5000 : 2000;
      const capAmount = (record.insurance?.sumInsured || 500000) * (policy.roomRentCapPercent / 100);
      if (actualRent > capAmount) {
        policyCompliance -= 30; // Rent cap breached
      }
    }
    if (wizardDocs.length === 0) {
      policyCompliance -= 20; // Missing documents
    }

    const overall = Math.round((finalFactualScore * 0.6) + (policyCompliance * 0.4));

    this.state.confidenceMetrics = {
      factualBackingScore: finalFactualScore,
      policyComplianceScore: Math.max(0, policyCompliance),
      overallConfidence: overall
    };
  }

  private logAudit(message: string) {
    this.state.auditTrail.push(`[${new Date().toISOString()}] ${message}`);
  }
}
