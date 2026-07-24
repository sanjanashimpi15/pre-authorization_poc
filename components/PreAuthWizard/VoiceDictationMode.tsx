/**
 * VoiceDictationMode.tsx
 *
 * Full voice-to-form pipeline:
 * 1. Doctor speaks → live Web Speech API transcript
 * 2. "Process with AI" → AI_PROVIDER-selected model parses → structured data
 * 3. Review panel shows every extracted field
 * 4. "Confirm & Fill All Fields" → wizard jumps to step 4 with everything pre-filled
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { parseTranscript, VoiceExtractedData } from '../../services/voiceDictationService';
import { PreAuthRecord } from './types';
import { calculateTotals } from '../../utils/costCalculator';

interface VoiceDictationModeProps {
    onComplete: (data: VoiceExtractedData) => void;
    onCancel: () => void;
}

type Phase = 'idle' | 'recording' | 'recorded' | 'processing' | 'review' | 'error';

// ─── Web Speech shim ─────────────────────────────────────────────────────────
const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export const VoiceDictationMode: React.FC<VoiceDictationModeProps> = ({
    onComplete, onCancel,
}) => {
    const [phase, setPhase] = useState<Phase>('idle');
    const [transcript, setTranscript] = useState('');
    const [interimText, setInterimText] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [extracted, setExtracted] = useState<VoiceExtractedData | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [elapsed, setElapsed] = useState(0);
    const recognitionRef = useRef<any>(null);
    const shouldRestartRef = useRef(false);   // stable flag survives instance recreation
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── timer ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (phase === 'recording') {
            timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [phase]);

    const formatElapsed = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    // ── start recording ────────────────────────────────────────────────────────
    const startRecording = useCallback(() => {
        if (!SpeechRecognition) {
            setErrorMsg('Your browser does not support voice input. Please use Chrome and try again.');
            setPhase('error');
            return;
        }

        shouldRestartRef.current = true;   // mark that we want recording to keep going

        const launchRec = () => {
            if (!shouldRestartRef.current) return;   // bail if user stopped

            const rec = new SpeechRecognition();
            rec.lang = 'en-IN';
            rec.continuous = true;
            rec.interimResults = true;
            rec.maxAlternatives = 1;

            let finalText = transcript;

            rec.onresult = (e: any) => {
                let interim = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) {
                        finalText += e.results[i][0].transcript + ' ';
                        setTranscript(finalText);
                    } else {
                        interim = e.results[i][0].transcript;
                    }
                }
                setInterimText(interim);
            };

            rec.onerror = (e: any) => {
                // 'no-speech' and 'aborted' are normal — just restart; don't surface as error
                if (e.error === 'no-speech' || e.error === 'aborted') return;
                setErrorMsg(`Mic error: ${e.error}. Please try again.`);
                setPhase('error');
                shouldRestartRef.current = false;
            };

            // onend fires whenever recognition stops (timeout, network hiccup, pause)
            // auto-restart as long as user hasn't clicked Stop
            rec.onend = () => {
                if (shouldRestartRef.current) {
                    setTimeout(launchRec, 100);   // slight delay avoids rapid spinning
                }
            };

            try {
                rec.start();
                recognitionRef.current = rec;
            } catch (err) {
                // ignore "already started" errors
            }
        };

        launchRec();
        setElapsed(0);
        setPhase('recording');
    }, [transcript]);

    // ── stop recording ─────────────────────────────────────────────────────────
    const stopRecording = () => {
        shouldRestartRef.current = false;   // prevent auto-restart
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;   // detach before calling stop
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setInterimText('');
        setPhase('recorded');
    };

    // ── process with Gemini ────────────────────────────────────────────────────
    const processWithAI = async () => {
        const full = (transcript + ' ' + interimText).trim();
        if (!full) { setErrorMsg('No speech captured. Please record first.'); setPhase('error'); return; }
        setPhase('processing');
        try {
            const data = await parseTranscript(full);
            setExtracted(data);
            setPhase('review');
        } catch (err: any) {
            setErrorMsg(`AI processing failed: ${err?.message ?? 'Unknown error'}. You can still edit the transcript manually.`);
            setPhase('error');
        }
    };

    // ── confirm & fill ─────────────────────────────────────────────────────────
    const confirmAndFill = () => {
        if (extracted) onComplete(extracted);
    };

    // ─── Render helpers ────────────────────────────────────────────────────────

    const FIELD_ROW = ({ label, value }: { label: string; value?: string | number | null }) =>
        value != null && value !== '' && value !== 0 ? (
            <div className="flex items-start gap-2 text-xs text-opd-text-primary">
                <span className="text-opd-text-secondary min-w-[130px] flex-shrink-0">{label}</span>
                <span className="text-opd-text-primary font-semibold break-words">{String(value)}</span>
            </div>
        ) : null;

    // ─── IDLE ──────────────────────────────────────────────────────────────────
    if (phase === 'idle' || phase === 'error') {
        return (
            <div className="space-y-6 text-center text-opd-text-primary">
                <div className="space-y-2">
                    <svg className="w-12 h-12 text-opd-primary mx-auto" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                    </svg>
                    <h2 className="text-xl font-bold font-lora text-opd-primary">Voice Dictation Mode</h2>
                    <p className="text-opd-text-secondary text-sm max-w-md mx-auto">
                        Speak the patient's full clinical notes - name, age, diagnosis, vitals, history, treatment plan, cost estimate.
                        AI will extract and fill <strong className="text-opd-text-primary">every field</strong> automatically.
                    </p>
                </div>

                <div className="bg-white border border-opd-border rounded-xl p-4 text-left space-y-1.5 text-xs text-opd-text-secondary shadow-sm">
                    <div className="text-opd-primary font-bold mb-2 uppercase tracking-wider text-[10px] font-lora">What to include in your dictation:</div>
                    {[
                        'Patient: name, age, gender, phone, city',
                        'Insurance: insurer name, TPA, policy number, sum insured',
                        'Presenting complaints and duration',
                        'Vitals: BP, pulse, temperature, SpO2, RR',
                        'Clinical examination findings',
                        'Investigation results (CBC, X-ray, etc.)',
                        'Past history: diabetes, hypertension, etc.',
                        'Diagnosis with reasoning',
                        'Treatment plan: IV antibiotics, O2, ICU, etc.',
                        'Expected stay and cost estimates',
                    ].map(t => <div key={t} className="flex items-center gap-1.5"><span>{t}</span></div>)}
                </div>

                {phase === 'error' && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 text-xs text-left shadow-sm">
                        {errorMsg}
                    </div>
                )}

                {/* Textarea for typing/pasting note directly */}
                <div className="text-left space-y-1.5 mt-4">
                    <label className="text-[10px] font-bold text-opd-primary uppercase tracking-wider font-lora">
                        Or type / paste patient clinical note directly:
                    </label>
                    <textarea
                        value={transcript}
                        onChange={e => {
                            setTranscript(e.target.value);
                            if (phase === 'error') setPhase('idle');
                        }}
                        placeholder="Type or paste doctor's notes (e.g. Ramesh Kumar, 48, Male. Star Health. Admitted for acute appendicitis. Vitals BP 120/80...)"
                        rows={5}
                        className="w-full bg-white border border-opd-border text-opd-text-primary text-xs rounded-xl p-3 focus:ring-1 focus:ring-opd-primary focus:border-opd-primary outline-none resize-none font-mono leading-relaxed shadow-sm"
                    />
                </div>

                <div className="flex gap-3">
                    {transcript.trim() ? (
                        <>
                            <button onClick={() => setTranscript('')}
                                className="btn-secondary flex-1 py-2"
                                type="button">
                                Clear Text
                            </button>
                            <button onClick={processWithAI}
                                className="btn-primary flex-1 py-2 bg-opd-primary text-white font-semibold shadow-sm"
                                type="button">
                                Process with AI
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={onCancel}
                                className="btn-secondary flex-1 py-2"
                                type="button">
                                ← Back
                            </button>
                            <button onClick={startRecording}
                                className="btn-primary flex-1 py-2 bg-red-700 hover:bg-red-600 text-white font-semibold shadow-sm">
                                Start Recording
                            </button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ─── RECORDING ─────────────────────────────────────────────────────────────
    if (phase === 'recording') {
        return (
            <div className="space-y-5 text-center text-opd-text-primary">
                <div className="space-y-3">
                    {/* Animated mic */}
                    <div className="relative inline-flex items-center justify-center">
                        <div className="absolute w-20 h-20 rounded-full bg-red-500/10 animate-ping" />
                        <div className="absolute w-16 h-16 rounded-full bg-red-500/20 animate-ping" style={{ animationDelay: '0.15s' }} />
                        <div className="relative w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-md shadow-red-900/20 text-white">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                            </svg>
                        </div>
                    </div>
                    <div className="text-red-700 font-mono text-base font-bold">{formatElapsed(elapsed)}</div>
                    <div className="text-xs text-opd-text-secondary font-semibold uppercase tracking-wider">Recording... Speak clearly</div>
                </div>

                {/* Live transcript */}
                <div className="bg-opd-input-bg border border-opd-border rounded-lg p-4 min-h-[120px] text-left text-xs font-mono leading-relaxed max-h-48 overflow-y-auto shadow-sm">
                    <span className="text-opd-text-primary">{transcript}</span>
                    <span className="text-opd-text-secondary italic">{interimText}</span>
                    {!transcript && !interimText && (
                        <span className="text-opd-text-muted italic">Listening for speech...</span>
                    )}
                </div>

                <div className="flex gap-3">
                    <button onClick={() => { stopRecording(); setPhase('idle'); setTranscript(''); }}
                        className="btn-secondary flex-1 py-2"
                        type="button">
                        Discard
                    </button>
                    <button onClick={stopRecording}
                        className="btn-secondary flex-1 py-2 font-bold text-red-750 hover:text-red-800"
                        type="button">
                        Stop Recording
                    </button>
                </div>
            </div>
        );
    }

    // ─── RECORDED (review transcript before processing) ────────────────────────
    if (phase === 'recorded') {
        return (
            <div className="space-y-4 text-opd-text-primary">
                <div>
                    <h2 className="text-sm font-semibold text-opd-primary font-lora uppercase tracking-wider">Recording Complete</h2>
                    <p className="text-opd-text-secondary text-xs mt-1">Review or edit the transcript, then let AI extract all fields.</p>
                </div>

                <div className="flex gap-2">
                    <button onClick={() => setEditMode(e => !e)}
                        className={`px-2.5 py-1 rounded text-[10px] uppercase font-bold border transition-colors ${editMode ? 'border-opd-primary text-opd-primary bg-primary-tint/20' : 'border-opd-border text-opd-text-secondary hover:text-opd-primary'}`}
                        type="button">
                        {editMode ? 'Editing' : 'Edit transcript'}
                    </button>
                    <button onClick={() => { setTranscript(''); setPhase('idle'); }}
                        className="px-2.5 py-1 rounded text-[10px] uppercase font-bold border border-opd-border text-opd-text-secondary hover:text-opd-primary hover:bg-gray-50 transition-colors"
                        type="button">
                        Re-record
                    </button>
                    <button onClick={startRecording}
                        className="px-2.5 py-1 rounded text-[10px] uppercase font-bold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                        type="button">
                        Add more
                    </button>
                </div>

                {editMode ? (
                    <textarea
                        ref={textareaRef}
                        value={transcript}
                        onChange={e => setTranscript(e.target.value)}
                        rows={10}
                        className="form-input font-mono"
                    />
                ) : (
                    <div className="bg-opd-input-bg border border-opd-border rounded-lg p-4 text-xs font-mono text-opd-text-primary leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap shadow-sm">
                        {transcript || <span className="text-opd-text-muted italic">No speech captured</span>}
                    </div>
                )}

                <div className="flex gap-3">
                    <button onClick={() => setPhase('idle')}
                        className="btn-secondary flex-1 py-2"
                        type="button">
                        ← Back
                    </button>
                    <button onClick={processWithAI} disabled={!transcript.trim()}
                        className="btn-primary flex-1 py-2 bg-opd-primary text-white disabled:opacity-40 disabled:cursor-not-allowed font-semibold shadow-sm"
                        type="button">
                        Process with AI
                    </button>
                </div>
            </div>
        );
    }

    // ─── PROCESSING ────────────────────────────────────────────────────────────
    if (phase === 'processing') {
        return (
            <div className="flex flex-col items-center justify-center py-20 space-y-6 text-opd-text-primary">
                <div className="relative">
                    <div className="w-20 h-20 rounded-full border-4 border-opd-primary/25 border-t-opd-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center text-2xl"></div>
                </div>
                <div className="text-center space-y-2">
                    <div className="text-opd-text-primary font-bold">Extracting clinical data...</div>
                    <div className="text-opd-text-secondary text-sm">Parsing patient details, vitals, diagnosis, treatment plan, and cost estimates</div>
                </div>
                <div className="flex gap-1.5">
                    {['Patient', 'Clinical', 'Admission', 'Billing'].map((label, i) => (
                        <div key={label} className="flex items-center gap-1 text-xs text-opd-text-secondary">
                            <div className="w-2 h-2 rounded-full bg-opd-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                            {label}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ─── REVIEW ────────────────────────────────────────────────────────────────
    if (phase === 'review' && extracted) {
        const { patient, insurance, clinical, admission } = extracted;
        const vitals = clinical.vitals;
        const dx = clinical.diagnoses?.[0];
        const pmh = admission.pastMedicalHistory;
        const presentConditions = pmh ? Object.entries(pmh).filter(([, v]: any) => v?.present).map(([k]) => k) : [];

        return (
            <div className="space-y-4 text-opd-text-primary">
                {/* Header */}
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-emerald-800 font-lora">AI Extraction Complete</h2>
                        <p className="text-emerald-700 text-xs mt-0.5">Review extracted data, then confirm to fill all wizard fields</p>
                    </div>
                </div>

                <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">

                    {/* Patient */}
                    <Section title="Patient Details" color="blue">
                        <FIELD_ROW label="Name" value={patient.patientName} />
                        <FIELD_ROW label="Age / Gender" value={patient.age ? `${patient.age}${patient.ageUnit === 'months' ? 'M' : 'Y'} · ${patient.gender ?? ''}` : null} />
                        <FIELD_ROW label="Phone" value={patient.mobileNumber} />
                        <FIELD_ROW label="City" value={patient.city} />
                        <FIELD_ROW label="Address" value={patient.address} />
                        <FIELD_ROW label="Occupation" value={patient.occupation} />
                    </Section>

                    {/* Insurance */}
                    <Section title="Insurance Details" color="purple">
                        <FIELD_ROW label="Insurer" value={insurance.insurerName} />
                        <FIELD_ROW label="TPA" value={insurance.tpaName} />
                        <FIELD_ROW label="Policy No." value={insurance.policyNumber} />
                        <FIELD_ROW label="Sum Insured" value={insurance.sumInsured ? `₹${insurance.sumInsured.toLocaleString('en-IN')}` : null} />
                    </Section>

                    {/* Clinical */}
                    <Section title="Clinical Details" color="cyan">
                        <FIELD_ROW label="Chief Complaints" value={clinical.chiefComplaints} />
                        <FIELD_ROW label="Duration" value={clinical.durationOfPresentAilment} />
                        <FIELD_ROW label="Nature" value={clinical.natureOfIllness} />
                        {dx && <FIELD_ROW label="Primary Diagnosis" value={`${dx.diagnosis} (${dx.icd10Code})`} />}
                        {clinical.diagnoses && clinical.diagnoses.length > 1 && (
                            <FIELD_ROW label="Other Diagnoses" value={clinical.diagnoses.slice(1).map(d => d.diagnosis).join(', ')} />
                        )}
                        <FIELD_ROW label="History" value={clinical.historyOfPresentIllness} />
                        <FIELD_ROW label="Exam Findings" value={clinical.relevantClinicalFindings} />
                        <FIELD_ROW label="Prior Treatment" value={clinical.treatmentTakenSoFar} />
                        <FIELD_ROW label="OPD Justification" value={clinical.reasonForHospitalisation} />
                    </Section>

                    {/* Vitals */}
                    {vitals && (vitals.bp || vitals.pulse || vitals.spo2) && (
                        <Section title="Vitals" color="amber">
                            <div className="grid grid-cols-5 gap-2">
                                {([['BP', vitals.bp], ['Pulse', vitals.pulse], ['Temp', vitals.temp ? `${vitals.temp}°F` : ''], ['SpO2', vitals.spo2 ? `${vitals.spo2}%` : ''], ['RR', vitals.rr]] as [string, string][]).map(([l, v]) => v ? (
                                    <div key={l} className={`bg-white border border-opd-border rounded-lg p-2 text-center shadow-sm ${l === 'SpO2' && parseInt(v) < 94 ? 'border-red-200 bg-red-50 text-red-800' : ''}`}>
                                        <div className={`text-xs font-bold font-mono ${l === 'SpO2' && parseInt(v) < 94 ? 'text-red-700' : 'text-opd-text-primary'}`}>{v}</div>
                                        <div className="text-[10px] text-opd-text-secondary mt-0.5">{l}</div>
                                    </div>
                                ) : null)}
                            </div>
                            {vitals.spo2 && parseInt(vitals.spo2) < 94 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-red-800 text-xs font-semibold leading-relaxed shadow-sm">
                                    SpO2 {vitals.spo2}% - Critical hypoxia. This strongly supports inpatient necessity.
                                </div>
                            )}
                        </Section>
                    )}

                    {/* Admission */}
                    <Section title="Admission & Stay" color="green">
                        <FIELD_ROW label="Type" value={admission.admissionType} />
                        <FIELD_ROW label="Room Category" value={admission.roomCategory} />
                        <FIELD_ROW label="Expected Stay" value={admission.expectedLengthOfStay ? `${admission.expectedLengthOfStay} days` : null} />
                        <FIELD_ROW label="ICU Days" value={admission.expectedDaysInICU ? `${admission.expectedDaysInICU} days` : null} />
                        {presentConditions.length > 0 && (
                            <FIELD_ROW label="Past History" value={presentConditions.join(', ')} />
                        )}
                    </Section>

                    {/* Treatment */}
                    {clinical.proposedLineOfTreatment && (
                        <Section title="Treatment Plan" color="rose">
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(clinical.proposedLineOfTreatment).filter(([, v]) => v).map(([k]) => (
                                    <span key={k} className="px-2 py-1 bg-primary-tint border border-opd-primary/10 rounded-md text-[10px] text-opd-primary font-bold uppercase tracking-wider capitalize font-mono shadow-sm">{k.replace(/([A-Z])/g, ' $1')}</span>
                                ))}
                            </div>
                        </Section>
                    )}
                </div>

                <div className="flex gap-3 pt-1">
                    <button onClick={() => setPhase('recorded')}
                        className="btn-secondary flex-1 py-2"
                        type="button">
                        ← Re-process
                    </button>
                    <button onClick={confirmAndFill}
                        className="btn-primary flex-1 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold shadow-sm"
                        type="button">
                        Confirm & Fill Fields
                    </button>
                </div>
            </div>
        );
    }

    return null;
};

// ─── Section wrapper ───────────────────────────────────────────────────────────
const COLOR_MAP: Record<string, string> = {
    blue: 'border-opd-border bg-white shadow-sm',
    purple: 'border-opd-border bg-white shadow-sm',
    cyan: 'border-opd-border bg-white shadow-sm',
    amber: 'border-opd-border bg-white shadow-sm',
    green: 'border-opd-border bg-white shadow-sm',
    rose: 'border-opd-border bg-white shadow-sm',
};

const Section: React.FC<{ title: string; color: string; children: React.ReactNode }> = ({ title, color, children }) => {
    const hasContent = React.Children.toArray(children).some(c => c !== null && c !== undefined && c !== false);
    if (!hasContent) return null;
    return (
        <div className={`rounded-lg border p-4 space-y-2.5 ${COLOR_MAP[color] ?? ''}`}>
            <div className="text-[10px] font-bold text-opd-primary font-lora uppercase tracking-wider border-b border-opd-border pb-1.5">{title}</div>
            {children}
        </div>
    );
};
