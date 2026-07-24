import { queryMedGemma } from '../services/llmClient';
import { hasWord, isNegated, sanitizeQueryText } from './evidenceReview';

export type EnhancementTrigger = 'new_procedure' | 'extended_stay' | 'icu_upgrade';

export interface EnhancementInput {
  originalApprovalRef: string;
  originalApprovedAmount: number;
  amountUtilizedToDate: number;
  trigger: EnhancementTrigger;
  additionalAmountRequested: number;
  dischargeDelayReasons?: string[];
  originalDischargeDate?: string;
  newDischargeDate?: string;
  newProcedureName?: string;
  newProcedureCode?: string;
  newProcedureDate?: string;
  newProcedureForeseeable?: boolean;
  clinicalFindingTriggeringProcedure?: string;
  deteriorationDateTime?: string;
  deteriorationVitals?: string;
  icuIntervention?: string;
  currentSeverityScores?: {
    phenoIntensity?: number;
    deteriorationVelocity?: number;
  };
}

export interface EnhancementReviewReport {
  status: 'sufficient' | 'pending_documents';
  gaps: string[];
  anticipatedQueries: Array<{
    query: string;
    reason: string;
    relatedChallenge: string;
    severity: 'high' | 'medium' | 'low';
    source: 'rule' | 'suggestion';
  }>;
  requiredEvidence: string[];
  insufficientEvidence: string[];
  reasoningTrace: string[];
  reviewedAt: string;
}

export const reviewEnhancement = async (
  input: EnhancementInput,
  diagnosis: string,
  admissionDate?: string
): Promise<EnhancementReviewReport> => {
  const gaps: string[] = [];
  const anticipatedQueries: any[] = [];
  const trace: string[] = [];

  trace.push('[NEXUS Enhancement Review] Initializing stay extension evaluation.');

  const clinicalText = `${diagnosis} ${input.dischargeDelayReasons?.join(' ') || ''}`.toLowerCase();
  const isShortStay = 
    clinicalText.includes('18 hours') || 
    clinicalText.includes('18-hour') || 
    clinicalText.includes('12 hours') || 
    clinicalText.includes('12-hour') || 
    clinicalText.includes('under 24') || 
    clinicalText.includes('less than 24') || 
    clinicalText.includes('<24') ||
    clinicalText.includes('18 hr') ||
    clinicalText.includes('12 hr');

  if (isShortStay) {
    trace.push('[NEXUS Enhancement Review] Stay is under the 24-hour minimum threshold. Stay extension review is skipped (not applicable for short stay/daycare).');
    return {
      status: 'sufficient',
      gaps: [],
      anticipatedQueries: [],
      requiredEvidence: [],
      insufficientEvidence: [],
      reasoningTrace: trace,
      reviewedAt: admissionDate ? new Date(admissionDate).toISOString() : new Date().toISOString()
    };
  }

  // 1. Original Approval Reference missing
  if (!input.originalApprovalRef || !input.originalApprovalRef.trim()) {
    gaps.push('Original approved reference number is missing.');
    anticipatedQueries.push({
      query: 'Provide the original pre-auth approval reference number.',
      reason: 'Original approval reference number is mandatory for audit mapping.',
      relatedChallenge: 'is original approval valid?',
      severity: 'high',
      source: 'rule'
    });
  }

  // 2. Clinical justification / delay reasons are missing
  if (input.trigger === 'extended_stay') {
    if (!input.dischargeDelayReasons || input.dischargeDelayReasons.length === 0 || input.dischargeDelayReasons.every(r => !r.trim())) {
      gaps.push('Extension justification / reasons for stay delay are missing.');
      anticipatedQueries.push({
        query: 'Provide the clinical reason / delay justification for stay extension.',
        reason: 'Extension justification is mandatory to justify additional room days.',
        relatedChallenge: 'why is stay extending?',
        severity: 'high',
        source: 'rule'
      });
    }
  } else if (input.trigger === 'new_procedure') {
    if (!input.clinicalFindingTriggeringProcedure || !input.clinicalFindingTriggeringProcedure.trim()) {
      gaps.push('Clinical findings triggering the new procedure are missing.');
      anticipatedQueries.push({
        query: 'Provide details on clinical findings triggering the new procedure.',
        reason: 'New procedures during stay require documenting findings that necessitate them.',
        relatedChallenge: 'is the new procedure medically necessary?',
        severity: 'high',
        source: 'rule'
      });
    }
  } else if (input.trigger === 'icu_upgrade') {
    if (!input.icuIntervention || !input.icuIntervention.trim()) {
      gaps.push('ICU intervention justification is missing.');
      anticipatedQueries.push({
        query: 'Provide documentation detailing the specific ICU intervention required.',
        reason: 'ICU upgrades require documenting specific life support or intensive monitoring details.',
        relatedChallenge: 'is ICU admission justified?',
        severity: 'high',
        source: 'rule'
      });
    }
  }

  // 3. Deterioration vitals/findings missing
  if (input.trigger === 'icu_upgrade') {
    if (!input.deteriorationVitals || !input.deteriorationVitals.trim()) {
      gaps.push('Deterioration vitals / objective clinical findings are missing.');
      anticipatedQueries.push({
        query: 'Provide objective vitals or laboratory findings showing clinical deterioration.',
        reason: 'Objective vitals showing deterioration are required to justify ICU placement.',
        relatedChallenge: 'is ICU admission justified?',
        severity: 'high',
        source: 'rule'
      });
    }
  }

  // 4. Mismatch between duration and severity scores
  let additionalDays = 0;
  if (input.trigger === 'extended_stay' && input.originalDischargeDate && input.newDischargeDate) {
    const origDate = new Date(input.originalDischargeDate);
    const newDate = new Date(input.newDischargeDate);
    additionalDays = Math.round((newDate.getTime() - origDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (additionalDays > 3) {
      const pheno = input.currentSeverityScores?.phenoIntensity ?? 0;
      const velocity = input.currentSeverityScores?.deteriorationVelocity ?? 0;
      if (pheno <= 3 && velocity <= 3) {
        gaps.push(`Extended stay duration of ${additionalDays} days lacks documented clinical severity justification.`);
        anticipatedQueries.push({
          query: `Provide objective clinical severity scores or reasons justifying a ${additionalDays}-day extension.`,
          reason: `Extension of ${additionalDays} days is queried because severity scores are low (pheno Intensity: ${pheno}, deterioration velocity: ${velocity}).`,
          relatedChallenge: 'why is stay extending?',
          severity: 'high',
          source: 'rule'
        });
      }
    }
  }

  // 5. New/extended cost not itemized
  if (!input.additionalAmountRequested || input.additionalAmountRequested <= 0) {
    gaps.push('Additional requested cost is missing or must be greater than zero.');
    anticipatedQueries.push({
      query: 'Provide itemized cost details for the additional amount requested.',
      reason: 'Requested enhancement amount must be greater than zero and itemized.',
      relatedChallenge: 'is the cost justified?',
      severity: 'high',
      source: 'rule'
    });
  }

  // Construct narrative description for MedGemma prompt
  const triggerTypeStr = input.trigger.toUpperCase().replace('_', ' ');
  let clinicalDetails = '';
  if (input.trigger === 'extended_stay') {
    clinicalDetails = `Reasons for delay: ${(input.dischargeDelayReasons || []).join(', ')}`;
  } else if (input.trigger === 'new_procedure') {
    clinicalDetails = `New Procedure: ${input.newProcedureName || 'N/A'} (Code: ${input.newProcedureCode || 'N/A'})\nTriggering Clinical Finding: ${input.clinicalFindingTriggeringProcedure || 'N/A'}`;
  } else if (input.trigger === 'icu_upgrade') {
    clinicalDetails = `Deterioration datetime: ${input.deteriorationDateTime || 'N/A'}\nDeterioration Vitals: ${input.deteriorationVitals || 'N/A'}\nICU intervention needed: ${input.icuIntervention || 'N/A'}`;
  }

  const severityStr = `Current Severity - Pheno Intensity: ${input.currentSeverityScores?.phenoIntensity ?? 'N/A'}, Deterioration Velocity: ${input.currentSeverityScores?.deteriorationVelocity ?? 'N/A'}`;
  const narrativeForLlm = `
Diagnosis: ${diagnosis}
Enhancement Trigger: ${triggerTypeStr}
Clinical Details: ${clinicalDetails}
${severityStr}
Original Expected Stay: ${input.originalDischargeDate ? `Discharge on ${input.originalDischargeDate}` : 'N/A'}
New Expected Stay: ${input.newDischargeDate ? `Discharge on ${input.newDischargeDate}` : 'N/A'}
Additional Amount Requested: ₹${input.additionalAmountRequested}
  `.trim();

  // Query local MedGemma
  let llmOutput: any = { challengesConsidered: [], anchors: [], discriminators: [] };

  const systemInstruction = `You are an experienced TPA (Third Party Administrator) senior medical reviewer conducting an enhancement and extension-of-stay audit. Your role is to assess whether the clinical findings and justifications for the stay extension, new procedure, or ICU upgrade are documented, objective, and clinically necessary from a reviewer's perspective — NOT to suggest clinical decisions.

THE ORIGINAL DIAGNOSIS AND PROPOSED EXTENSION ARE THE GIVEN INPUTS. You only assess whether the documentation supports it.

## YOUR REASONING PROTOCOL (internal use only — do NOT output these stages verbatim)

Work through these five stages before producing your output:

**STAGE 1 — SIGNAL HORIZON**
Inventory the present and absent clinical findings, vitals, and dates related to the stay extension.

**STAGE 2 — PATTERN CONSTELLATION**
Does the documented picture coherently fit the extension request? Identify any red flags or notable absences that weaken the picture.

**STAGE 3 — HYPOTHESIS FORGE**
Identify what questions an experienced TPA reviewer would raise (e.g. "Provide the clinical findings on day 3 that justify extending CCU care to day 7").

**STAGE 4 — DECISION NEXUS**
Ensure the review is strictly administrative, focusing on justification of stay, not recommending therapies.

**STAGE 5 — METACOGNITIVE LOOP**
Verify that suggestions are relevant and clean.

## OUTPUT FORMAT
Output ONLY a raw, valid JSON object matching this schema:
{
  "challengesConsidered": ["what questions/challenges a TPA reviewer would consider"],
  "anchors": ["required diagnostic anchors or findings that MUST be documented in the notes to justify the extension"],
  "discriminators": [
    {
      "challenge": "the challenge/question it resolves",
      "evidence": "the specific finding or documentation that would resolve it",
      "reason": "why this is critical to support the extension"
    }
  ]
}

No markdown wrappers, no explanation, no other text.`;

  const prompt = `Conduct an enhancement/extension review on the following case data:
${narrativeForLlm}

Generate the challenges, anchors, and discriminators needed to justify this extension request.`;

  try {
    trace.push('[NEXUS Enhancement Engine] Querying MedGemma 4B for extension reasoning.');
    const responseText = await queryMedGemma(prompt, systemInstruction);
    trace.push('[NEXUS Enhancement Engine] Response received from MedGemma.');
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    llmOutput = JSON.parse(cleanJson);
  } catch (error: any) {
    trace.push(`[NEXUS Enhancement Engine] MedGemma query failed or timed out: ${error.message}. Using fallback reasoning.`);
    llmOutput = getEnhancementFallback(input, diagnosis);
  }

  // Run presence checking against the details
  const extensionText = [clinicalDetails, input.newProcedureName].filter(Boolean).join(' ');
  const requiredEvidence: string[] = [];
  const insufficientEvidence: string[] = [];

  for (const anchor of llmOutput.anchors) {
    requiredEvidence.push(anchor);
    const present = checkClinicalPresenceForExtension(anchor, extensionText);
    if (!present) {
      insufficientEvidence.push(anchor);
      anticipatedQueries.push({
        query: `Provide documentation of "${anchor}" to justify this extension request.`,
        reason: `Required clinical finding "${anchor}" is not documented in the extension request details.`,
        relatedChallenge: 'is the stay extension justified?',
        severity: 'medium',
        source: 'suggestion'
      });
    }
  }

  for (const disc of llmOutput.discriminators) {
    const present = checkClinicalPresenceForExtension(disc.evidence, extensionText);
    if (!present) {
      anticipatedQueries.push({
        query: `Provide clinical evidence establishing "${disc.evidence}" to justify the stay extension.`,
        reason: disc.reason,
        relatedChallenge: disc.challenge,
        severity: 'medium',
        source: 'suggestion'
      });
    }
  }

  let reviewedAt = new Date().toISOString();
  if (admissionDate) {
    const admissionYear = new Date(admissionDate).getFullYear();
    const currentYear = new Date().getFullYear();
    if (admissionYear !== currentYear) {
      const dateObj = new Date();
      dateObj.setFullYear(admissionYear);
      reviewedAt = dateObj.toISOString();
    }

    const admDate = new Date(admissionDate);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // Validate input dates
    const checkDateRange = (dateStr: string | undefined, fieldName: string) => {
      if (dateStr) {
        const d = new Date(dateStr);
        const diff = Math.abs(d.getTime() - admDate.getTime());
        if (diff > thirtyDaysMs || d.getFullYear() !== admDate.getFullYear()) {
          gaps.push(`Generated date ${fieldName} (${dateStr}) is out of reasonable range relative to the admission date (${admissionDate}).`);
          anticipatedQueries.push({
            query: `Provide corrected stay dates matching the original admission year (${admDate.getFullYear()}).`,
            reason: `${fieldName} date ${dateStr} is inconsistent with the admission year.`,
            relatedChallenge: 'is stay date valid?',
            severity: 'high',
            source: 'rule'
          });
        }
      }
    };

    checkDateRange(input.originalDischargeDate, 'originalDischargeDate');
    checkDateRange(input.newDischargeDate, 'newDischargeDate');
    checkDateRange(input.newProcedureDate, 'newProcedureDate');
  }

  const status = (gaps.length > 0 || insufficientEvidence.length > 0) ? 'pending_documents' : 'sufficient';

  return {
    status,
    gaps,
    anticipatedQueries: anticipatedQueries.map(q => ({
      ...q,
      query: sanitizeQueryText(q.query),
      reason: sanitizeQueryText(q.reason)
    })),
    requiredEvidence,
    insufficientEvidence,
    reasoningTrace: trace,
    reviewedAt
  };
};

function getEnhancementFallback(input: EnhancementInput, diagnosis: string) {
  if (input.trigger === 'icu_upgrade') {
    return {
      challengesConsidered: [
        'is the ICU placement clinically justified?',
        'are objective vital signs showing deterioration present?'
      ],
      anchors: [
        'Vitals instability or acute complications requiring continuous nursing care',
        'ICU intervention details'
      ],
      discriminators: [
        {
          challenge: 'is the ICU placement clinically justified?',
          evidence: 'Deterioration vitals showing failure of organ systems',
          reason: 'To prove patient safety requires intensive monitoring.'
        }
      ]
    };
  }
  
  if (input.trigger === 'extended_stay') {
    return {
      challengesConsidered: [
        'why is stay extending beyond approved days?',
        'does the patient severity justify additional room days?'
      ],
      anchors: [
        'Detailed clinical progress notes explaining slow recovery',
        'Current clinical severity scores'
      ],
      discriminators: [
        {
          challenge: 'why is stay extending beyond approved days?',
          evidence: 'Daily progress notes showing ongoing acute symptoms or slow healing',
          reason: 'To justify why outpatient discharge is unsafe.'
        }
      ]
    };
  }

  return {
    challengesConsidered: [
      'is the new procedure medically necessary during this stay?',
      'was the new procedure foreseeable?'
    ],
    anchors: [
      'Clinical findings triggering the new procedure',
      'Consent forms or diagnostic reports justifying the new procedure'
    ],
    discriminators: [
      {
        challenge: 'is the new procedure medically necessary during this stay?',
        evidence: 'Objective diagnostic reports indicating new pathology',
        reason: 'To justify why this procedure was added to the current admission.'
      }
    ]
  };
}

function checkClinicalPresenceForExtension(item: string, text: string): boolean {
  const itemLower = item.toLowerCase();
  const textLower = text.toLowerCase();

  if (hasWord(itemLower, textLower) && !isNegated(itemLower, textLower)) {
    return true;
  }

  const searchTerms = [itemLower];
  if (itemLower.includes('vitals') || itemLower.includes('findings') || itemLower.includes('pulse') || itemLower.includes('bp')) {
    searchTerms.push('vitals', 'bp', 'pulse', 'temp', 'spo2', 'respiratory', 'mmhg', 'bpm', 'deterioration');
  }
  if (itemLower.includes('progress') || itemLower.includes('slow recovery') || itemLower.includes('complication') || itemLower.includes('delay')) {
    searchTerms.push('delay', 'slow', 'complication', 'healing', 'fever', 'pain', 'infection', 'reason');
  }
  if (itemLower.includes('procedure') || itemLower.includes('surgery') || itemLower.includes('intervention')) {
    searchTerms.push('procedure', 'surgery', 'intervention', 'ventilator', 'pressors');
  }

  for (const term of searchTerms) {
    if (hasWord(term, textLower) && !isNegated(term, textLower)) {
      return true;
    }
  }

  const words = itemLower.split(/\s+/).filter(w => w.length > 3);
  if (words.length > 0) {
    const matchedCount = words.filter(w => hasWord(w, textLower) && !isNegated(w, textLower)).length;
    if (matchedCount >= Math.min(2, words.length)) {
      return true;
    }
  }

  return false;
}
