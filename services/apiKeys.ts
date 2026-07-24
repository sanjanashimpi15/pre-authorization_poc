import { GoogleGenAI } from "@google/genai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from 'fs';
import * as path from 'path';
import { classifyGeminiError } from '../utils/geminiErrorClassifier';

const isBrowser = typeof window !== 'undefined';

function loadEnv() {
    if (isBrowser) return;
    try {
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
            for (const line of lines) {
                const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
                if (match) {
                    const key = match[1];
                    let value = (match[2] || '').trim();
                    if (value.startsWith('"') && value.endsWith('"')) {
                        value = value.substring(1, value.length - 1);
                    } else if (value.startsWith("'") && value.endsWith("'")) {
                        value = value.substring(1, value.length - 1);
                    }
                    if (process.env[key] === undefined) {
                        process.env[key] = value.trim();
                    }
                }
            }
        }
    } catch (e) {
        console.error("Failed to load inline .env file:", e);
    }
}

loadEnv();

export function getActiveApiKey(): string {
    const key = isBrowser
        ? ((import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY)
        : process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    return key || "";
}

// Startup verification check
if (isBrowser) {
    const key = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("CRITICAL STARTUP ERROR: VITE_GEMINI_API_KEY is missing from environment variables.");
        window.addEventListener('DOMContentLoaded', () => {
            const banner = document.createElement('div');
            banner.style.position = 'fixed';
            banner.style.top = '0';
            banner.style.left = '0';
            banner.style.width = '100%';
            banner.style.backgroundColor = '#ef4444';
            banner.style.color = '#ffffff';
            banner.style.padding = '16px';
            banner.style.textAlign = 'center';
            banner.style.fontWeight = 'bold';
            banner.style.zIndex = '999999';
            banner.innerHTML = "⚠️ CRITICAL STARTUP ERROR: VITE_GEMINI_API_KEY is missing from your environment variables. Please check your .env.local file.";
            document.body.appendChild(banner);
        });
        throw new Error("CRITICAL STARTUP ERROR: VITE_GEMINI_API_KEY is missing from environment variables (.env.local).");
    }
}

async function proxyGenerateContent(sdkType: 'genai' | 'generative-ai', args: any) {
    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sdkType, args })
    });
    if (!response.ok) {
        const errText = await response.text();
        const error: any = new Error(`Proxy error: ${response.status} - ${errText}`);
        // Real Gemini status (429/503), propagated by api/gemini.ts / vite.config.ts —
        // lets callers tell "quota exceeded" apart from "temporarily unavailable".
        error.status = response.status;
        throw error;
    }
    return await response.json();
}

/**
 * Exponential backoff retry for HTTP 503 (service unavailable) ONLY.
 * 429 (quota exceeded) is intentionally never retried here — retrying a quota
 * error just burns more of the exhausted quota and delays a clear failure.
 */
async function retryOnServiceUnavailable<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 1000): Promise<T> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            const isLastAttempt = attempt === maxAttempts - 1;
            if (classifyGeminiError(err) === 'service_unavailable' && !isLastAttempt) {
                const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200;
                console.warn(`[apiKeys] Gemini 503 (service unavailable). Retrying in ${Math.round(delayMs)}ms... (attempt ${attempt + 1}/${maxAttempts})`);
                await new Promise(res => setTimeout(res, delayMs));
                continue;
            }
            throw err;
        }
    }
    throw new Error('retryOnServiceUnavailable: exhausted all attempts');
}

/**
 * Exponential backoff retry for rate-limited API calls.
 * Retries on 429 (rate limit) and 503 (overloaded) errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4, baseDelayMs = 1000): Promise<T> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            const status = err?.status ?? err?.code ?? err?.httpStatus ?? 0;
            const msg = String(err?.message ?? '');
            const isRateLimit = status === 429 || status === 503 ||
                msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ||
                msg.includes('503') || msg.includes('quota');
            if (isRateLimit && attempt < maxAttempts - 1) {
                const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200;
                console.warn(`[apiKeys] Rate limit hit (attempt ${attempt + 1}/${maxAttempts}). Retrying in ${Math.round(delayMs)}ms...`);
                await new Promise(res => setTimeout(res, delayMs));
            } else {
                throw err;
            }
        }
    }
    throw new Error('withRetry: exhausted all attempts');
}

export function getGoogleGenAIClient(): any {
    if (!isBrowser) {
        // Node environment (scripts): talk to SDK directly with retry wrapper
        const sdk = new GoogleGenAI({ apiKey: getActiveApiKey() });
        return {
            models: {
                generateContent: (args: any) => withRetry(() => sdk.models.generateContent(args)),
                generateContentStream: (args: any) => sdk.models.generateContentStream(args),
            }
        };
    }

    // Browser: proxy via /api/gemini serverless function
    return {
        models: {
            generateContent: async (args: any) => {
                const resJson = await proxyGenerateContent('genai', args);
                return {
                    text: resJson.text,
                    candidates: resJson.candidates
                };
            },
            generateContentStream: async function* (args: any) {
                const resJson = await proxyGenerateContent('genai', args);
                yield {
                    text: resJson.text
                };
            }
        }
    };
}

export function getGoogleGenerativeAIClient(): any {
    if (!isBrowser) {
        return new GoogleGenerativeAI(getActiveApiKey());
    }

    return {
        getGenerativeModel: (modelArgs: { model: string }) => {
            return {
                generateContent: async (contents: any) => {
                    const resJson = await retryOnServiceUnavailable(() =>
                        proxyGenerateContent('generative-ai', { model: modelArgs.model, contents })
                    );
                    return {
                        response: {
                            text: () => resJson.text
                        }
                    };
                }
            };
        }
    };
}

async function proxyOpenRouter(model: string, parts: any[], forceJson: boolean, maxTokens?: number) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
        response = await fetch('/api/openrouter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model, parts, forceJson, maxTokens }),
            signal: controller.signal
        });
    } catch (err: any) {
        if (err.name === 'AbortError') {
            const timeoutError: any = new Error('OpenRouter request timed out after 30s.');
            timeoutError.status = 504;
            throw timeoutError;
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
    if (!response.ok) {
        const errText = await response.text();
        const error: any = new Error(`Proxy error: ${response.status} - ${errText}`);
        error.status = response.status;
        throw error;
    }
    return await response.json();
}

/**
 * OpenRouter equivalent of getGoogleGenerativeAIClient() — same
 * `getGenerativeModel({model}).generateContent(parts) => { response: { text() } }`
 * shape, so callers can branch on AI_PROVIDER without changing downstream code.
 */
export function getOpenRouterClient(): any {
    return {
        getGenerativeModel: (modelArgs: { model: string }) => {
            return {
                generateContent: async (parts: any[], options?: { forceJson?: boolean; maxTokens?: number }) => {
                    const resJson = await retryOnServiceUnavailable(() =>
                        proxyOpenRouter(modelArgs.model, parts, !!options?.forceJson, options?.maxTokens)
                    );
                    return {
                        response: {
                            text: () => resJson.text
                        }
                    };
                }
            };
        }
    };
}

async function proxyLocalPipeline(pdfBase64: string, docId: string) {
    const response = await fetch('/api/local', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pdfBase64, docId })
    });
    if (!response.ok) {
        const errText = await response.text();
        const error: any = new Error(`Proxy error: ${response.status} - ${errText}`);
        error.status = response.status;
        throw error;
    }
    return await response.json(); // { pythonOutput, markdownText }
}

/**
 * Bridge to the standalone local PaddleOCR+Qwen2.5-VL pipeline (api/local.ts).
 * Unlike getGoogleGenerativeAIClient()/getOpenRouterClient(), this isn't a
 * generateContent-style multi-call interface — the Python pipeline does OCR +
 * classification + extraction in one shot, so this exposes a single method.
 */
export function getLocalPipelineClient(): any {
    return {
        extractDocument: async (pdfBase64: string, docId: string) => {
            return await proxyLocalPipeline(pdfBase64, docId);
        }
    };
}

async function proxyOllamaVision(prompt: string, imageBase64: string) {
    const response = await fetch('/api/ollama-vision', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt, imageBase64 })
    });
    if (!response.ok) {
        const errText = await response.text();
        const error: any = new Error(`Proxy error: ${response.status} - ${errText}`);
        error.status = response.status;
        throw error;
    }
    return await response.json(); // { text }
}

/**
 * Bridge to local Ollama qwen2.5vl:3b direct-vision extraction (api/ollama-vision.ts).
 * Single method, single call per page — no OCR/classify/extract split like the
 * Gemini/OpenRouter path, since one vision call does understanding+extraction here.
 */
export function getOllamaVisionClient(): any {
    return {
        extractFromImage: async (prompt: string, imageBase64: string) => {
            return await proxyOllamaVision(prompt, imageBase64);
        }
    };
}

export function rotateApiKey(): boolean {
    // No-op client side as rotation is handled at proxy level/backend pool if any.
    return false;
}

async function proxySarvamOcr(pdfBase64: string, fileName: string) {
    if (typeof window === 'undefined') {
        const handlerModule = await import('../api/sarvam-ocr');
        const handler = handlerModule.default;
        const req = {
            method: 'POST',
            body: { pdfBase64, fileName }
        };
        let statusCode = 200;
        let responseBody: any = null;
        const res = {
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
                return res;
            },
            send: (body: any) => {
                responseBody = body;
                return res;
            }
        };
        await handler(req, res as any);
        if (statusCode !== 200) {
            throw new Error(`Sarvam OCR in-process error: ${statusCode} - ${JSON.stringify(responseBody)}`);
        }
        return responseBody;
    }

    const response = await fetch('/api/sarvam-ocr', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pdfBase64, fileName })
    });
    if (!response.ok) {
        const errText = await response.text();
        const error: any = new Error(`Sarvam OCR proxy error: ${response.status} - ${errText}`);
        error.status = response.status;
        throw error;
    }
    return await response.json();
}

export function getSarvamOcrClient(): any {
    return {
        extractText: async (pdfBase64: string, fileName: string) => {
            return await proxySarvamOcr(pdfBase64, fileName);
        }
    };
}

async function proxySarvamText(model: string, parts: any[], forceJson: boolean, maxTokens?: number) {
    if (typeof window === 'undefined') {
        const handlerModule = await import('../api/sarvam-text');
        const handler = handlerModule.default;
        const req = {
            method: 'POST',
            body: { model, parts, forceJson, maxTokens }
        };
        let statusCode = 200;
        let responseBody: any = null;
        const res = {
            status: (code: number) => {
                statusCode = code;
                return res;
            },
            json: (body: any) => {
                responseBody = body;
                return res;
            },
            send: (body: any) => {
                responseBody = body;
                return res;
            }
        };
        await handler(req, res as any);
        if (statusCode !== 200) {
            throw new Error(`Sarvam Text in-process error: ${statusCode} - ${JSON.stringify(responseBody)}`);
        }
        return responseBody;
    }

    const response = await fetch('/api/sarvam-text', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, parts, forceJson, maxTokens })
    });
    if (!response.ok) {
        const errText = await response.text();
        const error: any = new Error(`Sarvam Text proxy error: ${response.status} - ${errText}`);
        error.status = response.status;
        throw error;
    }
    return await response.json();
}

export function getSarvamTextClient(): any {
    return {
        getGenerativeModel: (modelArgs: { model: string }) => {
            return {
                generateContent: async (parts: any[], options?: { forceJson?: boolean; maxTokens?: number }) => {
                    const resJson = await retryOnServiceUnavailable(() =>
                        proxySarvamText(modelArgs.model, parts, !!options?.forceJson, options?.maxTokens)
                    );
                    return {
                        response: {
                            text: () => resJson.text
                        }
                    };
                }
            };
        }
    };
}

