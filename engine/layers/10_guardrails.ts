import { NexusContext, NexusOutput } from '../types';

// Part of Stratum 4: Decision Nexus & Stratum 5: Metacognitive Loop
// Purpose: Acts as a safety firewall between reasoning and final output.
//
// Core Functions:
// - Red-flag escalation: Detects high-risk cases and flags them for confirmation.
// - Scope limits: Prevents the system from giving out-of-scope advice.
// - Contraindication checks: Verifies that suggestions are safe for the given context.
//
// NOTE: This prototype implementation inspects the final AI response against the active
// protocol to determine if a "Requires Clinician Confirmation" flag is necessary.

export const applyGuardrails = (
    fullText: string,
    context: NexusContext
): Partial<NexusOutput> => {
    let actionType: 'Informational' | 'Requires Clinician Confirmation' = 'Informational';
    let output: Partial<NexusOutput> = {};

    // If a protocol was used, add source and review date metadata.
    if (context.activeProtocols.length > 0) {
        const protocol = context.activeProtocols[0];
        output.source_protocol_id = protocol.id;
        output.source_protocol_last_reviewed = protocol.metadata.last_reviewed;

        // Guardrail 1: Check if the response suggests an action that requires confirmation.
        // This is determined by the `requires_confirmation` flag in the protocol's escalation triggers.
        const mentionsEscalation = protocol.escalation_triggers.some(trigger =>
            trigger.requires_confirmation && fullText.toLowerCase().includes(trigger.action.toLowerCase())
        );

        // Guardrail 2: Check if the response provides specific dosing information.
        // Any mention of a drug from the dosing table implies a need for confirmation.
        const mentionsDosing = protocol.dosing_table.some(drug => 
            fullText.toLowerCase().includes(drug.drug_name.toLowerCase()) || 
            drug.brand_names_india.some(brand => fullText.toLowerCase().includes(brand.toLowerCase()))
        );

        if (mentionsDosing || mentionsEscalation) {
            actionType = 'Requires Clinician Confirmation';
        }
    }
    
    output.action_type = actionType;
    context.auditTrail.push(`[Stratum 5: Metacognitive Loop] Applied guardrails. Determined action type: ${actionType}.`);
    return output;
};