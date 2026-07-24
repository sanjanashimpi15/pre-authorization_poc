export const MODEL_TEXT = 'gemini-3.5-flash';       // general reasoning, JSON output
// Document OCR/extraction pipeline: gemini-3.5-flash returns HTTP 403 "project denied
// access" for this project's API key (an access-tier block, not a quota one — confirmed
// by direct API testing against every model this key can see, see chat history).
// gemini-2.0-flash is blocked by a 429 zero-quota limit instead, which is the class of
// restriction billing normally fixes, and matches the model this pipeline originally
// documented (see README "AI Stack"). Swap back once a working/billed key is available.
export const MODEL_DOCUMENT = 'gemini-2.0-flash';   // multimodal/PDF extraction

// OpenRouter fallback for the document pipeline: routes around the native Gemini
// quota=0 bug above via OpenRouter's OpenAI-compatible endpoint. Toggle with
// AI_PROVIDER=openrouter (default stays 'gemini' — the native path above).
export const MODEL_DOCUMENT_OPENROUTER = 'google/gemini-2.5-flash';
// 'local' routes document extraction to the standalone PaddleOCR+Qwen2.5-VL pipeline
// (api/local.ts) instead of a hosted API — see documentExtractionService.ts's local branch.
// 'ollama-vision' routes to direct-vision Qwen2.5-VL via Ollama (api/ollama-vision.ts),
// bypassing OCR entirely — single vision call per page, see documentExtractionService.ts.
console.log("[modelConfig] Module evaluation process.env.AI_PROVIDER:", process.env.AI_PROVIDER);
export const AI_PROVIDER: 'gemini' | 'openrouter' | 'local' | 'ollama-vision' | 'sarvam' = (
    (typeof window !== 'undefined' ? (import.meta as any).env?.VITE_AI_PROVIDER : process.env.AI_PROVIDER)
    || 'gemini'
) as 'gemini' | 'openrouter' | 'local' | 'ollama-vision' | 'sarvam';
console.log("[modelConfig] Resolved AI_PROVIDER constant:", AI_PROVIDER);
export const MODEL_TTS = 'gemini-2.5-flash-preview-tts';  // keep as-is, still active
export const MODEL_AUDIO = 'gemini-2.5-flash-native-audio-preview-12-2025'; // native audio preview
export const MODEL_SARVAM_TEXT = 'sarvam-30b';

