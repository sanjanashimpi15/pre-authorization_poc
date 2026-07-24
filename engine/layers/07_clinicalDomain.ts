
import { NexusContext } from '../types';

// Part of Stratum 3: Hypothesis Forge (Contextual Priors)
// Purpose: Encapsulates the medical intelligence — diagnostic frameworks, rules, and specialty-specific knowledge.
// This layer helps set the initial probabilities and context for the reasoning process.

export const applyClinicalDomainLogic = (context: NexusContext): NexusContext => {
  let domainInstruction = '';

  // 1. Specific GPT Instructions (Priority)
  if (context.activeGpt) {
    domainInstruction += `\n\n## Clinical Domain Context
This is a specialized session for: "${context.activeGpt.title}".
- **Description**: "${context.activeGpt.description}".
- **Instruction**: Focus your reasoning and response entirely within this specific clinical domain.`;
    
    if (context.activeGpt.customComponentId) {
       domainInstruction += `\n- **Output Format**: CRITICAL - Your response for this query MUST be in a structured JSON format inside a markdown block (\`\`\`json ... \`\`\`). \n- **IMPORTANT**: Do NOT provide any conversational text or preamble before the JSON block. Start your response immediately with \`\`\`json.\nThe JSON must contain a 'summary' field (string) and a 'type' field.`

       if (context.activeGpt.customComponentId === 'LabResultAnalysis') {
            domainInstruction += `
            Set "type" to "lab".
            Field "data": Object matching LabResultAnalysis interface (overallInterpretation, results array).
            `;
       } else if (context.activeGpt.customComponentId === 'PregnancyRiskAssessment') {
            domainInstruction += `
            Set "type" to "risk-assessment".
            Field "data": Object matching RiskAssessmentResult interface (riskLevel, riskFactors, recommendations).
            `;
       }
    }
  }

  context.systemInstruction += domainInstruction;
  context.auditTrail.push('[Stratum 3: Hypothesis Forge] Applied clinical domain logic.');
  
  return context;
};
