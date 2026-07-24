export const config = {
  maxDuration: 60, // matches api/gemini.ts's clinical-reasoning TAT budget
};

/**
 * Converts the same `parts` shape used by services/documentExtractionService.ts
 * (`{ text }` / `{ inlineData: { mimeType, data } }`) into a single OpenAI-style
 * user message so callers don't need to know about OpenRouter's wire format.
 */
function partsToOpenAIContent(parts: any[]): any[] {
  return parts.map((part: any) => {
    if (part.text !== undefined) {
      return { type: 'text', text: part.text };
    }
    if (part.inlineData) {
      return {
        type: 'image_url',
        image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }
      };
    }
    return { type: 'text', text: String(part) };
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { model, parts, forceJson, maxTokens } = req.body;
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Server-side OPENROUTER_API_KEY is not configured." });
  }

  try {
    const body: any = {
      model,
      messages: [{ role: 'user', content: partsToOpenAIContent(parts) }]
    };
    if (forceJson) {
      body.response_format = { type: 'json_object' };
    }
    if (maxTokens) {
      body.max_tokens = maxTokens;
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText || `OpenRouter request failed with status ${response.status}` });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    return res.status(200).json({ text });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to query OpenRouter API server-side" });
  }
}
