import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
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

// Deep nested path updating utility
function setNestedPath(obj: any, path: string, value: any): any {
    const clone = JSON.parse(JSON.stringify(obj));
    const parts = path.split('.');
    let current = clone;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const nextPart = parts[i + 1];
        const isNextNumber = /^\d+$/.test(nextPart);

        if (current[part] === undefined || current[part] === null) {
            current[part] = isNextNumber ? [] : {};
        }
        current = current[part];
    }
    const lastPart = parts[parts.length - 1];

    // Cast value if it should be numeric and is not a string ID field
    if (/^\d+(\.\d+)?$/.test(value) && lastPart !== 'mobileNumber' && lastPart !== 'policyNumber' && lastPart !== 'tpaIdCardNumber') {
        current[lastPart] = Number(value);
    } else if (value === 'true' || value === true) {
        current[lastPart] = true;
    } else if (value === 'false' || value === false) {
        current[lastPart] = false;
    } else {
        current[lastPart] = value;
    }

    return clone;
}

export const DocumentsGenerateStep: React.FC<DocGenerateStepProps> = ({
    record,
    onBack
}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [finalCaseData, setFinalCaseData] = useState<Partial<PreAuthRecord>>(() => record);

    const initialHtmlContent = useMemo(() => {
        return generateFull9PagePreAuthHtml(record, { editable: true });
    }, [record]);

    const setupIframeListeners = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;

        const inputs = doc.querySelectorAll('[data-field]');
        inputs.forEach(input => {
            const el = input as HTMLInputElement | HTMLTextAreaElement;

            const handleEvent = (e: Event) => {
                const target = e.target as HTMLInputElement | HTMLTextAreaElement;
                const path = target.getAttribute('data-field');
                if (!path) return;

                const value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;

                // Sync all duplicate fields inside the iframe's DOM in real-time
                const duplicates = doc.querySelectorAll(`[data-field="${path}"]`);
                duplicates.forEach(dup => {
                    if (dup !== target) {
                        if (dup.type === 'checkbox') {
                            (dup as HTMLInputElement).checked = target.type === 'checkbox' ? (target as HTMLInputElement).checked : false;
                        } else if (dup.type === 'radio') {
                            const radio = dup as HTMLInputElement;
                            radio.checked = radio.value === target.value;
                        } else {
                            (dup as HTMLInputElement | HTMLTextAreaElement).value = target.value;
                        }
                    }
                });

                setFinalCaseData(prev => {
                    return setNestedPath(prev, path, value);
                });
            };

            // Remove existing listeners if any (to prevent multiple listener bindings)
            el.removeEventListener('input', handleEvent);
            el.removeEventListener('change', handleEvent);

            el.addEventListener('input', handleEvent);
            el.addEventListener('change', handleEvent);
        });
    }, []);

    // Set up listeners whenever the iframe loads or re-renders
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const handleLoad = () => {
            setupIframeListeners();
        };

        iframe.addEventListener('load', handleLoad);
        setupIframeListeners();

        return () => {
            iframe.removeEventListener('load', handleLoad);
        };
    }, [setupIframeListeners]);

    const handleDownload = () => {
        const iframe = iframeRef.current;
        if (iframe && iframe.contentWindow) {
            const printHtml = generateFull9PagePreAuthHtml(finalCaseData, { editable: false });
            const doc = iframe.contentDocument || iframe.contentWindow.document;

            // Write printable read-only version to the iframe
            doc.open();
            doc.write(printHtml);
            doc.close();

            // Set up afterprint restore hook before calling print
            iframe.contentWindow.onafterprint = () => {
                // Restore the editable preview from the latest finalCaseData state
                const editableHtml = generateFull9PagePreAuthHtml(finalCaseData, { editable: true });
                doc.open();
                doc.write(editableHtml);
                doc.close();

                // Re-bind listeners to the restored editable DOM
                setupIframeListeners();
            };

            // Trigger printing after browser layout engine finishes writing the content
            setTimeout(() => {
                if (iframe.contentWindow) {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                }
            }, 100);
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

                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 font-semibold leading-relaxed shadow-sm flex items-start gap-2">
                        <span className="text-base leading-none">💡</span>
                        <span>
                            Edits made in the preview below affect only the final downloaded/printed PDF and do not propagate back to the database or recalculate the Claim Readiness score.
                        </span>
                    </div>

                    <div className="space-y-4">
                        <iframe
                            ref={iframeRef}
                            srcDoc={initialHtmlContent}
                            onLoad={setupIframeListeners}
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
