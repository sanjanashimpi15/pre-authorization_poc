
// This file simulates a backend proxy.
// In a real production environment, this would be a server (e.g., a GCP Cloud Run instance)
// that securely stores and uses the API key. The client would make fetch requests to this server.
// For this frontend-only prototype, we are keeping the Gemini SDK calls here to demonstrate
// the correct architecture and prepare for a seamless transition to a real backend.

import { Modality, GenerateContentResponse } from "@google/genai";
import { getGoogleGenAIClient, rotateApiKey } from './apiKeys';
import { MODEL_TTS } from '../config/modelConfig';

async function withFallback<T>(operation: (client: any) => Promise<T>): Promise<T> {
    let attempts = 3;
    let lastError: any = null;
    while (attempts > 0) {
        try {
            const client = getGoogleGenAIClient();
            return await operation(client);
        } catch (error: any) {
            lastError = error;
            attempts--;
            if (attempts > 0 && rotateApiKey()) {
                console.warn("[withFallback] Retrying operation with fallback API key...");
                continue;
            }
            break;
        }
    }
    throw lastError || new Error("All API keys failed");
}

// This simulates the structure of a backend that would handle various endpoints.
export const postToProxy = async (endpoint: string, body: any): Promise<any> => {
    console.log(`[PROXY] Calling endpoint: ${endpoint}`);

    switch (endpoint) {
        case '/gemini/generateContent':
        case '/gemini/generateSummary':
            return callGeminiGenerateContent(body);
        
        case '/gemini/stream':
             // This is a special case for streaming, we return the stream directly
            return callGeminiStream(body);

        case '/tts/synthesize':
            return callGeminiTts(body);

        default:
            throw new Error(`Unknown proxy endpoint: ${endpoint}`);
    }
};

// --- Gemini Handlers ---

async function callGeminiGenerateContent(body: any): Promise<GenerateContentResponse> {
    const { model, contents, config } = body;
    try {
        return await withFallback(async (client) => {
            return await client.models.generateContent({ model, contents, config });
        });
    } catch (error) {
        console.error("Gemini API error (via proxy simulation):", error);
        throw error;
    }
}

async function callGeminiStream(body: any): Promise<AsyncGenerator<string>> {
    const { model, contents, config } = body;
    try {
        return await withFallback(async (client) => {
            const responseStream = await client.models.generateContentStream({ model, contents, config });
            
            async function* textStream(): AsyncGenerator<string> {
                for await (const chunk of responseStream) {
                    if(chunk.text) {
                        yield chunk.text;
                    }
                }
            }
            return textStream();
        });
    } catch (error) {
        console.error("Gemini API streaming error (via proxy simulation):", error);
        throw error;
    }
}

// --- Gemini TTS Handler ---
// Simulates the structure expected by services/googleTtsService.ts but uses Gemini model
async function callGeminiTts(body: any): Promise<{ audioContent: string | null }> {
    try {
        const { input } = body;
        const text = input.text;
        const voiceName = 'Kore'; 

        return await withFallback(async (client) => {
            const response = await client.models.generateContent({
                 model: MODEL_TTS,
                 contents: [{ parts: [{ text: text }] }],
                 config: {
                    responseModalities: [Modality.AUDIO], 
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: voiceName }
                        }
                    }
                 }
            });
            
            const pcmBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            
            if (pcmBase64) {
                const pcmData = base64ToUint8Array(pcmBase64);
                const wavData = addWavHeader(pcmData, 24000, 1); // 24kHz mono is standard for this model
                const wavBase64 = uint8ArrayToBase64(wavData);
                return { audioContent: wavBase64 };
            }
            
            return { audioContent: null };
        });
    } catch (error) {
        console.error('Failed to synthesize speech via Gemini:', error);
        return { audioContent: null };
    }
}

// --- Audio Helper Functions ---

function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function addWavHeader(pcmData: Uint8Array, sampleRate: number, numChannels: number): Uint8Array {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const dataSize = pcmData.length;
    const bitsPerSample = 16;

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
    view.setUint16(32, numChannels * 2, true); // BlockAlign
    view.setUint16(34, bitsPerSample, true); // BitsPerSample

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const wavBuffer = new Uint8Array(header.byteLength + pcmData.length);
    wavBuffer.set(new Uint8Array(header), 0);
    wavBuffer.set(pcmData, header.byteLength);
    return wavBuffer;
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
