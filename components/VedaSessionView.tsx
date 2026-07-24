
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DoctorProfile, TranscriptEntry } from '../types';
import { Icon } from './Icon';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { processAudioSegment, generateClinicalNote } from '../services/geminiService';
import { renderMarkdownToHTML } from '../utils/markdownRenderer';
import { Mic, Activity, CheckCircle2, Circle, Clock, Download, FileText, ChevronRight, X, Wifi, BedDouble } from 'lucide-react';
import { createIPDCase } from '../services/ipdService';
import { detectAdmissionIntent, extractTestMentions } from '../utils/admissionDetector';
import { InsurancePreAuthModal } from './InsurancePreAuthModal';
import { NexusInsuranceInput, PreAuthSubmission } from '../types';

interface ScribeSessionViewProps {
    onEndSession: () => void;
    doctorProfile: DoctorProfile;
    language: string;
}

interface PatientDemographics {
    name: string; age: string; sex: string; mobile: string; weight: string; height: string; bmi: string;
    date: string; hospitalName: string; hospitalAddress: string; hospitalPhone: string;
}

// --- Helper Components ---

const BreathingWaveform: React.FC<{ active: boolean }> = ({ active }) => {
    return (
        <div className="flex items-center justify-center gap-1.5 h-32 w-full">
            {[...Array(20)].map((_, i) => (
                <div
                    key={i}
                    className={`w-2.5 rounded-full ${active ? 'bg-veda-purple animate-waveform mix-blend-multiply' : 'bg-gray-200 h-2'}`}
                    style={{
                        animationDuration: `${0.6 + Math.random() * 0.4}s`,
                        animationDelay: `${i * 0.05}s`
                    }}
                ></div>
            ))}
        </div>
    );
};

// --- Main Layout Components ---

const SidebarChecklist: React.FC<{ progress: number }> = ({ progress }) => {
    const steps = [
        { label: "Chief Complaint", done: progress >= 25 },
        { label: "Vitals & Exam", done: progress >= 50 },
        { label: "Diagnosis", done: progress >= 75 },
        { label: "Treatment Plan", done: progress >= 100 },
    ];

    return (
        <div className="space-y-4">
            {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-3">
                    <div className={`transition-all duration-300 ${step.done ? 'text-opd-success scale-110' : 'text-gray-300'}`}>
                        {step.done ? <CheckCircle2 className="w-5 h-5 fill-opd-success text-white" /> : <Circle className="w-5 h-5" />}
                    </div>
                    <span className={`text-sm font-medium transition-colors ${step.done ? 'text-opd-text-primary' : 'text-opd-text-muted'}`}>{step.label}</span>
                </div>
            ))}
        </div>
    );
};

const TranscriptBubble: React.FC<{ entry: TranscriptEntry }> = ({ entry }) => (
    <div className={`flex w-full ${entry.speaker === 'Doctor' ? 'justify-end' : 'justify-start'} mb-4 animate-fadeInUp`}>
        <div className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-sm border ${entry.speaker === 'Doctor'
            ? 'bg-opd-primary/10 border-opd-primary/20 text-opd-text-primary rounded-tr-none'
            : 'bg-white border-opd-border text-opd-text-secondary rounded-tl-none'
            }`}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">
                {entry.speaker}
            </div>
            {entry.text}
        </div>
    </div>
);

// --- Prescription Template (Matches Spec) ---
const PrescriptionTemplate: React.FC<{ patient: PatientDemographics; clinicalNote: string; isPreview?: boolean }> = ({ patient, clinicalNote, isPreview }) => {
    const getSectionContent = (title: string) => {
        if (!clinicalNote) return "";
        const regex = new RegExp(`##\\s*${title}[^]*?(?=##|$)`, 'i');
        const match = clinicalNote.match(regex);
        return match ? match[0].replace(new RegExp(`##\\s*${title}`, 'i'), '').trim() : "";
    };

    const containerClass = "w-full bg-white text-black p-8 relative shadow-card min-h-[800px] border border-gray-100";
    // const baseFontSize = isPreview ? 'text-[10px]' : 'text-[12.5px]'; // Removed unused const

    return (
        <div className={containerClass}>
            {/* Header */}
            <div className="flex justify-between items-start mb-6 border-b-2 border-opd-primary pb-4">
                <div>
                    <h2 className="text-xl font-bold uppercase text-opd-text-primary">Medical Prescription</h2>
                    <p className="text-xs text-gray-500 mt-1">Reg No: 12345678</p>
                </div>
                <div className="text-right">
                    <h3 className="font-bold text-lg text-opd-primary">OPD PLATFORM CLINIC</h3>
                    <p className="text-xs text-gray-500">Mumbai, India</p>
                    <p className="text-xs text-gray-500">{new Date().toLocaleDateString()}</p>
                </div>
            </div>

            {/* Patient Details */}
            <div className="bg-gray-50 p-4 rounded-lg flex justify-between items-center text-sm border border-gray-100 mb-8">
                <div><span className="font-bold text-gray-500 uppercase text-xs mr-2">Name:</span> {patient.name}</div>
                <div><span className="font-bold text-gray-500 uppercase text-xs mr-2">Age/Sex:</span> {patient.age} / {patient.sex}</div>
                <div><span className="font-bold text-gray-500 uppercase text-xs mr-2">ID:</span> #OPD-2026-X</div>
            </div>

            {/* Clinical Sections */}
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                    <div className="p-4 border border-gray-200 rounded-xl bg-blue-50/50">
                        <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Chief Complaint</h4>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{getSectionContent('Subjective') || 'None recorded'}</p>
                    </div>
                    <div className="p-4 border border-gray-200 rounded-xl bg-blue-50/50">
                        <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Clinical Findings</h4>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{getSectionContent('Objective') || 'None recorded'}</p>
                    </div>
                </div>

                <div>
                    <h4 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2 bg-red-50 p-2 rounded-md inline-block">Diagnosis</h4>
                    <p className="text-sm font-medium text-gray-900 border-l-4 border-red-200 pl-4 py-1">{getSectionContent('Assessment') || 'Pending...'}</p>
                </div>

                <div>
                    <h4 className="text-xs font-bold text-green-600 uppercase tracking-wider mb-2">Rx / Medicines</h4>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-green-50 text-gray-600 font-medium">
                                <tr>
                                    <th className="p-3">Medicine</th>
                                    <th className="p-3">Dosage</th>
                                    <th className="p-3">Frequency</th>
                                    <th className="p-3">Duration</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {getSectionContent('Plan').split('\n').filter(l => l.includes('|')).map((line, i) => {
                                    const parts = line.split('|');
                                    return (
                                        <tr key={i}>
                                            <td className="p-3 font-medium">{parts[0]}</td>
                                            <td className="p-3 text-gray-500">{parts[1] || '-'}</td>
                                            <td className="p-3 text-gray-500">{parts[2] || '-'}</td>
                                            <td className="p-3 text-gray-500">{parts[3] || '-'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {(!getSectionContent('Plan') || !getSectionContent('Plan').includes('|')) && (
                            <div className="p-8 text-center text-gray-400 text-xs italic">No medicines prescribed yet.</div>
                        )}
                    </div>
                </div>

                <div className="mt-8 pt-8 border-t border-dashed border-gray-200 flex justify-end">
                    <div className="text-center">
                        <div className="h-12"></div>
                        <div className="border-t border-gray-400 w-48 pt-2 text-xs font-bold uppercase text-gray-500">Doctor's Signature</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Session View ---

export const ScribeSessionView: React.FC<ScribeSessionViewProps> = ({ onEndSession, doctorProfile, language }) => {
    const [phase, setPhase] = useState<'active' | 'processing' | 'review'>('active');
    const [duration, setDuration] = useState(0);
    const [transcriptHistory, setTranscriptHistory] = useState<TranscriptEntry[]>([]);
    const [clinicalNote, setClinicalNote] = useState('');
    const [progress, setProgress] = useState(0);
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [isAdmitting, setIsAdmitting] = useState(false);
    const [showInsuranceModal, setShowInsuranceModal] = useState(false);
    const [insuranceNexusData, setInsuranceNexusData] = useState<NexusInsuranceInput | null>(null);

    // Mock Patient for Demo
    const [patient] = useState<PatientDemographics>({
        name: 'Amit Patel', age: '45', sex: 'Male', mobile: '+91 9876543210', weight: '72kg', height: '175cm', bmi: '23.5',
        date: new Date().toLocaleDateString('en-GB'),
        hospitalName: 'Akash Clinic', hospitalAddress: 'Mumbai', hospitalPhone: '022-12345678'
    });

    const pendingSegmentsQueue = useRef<Blob[]>([]);
    const processedSegmentsRef = useRef<number>(0);
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    const { isRecording, startRecording, stopRecording } = useAudioRecorder();
    const { startListening, stopListening, interimTranscript } = useSpeechRecognition({ lang: language });

    // Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (phase === 'active') {
            interval = setInterval(() => setDuration(d => d + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [phase]);

    // Auto-scroll transcript
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcriptHistory, interimTranscript]);

    // Detect admission intent
    useEffect(() => {
        const fullTranscript = transcriptHistory.map(t => t.text).join(' ');
        const admission = detectAdmissionIntent(fullTranscript);

        if (admission.detected && admission.confidence === 'high' && !showInsuranceModal) {
            const testMentions = extractTestMentions(fullTranscript);

            // Build mock Nexus data
            const mockNexusData: NexusInsuranceInput = {
                ddx: [{ diagnosis: 'Pending Diagnosis', rationale: 'Based on clinical presentation', confidence: 'High' }],
                severity: { phenoIntensity: 0.8, urgencyQuotient: 0.7, deteriorationVelocity: 0.6, mustNotMiss: true, redFlagSeverity: 'moderate' },
                keyFindings: ['Symptoms indicating need for admission'],
                vitals: { bp: '120/80', pulse: '90', temp: '98.6', spo2: '98', rr: '16' },
                voiceCapturedFindings: testMentions.map(m => ({
                    testName: m.testName,
                    value: 'Pending',
                    unit: '',
                    interpretation: 'normal',
                    spokenText: m.rawMention,
                    documentAttached: false
                }))
            };

            setInsuranceNexusData(mockNexusData);
            setShowInsuranceModal(true);
        }
    }, [transcriptHistory, showInsuranceModal]);

    const handlePreAuthSubmit = (preAuthData: PreAuthSubmission, tpaDocument: string) => {
        console.log(`[AUDIT] Pre-Auth generated at ${new Date().toISOString()}`);
        console.log(`[AUDIT] Doctor: ${preAuthData.doctorConfirmation.doctorName}`);
        console.log(`[AUDIT] Status: ${preAuthData.documentationStatus}`);
        console.log(`[AUDIT] Pending docs: ${preAuthData.pendingDocuments.length}`);
        alert('Pre-Authorization Document Generated! (Check console for TPA output)');
        console.log("TPA Document:\\n", tpaDocument);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const processSegment = useCallback(async (blob: Blob, index: number) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            const context = transcriptHistory.slice(-3).map(t => `${t.speaker}: ${t.text}`).join(' ');
            const results = await processAudioSegment(base64Audio, blob.type, language, doctorProfile, context);
            if (results) {
                const newEntries: TranscriptEntry[] = results.map((r, i) => ({
                    id: `seg-${index}-${i}-${Date.now()}`,
                    speaker: r.speaker,
                    text: r.text,
                    segmentIndex: index
                }));
                setTranscriptHistory(prev => {
                    const filtered = prev.filter(e => e.segmentIndex !== index); // Avoid dups
                    return [...filtered, ...newEntries].sort((a, b) => (a.segmentIndex || 0) - (b.segmentIndex || 0));
                });
            }
            processedSegmentsRef.current++;
        };
    }, [language, doctorProfile, transcriptHistory]);

    // Cleanup previous session on mount
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mock') === 'true') {
            setPhase('review'); // Start in review mode for testing
        } else {
            handleStartSession();
        }
        return () => {
            stopRecording();
            stopListening();
        };
    }, []);

    const handleStartSession = async () => {
        setPhase('active');
        setDuration(0);
        setTranscriptHistory([]);
        setClinicalNote('');
        processedSegmentsRef.current = 0;
        pendingSegmentsQueue.current = [];
        await startRecording({
            segmentDuration: 30000,
            vadThreshold: 0.02,
            minSegmentDuration: 2000,
            onSegment: (blob) => {
                const idx = pendingSegmentsQueue.current.length;
                pendingSegmentsQueue.current.push(blob);
                processSegment(blob, idx);
            }
        });
        startListening();
    };

    const handleStopSession = async () => {
        setPhase('processing');
        stopListening();
        const finalBlob = await stopRecording();
        if (finalBlob) {
            const idx = pendingSegmentsQueue.current.length;
            pendingSegmentsQueue.current.push(finalBlob);
            await processSegment(finalBlob, idx);
        }

        // Wait for processing simulation
        setTimeout(async () => {
            await handleGenerateNote();
            setPhase('review');
            setProgress(50);
        }, 3000);
    };

    const handleGenerateNote = async () => {
        const fullTranscript = transcriptHistory.map(t => `${t.speaker}: ${t.text}`).join('\n');
        // If transcript empty, use mock for demo
        const textToUse = fullTranscript || "Patient reports fever for 3 days. BP 120/80. Diagnosis: Viral Fever. Plan: Paracetamol 650mg TDS.";
        const note = await generateClinicalNote(textToUse, doctorProfile, language);
        setClinicalNote(note);
    };

    const handleAdmitPatient = async () => {
        setIsAdmitting(true);
        try {
            const newCase = await createIPDCase({
                patient_id: 'EMR_PAT_123', // Mock ID
                linked_opd_session_id: `OPD_${Date.now()}`,
                admitting_doctor_id: 'DOC_789', // Mock ID
                admission_type: 'Planned',
                ward_type: 'General',
            });
            alert(`Patient Admitted! Case ID: ${newCase.ipd_case_id}`);
            // Logic to redirect to IPD Dashboard would go here
        } catch (error) {
            console.error("Admission failed", error);
            alert("Failed to admit patient");
        } finally {
            setIsAdmitting(false);
        }
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-opd-bg">

            {/* 1. Left Sidebar */}
            <aside className="w-[280px] bg-white border-r border-opd-border flex flex-col z-20 shadow-sm md:flex hidden">
                <div className="p-6 border-b border-opd-border">
                    <div className="flex items-center gap-2 text-opd-primary mb-6">
                        <Icon name="logo" className="w-6 h-6" />
                        <span className="font-bold text-lg text-black">OPD Platform</span>
                    </div>

                    <div className="bg-opd-bg p-4 rounded-xl border border-opd-border">
                        <div className="text-[10px] font-bold text-opd-text-muted uppercase tracking-wider mb-2">Doctor Profile</div>
                        <div className="font-bold text-opd-text-primary text-sm mb-1">Dr. Sharma</div>
                        <div className="text-xs text-opd-text-secondary">General Medicine</div>
                    </div>
                </div>

                <div className="p-6 flex-1">
                    <div className="mb-2 flex justify-between items-center text-xs font-bold uppercase tracking-wider text-opd-primary">
                        <span>Session Progress</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="h-1 w-full bg-opd-bg rounded-full mb-8 overflow-hidden">
                        <div className="h-full bg-opd-primary transition-all duration-500" style={{ width: `${progress}%` }}></div>
                    </div>
                    <SidebarChecklist progress={progress} />
                </div>

                <div className="p-4 bg-gray-50 border-t border-opd-border">
                    <div className="flex items-center gap-2 text-opd-success text-xs font-bold uppercase tracking-wider">
                        <Wifi className="w-4 h-4" />
                        <span>System Connected</span>
                    </div>
                </div>
            </aside>

            {/* 2. Middle Panel (Responsive Main) */}
            <main className="flex-1 flex flex-col relative min-w-0">
                {/* Header Strip */}
                <header className="h-16 bg-white border-b border-opd-border flex justify-between items-center px-6 shadow-sm z-10">
                    <div className="text-xs font-bold uppercase tracking-widest text-opd-text-secondary">
                        {phase === 'active' ? 'Live Transcript' : 'Review Consultation'}
                    </div>

                    <div className="flex items-center gap-4">
                        {phase === 'active' && (
                            <div className="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1.5 rounded-full border border-red-100 animate-pulse">
                                <div className="w-2 h-2 rounded-full bg-red-600"></div>
                                <span className="text-xs font-bold uppercase tracking-wider">REC</span>
                                <span className="text-xs font-mono w-12 text-center">{formatTime(duration)}</span>
                            </div>
                        )}
                        {phase === 'active' && (
                            <button
                                onClick={handleStopSession}
                                className="bg-opd-accent hover:bg-red-600 text-white px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg shadow-red-200 transition-all active:scale-95"
                            >
                                Stop Session
                            </button>
                        )}
                        {phase === 'review' && (
                            <div className="flex gap-2">
                                <button
                                    onClick={handleAdmitPatient}
                                    disabled={isAdmitting}
                                    className="flex items-center gap-2 px-4 py-2 border-2 border-opd-accent text-opd-accent rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-opd-accent hover:text-white transition-colors"
                                >
                                    {isAdmitting ? 'Creating...' : <><BedDouble className="w-4 h-4" /> Admit Patient</>}
                                </button>
                                <button className="flex items-center gap-2 px-4 py-2 border border-opd-primary text-opd-primary rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-opd-primary/5 transition-colors">
                                    <Mic className="w-4 h-4" /> Voice Edit
                                </button>
                                <button
                                    onClick={() => setShowPdfModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-opd-primary text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-opd-primary-dark transition-colors shadow-lg shadow-blue-200"
                                >
                                    <FileText className="w-4 h-4" /> PDF
                                </button>
                                <button onClick={onEndSession} className="px-4 py-2 text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                {/* TEMPORARY TESTING BUTTON */}
                <button
                    onClick={() => {
                        setInsuranceNexusData({
                            ddx: [{ diagnosis: 'Viral Fever with Suspected Dengue', rationale: 'High fever, body ache', confidence: 'High' }],
                            severity: { phenoIntensity: 0.8, urgencyQuotient: 0.7, deteriorationVelocity: 0.6, mustNotMiss: true, redFlagSeverity: 'moderate' },
                            keyFindings: ['High grade fever', 'Severe body ache'],
                            vitals: { bp: '120/80', pulse: '100', temp: '102F', spo2: '98', rr: '18' },
                            voiceCapturedFindings: [
                                { testName: 'CBC', value: 'Pending', unit: '', interpretation: 'normal', spokenText: 'cbc test', documentAttached: false },
                                { testName: 'Chest X-Ray', value: 'Pending', unit: '', interpretation: 'normal', spokenText: 'chest x-ray', documentAttached: false }
                            ]
                        });
                        setShowInsuranceModal(true);
                    }}
                    className="fixed bottom-4 left-4 z-50 bg-red-500 text-white p-2 text-xs opacity-50 hover:opacity-100"
                    id="simulate-admit-btn"
                >
                    Simulate Admission Model
                </button>

                <div className="flex-1 overflow-hidden relative bg-opd-bg flex flex-col">
                    {/* Active Waveform Area */}
                    {phase === 'active' && (
                        <div className="h-48 flex flex-col items-center justify-center border-b border-opd-border bg-white shrink-0">
                            <BreathingWaveform active={true} />
                            <div className="mt-4 text-veda-purple font-bold tracking-widest text-sm animate-pulse">LISTENING...</div>
                            <div className="text-xs text-gray-400 mt-1">Speak clearly into the microphone</div>
                        </div>
                    )}

                    {/* Transcript Area */}
                    <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                        {transcriptHistory.length === 0 && !interimTranscript && phase === 'active' && (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                                <Mic className="w-12 h-12 mb-4" />
                                <p>Waiting for speech...</p>
                            </div>
                        )}
                        {transcriptHistory.map(t => <TranscriptBubble key={t.id} entry={t} />)}
                        {interimTranscript && (
                            <div className="flex justify-start mb-4 opacity-70">
                                <div className="bg-gray-100 rounded-2xl rounded-tl-none px-5 py-3 text-sm text-gray-500 italic">
                                    {interimTranscript}...
                                </div>
                            </div>
                        )}
                        <div ref={transcriptEndRef} />
                    </div>

                    {/* Processing Overlay */}
                    {phase === 'processing' && (
                        <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                            <div className="w-16 h-16 border-4 border-veda-purple border-t-transparent rounded-full animate-spin mb-6"></div>
                            <h2 className="text-2xl font-bold text-opd-text-primary uppercase tracking-widest mb-2">Processing Session</h2>
                            <p className="text-gray-500">Generating clinical notes...</p>
                        </div>
                    )}
                </div>
            </main>

            {/* 3. Right Panel (Context/Form) */}
            <aside className="w-[350px] bg-white border-l border-opd-border hidden lg:flex flex-col z-10 shadow-float">
                {phase === 'active' ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50">
                        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
                            <Mic className="w-10 h-10 text-opd-accent" />
                        </div>
                        <h3 className="text-xl font-bold text-opd-text-primary mb-2">Recording in Progress</h3>
                        <p className="text-sm text-opd-text-secondary leading-relaxed">
                            Live transcription is active in the center panel. <br />
                            Focus on the patient, the AI is taking notes.
                        </p>
                    </div>
                ) : (
                    // Review Form
                    <div className="flex-1 flex flex-col h-full overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-white p-2 rounded border border-gray-100">
                                    <span className="block text-gray-400 font-bold uppercase text-[10px]">Name</span>
                                    {patient.name}
                                </div>
                                <div className="bg-white p-2 rounded border border-gray-100">
                                    <span className="block text-gray-400 font-bold uppercase text-[10px]">Age / Sex</span>
                                    {patient.age} / {patient.sex}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Form Fields matching PDF structure */}
                            <div className="space-y-4">
                                <div className="p-4 border border-gray-200 rounded-xl bg-white shadow-sm transition-all hover:border-opd-primary/50 group">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block group-focus-within:text-opd-primary">Diagnosis</label>
                                    <input
                                        type="text"
                                        className="w-full text-sm font-medium text-gray-900 outline-none placeholder-gray-300"
                                        placeholder="Enter Diagnosis..."
                                        defaultValue={clinicalNote ? "Viral Fever" : ""}  // Mock autofill
                                    />
                                </div>

                                <div className="p-4 border border-gray-200 rounded-xl bg-white shadow-sm relative">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Full Clinical Note (SOAP)</label>
                                    <textarea
                                        className="w-full text-xs text-gray-700 outline-none resize-none h-48 placeholder-gray-300 border border-gray-50 rounded p-2"
                                        placeholder="Paste clinical note here for pre-auth extraction..."
                                        value={clinicalNote}
                                        onChange={(e) => setClinicalNote(e.target.value)}
                                    ></textarea>
                                </div>

                                <div className="p-4 border border-gray-200 rounded-xl bg-white shadow-sm">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Advice</label>
                                    <textarea
                                        className="w-full text-sm text-gray-700 outline-none resize-none h-24 placeholder-gray-300"
                                        placeholder="Instructions for patient..."
                                    ></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </aside>

            {/* PDF Modal */}
            {showPdfModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeInUp">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-lg text-gray-800">Prescription Preview</h3>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => window.print()}
                                    className="flex items-center gap-2 px-4 py-2 bg-opd-primary text-white rounded-lg text-sm font-bold shadow-lg hover:bg-opd-primary-dark transition-colors"
                                >
                                    <Download className="w-4 h-4" /> Download PDF
                                </button>
                                <button onClick={() => setShowPdfModal(false)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                                    <X className="w-6 h-6 text-gray-500" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto bg-gray-100 p-8 flex justify-center">
                            <div className="w-full max-w-[210mm] bg-white shadow-lg min-h-[297mm]">
                                <PrescriptionTemplate patient={patient} clinicalNote={clinicalNote} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <InsurancePreAuthModal
                isOpen={showInsuranceModal}
                onClose={() => setShowInsuranceModal(false)}
                onSubmit={handlePreAuthSubmit}
                nexusOutput={insuranceNexusData}
                patientInfo={{
                    name: patient.name,
                    age: parseInt(patient.age),
                    gender: patient.sex as 'Male' | 'Female' | 'Other',
                    uhid: 'UHID-12345',
                    tpaName: 'Star Health'
                }}
                consultationInfo={{
                    date: patient.date,
                    doctorName: 'Dr. Sharma',
                    doctorLicense: 'MCI-123456',
                    department: 'General Medicine'
                }}
            />
        </div>
    );
};
