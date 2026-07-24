import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { statusForGeminiError } from '../utils/geminiErrorClassifier';

export const config = {
  maxDuration: 60, // set max duration for clinical reasoning TAT
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { sdkType, args } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  console.log('[DEBUG /api/gemini] REQUEST RECEIVED');
  console.log('[DEBUG /api/gemini] sdkType:', sdkType);
  console.log('[DEBUG /api/gemini] apiKey prefix:', apiKey ? apiKey.substring(0, 8) : 'MISSING');
  console.log('[DEBUG /api/gemini] args.model:', args?.model);
  if (args?.contents) {
    console.log('[DEBUG /api/gemini] contents: Array of', args.contents.length, 'items');
    args.contents.forEach((c: any, i: number) => {
      if (typeof c === 'string') {
        console.log(`  [${i}] string: "${c.substring(0, 50)}..."`);
      } else if (c.text) {
        console.log(`  [${i}] { text: "${c.text.substring(0, 50)}..." }`);
      } else if (c.inlineData) {
        console.log(`  [${i}] { inlineData: { mimeType: "${c.inlineData.mimeType}", data: "${(c.inlineData.data || '').substring(0, 50)}..." } }`);
      } else {
        console.log(`  [${i}]`, Object.keys(c));
      }
    });
  }

  if (!apiKey) {
    console.error('[DEBUG /api/gemini] ERROR: GEMINI_API_KEY not configured');
    return res.status(500).json({ error: "Server-side GEMINI_API_KEY is not configured in Vercel settings." });
  }

  try {
    if (sdkType === 'genai') {
      console.log('[DEBUG /api/gemini] Using @google/genai SDK');
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent(args);
      console.log('[DEBUG /api/gemini] Response received successfully');
      return res.status(200).json({
        text: response.text,
        candidates: response.candidates
      });
    } else if (sdkType === 'generative-ai') {
      console.log('[DEBUG /api/gemini] Using @google/generative-ai SDK');
      const client = new GoogleGenerativeAI(apiKey);
      const { model, contents } = args;
      console.log('[DEBUG /api/gemini] Creating model instance for:', model);
      const modelObj = client.getGenerativeModel({ model });
      console.log('[DEBUG /api/gemini] Calling generateContent...');
      const result = await modelObj.generateContent(contents);
      const text = result.response.text();
      console.log('[DEBUG /api/gemini] Response received successfully');
      return res.status(200).json({
        text
      });
    } else {
      console.error('[DEBUG /api/gemini] ERROR: Unsupported sdkType:', sdkType);
      return res.status(400).send(`Unsupported SDK type: ${sdkType}`);
    }
  } catch (error: any) {
    console.error('[DEBUG /api/gemini] *** EXCEPTION CAUGHT ***');
    console.error('[DEBUG /api/gemini] Status:', error?.status ?? error?.code ?? error?.httpStatus ?? 'UNKNOWN');
    console.error('[DEBUG /api/gemini] Message:', error?.message || 'NO MESSAGE');
    console.error('[DEBUG /api/gemini] Error:', error?.error || error?.details || 'NO ERROR DETAILS');
    console.error('[DEBUG /api/gemini] Stack:', error?.stack?.substring(0, 500) || 'NO STACK');
    // Preserve the real Gemini status (429/503) instead of collapsing everything to 500,
    // so the browser client can tell "quota exceeded" apart from "temporarily unavailable".
    const status = statusForGeminiError(error);
    console.error('[DEBUG /api/gemini] Final response status:', status);
    return res.status(status).json({ error: error.message || "Failed to query Gemini API server-side" });
  }
}
