
import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";

// FIX: Updated to the correct native audio preview model name
import { MODEL_AUDIO } from '../config/modelConfig';
import { getGoogleGenAIClient } from '../services/apiKeys';

const MODEL_NAME = MODEL_AUDIO;

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  error: string | null;
  supported: boolean;
  stream: MediaStream | null;
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const output = new DataView(new ArrayBuffer(input.length * 2));
    for (let i = 0; i < input.length; i++) {
        let s = Math.max(-1, Math.min(1, input[i]));
        s = s < 0 ? s * 0x8000 : s * 0x7FFF;
        output.setInt16(i * 2, s, true);
    }
    return output.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export const useSpeechRecognition = (options: { lang?: string } = {}): UseSpeechRecognitionReturn => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const supported = true;

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const wsRef = useRef<any>(null);
  const currentTurnTextRef = useRef('');
  const isCleaningUpRef = useRef(false);
  
  const shouldBeListeningRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ai = getGoogleGenAIClient();

  const cleanup = useCallback(async () => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;

    try {
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current.onaudioprocess = null;
            processorRef.current = null;
        }
        if (compressorRef.current) {
            compressorRef.current.disconnect();
            compressorRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            setStream(null);
        }

        if (audioContextRef.current) {
            const ctx = audioContextRef.current;
            audioContextRef.current = null;
            if (ctx.state !== 'closed') {
                await ctx.close();
            }
        }

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        
        if (currentTurnTextRef.current) {
            const leftover = currentTurnTextRef.current;
            setTranscript(prev => (prev + ' ' + leftover).trim());
            currentTurnTextRef.current = '';
            setInterimTranscript('');
        }
    } catch (error) {
        console.error("Cleanup error:", error);
    } finally {
        isCleaningUpRef.current = false;
        if (!shouldBeListeningRef.current) {
            setIsListening(false);
        }
    }
  }, []);

  const startListening = useCallback(async () => {
    if (isCleaningUpRef.current) return;
    
    shouldBeListeningRef.current = true;
    setError(null);

    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContextClass({ sampleRate: 16000 });
        audioContextRef.current = audioContext;

        const targetLang = options.lang || 'English';

        const config = {
            responseModalities: [Modality.AUDIO], 
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            inputAudioTranscription: {},
            systemInstruction: `You are a professional medical transcriber. Listen accurately. 
            STRICT LANGUAGE RULE: Provide the transcription strictly in ${targetLang}. 
            Even if the user speaks in a mix of languages or code-switches, output the final text in ${targetLang}.`,
        };

        const sessionPromise = ai.live.connect({
            model: MODEL_NAME,
            config: config,
            callbacks: {
                onopen: () => {
                    console.log("Connected to secure transcription engine");
                    setIsListening(true);
                },
                onmessage: (message: any) => {
                    const inputTranscription = message.serverContent?.inputTranscription;
                    if (inputTranscription) {
                        const text = inputTranscription.text;
                        if (text) {
                            currentTurnTextRef.current += text;
                            setInterimTranscript(currentTurnTextRef.current);
                        }
                    }

                    if (message.serverContent?.turnComplete) {
                        if (currentTurnTextRef.current) {
                             const finalized = currentTurnTextRef.current;
                             setTranscript(prev => (prev + ' ' + finalized).trim());
                             currentTurnTextRef.current = '';
                             setInterimTranscript('');
                        }
                    }
                },
                onclose: () => {
                    if (shouldBeListeningRef.current) {
                        cleanup().then(() => {
                            reconnectTimeoutRef.current = setTimeout(() => {
                                startListening();
                            }, 1000);
                        });
                    } else {
                        setIsListening(false);
                    }
                },
                onerror: (err: any) => {
                    if (!shouldBeListeningRef.current) {
                         setError("Transcription interrupted.");
                         cleanup();
                         setIsListening(false);
                    }
                }
            }
        });
        
        const session = await sessionPromise;
        wsRef.current = session;

        const micStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: 48000 
            } 
        });
        streamRef.current = micStream;
        setStream(micStream);

        const source = audioContext.createMediaStreamSource(micStream);
        sourceRef.current = source;

        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, audioContext.currentTime);
        compressor.knee.setValueAtTime(40, audioContext.currentTime);
        compressor.ratio.setValueAtTime(12, audioContext.currentTime);
        compressor.attack.setValueAtTime(0, audioContext.currentTime);
        compressor.release.setValueAtTime(0.25, audioContext.currentTime);
        compressorRef.current = compressor;
        
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
            if (!wsRef.current) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBuffer = floatTo16BitPCM(inputData);
            const base64Audio = arrayBufferToBase64(pcmBuffer);
            try {
                wsRef.current.sendRealtimeInput({
                    media: {
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Audio
                    }
                });
            } catch(err) {}
        };

        source.connect(compressor);
        compressor.connect(processor);
        processor.connect(audioContext.destination);

    } catch (err: any) {
        setError("Audio device initialization failed.");
        shouldBeListeningRef.current = false;
        cleanup();
        setIsListening(false);
    }
  }, [cleanup, options.lang]);

  const stopListening = useCallback(async () => {
    shouldBeListeningRef.current = false;
    if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
    }
    setIsListening(false);
    await cleanup();
  }, [cleanup]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    currentTurnTextRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
        shouldBeListeningRef.current = false;
        cleanup();
    };
  }, [cleanup]);

  return {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
    error,
    supported,
    stream
  };
};
