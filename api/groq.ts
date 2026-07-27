import dns from 'dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

export const config = {
  maxDuration: 60,
};

function partsToText(parts: any[]): string {
  return parts.map((part: any) => {
    if (typeof part === 'string') return part;
    if (part && typeof part === 'object') {
      if (part.text !== undefined) return part.text;
      return JSON.stringify(part);
    }
    return String(part);
  }).join('\n\n');
}

// Simple JSON string cleaner
function cleanAndRepairJson(rawText: string): string {
  let cleaned = rawText.trim();
  
  // Remove markdown blocks
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
  }
  
  // Find first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  
  return cleaned;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { model = 'llama-3.3-70b-versatile', parts, forceJson, maxTokens } = req.body;
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Server-side GROQ_API_KEY is not configured in environment variables." });
  }

  if (!parts || !Array.isArray(parts)) {
    return res.status(400).json({ error: "Missing or invalid required parts body parameter." });
  }

  const textPrompt = partsToText(parts);
  let attempts = 0;
  const maxAttempts = 3;
  let lastError = null;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      console.log(`[groq] Sending request to Groq completions model ${model} (attempt ${attempts}/${maxAttempts})...`);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: textPrompt }],
          response_format: forceJson ? { type: 'json_object' } : undefined,
          max_tokens: maxTokens || 4096,
          temperature: 0.1, // low temperature for highly structured clinical data
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('retry-after');
          let delayMs = 2000;
          if (retryAfterHeader) {
            delayMs = parseFloat(retryAfterHeader) * 1000;
          } else {
            const match = errText.match(/try again in (\d+(?:\.\d+)?)\s*(s|ms)?/i);
            if (match) {
              const val = parseFloat(match[1]);
              const unit = match[2]?.toLowerCase() || 's';
              delayMs = unit === 'ms' ? val : val * 1000;
            }
          }
          // Add a 1.5 second safety buffer
          delayMs = Math.max(delayMs + 1500, 2000);
          console.warn(`[groq] Rate limit reached. Parsed delay: ${delayMs}ms. Backing off...`);
          throw { isRateLimit: true, delayMs, message: `Groq API returned error status 429: ${errText}` };
        }
        throw new Error(`Groq API returned error status ${response.status}: ${errText}`);
      }

      const data = await response.json() as any;
      const rawText = data?.choices?.[0]?.message?.content ?? '';
      
      // If forceJson is requested, make sure we clean and validate the JSON
      if (forceJson) {
        const cleanedText = cleanAndRepairJson(rawText);
        try {
          JSON.parse(cleanedText); // Validate JSON parsing
          return res.status(200).json({ text: cleanedText });
        } catch (parseErr: any) {
          console.warn(`[groq] Attempt ${attempts} failed to parse JSON:`, parseErr.message, "\nRaw Text:\n", rawText);
          lastError = new Error(`JSON parse failure: ${parseErr.message}`);
          continue; // retry
        }
      }

      return res.status(200).json({ text: rawText });

    } catch (error: any) {
      console.error(`[groq] Exception in attempt ${attempts}:`, error.message || error);
      lastError = error;
      // Wait briefly before retrying
      if (attempts < maxAttempts) {
        const waitMs = error.isRateLimit ? error.delayMs : (1000 * attempts);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }

  return res.status(500).json({ error: lastError?.message || "Failed to execute Groq proxy after multiple attempts." });
}
