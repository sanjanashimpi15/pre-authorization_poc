import { NexusContext } from '../types';

// Part of Stratum 3: Hypothesis Forge (Evidence Retrieval)
// Purpose: The dynamic library — provides real-world data and medical guidelines that feed into reasoning.
//
// Core Functions:
// - Guideline fetch: Pulls evidence from Clinical Practice Guidelines (CPGs).
// - Local protocols: Integrates hospital- or country-specific practices.
//
// NOTE: This prototype implementation performs a simple keyword search over the in-memory
// knowledge base to find relevant protocols.

export const retrieveKnowledge = (context: NexusContext): NexusContext => {
  const { initialMessage, knowledgeBase } = context;

  // Simple keyword matching to find a relevant protocol
  const relevantProtocol = knowledgeBase.find(p =>
      // Check if message mentions protocol ID (e.g., "PPH-001")
      initialMessage.toLowerCase().includes(p.id.toLowerCase()) ||
      // Check if message contains significant words from the protocol title
      p.title.toLowerCase().split(' ').some(word => word.length > 4 && initialMessage.toLowerCase().includes(word))
  );
  
  context.activeProtocols = relevantProtocol ? [relevantProtocol] : [];
  
  if (relevantProtocol) {
    context.auditTrail.push(`[Stratum 3: Hypothesis Forge] Retrieved relevant protocol: ${relevantProtocol.id} - ${relevantProtocol.title}`);
  } else {
    context.auditTrail.push(`[Stratum 3: Hypothesis Forge] No specific protocol retrieved for the query.`);
  }

  return context;
};