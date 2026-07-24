import React, { useState } from 'react';
import { Message, LabResultAnalysis, MedicalCodeResult, PatientHandout, LabParameter, RiskAssessmentResult, DdxItem } from '../types';
import { Icon } from './Icon';
import { TypingIndicator } from './TypingIndicator';
import { renderMarkdownToHTML } from '../utils/markdownRenderer';

interface ChatMessageProps {
  message: Message;
  onToggleTts: (message: Message) => void;
  playingMessageId: string | null;
  onUpdateMessage: (messageId: string, updates: Partial<Message>) => void;
}

const Citations: React.FC<{ citations: NonNullable<Message['citations']> }> = ({ citations }) => {
    if (citations.length === 0) return null;

    return (
        <div className="mt-4 pt-3 border-t border-gray-500/50">
            <h4 className="text-xs font-semibold text-gray-300 mb-2">Sources</h4>
            <div className="flex flex-wrap gap-2">
                {citations.map((citation, index) => (
                    <a
                        key={index}
                        href={citation.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-gray-600/50 hover:bg-gray-600 text-gray-200 rounded-full px-2 py-1 transition-colors truncate max-w-xs"
                        title={citation.title}
                    >
                        {index + 1}. {citation.title}
                    </a>
                ))}
            </div>
        </div>
    );
};

// --- Structured Data Renderers ---

const RenderDdx: React.FC<{ items: DdxItem[] }> = ({ items }) => {
    if (!items || items.length === 0) return null;

    const normalizeConfidence = (c: string) => {
        const lower = (c || '').toLowerCase();
        if (lower.includes('high')) return 'High';
        if (lower.includes('medium')) return 'Medium';
        if (lower.includes('low')) return 'Low';
        return 'Low'; 
    };

    const grouped = {
        High: items.filter(i => normalizeConfidence(i.confidence) === 'High'),
        Medium: items.filter(i => normalizeConfidence(i.confidence) === 'Medium'),
        Low: items.filter(i => normalizeConfidence(i.confidence) === 'Low')
    };

    const renderSection = (title: string, items: DdxItem[], colorClass: string, bgClass: string, badgeClass: string) => (
        <div className="mb-4 last:mb-0">
             <h5 className={`text-[10px] font-bold ${colorClass} uppercase tracking-wider mb-2 flex items-center gap-2`}>
                <span className={`w-2 h-2 rounded-full ${bgClass}`}></span>
                {title}
            </h5>
            <div className="space-y-2">
                {items.map((item, i) => (
                    <div key={i} className="bg-[#18181b] border border-white/10 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-1.5 gap-3">
                            <span className="font-bold text-gray-200 text-sm">{item.diagnosis}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeClass} uppercase whitespace-nowrap`}>
                                {normalizeConfidence(item.confidence)}
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">
                            {item.rationale}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center gap-2 mb-4">
                 <div className="p-1.5 bg-aivana-accent/20 rounded-md">
                     <Icon name="diagnosis" className="w-4 h-4 text-aivana-accent" />
                 </div>
                 <h4 className="text-sm font-bold text-gray-100">Differential Diagnosis</h4>
            </div>

            <div className="space-y-4">
                {grouped.High.length > 0 && renderSection('High Probability', grouped.High, 'text-green-400', 'bg-green-500', 'text-green-400 bg-green-900/20 border-green-500/30')}
                {grouped.Medium.length > 0 && renderSection('Medium Probability', grouped.Medium, 'text-yellow-400', 'bg-yellow-500', 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30')}
                {grouped.Low.length > 0 && renderSection('Low Probability', grouped.Low, 'text-blue-400', 'bg-blue-500', 'text-blue-400 bg-blue-900/20 border-blue-500/30')}
            </div>
        </div>
    );
};

const RenderLabAnalysis: React.FC<{ analysis: LabResultAnalysis }> = ({ analysis }) => {
    const getUrgencyClass = (urgency: LabParameter['urgency']) => {
        switch (urgency) {
            case 'Critical': return 'text-red-400 border-red-500';
            case 'Abnormal': return 'text-yellow-400 border-yellow-500';
            default: return 'text-gray-400 border-gray-600';
        }
    };
    return (
        <div className="mt-4 pt-3 border-t border-aivana-light-grey/80">
            <h4 className="text-sm font-semibold text-gray-200 mb-2">Lab Result Analysis</h4>
            <p className="text-xs text-gray-300 mb-4 italic">"{analysis.overallInterpretation}"</p>
            <div className="space-y-2">
                {analysis.results.map((param, index) => (
                    <div key={index} className={`p-2.5 bg-aivana-grey/50 rounded-lg border-l-2 ${getUrgencyClass(param.urgency)}`}>
                        <div className="flex justify-between items-start">
                            <span className="font-semibold text-white text-sm">{param.parameter}</span>
                            <span className="font-mono text-sm">{param.value}</span>
                        </div>
                        <div className="text-xs text-gray-400 flex justify-between items-center mt-1">
                             <span>Ref: {param.referenceRange}</span>
                             <span className={`font-semibold ${param.urgency !== 'Normal' ? 'text-white' : ''}`}>{param.urgency}</span>
                        </div>
                        <p className="text-xs text-gray-300 mt-2">{param.interpretation}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

const RenderMedicalCodes: React.FC<{ result: MedicalCodeResult }> = ({ result }) => (
    <div className="mt-4 pt-3 border-t border-aivana-light-grey/80">
        <h4 className="text-sm font-semibold text-gray-200 mb-2">Medical Coding Suggestions</h4>
        <p className="text-xs text-gray-400 mb-3">For query: "{result.query}"</p>
        <div className="space-y-2">
            {result.codes.map((code, index) => (
                <div key={index} className="flex items-start gap-3 p-2 bg-aivana-grey/50 rounded-lg">
                    <span className="font-mono text-sm bg-aivana-dark text-aivana-accent px-2 py-1 rounded">{code.code}</span>
                    <p className="text-sm text-gray-200">{code.description}</p>
                </div>
            ))}
        </div>
    </div>
);

const RenderPatientHandout: React.FC<{ handout: PatientHandout }> = ({ handout }) => (
    <div className="mt-4 pt-3 border-t border-aivana-light-grey/80">
        <div className="p-4 bg-aivana-dark rounded-lg border border-aivana-light-grey">
            <h4 className="text-lg font-bold text-aivana-accent mb-2">{handout.title}</h4>
            <p className="text-sm text-gray-300 mb-4">{handout.introduction}</p>
            <div className="space-y-3">
                {handout.sections.map((section, index) => (
                    <div key={index}>
                        <h5 className="font-semibold text-white mb-1">{section.heading}</h5>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">{section.content}</p>
                    </div>
                ))}
            </div>
            <p className="text-xs text-gray-500 mt-6 pt-3 border-t border-aivana-light-grey">{handout.disclaimer}</p>
        </div>
    </div>
);

const RenderRiskAssessment: React.FC<{ assessment: RiskAssessmentResult }> = ({ assessment }) => {
    const getRiskLevelClass = (level: RiskAssessmentResult['riskLevel']) => {
        switch (level) {
            case 'High': return 'bg-red-500/20 text-red-300 border-red-500/50';
            case 'Medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
            default: return 'bg-green-500/20 text-green-300 border-green-500/50';
        }
    };

    return (
        <div className="mt-4 pt-3 border-t border-aivana-light-grey/80">
            <h4 className="text-sm font-semibold text-gray-200 mb-3">Risk Assessment Result</h4>
            <div className={`p-3 rounded-lg border-l-4 ${getRiskLevelClass(assessment.riskLevel)}`}>
                <p className="text-xs font-medium uppercase tracking-wider">Risk Level</p>
                <p className="text-2xl font-bold text-white">{assessment.riskLevel}</p>
            </div>
            
            <div className="mt-4">
                <h5 className="font-semibold text-white mb-2 text-sm">Contributing Risk Factors</h5>
                <ul className="list-disc list-inside space-y-1 text-xs text-gray-300">
                    {assessment.riskFactors.map((factor, index) => (
                        <li key={index}>{factor}</li>
                    ))}
                </ul>
            </div>
            
            <div className="mt-4">
                <h5 className="font-semibold text-white mb-2 text-sm">Management Recommendations</h5>
                <ul className="list-disc list-inside space-y-1 text-xs text-gray-300">
                    {assessment.recommendations.map((rec, index) => (
                        <li key={index}>{rec}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
};


const StructuredContent: React.FC<{ message: Message }> = ({ message }) => {
    if (!message.structuredData) return null;

    switch (message.structuredData.type) {
        case 'ddx':
            return <RenderDdx items={message.structuredData.data} />;
        case 'lab':
            return <RenderLabAnalysis analysis={message.structuredData.data} />;
        case 'billing':
            return <RenderMedicalCodes result={message.structuredData.data} />;
        case 'handout':
            return <RenderPatientHandout handout={message.structuredData.data} />;
        case 'risk-assessment':
            return <RenderRiskAssessment assessment={message.structuredData.data} />;
        default:
            return null;
    }
};

const SafetyHeader: React.FC<{ message: Message }> = ({ message }) => {
  if (!message.action_type) return null;

  const isConfirmationRequired = message.action_type === 'Requires Clinician Confirmation';
  const colorClass = isConfirmationRequired ? 'bg-yellow-500/20 text-yellow-300' : 'bg-blue-500/20 text-blue-300';

  return (
    <div className={`text-xs px-3 py-1.5 border-b border-aivana-light-grey/50 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 ${colorClass}`}>
        <div className="flex items-center gap-2">
            <span className="font-semibold">SOURCE:</span>
            <span className="font-mono text-xs bg-black/20 px-1.5 py-0.5 rounded">{message.source_protocol_id || 'General AI Knowledge'}</span>
            {message.source_protocol_last_reviewed && (
                 <span className="font-semibold">(Reviewed: {message.source_protocol_last_reviewed})</span>
            )}
        </div>
        <span className="font-semibold">{message.action_type}</span>
    </div>
  );
};

const ConfirmationFooter: React.FC<{ message: Message, onConfirm: () => void }> = ({ message, onConfirm }) => {
    if (message.action_type !== 'Requires Clinician Confirmation') return null;

    return (
        <div className="mt-4 pt-3 border-t border-aivana-light-grey/50">
            <button
                onClick={onConfirm}
                disabled={message.is_confirmed}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    message.is_confirmed
                        ? 'bg-green-600/50 text-white cursor-default'
                        : 'bg-yellow-600/80 hover:bg-yellow-600 text-white'
                }`}
            >
                <Icon name="shieldCheck" className="w-4 h-4" />
                {message.is_confirmed ? 'Action Confirmed by Clinician' : 'Confirm Action'}
            </button>
        </div>
    );
};


export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onToggleTts, playingMessageId, onUpdateMessage }) => {
  const isUser = message.sender === 'USER';
  const isPlaying = playingMessageId === message.id;
  const [feedback, setFeedback] = useState<Message['feedback']>(message.feedback || null);

  const handleFeedback = (newFeedback: 'good' | 'bad') => {
      // In a real app, you'd also send this to a logging service
      const updatedFeedback = feedback === newFeedback ? null : newFeedback;
      setFeedback(updatedFeedback);
      onUpdateMessage(message.id, { feedback: updatedFeedback });
  };
  
  const handleConfirm = () => {
    if (!message.is_confirmed) {
        console.log(`[AUDIT] Clinician confirmed action for message ID: ${message.id}. Content: "${message.text.substring(0, 100)}..."`);
        onUpdateMessage(message.id, { is_confirmed: true });
    }
  };


  return (
    <div className={`flex items-start gap-3 my-4 ${isUser ? 'justify-end' : 'justify-start'} animate-fadeInUp`}>
      {!isUser && (
        <div className="w-8 h-8 flex-shrink-0 rounded-full bg-aivana-accent flex items-center justify-center">
            <Icon name="ai" className="w-5 h-5 text-white" />
        </div>
      )}
      <div className={`flex items-end gap-2 max-w-2xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`shadow-md overflow-hidden ${
            isUser 
            ? 'bg-aivana-accent text-white rounded-t-2xl rounded-bl-2xl' 
            : 'bg-aivana-light-grey rounded-t-2xl rounded-br-2xl'
        }`}>
          {!isUser && <SafetyHeader message={message} />}
          <div className="px-4 py-3">
              {message.text === '...' ? (
                <TypingIndicator />
              ) : isUser ? (
                <div className="text-sm whitespace-pre-wrap">{message.text}</div>
              ) : (
                <div
                  className="text-sm prose prose-sm prose-invert max-w-none [&_table]:border [&_table]:border-aivana-light-grey/50 [&_th]:p-2 [&_td]:p-2 [&_td]:border-t [&_td]:border-aivana-light-grey/50"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(message.text) }}
                />
              )}
              <StructuredContent message={message} />
              {message.citations && <Citations citations={message.citations} />}
          </div>
          {!isUser && <ConfirmationFooter message={message} onConfirm={handleConfirm} />}
        </div>
        {!isUser && message.text.length > 0 && message.text !== '...' && (
             <div className="flex flex-col space-y-1 self-end">
                <button
                    onClick={() => onToggleTts(message)}
                    className={`p-1.5 rounded-full transition-colors ${isPlaying ? 'text-white bg-aivana-accent' : 'text-gray-400 hover:text-white bg-aivana-light-grey hover:bg-aivana-grey'}`}
                    aria-label={isPlaying ? "Stop speech" : "Read message aloud"}
                    title={isPlaying ? "Stop speech" : "Read aloud"}
                >
                    <Icon name={isPlaying ? "stopCircle" : "speaker"} className="w-5 h-5" />
                </button>
                <button
                    onClick={() => handleFeedback('good')}
                    className={`p-1.5 rounded-full transition-colors ${feedback === 'good' ? 'text-green-400 bg-aivana-grey' : 'text-gray-400 hover:text-green-400 bg-aivana-light-grey hover:bg-aivana-grey'}`}
                    aria-label="Good response"
                    title="Good response"
                >
                    <Icon name="thumb-up" className="w-4 h-4" />
                </button>
                 <button
                    onClick={() => handleFeedback('bad')}
                    className={`p-1.5 rounded-full transition-colors ${feedback === 'bad' ? 'text-red-400 bg-aivana-grey' : 'text-gray-400 hover:text-red-400 bg-aivana-light-grey hover:bg-aivana-grey'}`}
                    aria-label="Bad response"
                    title="Bad response"
                >
                    <Icon name="thumb-down" className="w-4 h-4" />
                </button>
            </div>
        )}
      </div>
      {isUser && (
         <div className="w-8 h-8 flex-shrink-0 rounded-full bg-gray-600 flex items-center justify-center">
            <Icon name="user" className="w-5 h-5 text-white" />
        </div>
      )}
    </div>
  );
};