import { NexusContext, NexusOutput } from '../types';
import { applyGuardrails } from './10_guardrails';

// Part of Stratum 4: Decision Nexus (Output Composition)
// Purpose: Formats the reasoning into a clinician-friendly, traceable output.
//
// NOTE: This prototype implementation streams the raw LLM text chunks to the UI for
// responsiveness. After the full response is received, it parses for structured data
// (like JSON) and applies guardrails, yielding a final structured output part.

const parseStructuredData = (text: string): any | null => {
    try {
        const jsonStart = text.indexOf('```json');
        if (jsonStart === -1) return null;
        
        const jsonString = text.substring(jsonStart + 7, text.lastIndexOf('```')).trim();
        return JSON.parse(jsonString);
    } catch (e) {
        // The JSON might be incomplete during streaming, so this is not a fatal error.
        return null;
    }
}

export async function* composeOutput(context: NexusContext): AsyncGenerator<NexusOutput> {
  if (!context.llmResponseStream) {
    yield { error: 'LLM stream not available.' };
    return;
  }
  
  let fullText = '';
  // First, stream the raw text chunks to the UI for immediate feedback
  for await (const chunk of context.llmResponseStream) {
      const textChunk = chunk.text;
      if (textChunk) {
          fullText += textChunk;
          yield { textChunk: textChunk };
      }
  }

  context.llmFullResponse = fullText;
  context.auditTrail.push(`[Stratum 4: Decision Nexus] Finished consuming LLM stream. Full response length: ${fullText.length}`);

  // After streaming is complete, perform post-processing.
  const structuredData = parseStructuredData(fullText);
  const guardrailOutput = applyGuardrails(fullText, context); // Layer 10 / Stratum 5

  // Yield a final, structured part containing metadata and parsed data.
  // The UI can use this to update the last message bubble.
  const finalOutput: NexusOutput = { ...guardrailOutput };
  
  if (structuredData && structuredData.data && structuredData.summary) {
    finalOutput.structuredData = structuredData;
    context.auditTrail.push('[Stratum 4: Decision Nexus] Parsed structured data from response.');
  }
  
  // Only yield if there's something to add (guardrail info or structured data)
  if (Object.keys(finalOutput).length > 0) {
      yield finalOutput;
  }

  context.auditTrail.push('[Stratum 4: Decision Nexus] Composed and yielded final output parts.');
}