import React, { useState } from 'react';
import { VoiceCapturedFinding, UploadedDocument } from '../types';
import { TestResultCard } from './TestResultCard';
import { getRequiredDocuments, guessDocumentCategory } from '../utils/documentRequirements';

interface InsuranceStepDocumentsProps {
    testResults: VoiceCapturedFinding[];
    uploadedDocuments: UploadedDocument[];
    onFileUpload: (file: File) => void;
    onLinkDocument: (documentId: string, testName: string) => void;
    onRemoveDocument: (documentId: string, testName?: string) => void;
    provisionalDiagnosis?: string;
}

export const InsuranceStepDocuments: React.FC<InsuranceStepDocumentsProps> = ({
    testResults,
    uploadedDocuments,
    onFileUpload,
    onLinkDocument,
    onRemoveDocument,
    provisionalDiagnosis
}) => {
    const [activeTestToLink, setActiveTestToLink] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            onFileUpload(file);

            // Reset input
            e.target.value = '';
        }
    };

    const testsNeedingDocs = testResults.filter(t => !t.documentAttached);

    // Calculate missing required documents based on diagnosis
    const requiredDocs = provisionalDiagnosis ? getRequiredDocuments(provisionalDiagnosis) : [];
    const uploadedCategories = uploadedDocuments.map(d => guessDocumentCategory(d.fileName));

    const missingMandatoryDocs = requiredDocs.filter(
        req => req.isRequired && !uploadedCategories.includes(req.category)
    );

    return (
        <div className="space-y-8">
            {missingMandatoryDocs.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <span className="text-xl mt-0.5" role="img" aria-label="warning">🚨</span>
                        <div>
                            <p className="text-red-400 font-bold text-sm">Critical Missing Evidence Alert</p>
                            <p className="text-sm text-red-300/90 mt-1">
                                TPA algorithms auto-reject <strong>{provisionalDiagnosis}</strong> claims without the following documents:
                            </p>
                            <ul className="list-disc list-inside text-sm text-red-200 mt-2 font-medium">
                                {missingMandatoryDocs.map((doc, i) => (
                                    <li key={i}>{doc.displayName} <span className="text-xs text-red-300/70 font-normal">({doc.description})</span></li>
                                ))}
                            </ul>
                            <p className="text-xs text-red-300/80 mt-3 font-semibold">
                                Please upload these mandatory attachments below to prevent rejection.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div>
                <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2 mb-4 flex items-center justify-between">
                    <span>📋 Test Results from Consultation</span>
                    <span className="text-sm bg-gray-800 px-3 py-1 rounded-full text-gray-400">
                        {testResults.length} Tests Detected
                    </span>
                </h3>

                {testResults.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 bg-gray-800/50 rounded-lg border border-gray-700">
                        <p>No test results were detected in the consultation transcript.</p>
                    </div>
                ) : (
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {testResults.map((result, idx) => {
                            const linkedDoc = result.documentId
                                ? uploadedDocuments.find(d => d.id === result.documentId)
                                : undefined;

                            return (
                                <div key={idx}>
                                    <TestResultCard
                                        result={result}
                                        linkedDocument={linkedDoc}
                                        onAttachClick={(testName) => setActiveTestToLink(testName)}
                                        onRemoveClick={(docId, testName) => onRemoveDocument(docId, testName)}
                                    />

                                    {activeTestToLink === result.testName && (
                                        <div className="mt-2 p-3 bg-gray-700 rounded-lg border border-purple-500">
                                            <p className="text-sm text-gray-300 mb-2 font-medium">Link document for {result.testName}:</p>
                                            <div className="flex gap-2 mb-3 max-w-full overflow-x-auto">
                                                {uploadedDocuments.filter(d => !d.linkedToTest).map(doc => (
                                                    <button
                                                        key={doc.id}
                                                        onClick={() => {
                                                            onLinkDocument(doc.id, result.testName);
                                                            setActiveTestToLink(null);
                                                        }}
                                                        className="text-xs bg-gray-800 hover:bg-gray-600 px-3 py-2 rounded border border-gray-600 truncate max-w-[150px]"
                                                        title={doc.fileName}
                                                    >
                                                        {doc.fileName}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <label className="cursor-pointer text-purple-400 hover:text-purple-300">
                                                    <input type="file" className="hidden" onChange={handleFileChange} />
                                                    + Upload new file
                                                </label>
                                                <button
                                                    onClick={() => setActiveTestToLink(null)}
                                                    className="text-gray-400 hover:text-white"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div>
                <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2 mb-4">
                    📤 Upload Additional Documents
                </h3>

                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer bg-gray-800/50 hover:bg-gray-800 transition">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-8 h-8 mb-3 text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2" />
                        </svg>
                        <p className="mb-1 text-sm text-gray-300"><span className="font-medium text-purple-400">Click to upload</span> or drag and drop</p>
                        <p className="text-xs text-gray-500">PDF, JPG, PNG up to 10MB</p>
                    </div>
                    <input type="file" className="hidden" onChange={handleFileChange} />
                </label>

                {uploadedDocuments.length > 0 && (
                    <div className="mt-6">
                        <h4 className="text-sm font-medium text-gray-400 mb-2">Uploaded Files:</h4>
                        <ul className="space-y-2">
                            {uploadedDocuments.map((doc, idx) => (
                                <li key={idx} className="flex items-center justify-between text-sm bg-gray-800 p-2 rounded border border-gray-700">
                                    <div className="flex items-center gap-3">
                                        <span className="text-gray-300">{doc.fileName}</span>
                                        <span className="text-xs text-gray-500">({doc.fileSize})</span>
                                        {doc.linkedToTest ? (
                                            <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded">
                                                Linked: {doc.linkedToTest}
                                            </span>
                                        ) : (
                                            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                                                General
                                            </span>
                                        )}
                                        {doc.extractionStatus === 'processing' && (
                                            <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded animate-pulse">
                                                🔄 Reading document...
                                            </span>
                                        )}
                                        {doc.extractionStatus === 'success' && (
                                            <span
                                                className="text-xs bg-green-900/50 text-green-300 px-2 py-0.5 rounded"
                                                title={`Confidence: ${Math.round((doc.extractedData?.confidence ?? 0) * 100)}%`}
                                            >
                                                ✅ {doc.extractedData?.document_type?.replace(/_/g, ' ') || 'Processed'}
                                            </span>
                                        )}
                                        {doc.extractionStatus === 'error' && (
                                            <span
                                                className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded"
                                                title={doc.extractionError}
                                            >
                                                ⚠️ Extraction failed
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => onRemoveDocument(doc.id, doc.linkedToTest)}
                                        className="text-red-400 hover:text-red-300 p-1"
                                        title="Remove file"
                                    >
                                        🗑️
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};