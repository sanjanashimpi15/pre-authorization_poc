import React, { useState } from 'react';
import { ClinicalProtocol } from '../types';
import { Icon } from './Icon';

interface PrintViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  protocols: ClinicalProtocol[];
}

const ProtocolPrintCard: React.FC<{ protocol: ClinicalProtocol }> = ({ protocol }) => {
    const criticalSteps = protocol.stepwise_actions.filter(s => s.is_critical);
    
    return (
        <div className="printable-area p-4 bg-white text-black font-sans">
            <header className="flex justify-between items-center border-b-2 border-black pb-2 mb-4">
                <div>
                    <h1 className="text-2xl font-bold">{protocol.title}</h1>
                    <p className="text-sm text-gray-600">{protocol.id} v{protocol.metadata.version}</p>
                </div>
                <p className="text-right text-sm">
                    <strong>Institution:</strong> {protocol.metadata.institution}<br/>
                    <strong>Effective:</strong> {protocol.metadata.date_effective}
                </p>
            </header>
            
            <main>
                <section className="mb-4">
                    <h2 className="text-lg font-bold uppercase tracking-wide bg-gray-200 p-2 text-center mb-2">Immediate Actions (Critical)</h2>
                    <div className="space-y-3">
                        {criticalSteps.map(step => (
                            <div key={step.id}>
                                <h3 className="font-bold text-md">{step.timing}: {step.title}</h3>
                                <ul className="list-disc list-inside ml-2 text-sm">
                                    {step.actions.map((action, i) => <li key={i}>{action}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                <section>
                    <h2 className="text-lg font-bold uppercase tracking-wide bg-gray-200 p-2 text-center mb-2">Critical Dosing Information</h2>
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="border p-1 font-bold">Drug</th>
                                <th className="border p-1 font-bold">Dose/Formula</th>
                                <th className="border p-1 font-bold">Route</th>
                                <th className="border p-1 font-bold">Key Contraindications</th>
                            </tr>
                        </thead>
                        <tbody>
                            {protocol.dosing_table.map(drug => (
                                <tr key={drug.drug_name}>
                                    <td className="border p-1 font-semibold">{drug.drug_name}</td>
                                    <td className="border p-1">{drug.formula}</td>
                                    <td className="border p-1">{drug.route}</td>
                                    <td className="border p-1">{drug.contraindications?.join(', ') || 'None'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
                
                 <section className="mt-4">
                    <h2 className="text-lg font-bold uppercase tracking-wide bg-red-600 text-white p-2 text-center mb-2">Escalate If...</h2>
                    <ul className="list-disc list-inside ml-2 text-sm space-y-1">
                        {protocol.escalation_triggers.map(trigger => (
                            <li key={trigger.condition}><strong>{trigger.condition}</strong> - {trigger.action}</li>
                        ))}
                    </ul>
                </section>
            </main>
            
            <footer className="mt-6 pt-2 border-t border-gray-400 text-center text-xs text-gray-500">
                <p>This is a summary for quick reference. Always refer to the full, most recent clinical guidelines. Clinician judgment is paramount.</p>
            </footer>
        </div>
    );
};


export const PrintViewModal: React.FC<PrintViewModalProps> = ({ isOpen, onClose, protocols }) => {
  const [selectedProtocolId, setSelectedProtocolId] = useState<string>(protocols[0]?.id || '');

  if (!isOpen) return null;
  
  const selectedProtocol = protocols.find(p => p.id === selectedProtocolId);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center transition-opacity"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-aivana-grey rounded-2xl shadow-xl w-full max-w-4xl m-4 transform transition-all text-white border border-aivana-light-grey flex flex-col max-h-[90vh]">
        <header className="p-4 flex-shrink-0 flex justify-between items-center border-b border-aivana-light-grey">
            <div className="flex items-center gap-3">
                <Icon name="print" className="w-6 h-6 text-aivana-accent" />
                <h2 className="text-xl font-bold">Print Emergency Pocket Card</h2>
            </div>
             <button onClick={onClose} className="p-1 rounded-full hover:bg-aivana-light-grey">
                <Icon name="close" className="w-5 h-5"/>
            </button>
        </header>
        
        <div className="p-4 flex-shrink-0 flex items-center gap-4">
            <label htmlFor="protocol-select" className="text-sm font-medium">Select Protocol:</label>
            <select
                id="protocol-select"
                value={selectedProtocolId}
                onChange={(e) => setSelectedProtocolId(e.target.value)}
                className="bg-aivana-dark border border-aivana-light-grey text-white text-sm rounded-lg focus:ring-aivana-accent focus:border-aivana-accent p-2"
            >
                {protocols.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                ))}
            </select>
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto bg-gray-800">
            {selectedProtocol && <ProtocolPrintCard protocol={selectedProtocol} />}
        </div>
        
        <footer className="p-4 flex-shrink-0 flex justify-end items-center border-t border-aivana-light-grey">
            <button
                onClick={handlePrint}
                className="bg-aivana-accent hover:bg-purple-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
                <Icon name="print" className="w-5 h-5"/>
                Print
            </button>
        </footer>
      </div>
    </div>
  );
};