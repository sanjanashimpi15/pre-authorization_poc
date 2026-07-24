import React, { useState } from 'react';
import { X, Eye, EyeOff, Lock, Mail, User, Phone, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    defaultTab?: 'login' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, defaultTab = 'login' }) => {
    const [activeTab, setActiveTab] = useState<'login' | 'signup'>(defaultTab);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, signup, loginAsGuest } = useAuth();

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (activeTab === 'login') {
                await login(email, password);
            } else {
                await signup({ email, password, firstName, lastName, phone });
            }
            onClose();
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-opd-text-primary/35 backdrop-blur-md p-4 transition-all duration-300">
            <div className="bg-white/95 backdrop-blur-lg rounded-3xl shadow-float w-full max-w-md relative border border-white/20 text-opd-text-primary overflow-hidden animate-fadeInUp">
                
                {/* Gradient Top Indicator */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-opd-primary to-opd-success" />

                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 p-1.5 rounded-full text-opd-text-muted hover:text-opd-text-primary hover:bg-opd-bg transition-all"
                >
                    <X className="w-4 h-4" />
                </button>

                <div className="p-8">
                    {/* Header */}
                    <div className="text-center mb-6">
                        <div className="inline-flex p-2 bg-primary-tint rounded-2xl text-opd-primary mb-3">
                            <Sparkles className="w-5 h-5 animate-pulse" />
                        </div>
                        <h2 className="text-2xl font-bold font-lora text-opd-primary">
                            {activeTab === 'login' ? 'Welcome Back' : 'Get Started'}
                        </h2>
                        <p className="text-xs text-opd-text-secondary mt-1">
                            {activeTab === 'login' 
                                ? 'Access the prior authorization desk and medical coding pipeline' 
                                : 'Create your cashless desk account to start automating pre-auths'}
                        </p>
                    </div>

                    {/* Pill Switcher */}
                    <div className="bg-opd-input-bg p-1 rounded-2xl border border-opd-border flex gap-1 mb-6">
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('login');
                                setError('');
                            }}
                            className={`flex-1 py-2 px-4 rounded-xl font-bold text-xs transition-all ${
                                activeTab === 'login'
                                    ? 'bg-white text-opd-primary shadow-sm'
                                    : 'text-opd-text-secondary hover:text-opd-primary'
                            }`}
                        >
                            Login
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('signup');
                                setError('');
                            }}
                            className={`flex-1 py-2 px-4 rounded-xl font-bold text-xs transition-all ${
                                activeTab === 'signup'
                                    ? 'bg-white text-opd-primary shadow-sm'
                                    : 'text-opd-text-secondary hover:text-opd-primary'
                            }`}
                        >
                            Sign Up
                        </button>
                    </div>

                    {error && (
                        <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs font-semibold leading-relaxed flex gap-2 items-start">
                            <span>⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4 text-left">
                        {activeTab === 'signup' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-opd-text-secondary mb-1">
                                        First Name
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-opd-text-muted">
                                            <User className="w-3.5 h-3.5" />
                                        </span>
                                        <input
                                            type="text"
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                            required
                                            placeholder="Akash"
                                            className="form-input pl-9"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-opd-text-secondary mb-1">
                                        Last Name
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-opd-text-muted">
                                            <User className="w-3.5 h-3.5" />
                                        </span>
                                        <input
                                            type="text"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            required
                                            placeholder="Sharma"
                                            className="form-input pl-9"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-opd-text-secondary mb-1">
                                Email Address
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-opd-text-muted">
                                    <Mail className="w-3.5 h-3.5" />
                                </span>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    placeholder="doctor@aivana.com"
                                    className="form-input pl-9"
                                />
                            </div>
                        </div>

                        {activeTab === 'signup' && (
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-opd-text-secondary mb-1">
                                    Phone Number (Optional)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-opd-text-muted">
                                        <Phone className="w-3.5 h-3.5" />
                                    </span>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+91 98765 43210"
                                        className="form-input pl-9"
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-opd-text-secondary mb-1">
                                Password
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-opd-text-muted">
                                    <Lock className="w-3.5 h-3.5" />
                                </span>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    placeholder="••••••"
                                    className="form-input px-9"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-opd-text-muted hover:text-opd-text-primary transition-all"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {activeTab === 'signup' && (
                                <p className="text-[10px] text-opd-text-muted mt-1 font-semibold uppercase tracking-wider">
                                    Minimum 6 characters
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-opd-primary hover:bg-opd-primary-dark disabled:opacity-40 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 active:scale-[.98] shadow-sm mt-6"
                        >
                            {loading ? 'Please wait...' : activeTab === 'login' ? 'Login to Portal' : 'Create Account'}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-opd-border" />
                        <span className="text-[10px] text-opd-text-muted font-semibold uppercase tracking-widest">or</span>
                        <div className="flex-1 h-px bg-opd-border" />
                    </div>

                    {/* Guest Login */}
                    <button
                        type="button"
                        onClick={() => { loginAsGuest(); onClose(); }}
                        className="w-full py-3 border border-opd-border rounded-xl text-xs font-bold text-opd-text-secondary hover:border-opd-primary hover:text-opd-primary hover:bg-primary-tint/40 transition-all flex items-center justify-center gap-2 active:scale-[.98]"
                    >
                        <User className="w-3.5 h-3.5" />
                        Continue as Guest
                    </button>
                    <p className="text-[10px] text-opd-text-muted text-center mt-2 font-medium">
                        Demo access — no account required. Some features may be limited.
                    </p>

                    {activeTab === 'signup' && (
                        <p className="mt-4 text-[10px] text-opd-text-muted text-center font-medium leading-relaxed">
                            By signing up, you agree to our Terms of Service and Privacy Policy.
                            You'll get 10 free OPD cases per day.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
