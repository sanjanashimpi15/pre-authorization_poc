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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { model = 'sarvam-30b', parts, forceJson, maxTokens } = req.body;
  const apiKey = process.env.SARVAM_API_KEY || process.env.VITE_SARVAM_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Server-side SARVAM_API_KEY is not configured in .env." });
  }

  if (!parts || !Array.isArray(parts)) {
    return res.status(400).json({ error: "Missing or invalid required parts body parameter." });
  }

  try {
    const textPrompt = partsToText(parts);
    console.log(`[sarvam-text] Sending request to Sarvam completions model ${model}...`);

    const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: textPrompt }],
        response_format: forceJson ? { type: 'json_object' } : undefined,
        max_tokens: maxTokens || 4096,
        temperature: 0, // Keep it deterministic for structured patient data extraction
        reasoning_effort: null
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Sarvam completions failed: ${errText}` });
    }

    const data = await response.json() as any;
    const text = data?.choices?.[0]?.message?.content ?? '';

    return res.status(200).json({ text });

  } catch (error: any) {
    console.error("[sarvam-text] Exception in handler:", error);
    return res.status(500).json({ error: error.message || "Failed to execute Sarvam Text proxy." });
  }
}
