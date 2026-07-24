
import { useState, useRef, useCallback } from 'react';

export const useAudioRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const segmentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startRecording = useCallback(async (
        options: { onSegment?: (blob: Blob) => void; segmentDuration?: number; vadThreshold?: number; minSegmentDuration?: number } = {}
    ) => {
        setError(null);
        if (mediaRecorderRef.current || isRecording) return;
        const {
            onSegment,
            segmentDuration = 30000,
            vadThreshold = 0.015,
            minSegmentDuration = 3000
        } = options;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Float32Array(bufferLength);

            let lastSpeechTime = Date.now();
            let isSpeaking = false;
            let segmentStartTime = Date.now();

            const mediaOptions = { mimeType: 'audio/webm;codecs=opus' };
            const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported(mediaOptions.mimeType) ? mediaOptions : undefined);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            const checkVAD = () => {
                if (recorder.state !== 'recording') return;

                analyser.getFloatTimeDomainData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i] * dataArray[i];
                }
                const rms = Math.sqrt(sum / bufferLength);

                const now = Date.now();
                if (rms > vadThreshold) {
                    if (!isSpeaking) isSpeaking = true;
                    lastSpeechTime = now;
                } else {
                    if (isSpeaking && (now - lastSpeechTime > 1500)) {
                        // Silence detected for 1.5s after speech
                        isSpeaking = false;
                        const duration = now - segmentStartTime;
                        if (duration > minSegmentDuration) {
                            triggerSegment();
                        }
                    }
                }

                if (now - segmentStartTime > segmentDuration) {
                    triggerSegment();
                }

                if (isRecording) {
                    requestAnimationFrame(checkVAD);
                }
            };

            const triggerSegment = () => {
                if (recorder.state === 'recording' && audioChunksRef.current.length > 0) {
                    recorder.requestData();
                    setTimeout(() => {
                        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
                        if (onSegment) onSegment(blob);
                        // Reset for next segment - we keep the same recorder to avoid header overhead
                        // but Gemini's diarization handles the full stream context better.
                        // For per-chunk processing, we just need to ensure we don't send massive files.
                        // Here we keep accumulating to maintain audio headers, but Gemini focuses on the new parts.
                        // To truly "reset", we'd need to stop/start, but that causes pops.
                        segmentStartTime = Date.now();
                    }, 100);
                }
            };

            recorder.start(1000); // Collect data every 1s
            setIsRecording(true);
            setIsPaused(false);

            requestAnimationFrame(checkVAD);

        } catch (err) {
            console.error('Microphone access error:', err);
            setError('Microphone access denied.');
            setIsRecording(false);
        }
    }, [isRecording]);

    const stopRecording = useCallback((): Promise<Blob | null> => {
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current) {
                resolve(null);
                return;
            }

            const recorder = mediaRecorderRef.current;

            const cleanupAndResolve = () => {
                const mimeType = recorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

                if (recorder.stream) {
                    recorder.stream.getTracks().forEach(track => track.stop());
                }

                mediaRecorderRef.current = null;
                audioChunksRef.current = [];
                setIsRecording(false);
                setIsPaused(false);

                resolve(audioBlob.size > 0 ? audioBlob : null);
            };

            recorder.onstop = cleanupAndResolve;

            if (recorder.state !== 'inactive') {
                recorder.stop();
            } else {
                cleanupAndResolve();
            }
        });
    }, []);

    const pauseRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
        }
    }, []);

    const resumeRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
        }
    }, []);

    return { isRecording, isPaused, startRecording, stopRecording, pauseRecording, resumeRecording, error };
};
