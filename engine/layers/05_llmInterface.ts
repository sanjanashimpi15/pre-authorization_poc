
import { GoogleGenAI } from "@google/genai";
// FIX: Replaced incorrect type 'ClinicalWorkflowContext' with the correct exported type 'NexusContext'.
import { NexusContext } from '../types';
import { constructLlmContent } from './06_reasoningOrchestrator';
import { getGoogleGenAIClient } from '../../services/apiKeys';
import { MODEL_TEXT } from '../../config/modelConfig';

// Layer 05: Foundational LLM Interface (Reasoning Runtime)
export const queryLlm = async (context: NexusContext): Promise<NexusContext> => {
  
  const contents = constructLlmContent(context);
  
  try {
    const ai = getGoogleGenAIClient();
    const responseStream = await ai.models.generateContentStream({
      model: MODEL_TEXT,
      contents: contents,
      config: {
        systemInstruction: context.systemInstruction,
      },
    });

    context.llmResponseStream = responseStream;
    context.auditTrail.push('[LLM Interface] Started streaming response from Gemini.');
  } catch (error: any) {
    console.error('Error streaming chat response:', error);
    context.auditTrail.push(`[LLM Interface] ERROR: ${error.message}`);
    throw error;
  }
  
  return context;
};
