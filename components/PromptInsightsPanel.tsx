
import React from 'react';
import { PromptInsight, DdxItem } from '../types';
import { Icon } from './Icon';

interface PromptInsightsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  insights: PromptInsight | null;
  isLoading: boolean;
  currentDdx?: DdxItem[] | null;
  currentQuestions?: string[] | null;
}

const InsightSection: React.FC<{ title: string; icon: string; children: React.ReactNode; isPriority?: boolean }> = ({ title, icon, children, isPriority }) => (
    <div className={`mb-6 last:mb-0 ${isPriority ? 'bg-aivana-accent/5 p-4 rounded-xl border border-aivana-accent/10' : ''}`}>
        <h3 className={`flex items-center gap-2 text-sm font-bold mb-3 ${isPriority ? 'text-white' : 'text-aivana-accent'}`}>
            <Icon name={icon} className={`w-4 h-4 ${isPriority ? 'text-aivana-accent' : ''}`} />
            {title}
        </h3>
        <div className="text-sm text-gray-300 space-y-2">
            {children}
        </div>
    </div>
);

export const PromptInsightsPanel: React.FC<PromptInsightsPanelProps> = ({ isOpen, onClose, insights, isLoading, currentDdx, currentQuestions }) => {
    if (!isOpen) {
        return null;
    }

    return (
        <aside className="fixed top-0 right-0 h-full w-full max-w-sm md:relative md:max-w-none md:w-1/3 lg:w-80 bg-aivana-dark-sider border-l border-aivana-light-grey flex flex-col z-20 md:z-0 transform transition-transform md:translate-x-0"
            style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
        >
            <header className="flex items-center justify-between p-4 border-b border-aivana-light-grey flex-shrink-0">
                <div className="flex items-center gap-3">
                    <Icon name="lightbulb" className="w-6 h-6 text-yellow-300" />
                    <h2 className="text-lg font-bold text-white">Clinical Insights</h2>
                </div>
                <button onClick={onClose} className="p-1 rounded-full hover:bg-aivana-light-grey">
                    <Icon name="close" className="w-5 h-5" />
                </button>
            </header>

            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                
                {isLoading && (
                    <div className="flex items-center justify-center h-32">
                        <div className="flex flex-col items-center text-gray-400">
                             <div className="w-8 h-8 border-4 border-t-transparent border-aivana-accent rounded-full animate-spin mb-4"></div>
                             <span className="text-xs font-bold uppercase tracking-widest">Analyzing Dialogue...</span>
                        </div>
                    </div>
                )}

                {/* 1. PRIMARY QUESTIONS (from Prompt Analysis) */}
                {!isLoading && insights && insights.followUps.length > 0 && (
                    <InsightSection title="Suggested Follow-ups" icon="chatHistory" isPriority>
                        <ul className="space-y-2">
                            {insights.followUps.map((q, i) => (
                                <li key={i} className="flex gap-2 text-xs leading-relaxed group cursor-pointer hover:text-white transition-colors">
                                    <span className="text-aivana-accent font-bold">•</span>
                                    {q}
                                </li>
                            ))}
                        </ul>
                    </InsightSection>
                )}

                {/* 2. CONTEXTUAL QUESTIONS (from Differential Diagnosis) */}
                {!isLoading && currentQuestions && currentQuestions.length > 0 && (
                    <InsightSection title="Questions to Ask Patient" icon="help" isPriority>
                        <ul className="space-y-2">
                            {currentQuestions.map((q, i) => (
                                <li key={i} className="text-xs text-gray-300 p-2.5 bg-black/40 rounded-lg border border-white/5 flex gap-2">
                                    <span className="text-aivana-accent font-bold">?</span>
                                    {q}
                                </li>
                            ))}
                        </ul>
                    </InsightSection>
                )}
                
                {/* 3. SECONDARY INSIGHTS */}
                {!isLoading && insights && (
                    <div className="mt-8 pt-8 border-t border-aivana-light-grey space-y-8 animate-fadeInUp">
                        <InsightSection title="Key Clinical Terms" icon="search">
                            {insights.keyTerms.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {insights.keyTerms.map((term, i) => (
                                        <span key={i} className="px-2 py-1 bg-aivana-grey rounded text-[10px] font-mono border border-white/5">
                                            {term}
                                        </span>
                                    ))}
                                </div>
                            ) : <p className="text-gray-500 italic text-xs">No terms identified.</p>}
                        </InsightSection>
                        
                        <InsightSection title="Refinement Suggestions" icon="sparkles">
                             {insights.suggestions.length > 0 ? (
                                <ul className="list-disc list-inside space-y-1 text-xs text-gray-400">
                                    {insights.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                            ) : <p className="text-gray-500 italic text-xs">Prompt precision is optimal.</p>}
                        </InsightSection>
                    </div>
                )}

                {!isLoading && !insights && !currentQuestions && (
                     <div className="flex items-center justify-center h-64">
                        <div className="text-center text-gray-600 p-4">
                             <Icon name="diagnosis" className="w-10 h-10 mx-auto mb-3 opacity-10"/>
                             <p className="text-[10px] uppercase font-bold tracking-widest">Awaiting Clinical Signal</p>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
};
