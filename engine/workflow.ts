import { NexusContext, NexusOutput } from './types';
import { normalizeInput } from './layers/02_inputNormalizer';
import { scrubPhi } from './layers/03_safetyScrubber';
import { mapOntology } from './layers/04_ontologyMapper';
import { queryLlm } from './layers/05_llmInterface';
import { orchestrateReasoning } from './layers/06_reasoningOrchestrator';
import { applyClinicalDomainLogic } from './layers/07_clinicalDomain';
import { runDdxEngine } from './layers/08_ddxEngine';
import { retrieveKnowledge } from './layers/09_knowledge';
import { composeOutput } from './layers/11_outputComposer';
import { finalizeAudit } from './layers/12_audit';
import { Message, DoctorProfile, PreCodedGpt, ClinicalProtocol } from '../types';

export async function* runNexusWorkflow(params: {
    message: string;
    history: Message[];
    doctorProfile: DoctorProfile;
    language: string;
    activeGpt?: PreCodedGpt;
    isDoctorVerified: boolean;
    knowledgeBase: ClinicalProtocol[];
}): AsyncGenerator<NexusOutput> {
    
    // 01: Input comes from UI / Clinician
    let context: NexusContext = {
        initialMessage: params.message,
        history: params.history,
        doctorProfile: params.doctorProfile,
        language: params.language,
        activeGpt: params.activeGpt,
        isDoctorVerified: params.isDoctorVerified,
        knowledgeBase: params.knowledgeBase,
        activeProtocols: [],
        normalizedInput: '',
        systemInstruction: '',
        auditTrail: ['[NEXUS Workflow] Starting clinical reasoning process.'],
    };

    try {
        // This is the pipeline of operations, following the system architecture
        context = normalizeInput(context);           // Stratum 1 (Input Normalizer)
        context = scrubPhi(context);                 // Pre-processing
        context = mapOntology(context);              // Pre-processing
        
        // The core reasoning loop begins
        context = retrieveKnowledge(context);        // Stratum 3 (Hypothesis Forge - Knowledge)
        context = applyClinicalDomainLogic(context); // Stratum 3 (Hypothesis Forge - Domain Logic)
        context = orchestrateReasoning(context);     // Stratum 2, 3, 4, 5 (Orchestration)
        context = runDdxEngine(context);             // Stratum 3 (DDx Engine)
        
        // The reasoning is passed to the LLM
        context = await queryLlm(context);           // Foundational LLM Interface
        
        // The output is composed and guarded
        const outputStream = composeOutput(context); // Stratum 4 & 5 (Output & Guardrails)
        for await (const output of outputStream) {
            yield output;
        }

    } catch (error: any) {
        context.auditTrail.push(`[NEXUS Workflow] FATAL ERROR: ${error.message}`);
        yield { error: error.message || 'An unexpected error occurred in the clinical workflow.' };
    } finally {
        // Stratum 5 (Audit)
        finalizeAudit(context);
    }
}