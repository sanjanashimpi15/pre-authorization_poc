export const config = {
  maxDuration: 60,
};

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_VISION_MODEL = 'qwen2.5vl:3b';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { prompt, imageBase64, timeoutMs } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required.' });
  }

  // imageBase64 is optional: text-only calls (e.g. note-vs-document comparison) skip
  // the images field entirely — same model/endpoint, no vision tokens to process.
  const effectiveTimeout = timeoutMs || 60000; // 60s default matches vision-call latency (35-47s); callers of lighter text-only prompts should pass a shorter timeoutMs
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_VISION_MODEL,
        messages: [{ role: 'user', content: prompt, ...(imageBase64 ? { images: [imageBase64] } : {}) }],
        options: { temperature: 0.0, num_ctx: 8192 }, // num_ctx: 8192 confirmed needed tonight — default 4096 overflows with an image
        stream: false,
        format: 'json'
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText || `Ollama request failed with status ${response.status}` });
    }

    const data = await response.json();
    if (data.error) {
      return res.status(500).json({ error: data.error });
    }

    const text = data?.message?.content ?? '';
    return res.status(200).json({ text });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: `Ollama request timed out after ${effectiveTimeout / 1000}s.` });
    }
    return res.status(500).json({ error: err.message || 'Ollama request failed.' });
  } finally {
    clearTimeout(timeoutId);
  }
}
