import React, { useState, useEffect } from 'react';
import { lookupICD, assignICDViaModel, IcdCandidate, validateCode } from '../../services/icdService';
import { logIcdAssignment } from '../../utils/auditLogger';
import { captureCodingCorrection } from '../../engine/continuousLearningLoop';

interface ICDPickerProps {
  caseId: string;
  diagnosisText: string;
  clinicalContext?: string;
  initialCode?: string;
  initialDescription?: string;
  initialMatchMethod?: string;
  onConfirm: (code: string, description: string, matchMethod: string) => void;
  doctorName?: string;
}

export const ICDPicker: React.FC<ICDPickerProps> = ({
  caseId,
  diagnosisText,
  clinicalContext = '',
  initialCode = '',
  initialDescription = '',
  initialMatchMethod = '',
  onConfirm,
  doctorName = 'Dr. Kumar'
}) => {
  const [query, setQuery] = useState(diagnosisText || '');
  const [candidates, setCandidates] = useState<IcdCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<IcdCandidate | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [confirmed, setConfirmed] = useState<{ code: string; desc: string; method: string } | null>(
    initialCode && validateCode(initialCode)
      ? { code: initialCode, desc: initialDescription, method: initialMatchMethod || 'manual' }
      : null
  );

  // Keep confirmed local state synced with incoming props
  useEffect(() => {
    if (initialCode && validateCode(initialCode)) {
      setConfirmed({ code: initialCode, desc: initialDescription, method: initialMatchMethod || 'manual' });
    } else {
      setConfirmed(null);
    }
    setQuery(diagnosisText || '');
  }, [initialCode, initialDescription, initialMatchMethod, diagnosisText]);

  // Run deterministic lookup as typing happens
  useEffect(() => {
    if (query.trim().length > 1) {
      const results = lookupICD(query);
      setCandidates(results);
    } else {
      setCandidates([]);
    }
  }, [query]);

  const handleAiFallback = async () => {
    setLoadingAi(true);
    try {
      const results = await assignICDViaModel(diagnosisText, clinicalContext);
      setCandidates(results);
    } catch (err) {
      console.error('Error in AI fallback lookup:', err);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleSelect = (candidate: IcdCandidate) => {
    setSelectedCandidate(candidate);
  };

  const handleConfirm = () => {
    if (!selectedCandidate) return;

    // Log the assignment to audit ledger
    logIcdAssignment({
      caseId,
      inputText: query,
      candidatesShown: candidates.map(c => `${c.code}:${c.description}`),
      chosenCode: selectedCandidate.code,
      matchMethod: selectedCandidate.matchMethod,
      confirmedBy: doctorName
    });

    // Capture human override correction for continuous learning loop
    if (initialCode && initialCode !== selectedCandidate.code) {
      captureCodingCorrection({
        caseId,
        originalAiCode: initialCode,
        humanCorrectedCode: selectedCandidate.code,
        clinicalContext: diagnosisText
      });
    }

    const newConfirmation = {
      code: selectedCandidate.code,
      desc: selectedCandidate.description,
      method: selectedCandidate.matchMethod
    };

    setConfirmed(newConfirmation);
    onConfirm(selectedCandidate.code, selectedCandidate.description, selectedCandidate.matchMethod);
    setSelectedCandidate(null);
    setCandidates([]);
  };

  return (
    <div className="bg-white border border-opd-border rounded-2xl p-4 space-y-3.5 shadow-sm">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-opd-text-secondary uppercase tracking-wider font-lora">ICD-10 Diagnostic Coding (WHO Standard)</h4>
        {confirmed ? (
          <span className="text-[9px] uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
            Confirmed
          </span>
        ) : (
          <span className="text-[9px] uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
            Coding Required
          </span>
        )}
      </div>

      {/* Confirmed Code Display */}
      {confirmed && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex justify-between items-start text-xs shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-mono text-emerald-700 font-bold text-sm">
              <span>Code:</span>
              <span className="bg-white px-2 py-0.5 rounded border border-emerald-200">{confirmed.code}</span>
            </div>
            <p className="text-opd-text-primary font-semibold text-xs mt-1">{confirmed.desc}</p>
            <div className="text-[10px] text-opd-text-secondary mt-1">
              Assigned via <span className="uppercase text-opd-text-primary font-bold">{confirmed.method.replace('_', ' ')}</span>
            </div>
          </div>
          <button
            onClick={() => setConfirmed(null)}
            className="text-[10px] text-red-700 hover:text-red-800 font-bold hover:underline transition-colors"
            type="button"
          >
            Reset
          </button>
        </div>
      )}

      {/* Input Selector (Only show if not confirmed) */}
      {!confirmed && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="form-input flex-1"
              placeholder="Search ICD-10 description or code (e.g. pneumonia)..."
            />
            {query.trim().length > 0 && (
              <button
                onClick={() => setQuery('')}
                className="px-2 py-1 text-xs text-opd-text-secondary hover:text-opd-primary transition-colors"
                type="button"
              >
                Clear
              </button>
            )}
          </div>

          {/* Candidates List */}
          {candidates.length > 0 && (
            <div className="bg-white border border-opd-border rounded-xl max-h-48 overflow-y-auto divide-y divide-opd-border shadow-sm">
              {candidates.map((c) => (
                <div
                  key={c.code}
                  onClick={() => handleSelect(c)}
                  className={`p-2.5 text-xs cursor-pointer flex justify-between items-start transition-colors ${
                    selectedCandidate?.code === c.code
                      ? 'bg-primary-tint/25 hover:bg-primary-tint/35'
                      : 'hover:bg-primary-tint/10'
                  }`}
                >
                  <div className="space-y-0.5 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-opd-primary">{c.code}</span>
                      <span className="text-opd-text-primary font-medium">{c.description}</span>
                    </div>
                    {c.note && <span className="text-[10px] text-opd-text-secondary italic">Note: {c.note}</span>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                      c.confidence === 'high' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      c.confidence === 'medium' ? 'bg-primary-tint text-opd-primary border-opd-primary/10' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {c.confidence}
                    </span>
                    <span className="text-[8px] text-opd-text-muted uppercase font-semibold">{c.matchMethod.replace('_', ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* AI Fallback trigger when rules return empty */}
          {candidates.length === 0 && query.trim().length > 2 && (
            <div className="flex items-center justify-between bg-primary-tint/5 rounded-xl p-3 border border-opd-border shadow-sm">
              <span className="text-xs text-opd-text-secondary">No official matching codes found.</span>
              <button
                onClick={handleAiFallback}
                disabled={loadingAi}
                className="btn-primary py-1.5 px-3 flex items-center gap-1.5 shadow-sm"
                type="button"
              >
                {loadingAi ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Coding...</span>
                  </>
                ) : (
                  <>
                    <span>Ask MedGemma Fallback</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Selected Candidate Confirmation Details */}
          {selectedCandidate && (
            <div className="bg-primary-tint/20 border border-opd-primary/20 rounded-xl p-3.5 space-y-2.5 shadow-sm">
              <div className="text-xs text-opd-text-primary">
                Are you sure you want to select: <strong className="font-mono text-opd-primary font-bold">{selectedCandidate.code}</strong> - <strong>{selectedCandidate.description}</strong>?
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white transition-colors shadow-sm"
                  type="button"
                >
                  Confirm Selection
                </button>
                <button
                  onClick={() => setSelectedCandidate(null)}
                  className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-white border border-opd-border hover:bg-gray-50 text-opd-text-secondary transition-colors shadow-sm"
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
