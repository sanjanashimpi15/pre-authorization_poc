
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chat, Message, UserRole, PreCodedGpt, DoctorProfile, PromptInsight, LabParameterInput, ClinicalProtocol } from '../types';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { Icon } from './Icon';
import { PRE_CODED_GPTS } from '../constants';
import { streamChatResponse, getPromptInsights } from '../services/geminiService';
import { synthesizeSpeech } from '../services/googleTtsService';
import { PromptInsightsPanel } from './PromptInsightsPanel';
import { GeneralTriageForm } from './PregnancyRiskAssessmentForm'; // Re-using file, but content is GeneralTriage

interface ChatViewProps {
  chat: Chat | null;
  onNewChat: (gpt?: PreCodedGpt) => void;
  updateChat: (chatId: string, messages: Message[]) => void;
  userRole: UserRole;
  language: string;
  isDoctorVerified: boolean;
  setShowVerificationModal: (show: boolean) => void;
  setPendingVerificationMessage: (message: string | null) => void;
  pendingVerificationMessage: string | null;
  doctorProfile: DoctorProfile;
  pendingFirstMessage: string | null;
  setPendingFirstMessage: (message: string | null) => void;
  isInsightsPanelOpen: boolean;
  setIsInsightsPanelOpen: (isOpen: boolean) => void;
  knowledgeBaseProtocols: ClinicalProtocol[];
}

const languageToCodeMap: Record<string, string> = {
    'English': 'en-IN',
    'Marathi': 'mr-IN',
    'Hindi': 'hi-IN',
    'Gujarati': 'gu-IN',
    'Tamil': 'ta-IN',
    'Bengali': 'bn-IN',
};

const LabResultForm: React.FC<{ onSubmit: (params: LabParameterInput[]) => void }> = ({ onSubmit }) => {
    const [params, setParams] = useState<LabParameterInput[]>([]);
    const [currentParam, setCurrentParam] = useState<LabParameterInput>({ name: '', value: '', units: '', referenceRange: '' });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCurrentParam({ ...currentParam, [e.target.name]: e.target.value });
    };

    const handleAddParam = () => {
        if (currentParam.name.trim() && currentParam.value.trim()) {
            setParams([...params, currentParam]);
            setCurrentParam({ name: '', value: '', units: '', referenceRange: '' });
        }
    };
    
    const handleRemoveParam = (index: number) => {
        setParams(params.filter((_, i) => i !== index));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (params.length === 0 && (!currentParam.name.trim() || !currentParam.value.trim())) {
            return; // Don't submit an empty form
        }
        let finalParams = [...params];
        // Add the currently entered param if it's valid, even if "Add" wasn't clicked
        if (currentParam.name.trim() && currentParam.value.trim()) {
            finalParams.push(currentParam);
        }
        if (finalParams.length > 0) {
            onSubmit(finalParams);
        }
    };

    const canAdd = currentParam.name.trim() && currentParam.value.trim();

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 animate-fadeInUp">
            <div className="w-full max-w-3xl bg-aivana-light-grey rounded-xl p-6 md:p-8 border border-aivana-light-grey/50">
                <div className="flex items-center gap-3 mb-4">
                    <Icon name="lab" className="w-8 h-8 text-aivana-accent" />
                    <h2 className="text-2xl font-bold text-white">General Lab Analyzer</h2>
                </div>
                <p className="text-gray-400 mb-6 text-sm">Enter lab parameters (e.g., Sodium, Creatinine, WBC) for a clinical interpretation.</p>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Parameter Input Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end p-3 bg-aivana-dark rounded-lg">
                        <div className="md:col-span-2">
                            <label htmlFor="name" className="block text-xs font-medium text-gray-300 mb-1">Parameter Name</label>
                            <input type="text" name="name" id="name" value={currentParam.name} onChange={handleInputChange} className="w-full bg-aivana-grey p-2 rounded-md border border-aivana-light-grey/80 focus:ring-aivana-accent focus:border-aivana-accent" placeholder="e.g., Sodium" />
                        </div>
                        <div>
                            <label htmlFor="value" className="block text-xs font-medium text-gray-300 mb-1">Value</label>
                            <input type="text" name="value" id="value" value={currentParam.value} onChange={handleInputChange} className="w-full bg-aivana-grey p-2 rounded-md border border-aivana-light-grey/80 focus:ring-aivana-accent focus:border-aivana-accent" placeholder="e.g., 145" />
                        </div>
                        <div>
                            <label htmlFor="units" className="block text-xs font-medium text-gray-300 mb-1">Units</label>
                            <input type="text" name="units" id="units" value={currentParam.units} onChange={handleInputChange} className="w-full bg-aivana-grey p-2 rounded-md border border-aivana-light-grey/80 focus:ring-aivana-accent focus:border-aivana-accent" placeholder="e.g., mEq/L" />
                        </div>
                        <button type="button" onClick={handleAddParam} disabled={!canAdd} className="w-full bg-aivana-accent/80 hover:bg-aivana-accent text-white font-semibold py-2 px-3 rounded-md transition-colors flex items-center justify-center gap-2 disabled:bg-aivana-light-grey/50 disabled:cursor-not-allowed">
                            <Icon name="newChat" className="w-5 h-5"/> Add
                        </button>
                    </div>

                    {/* Display Added Parameters */}
                    {params.length > 0 && (
                        <div className="space-y-2 max-h-48 overflow-y-auto p-2">
                            {params.map((param, index) => (
                                <div key={index} className="flex items-center justify-between p-2 bg-aivana-dark rounded-md text-sm">
                                    <span className="font-semibold text-white">{param.name}:</span>
                                    <span className="text-gray-300">{param.value} {param.units}</span>
                                    <span className="text-gray-400 text-xs">(Ref: {param.referenceRange || 'N/A'})</span>
                                    <button onClick={() => handleRemoveParam(index)} className="p-1 text-red-400 hover:text-red-300"><Icon name="close" className="w-4 h-4"/></button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <button type="submit" className="w-full !mt-6 bg-aivana-accent hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <Icon name="diagnosis" className="w-5 h-5"/>
                        Analyze Results
                    </button>
                </form>
            </div>
        </div>
    );
};


export const ChatView: React.FC<ChatViewProps> = ({
  chat,
  onNewChat,
  updateChat,
  userRole,
  language,
  isDoctorVerified,
  setShowVerificationModal,
  setPendingVerificationMessage,
  pendingVerificationMessage,
  doctorProfile,
  pendingFirstMessage,
  setPendingFirstMessage,
  isInsightsPanelOpen,
  setIsInsightsPanelOpen,
  knowledgeBaseProtocols: knowledgeBaseProtocols,
}) => {
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // State for Prompt Insights
  const [insights, setInsights] = useState<PromptInsight | null>(null);
  const [isFetchingInsights, setIsFetchingInsights] = useState(false);


  const activeGpt = chat?.gptId ? PRE_CODED_GPTS.find(g => g.id === chat.gptId) : undefined;
  const shouldShowRiskAssessmentForm = chat && activeGpt?.customComponentId === 'PregnancyRiskAssessment' && chat.messages.filter(m => m.sender === 'USER').length === 0;
  const shouldShowLabResultForm = chat && activeGpt?.customComponentId === 'LabResultAnalysis' && chat.messages.filter(m => m.sender === 'USER').length === 0;


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };
  
  const fetchInsightsForPrompt = useCallback(async (prompt: string) => {
    if (!prompt) return;
    setIsFetchingInsights(true);
    setInsights(null);
    try {
        const fetchedInsights = await getPromptInsights(prompt, doctorProfile, language);
        setInsights(fetchedInsights);
        if (fetchedInsights) {
          setIsInsightsPanelOpen(true); // Open panel automatically when insights are ready
        }
    } catch (error) {
        console.error("Failed to fetch prompt insights:", error);
        setInsights(null);
    } finally {
        setIsFetchingInsights(false);
    }
  }, [doctorProfile, language, setIsInsightsPanelOpen]);


  useEffect(() => {
    setTimeout(scrollToBottom, 100);
  }, [chat?.messages]);
  
  const handleToggleTts = useCallback(async (message: Message) => {
    if (!audioRef.current) return;

    if (playingMessageId === message.id) {
        audioRef.current.pause();
        audioRef.current.src = '';
        setPlayingMessageId(null);
    } else {
        audioRef.current.pause();
        setPlayingMessageId(message.id); 

        const langCode = languageToCodeMap[language] || 'en-IN';
        const audioSrc = await synthesizeSpeech(message.text, langCode);

        if (audioSrc && audioRef.current) {
            audioRef.current.src = audioSrc;
            audioRef.current.play().catch(e => {
                console.error("Audio playback failed:", e);
                setPlayingMessageId(null);
            });
            
            audioRef.current.onended = () => {
                setPlayingMessageId(null);
            };
            audioRef.current.onerror = () => {
                console.error("Audio element error");
                setPlayingMessageId(null);
            };
        } else {
            console.error("Failed to get audio source from TTS API.");
            setPlayingMessageId(null); 
        }
    }
  }, [playingMessageId, language]);
  
  const handleUpdateMessage = (messageId: string, updates: Partial<Message>) => {
      if (!chat) return;
      const updatedMessages = chat.messages.map(m => m.id === messageId ? {...m, ...updates} : m);
      updateChat(chat.id, updatedMessages);
  };


  const handleSendMessage = useCallback(async (message: string) => {
    if (!chat) return;
    
    setIsSending(true);
    fetchInsightsForPrompt(message);

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      sender: 'USER',
      text: message,
    };

    const aiMessagePlaceholder: Message = {
        id: `msg-${Date.now() + 1}`,
        sender: 'AI',
        text: '...',
    };
    
    const currentMessages = chat.messages ? [...chat.messages, userMessage] : [userMessage];
    updateChat(chat.id, [...currentMessages, aiMessagePlaceholder]);

    const stream = streamChatResponse({
        message,
        history: currentMessages,
        userRole,
        language,
        activeGpt,
        isDoctorVerified,
        doctorProfile,
        knowledgeBaseProtocols: knowledgeBaseProtocols,
    });

    let finalMessage: Message = { ...aiMessagePlaceholder, text: '...' };
    let fullStreamedText = '';

    try {
        for await (const chunk of stream) {
            if (chunk.error) {
                if (chunk.error.includes("license verification")) {
                    setPendingVerificationMessage(message);
                    setShowVerificationModal(true);
                    finalMessage.text = "Verification required to proceed. Please verify your license to continue.";
                } else {
                    finalMessage.text = chunk.error;
                }
                updateChat(chat.id, [...currentMessages, finalMessage]);
                setIsSending(false);
                return; 
            }

            if (chunk.textChunk) {
                fullStreamedText += chunk.textChunk;
                
                // Check if we should hide this text (JSON buffering logic)
                const target = '```json';
                const trimmed = fullStreamedText.trimStart();
                let shouldHide = false;

                if (trimmed.startsWith(target)) {
                     // It definitely starts with JSON block. Hide it.
                     shouldHide = true;
                } else if (target.startsWith(trimmed) && trimmed.length < target.length) {
                     // It matches the prefix so far (e.g. "``"), so wait to see if it becomes JSON.
                     shouldHide = true;
                }
                
                // If it's potentially JSON, keep the UI text as '...' to show typing indicator
                // Otherwise, update the UI with the streamed text
                if (shouldHide) {
                    finalMessage.text = '...';
                } else {
                    finalMessage.text = fullStreamedText;
                }
            }

            if (chunk.source_protocol_id) finalMessage.source_protocol_id = chunk.source_protocol_id;
            if (chunk.source_protocol_last_reviewed) finalMessage.source_protocol_last_reviewed = chunk.source_protocol_last_reviewed;
            if (chunk.action_type) finalMessage.action_type = chunk.action_type;
            if (chunk.citations) finalMessage.citations = chunk.citations;
            if (chunk.structuredData) {
                finalMessage.structuredData = chunk.structuredData;
                // Once structured data arrives, we replace the text (which might be '...' or JSON) with the summary.
                finalMessage.text = chunk.structuredData.summary; 
            }
            
            updateChat(chat.id, [...currentMessages, { ...finalMessage }]);
        }
    } catch (error) {
        console.error("Error handling stream:", error);
        finalMessage.text = "An unexpected error occurred while processing your request.";
        updateChat(chat.id, [...currentMessages, finalMessage]);
    } finally {
        setIsSending(false);
    }
  }, [chat, language, updateChat, userRole, activeGpt, isDoctorVerified, doctorProfile, setPendingVerificationMessage, setShowVerificationModal, fetchInsightsForPrompt, knowledgeBaseProtocols]);
  
  const handleRiskAssessmentSubmit = (formData: {
    age: string;
    sex: string;
    systolicBP: string;
    diastolicBP: string;
    hr: string;
    temp: string;
    spo2: string;
    respiratoryRate: string;
    chiefComplaint: string;
    history: string[];
  }) => {
      const prompt = `
          Perform a clinical risk assessment and triage for this patient.
          - Patient: ${formData.age} year old ${formData.sex}
          - Chief Complaint: ${formData.chiefComplaint}
          - Vitals: BP ${formData.systolicBP}/${formData.diastolicBP}, HR ${formData.hr}, RR ${formData.respiratoryRate}, Temp ${formData.temp}°C, SpO2 ${formData.spo2}%
          - PMH: ${formData.history.length > 0 ? formData.history.join(', ') : 'None reported'}
          
          Calculate relevant risk scores (e.g., NEWS2, qSOFA, ASCVD, HEART score) based on the presentation.
          Provide a differential diagnosis, risk stratification (Low/Medium/High), and suggested management plan/disposition.
          Your response must be in structured JSON format.
      `;
      handleSendMessage(prompt);
  };
  
  const handleLabResultSubmit = (labParams: LabParameterInput[]) => {
      const paramStrings = labParams.map(p => 
          `- Parameter: ${p.name}, Value: ${p.value} ${p.units}, Reference Range: ${p.referenceRange || 'N/A'}`
      );
      
      const prompt = `
          Analyze the following lab results for a general medical patient.
          ${paramStrings.join('\n')}
          
          Provide a detailed interpretation for each parameter, an overall clinical summary, and flag any critical or abnormal values with recommended next steps. Your response must be in structured JSON format.
      `;
      handleSendMessage(prompt);
  };


  useEffect(() => {
    if (isDoctorVerified && pendingVerificationMessage && chat) {
      const message = pendingVerificationMessage;
      setPendingVerificationMessage(null);
      handleSendMessage(message);
    }
  }, [isDoctorVerified, pendingVerificationMessage, chat, handleSendMessage, setPendingVerificationMessage]);
  
  useEffect(() => {
      if (chat && pendingFirstMessage && chat.messages.length === 0) {
          const messageToSend = pendingFirstMessage;
          setPendingFirstMessage(null); 
          handleSendMessage(messageToSend);
      }
  }, [chat, pendingFirstMessage, handleSendMessage, setPendingFirstMessage]);

  
    const handleSendMessageOnWelcome = (message: string) => {
        if (!message.trim()) return;
        onNewChat();
        setPendingFirstMessage(message);
    };

    const lastAiMessage = useMemo(() => {
        if (!chat?.messages) return null;
        // Find last message from AI that isn't a placeholder and has text
        return [...chat.messages]
          .reverse()
          .find(m => m.sender === 'AI' && m.text && m.text !== '...');
    }, [chat?.messages]);

    const latestDdxData = useMemo(() => {
        if (!chat?.messages) return null;
        // Find the last message with structured data of type 'ddx'
        for (let i = chat.messages.length - 1; i >= 0; i--) {
            const msg = chat.messages[i];
            if (msg.structuredData?.type === 'ddx') {
                return msg.structuredData;
            }
        }
        return null;
    }, [chat?.messages]);

    const handlePlayLastMessage = useCallback(() => {
        if (lastAiMessage) {
            handleToggleTts(lastAiMessage);
        }
    }, [lastAiMessage, handleToggleTts]);

  if (!chat) {
    return (
      <div className="flex-1 flex flex-col h-full relative bg-aivana-dark">
          <WelcomeScreen onNewChat={onNewChat} />
          <div className="p-4 w-full max-w-4xl mx-auto z-10">
              <ChatInput 
                onSendMessage={handleSendMessageOnWelcome} 
                isSending={isSending} 
                language={language}
              />
          </div>
      </div>
    );
  }
  
  if (shouldShowRiskAssessmentForm) {
      return <GeneralTriageForm onSubmit={handleRiskAssessmentSubmit} />;
  }
  
  if (shouldShowLabResultForm) {
      return <LabResultForm onSubmit={handleLabResultSubmit} />;
  }


  return (
    <div className="flex-1 flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <audio ref={audioRef} style={{ display: 'none' }} />

        {/* Desktop Header */}
        <header className="hidden md:flex items-center justify-between p-4 border-b border-aivana-light-grey">
            <h2 className="text-lg font-semibold truncate">
                {chat.title}
            </h2>
            <button
              onClick={() => setIsInsightsPanelOpen(!isInsightsPanelOpen)}
              className={`p-2 rounded-md transition-colors ${isInsightsPanelOpen ? 'bg-aivana-accent text-white' : 'text-gray-400 hover:bg-aivana-grey hover:text-white'}`}
              aria-label="Toggle prompt insights"
              title="Toggle prompt insights"
            >
              <Icon name="lightbulb" />
            </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
          {chat.messages.map((message) => (
              <ChatMessage
                  key={message.id}
                  message={message}
                  onToggleTts={handleToggleTts}
                  playingMessageId={playingMessageId}
                  onUpdateMessage={handleUpdateMessage}
              />
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 w-full max-w-4xl mx-auto">
          <ChatInput 
              onSendMessage={handleSendMessage} 
              isSending={isSending} 
              onPlayLastMessage={handlePlayLastMessage}
              isTtsPlaying={!!lastAiMessage && playingMessageId === lastAiMessage.id}
              canPlayTts={!!lastAiMessage}
              language={language}
          />
        </div>
      </div>
       {/* Backdrop for mobile when panel is open */}
      {isInsightsPanelOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-10 md:hidden"
            onClick={() => setIsInsightsPanelOpen(false)}
          ></div>
      )}
      <PromptInsightsPanel
        isOpen={isInsightsPanelOpen}
        onClose={() => setIsInsightsPanelOpen(false)}
        insights={insights}
        isLoading={isFetchingInsights}
        currentDdx={latestDdxData?.type === 'ddx' ? latestDdxData.data : null}
        currentQuestions={latestDdxData?.type === 'ddx' ? latestDdxData.questions : null}
      />
    </div>
  );
};


const WelcomeScreen: React.FC<{ onNewChat: (gpt?: PreCodedGpt) => void }> = ({ onNewChat }) => {
    const findGpt = (id: string) => PRE_CODED_GPTS.find(g => g.id === id);

    const cards = [
        {
            id: 'doctor-emergency',
            title: 'Emergency Protocols',
            description: 'Step-by-step guides for ACLS, Trauma, and Critical Care.',
            icon: 'siren',
        },
        {
            id: 'doctor-risk-assessment',
            title: 'Risk Assessment',
            description: 'Calculate risk scores and determine patient disposition.',
            icon: 'shield-heart',
        },
        {
            id: 'doctor-lab',
            title: 'Lab Result Analyzer',
            description: 'Interpret lab results, identify abnormalities, and suggest next steps.',
            icon: 'lab',
        },
    ];

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center relative z-0 animate-fadeInUp bg-aivana-dark">
            {/* Cube Icon - Matches screenshot */}
            <div className="mb-8 text-white">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
            </div>

            <h1 className="text-4xl font-bold text-white mb-4">
                Welcome to the OPD Platform
            </h1>
            <p className="text-gray-400 mb-12 text-lg max-w-2xl mx-auto leading-relaxed">
                Professional out-patient department clinical partner for Internal Medicine, Emergency, and General Practice. Powered by Veda.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl w-full">
                {cards.map((card) => {
                     const gpt = findGpt(card.id);
                     return (
                        <button
                            key={card.id}
                            onClick={() => onNewChat(gpt)}
                            className="flex flex-col text-left p-6 bg-[#1c1c1c] hover:bg-[#2a2a2a] border border-[#333] rounded-xl transition-all group h-full transform hover:-translate-y-1"
                        >
                            <div className="mb-4 text-gray-400 group-hover:text-white">
                                <Icon name={card.icon} className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">
                                {card.title}
                            </h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                {card.description}
                            </p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
