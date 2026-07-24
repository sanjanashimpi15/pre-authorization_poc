
import React, { useMemo, useState } from 'react';
import { PreCodedGpt, Chat, DoctorProfile } from '../types';
import { Icon } from './Icon';
import { MTP_PROTOCOL_JSON } from '../assets/mtpProtocol';
import { useAuth } from '../contexts/AuthContext';
import { User, LogOut, LogIn } from 'lucide-react';

interface SidebarProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    gpts: PreCodedGpt[];
    chats: Chat[];
    onNewChat: (gpt?: PreCodedGpt) => void;
    onSelectChat: (chatId: string) => void;
    activeChat: Chat | null;
    activeChatId: string | null;
    language: string;
    setLanguage: (language: string) => void;
    doctorProfile: DoctorProfile;
    setDoctorProfile: (profile: DoctorProfile) => void;
    onStartScribeSession: () => void;
    onStartInsuranceModule: () => void;
    activeView: 'chat' | 'scribe' | 'insurance';
    onShowPrintModal: () => void;
    onShowAboutModal: () => void;
    onGenerateCaseSummary: () => void;
    onShowAuthModal?: () => void;
}

const DoctorProfileSwitcher: React.FC<{
    profile: DoctorProfile;
    setProfile: (profile: DoctorProfile) => void;
}> = ({ profile, setProfile }) => {
    const profiles: DoctorProfile[] = [
        { qualification: 'BAMS', canPrescribeAllopathic: 'no' },
        { qualification: 'BHMS', canPrescribeAllopathic: 'no' },
        { qualification: 'MBBS', canPrescribeAllopathic: 'yes' },
    ];

    return (
        <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-opd-text-secondary mb-2 font-lora">
                Clinician Profile
            </label>
            <div className="flex bg-opd-input-bg border border-opd-border rounded-lg p-1 gap-1">
                {profiles.map(p => (
                    <button
                        key={p.qualification}
                        onClick={() => setProfile(p)}
                        className={`flex-1 text-xs px-2 py-1.5 rounded-md transition-colors ${profile.qualification === p.qualification ? 'bg-opd-primary text-white font-semibold shadow-sm' : 'text-opd-text-secondary hover:text-opd-primary hover:bg-white/50'}`}
                    >
                        {p.qualification}
                    </button>
                ))}
            </div>
        </div>
    );
};

const LanguageSelector: React.FC<{ language: string; setLanguage: (lang: string) => void }> = ({ language, setLanguage }) => (
    <div className="mt-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-opd-text-secondary mb-2 font-lora">
            Response Language
        </label>
        <div className="relative">
            <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-white border border-opd-border text-opd-text-primary text-sm rounded-lg px-3 py-2 appearance-none focus:ring-1 focus:ring-opd-primary focus:border-opd-primary outline-none cursor-pointer hover:bg-opd-bg transition-colors"
            >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Marathi">Marathi</option>
                <option value="Gujarati">Gujarati</option>
                <option value="Tamil">Tamil</option>
                <option value="Bengali">Bengali</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-opd-text-secondary">
                <Icon name="chevronDown" className="w-4 h-4" />
            </div>
        </div>
    </div>
);

const UserMenu: React.FC<{ onShowAuthModal?: () => void }> = ({ onShowAuthModal }) => {
    const { user, logout } = useAuth();
    const [showMenu, setShowMenu] = useState(false);

    if (!user) {
        return (
            <button
                onClick={onShowAuthModal}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-opd-primary hover:bg-opd-primary-dark text-white rounded-lg transition-colors text-sm font-semibold shadow-sm"
            >
                <LogIn className="w-4 h-4" />
                <span>Login / Sign Up</span>
            </button>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={() => setShowMenu(!showMenu)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-opd-border text-opd-text-primary rounded-lg transition-colors text-sm font-medium hover:bg-gray-50 shadow-sm"
            >
                <User className="w-4 h-4 text-opd-primary" />
                <span className="flex-1 text-left truncate">{user.firstName} {user.lastName}</span>
                <Icon name="chevronDown" className={`w-4 h-4 text-opd-text-secondary transition-transform ${showMenu ? 'rotate-180' : ''}`} />
            </button>

            {showMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-opd-border rounded-lg shadow-lg overflow-hidden text-opd-text-primary z-50">
                    <div className="px-3 py-2 border-b border-opd-border">
                        <p className="text-xs text-opd-text-muted">Signed in as</p>
                        <p className="text-sm font-semibold truncate text-opd-text-primary">{user.email}</p>
                    </div>
                    <button
                        onClick={() => {
                            logout();
                            setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50 transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                    </button>
                </div>
            )}
        </div>
    );
};


export const Sidebar: React.FC<SidebarProps> = ({
    isOpen,
    setIsOpen,
    gpts,
    chats,
    onNewChat,
    onSelectChat,
    activeChat,
    activeChatId,
    language,
    setLanguage,
    doctorProfile,
    setDoctorProfile,
    onStartScribeSession,
    onStartInsuranceModule,
    activeView,
    onShowPrintModal,
    onShowAboutModal,
    onGenerateCaseSummary,
    onShowAuthModal,
}) => {
    const handleDownloadMtpJson = () => {
        const dataStr = JSON.stringify(MTP_PROTOCOL_JSON, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'general_sepsis_protocol.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const canGenerateSummary = activeChat && activeChat.messages.length > 0;

    const displayedGpts = useMemo(() => {
        const priorityIds = ['doctor-emergency', 'doctor-lab', 'doctor-risk-assessment'];
        const priority = gpts.filter(g => priorityIds.includes(g.id));
        const others = gpts.filter(g => !priorityIds.includes(g.id));
        return [...priority, ...others];
    }, [gpts]);

    return (
        <>
            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-xs z-20 md:hidden"
                    onClick={() => setIsOpen(false)}
                ></div>
            )}

            {/* Sidebar */}
            <div
                className={`fixed top-0 left-0 w-72 h-full bg-white z-30 transform transition-transform duration-300 ease-in-out border-r border-opd-border no-print ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    } md:relative md:translate-x-0 md:flex-shrink-0 flex flex-col text-opd-text-primary`}
            >
                {/* Header */}
                <div className="p-4 flex-shrink-0 flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary-tint flex items-center justify-center text-opd-primary shadow-sm">
                            <Icon name="logo" className="w-5 h-5 text-opd-primary" />
                        </div>
                        <span className="font-bold text-base text-opd-text-primary font-lora leading-tight">OPD Platform</span>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="md:hidden p-1.5 rounded-md hover:bg-opd-bg text-opd-text-secondary hover:text-opd-primary transition-colors">
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                </div>

                {/* Primary Actions */}
                <div className="px-3 pb-4 flex-shrink-0 space-y-3">
                    <button
                        onClick={onStartScribeSession}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all border ${activeView === 'scribe'
                            ? 'bg-primary-tint text-opd-primary border-opd-primary/20 shadow-sm font-semibold'
                            : 'bg-opd-input-bg border-opd-border text-opd-text-secondary hover:bg-primary-tint hover:text-opd-primary hover:border-opd-primary/20'
                            }`}
                    >
                        <Icon name="sparkles" className={`w-5 h-5 ${activeView === 'scribe' ? 'text-opd-primary' : 'text-opd-text-secondary'}`} />
                        <span className="font-medium text-sm">Start Veda Session</span>
                    </button>

                    <button
                        onClick={onStartInsuranceModule}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all border ${activeView === 'insurance'
                            ? 'bg-primary-tint text-opd-primary border-opd-primary/20 shadow-sm font-semibold'
                            : 'bg-opd-input-bg border-opd-border text-opd-text-secondary hover:bg-primary-tint hover:text-opd-primary hover:border-opd-primary/20'
                            }`}
                    >
                        <Icon name="document-text" className={`w-5 h-5 ${activeView === 'insurance' ? 'text-opd-primary' : 'text-opd-text-secondary'}`} />
                        <span className="font-medium text-sm">Insurance Center</span>
                    </button>

                    <button
                        onClick={() => onNewChat()}
                        className="btn-primary w-full flex items-center justify-center gap-2 px-4 py-3 bg-opd-primary hover:bg-opd-primary-dark text-white font-bold text-sm shadow-sm"
                    >
                        <Icon name="newChat" className="w-5 h-5" />
                        New Chat
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6">

                    {/* Explore Section */}
                    <div>
                        <h3 className="text-xs font-bold text-opd-primary uppercase tracking-wider mb-2 px-2 font-lora">Explore</h3>
                        <div className="space-y-1">
                            {displayedGpts.slice(0, 5).map((gpt) => {
                                const isActive = activeChatId && chats.find(c => c.id === activeChatId)?.gptId === gpt.id;
                                return (
                                    <button
                                        key={gpt.id}
                                        onClick={() => onNewChat(gpt)}
                                        className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${isActive
                                            ? 'bg-primary-tint text-opd-primary font-semibold border border-opd-primary/10 shadow-sm'
                                            : 'text-opd-text-secondary hover:text-opd-primary hover:bg-opd-bg/50 border border-transparent'
                                            }`}
                                    >
                                        <div className={isActive ? 'text-opd-primary' : 'text-opd-text-secondary group-hover:text-opd-primary transition-colors'}>
                                            {React.cloneElement(gpt.icon as React.ReactElement<any>, { className: 'w-4 h-4' })}
                                        </div>
                                        <span className="text-sm truncate">
                                            {gpt.title}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Tools Section */}
                    <div className="mt-4">
                        <div className="space-y-1">
                            <button
                                onClick={onGenerateCaseSummary}
                                disabled={!canGenerateSummary}
                                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-opd-text-secondary hover:text-opd-primary hover:bg-opd-bg/50 disabled:opacity-50"
                            >
                                <Icon name="document-text" className="w-4 h-4" />
                                <span className="text-sm">Case Summary</span>
                            </button>
                            <button
                                onClick={onShowPrintModal}
                                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-opd-text-secondary hover:text-opd-primary hover:bg-opd-bg/50"
                            >
                                <Icon name="print" className="w-4 h-4" />
                                <span className="text-sm">Print Cards</span>
                            </button>
                            <button
                                onClick={handleDownloadMtpJson}
                                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-opd-text-secondary hover:text-opd-primary hover:bg-opd-bg/50"
                            >
                                <Icon name="download" className="w-4 h-4" />
                                <span className="text-sm">Download Protocol JSON</span>
                            </button>
                        </div>
                    </div>

                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-opd-border flex-shrink-0 bg-white space-y-3">
                    {/* User Menu */}
                    <UserMenu onShowAuthModal={onShowAuthModal} />

                    <DoctorProfileSwitcher profile={doctorProfile} setProfile={setDoctorProfile} />
                    <LanguageSelector language={language} setLanguage={setLanguage} />
                </div>
            </div>
        </>
    );
};
