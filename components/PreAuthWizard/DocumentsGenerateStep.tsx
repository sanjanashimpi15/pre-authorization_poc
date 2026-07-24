import React, { useRef, useMemo } from 'react';
import { PreAuthRecord } from '../PreAuthWizard/types';
import { generateFull9PagePreAuthHtml } from '../../services/preAuthGenerator';

interface DocGenerateStepProps {
    record: Partial<PreAuthRecord>;
    onRecordChange?: (r: Partial<PreAuthRecord>) => void;
    onBack: () => void;
    onGenerate?: (irdaiText: string) => void;
    defaultTab?: 'docs' | 'necessity' | 'summary' | 'declarations' | 'tpa-review';
    isDemo?: boolean;
    onResetDemo?: () => void;
    onJumpToStep?: (step: 1 | 2 | 3 | 4) => void;
    externalTpaReport?: any;
}

export const DocumentsGenerateStep: React.FC<DocGenerateStepProps> = ({
    record,
    onBack
}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const htmlContent = useMemo(() => {
        return generateFull9PagePreAuthHtml(record);
    }, [record]);

    const handleDownload = () => {
        const iframe = iframeRef.current;
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        }
    };

    return (
        <div className="space-y-6 text-opd-text-primary">
            {/* Header section */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold font-lora text-opd-primary">Review & Generate Summary</h2>
                    <p className="text-opd-text-secondary text-sm mt-1">Review the generated 9-page Pre-Authorization PDF document before downloading or submitting.</p>
                </div>
                <button
                    type="button"
                    onClick={onBack}
                    className="btn-secondary px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
                >
                    ← Back to Cost Estimation
                </button>
            </div>

            {/* 9-Page Embedded PDF Viewer stretching across full main column */}
            <div className="w-full space-y-4">
                <div className="bg-white p-4 rounded-2xl border border-opd-border shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-opd-border pb-3">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-xs uppercase tracking-wider text-opd-primary font-lora">Generated Pre-Authorization Form</span>
                            <span className="text-[10px] bg-primary-tint text-opd-primary px-2 py-0.5 rounded font-mono font-bold border border-opd-primary/10">9 Pages A4</span>
                        </div>
                        <span className="text-[11px] text-emerald-500 font-bold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Document Ready
                        </span>
                    </div>

                    <div className="space-y-4">
                        <iframe
                            ref={iframeRef}
                            srcDoc={htmlContent}
                            title="Pre-Authorization 9-Page PDF Summary Preview"
                            className="w-full h-[750px] bg-white rounded-xl border border-opd-border shadow-inner"
                        />
                        <div className="flex items-center justify-between bg-opd-input-bg p-3.5 rounded-xl border border-opd-border">
                            <div className="text-xs text-opd-text-secondary">
                                Scroll through all 9 pages above. Both preview and download read from the exact same native rendering pipeline.
                            </div>
                            <button
                                type="button"
                                onClick={handleDownload}
                                className="btn-primary py-2.5 px-6 flex items-center gap-2 text-xs font-bold shadow-md shrink-0"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                Download Pre-Authorization PDF
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocumentsGenerateStep;
