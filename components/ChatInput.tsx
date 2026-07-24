
import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface ChatInputProps {
    onSendMessage: (message: string) => void;
    isSending: boolean;
    language: string;
    onPlayLastMessage?: () => void;
    isTtsPlaying?: boolean;
    canPlayTts?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    onSendMessage,
    isSending,
    language,
    onPlayLastMessage,
    isTtsPlaying,
    canPlayTts,
}) => {
    const [manualInput, setManualInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    
    const {
        isListening,
        transcript,
        interimTranscript,
        startListening,
        stopListening,
        resetTranscript,
        error: sttError
    } = useSpeechRecognition({ lang: language });

    // Append finalized transcript to manual input
    useEffect(() => {
        if (transcript) {
            setManualInput(prev => {
                const space = prev.length > 0 && !prev.endsWith(' ') ? ' ' : '';
                return prev + space + transcript;
            });
            resetTranscript();
        }
    }, [transcript, resetTranscript]);

    // Adjust textarea height
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [manualInput, interimTranscript]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setManualInput(e.target.value);
    };

    const handleSendTextMessage = () => {
        const fullMessage = manualInput.trim();
        if (fullMessage && !isSending) {
            onSendMessage(fullMessage);
            setManualInput('');
            resetTranscript();
            if (isListening) stopListening();
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };
    
    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    // Combine manual input with what is currently being spoken (interim)
    const displayValue = isListening 
        ? `${manualInput}${manualInput && !manualInput.endsWith(' ') ? ' ' : ''}${interimTranscript}` 
        : manualInput;

    return (
        <div className="space-y-3">
             {sttError && (
                <div className="text-red-400 text-xs text-center p-2 bg-red-900/30 border border-red-500/30 rounded-lg" role="alert">
                    {sttError}
                </div>
            )}
            <div className={`bg-aivana-light-grey rounded-xl flex items-end p-2 gap-2 border transition-all duration-300 ${isListening ? 'border-aivana-accent shadow-[0_0_15px_rgba(138,99,210,0.3)]' : 'border-transparent focus-within:border-aivana-accent'}`}>
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={displayValue}
                    onChange={handleInput}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendTextMessage(); }}}
                    placeholder={isListening ? "Listening..." : "Type your message..."}
                    className="flex-1 w-full bg-transparent text-white placeholder-gray-500 resize-none focus:outline-none max-h-48 py-2.5 pl-2"
                    disabled={isSending}
                />
                
                <button
                    onClick={toggleListening}
                    disabled={isSending}
                    title={isListening ? "Stop Dictation" : "Start Dictation"}
                    className={`p-3 rounded-lg text-white transition-all duration-300 flex-shrink-0 ${isListening ? 'bg-red-600 animate-pulse' : 'bg-aivana-light-grey/80 hover:bg-aivana-grey'}`}
                >
                    <Icon name={isListening ? "stopCircle" : "microphone"} className="w-5 h-5" />
                </button>

                <button
                    onClick={onPlayLastMessage}
                    disabled={isSending || !canPlayTts}
                    title={isTtsPlaying ? "Stop speech" : "Read last message aloud"}
                    className={`p-3 rounded-lg text-white transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${isTtsPlaying ? 'bg-purple-600' : 'bg-aivana-light-grey/80 hover:bg-aivana-grey'}`}
                >
                    <Icon name={isTtsPlaying ? "stopCircle" : "speaker"} className="w-5 h-5" />
                </button>
                
                <button
                    onClick={handleSendTextMessage}
                    disabled={isSending || !displayValue.trim()}
                    className="p-3 bg-aivana-accent rounded-lg text-white transition-colors flex-shrink-0 disabled:bg-aivana-grey disabled:text-gray-500 disabled:cursor-not-allowed hover:bg-purple-700"
                >
                    <Icon name="send" className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};
