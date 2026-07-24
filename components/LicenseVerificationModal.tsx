import React, { useState } from 'react';
import { Icon } from './Icon';

interface LicenseVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: () => void;
}

export const LicenseVerificationModal: React.FC<LicenseVerificationModalProps> = ({ isOpen, onClose, onVerify }) => {
  const [licenseNumber, setLicenseNumber] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;
  
  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseNumber.trim()) return;

    setIsVerifying(true);
    // Simulate API call for verification
    setTimeout(() => {
      setIsVerifying(false);
      onVerify();
    }, 1500);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center transition-opacity"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-aivana-grey rounded-2xl shadow-xl w-full max-w-md m-4 transform transition-all text-white border border-aivana-light-grey">
        <div className="p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Icon name="shieldCheck" className="w-6 h-6 text-aivana-accent" />
                    <h2 className="text-xl font-bold">Verification Required</h2>
                </div>
                <button onClick={onClose} className="p-1 rounded-full hover:bg-aivana-light-grey">
                    <Icon name="close" className="w-5 h-5"/>
                </button>
            </div>
          
            <p className="text-sm text-gray-400 mb-6">
                To access information about controlled substances, please verify your medical license. This is a one-time step for this session.
            </p>

            <form onSubmit={handleVerify}>
                <label htmlFor="licenseNumber" className="block text-xs font-medium text-gray-300 mb-2">
                    Medical License Number (e.g., MCI/12/34567)
                </label>
                <input
                    id="licenseNumber"
                    type="text"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="Enter your license number"
                    className="w-full bg-aivana-dark border border-aivana-light-grey text-white text-sm rounded-lg focus:ring-aivana-accent focus:border-aivana-accent block p-3"
                    required
                />
                <button
                    type="submit"
                    disabled={isVerifying || !licenseNumber.trim()}
                    className="w-full mt-6 flex justify-center items-center gap-2 text-white bg-aivana-accent hover:bg-purple-700 focus:ring-4 focus:ring-purple-900 font-medium rounded-lg text-sm px-5 py-3 text-center disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                    {isVerifying ? (
                        <>
                            <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                            <span>Verifying...</span>
                        </>
                    ) : (
                        'Verify & Continue'
                    )}
                </button>
            </form>
            <p className="text-xs text-center text-gray-500 mt-4">
                This is a simulated verification for demonstration purposes.
            </p>
        </div>
      </div>
    </div>
  );
};
