import React, { useState } from 'react';
import { DoctorProfile } from '../types';
import { Icon } from './Icon';
import { LogOut, User as UserIcon, Award, BarChart3, ClipboardList, ChevronDown, Gem } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface DashboardProps {
    doctorProfile: DoctorProfile;
    onStartSession: (language: string) => void;
    onBoout: () => void;
}

const StatsCard: React.FC<{
    label: string;
    value: string | number;
    subLabel: React.ReactNode;
    icon: React.ReactNode;
}> = ({ label, value, subLabel, icon }) => (
    <div className="bg-white p-6 rounded-2xl shadow-card border border-opd-border flex flex-col justify-between h-40">
        <div className="flex justify-between items-start">
            <h3 className="text-opd-text-secondary text-sm font-medium uppercase tracking-wide">{label}</h3>
            <div className="p-2 bg-opd-bg rounded-full text-opd-primary">
                {icon}
            </div>
        </div>
        <div>
            <div className="text-3xl font-bold text-opd-text-primary mb-1">{value}</div>
            <div className="text-xs text-opd-text-muted">{subLabel}</div>
        </div>
    </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ doctorProfile, onStartSession }) => {
    const { user, logout } = useAuth();
    const [language, setLanguage] = useState('Automatic Language Detection');
    const [showLaunchModal, setShowLaunchModal] = useState(false);

    // Mock Date for "Welcome back"
    const doctorName = user ? `${user.firstName} ${user.lastName}` : 'Dr. Sharma';

    // Launch Modal Component
    const VedaLaunchModal = () => (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fadeInUp">
            <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl border border-opd-border text-center">
                <div className="mb-6 flex justify-center">
                    <div className="w-16 h-16 bg-primary-tint rounded-full flex items-center justify-center text-opd-primary">
                        <Icon name="sparkles" className="w-8 h-8 text-opd-primary" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-opd-text-primary mb-8 font-lora">Veda Assistant</h2>
                <div className="flex gap-4">
                    <button
                        onClick={() => setShowLaunchModal(false)}
                        className="btn-secondary flex-1 py-3 text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onStartSession(language)}
                        className="btn-primary flex-1 py-3 text-sm bg-opd-primary hover:bg-opd-primary-dark text-white font-bold"
                    >
                        Start Session
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-opd-bg text-opd-text-primary font-sans">
            {showLaunchModal && <VedaLaunchModal />}

            {/* Header */}
            <header className="px-6 py-4 bg-white border-b border-opd-border sticky top-0 z-10">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-opd-primary/10 rounded-lg flex items-center justify-center text-opd-primary">
                            <Icon name="logo" className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-opd-text-primary leading-tight">OPD Platform</h1>
                            <p className="text-[10px] text-opd-text-secondary font-medium tracking-wide uppercase">AI-Powered Medical Scribe</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-opd-bg rounded-full border border-opd-border">
                            <Gem className="w-3.5 h-3.5 text-opd-primary" />
                            <span className="text-xs font-semibold text-opd-text-secondary">Free Plan</span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="text-right hidden md:block">
                                <div className="text-sm font-bold text-opd-text-primary">{doctorName}</div>
                                <div className="text-[10px] text-opd-text-secondary uppercase font-bold tracking-wider">{doctorProfile.qualification} • General Medicine</div>
                            </div>
                            <div className="w-10 h-10 bg-opd-primary/10 rounded-full flex items-center justify-center text-opd-primary font-bold text-sm border-2 border-white shadow-sm">
                                {doctorName.split(' ').map(n => n[0]).join('').substring(0, 2)}
                            </div>
                            <button onClick={logout} className="text-xs text-opd-text-muted hover:text-opd-accent font-medium ml-2 transition-colors">
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-8 md:py-12 space-y-12">

                {/* Welcome Block */}
                <section>
                    <h2 className="text-3xl md:text-4xl font-bold text-opd-text-primary mb-2">Welcome back, {doctorName}</h2>
                    <p className="text-lg text-opd-text-secondary">Ready to start a new consultation?</p>
                </section>

                {/* Stats Row */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatsCard
                        label="Today's Cases"
                        value="0"
                        subLabel="10 remaining today"
                        icon={<ClipboardList className="w-5 h-5" />}
                    />
                    <StatsCard
                        label="Total Cases"
                        value="0"
                        subLabel="All time"
                        icon={<BarChart3 className="w-5 h-5" />}
                    />
                    <StatsCard
                        label="Subscription"
                        value="Free"
                        subLabel={<span className="text-opd-primary hover:underline cursor-pointer font-medium">Upgrade to Premium →</span>}
                        icon={<Gem className="w-5 h-5" />}
                    />
                </section>

                {/* Start Session Card */}
                <section className="flex justify-center">
                    <div className="w-full max-w-2xl bg-white rounded-3xl shadow-float p-8 md:p-10 border border-opd-border text-center relative overflow-hidden group hover:border-opd-primary/30 transition-all">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-opd-primary to-veda-purple"></div>

                        <div className="w-16 h-16 bg-opd-bg rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                            <Icon name="microphone" className="w-8 h-8 text-opd-primary" />
                        </div>

                        <h3 className="text-2xl font-bold text-opd-text-primary mb-3">Start New Session</h3>
                        <p className="text-opd-text-secondary mb-8 max-w-md mx-auto">Begin a new patient consultation with AI-powered transcription and clinical note generation.</p>

                        <div className="max-w-md mx-auto space-y-4">
                            <div className="relative">
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    className="w-full appearance-none bg-white border border-opd-border rounded-xl px-4 py-3 text-sm font-medium text-opd-text-primary focus:border-opd-primary focus:ring-1 focus:ring-opd-primary outline-none transition-all cursor-pointer hover:bg-opd-bg"
                                >
                                    <option>✨ Automatic Language Detection</option>
                                    <option>English</option>
                                    <option>Hindi</option>
                                    <option>Marathi</option>
                                    <option>Gujarati</option>
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-opd-text-secondary pointer-events-none" />
                            </div>

                            <button
                                onClick={() => setShowLaunchModal(true)}
                                className="w-full py-4 bg-opd-primary hover:bg-opd-primary-dark text-white rounded-xl font-bold text-lg shadow-lg shadow-opd-primary/20 transition-all active:scale-[0.98]"
                            >
                                Start Veda Session
                            </button>

                            <p className="text-[10px] text-opd-text-muted font-bold tracking-widest uppercase mt-4">Akash Clinic</p>
                        </div>
                    </div>
                </section>

            </main>
        </div>
    );
};
