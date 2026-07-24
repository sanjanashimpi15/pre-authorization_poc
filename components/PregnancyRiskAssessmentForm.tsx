import React, { useState } from 'react';
import { Icon } from './Icon';

interface FormData {
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
}

interface GeneralTriageFormProps {
  onSubmit: (formData: FormData) => void;
}

const commonConditions = [
    'Diabetes',
    'Hypertension',
    'COPD/Asthma',
    'Ischemic Heart Disease',
    'Chronic Kidney Disease',
    'Immunosuppressed',
    'Recent Surgery',
];

export const GeneralTriageForm: React.FC<GeneralTriageFormProps> = ({ onSubmit }) => {
    const [formData, setFormData] = useState<FormData>({
        age: '',
        sex: 'Male',
        systolicBP: '',
        diastolicBP: '',
        hr: '',
        temp: '',
        spo2: '',
        respiratoryRate: '',
        chiefComplaint: '',
        history: [],
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value, checked } = e.target;
        if (checked) {
            setFormData(prev => ({ ...prev, history: [...prev.history, value] }));
        } else {
            setFormData(prev => ({ ...prev, history: prev.history.filter(item => item !== value) }));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 animate-fadeInUp">
            <div className="w-full max-w-3xl bg-aivana-light-grey rounded-xl p-6 md:p-8 border border-aivana-light-grey/50 shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <Icon name="shield-heart" className="w-8 h-8 text-aivana-accent" />
                    <h2 className="text-2xl font-bold text-white">General Triage & Risk Assessment</h2>
                </div>
                <p className="text-gray-400 mb-6 text-sm">Enter patient vitals and presentation to generate a risk stratification (NEWS2/qSOFA) and management plan.</p>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Demographics & Complaint */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label htmlFor="age" className="block text-xs font-medium text-gray-300 mb-1">Age</label>
                            <input type="number" name="age" id="age" value={formData.age} onChange={handleChange} className="w-full bg-aivana-dark p-2 rounded-md border border-aivana-light-grey/80 focus:ring-aivana-accent focus:border-aivana-accent" required />
                        </div>
                        <div>
                            <label htmlFor="sex" className="block text-xs font-medium text-gray-300 mb-1">Sex</label>
                            <select name="sex" id="sex" value={formData.sex} onChange={handleChange} className="w-full bg-aivana-dark p-2 rounded-md border border-aivana-light-grey/80 focus:ring-aivana-accent focus:border-aivana-accent">
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                            </select>
                        </div>
                         <div className="md:col-span-3">
                            <label htmlFor="chiefComplaint" className="block text-xs font-medium text-gray-300 mb-1">Chief Complaint</label>
                            <textarea name="chiefComplaint" id="chiefComplaint" rows={2} value={formData.chiefComplaint} onChange={handleChange} className="w-full bg-aivana-dark p-2 rounded-md border border-aivana-light-grey/80 focus:ring-aivana-accent focus:border-aivana-accent" placeholder="e.g., chest pain radiating to left arm, sudden onset" required />
                        </div>
                    </div>

                    {/* Vitals */}
                    <div className="bg-aivana-dark p-4 rounded-lg border border-aivana-grey">
                        <h3 className="text-sm font-semibold text-aivana-accent mb-3">Vital Signs</h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">BP (mmHg)</label>
                                <div className="flex gap-1">
                                    <input type="number" name="systolicBP" placeholder="Sys" value={formData.systolicBP} onChange={handleChange} className="w-full bg-aivana-grey p-2 rounded-md focus:ring-aivana-accent" required />
                                    <input type="number" name="diastolicBP" placeholder="Dia" value={formData.diastolicBP} onChange={handleChange} className="w-full bg-aivana-grey p-2 rounded-md focus:ring-aivana-accent" required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">HR (bpm)</label>
                                <input type="number" name="hr" value={formData.hr} onChange={handleChange} className="w-full bg-aivana-grey p-2 rounded-md focus:ring-aivana-accent" required />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">RR (min)</label>
                                <input type="number" name="respiratoryRate" value={formData.respiratoryRate} onChange={handleChange} className="w-full bg-aivana-grey p-2 rounded-md focus:ring-aivana-accent" required />
                            </div>
                             <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Temp (°C)</label>
                                <input type="number" step="0.1" name="temp" value={formData.temp} onChange={handleChange} className="w-full bg-aivana-grey p-2 rounded-md focus:ring-aivana-accent" required />
                            </div>
                             <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">SpO2 (%)</label>
                                <input type="number" name="spo2" value={formData.spo2} onChange={handleChange} className="w-full bg-aivana-grey p-2 rounded-md focus:ring-aivana-accent" required />
                            </div>
                        </div>
                    </div>

                    {/* PMH */}
                    <div>
                        <label className="block text-xs font-medium text-gray-300 mb-2">Medical History (PMH)</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {commonConditions.map(option => (
                                <label key={option} className="flex items-center space-x-2 p-2 rounded-md hover:bg-aivana-grey cursor-pointer">
                                    <input type="checkbox" value={option} checked={formData.history.includes(option)} onChange={handleCheckboxChange} className="form-checkbox h-4 w-4 text-aivana-accent bg-aivana-dark border-aivana-light-grey/80 focus:ring-aivana-accent" />
                                    <span className="text-sm text-gray-300">{option}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <button type="submit" className="w-full !mt-6 bg-aivana-accent hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <Icon name="diagnosis" className="w-5 h-5"/>
                        Calculate Risk & Triage
                    </button>
                </form>
            </div>
        </div>
    );
};