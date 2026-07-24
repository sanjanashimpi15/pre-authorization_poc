import React from 'react';
import { VoiceCapturedFinding, UploadedDocument } from '../types';

interface TestResultCardProps {
  result: VoiceCapturedFinding;
  linkedDocument?: UploadedDocument;
  onAttachClick: (testName: string) => void;
  onRemoveClick: (documentId: string, testName: string) => void;
}

const getInterpretationIcon = (interpretation: string) => {
  switch (interpretation) {
    case 'normal': return '✅';
    case 'abnormal_high':
    case 'abnormal_low':
    case 'critical':
      return '⚠️';
    default: return '❕';
  }
};

const getStatusLabel = (interpretation: string) => {
  return interpretation.replace('_', ' ').toUpperCase();
};

export const TestResultCard: React.FC<TestResultCardProps> = ({
  result,
  linkedDocument,
  onAttachClick,
  onRemoveClick
}) => {
  return (
    <div className="border border-gray-600 rounded-lg p-4 bg-gray-800 mb-4 transition-colors hover:bg-gray-700/80">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🔬</span>
            <h4 className="font-semibold text-white">
              {result.testName}: {result.value} {result.unit}
            </h4>
          </div>

          <p className="italic text-gray-400 text-sm mt-2">
            "{result.spokenText}"
          </p>

          <div className="mt-3 flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Status:</span>
              <span className={`font-medium ${result.interpretation === 'normal' ? 'text-green-400' : 'text-yellow-400'}`}>
                {getInterpretationIcon(result.interpretation)} {getStatusLabel(result.interpretation)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-400">Document:</span>
              {linkedDocument ? (
                <span className="text-green-400 font-medium">✅ ATTACHED ({linkedDocument.fileName})</span>
              ) : (
                <span className="text-red-400 font-medium">❌ NOT ATTACHED</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {linkedDocument ? (
          <button
            onClick={() => onRemoveClick(linkedDocument.id, result.testName)}
            className="text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 px-3 py-1.5 rounded-md flex items-center gap-2 transition"
          >
            <span>🗑️</span> Remove Document
          </button>
        ) : (
          <button
            onClick={() => onAttachClick(result.testName)}
            className="text-sm bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 px-3 py-1.5 rounded-md flex items-center gap-2 transition"
          >
            <span>📎</span> Attach Report
          </button>
        )}
      </div>
    </div>
  );
};
