export const ICD10_DOCUMENT_REQUIREMENTS: Record<string, string[]> = {
  // Common sample mapping, can be expanded later
  'default': ['Discharge Summary', 'Final Hospital Bill', 'Payment Receipt', 'Pharmacy Bills'],
  'A00': ['Stool Culture Report', 'Discharge Summary', 'Final Hospital Bill'],
  'I21': ['ECG', 'Cardiac Enzymes (Troponin)', 'Angiogram Report', 'Discharge Summary'],
  'J44': ['Chest X-Ray', 'ABG Report', 'PFT (if available)', 'Discharge Summary'],
};

export const getRequiredDocuments = (icd10Code: string): string[] => {
  const prefix = icd10Code.substring(0, 3).toUpperCase();
  return ICD10_DOCUMENT_REQUIREMENTS[prefix] || ICD10_DOCUMENT_REQUIREMENTS['default'];
};
