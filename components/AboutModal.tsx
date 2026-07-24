
import React from 'react';
import { Icon } from './Icon';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  
  const appVersion = "2.5.0-OPD";

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center transition-opacity"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-aivana-grey rounded-2xl shadow-xl w-full max-w-lg m-4 transform transition-all text-white border border-aivana-light-grey">
        <div className="p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Icon name="info" className="w-6 h-6 text-aivana-accent" />
                    <h2 className="text-xl font-bold">About the OPD Platform</h2>
                </div>
                <button onClick={onClose} className="p-1 rounded-full hover:bg-aivana-light-grey">
                    <Icon name="close" className="w-5 h-5"/>
                </button>
            </div>
          
            <div className="text-sm text-gray-300 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <p>
                    The <strong>OPD Platform</strong> is a professional out-patient department clinical assistant designed for high-volume Indian medical settings. Its primary goal is to provide accurate, evidence-based information and automated documentation via the <strong>Veda</strong> clinical scribe.
                </p>

                <div className="p-3 bg-purple-900/30 border border-purple-500/50 rounded-lg">
                    <h3 className="font-semibold text-white mb-2">Powered by the Veda Engine</h3>
                    <p className="text-xs">
                        Documentation is operationalized via <strong>Veda</strong>, an expert clinical reasoning and transcription engine that integrates parallel segmented acoustic analysis for high-accuracy speaker segregation.
                    </p>
                </div>
                
                <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg">
                    <h3 className="font-semibold text-white mb-2">CRITICAL CLINICAL DISCLAIMER</h3>
                    <p className="text-xs">
                        This tool is intended for professional clinician use only. It is <strong className="text-white">NOT</strong> a substitute for independent clinical judgment. All automated notes and summaries must be verified before inclusion in medical records.
                    </p>
                </div>

                <p className="text-xs text-center text-gray-500 pt-2">
                    Platform Version: {appVersion}
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};
