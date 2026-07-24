
import React from 'react';
import { PreCodedGpt, UserRole } from './types';
import { Icon } from './components/Icon';

export const PRE_CODED_GPTS: PreCodedGpt[] = [
  // General Medicine Focus
  {
    id: 'doctor-emergency',
    title: 'Emergency Protocols (ACLS/ATLS)',
    description: 'Instant, step-by-step protocols for general medical emergencies like ACS, Stroke, Sepsis, and Anaphylaxis.',
    icon: <Icon name="siren" />,
    roles: [UserRole.DOCTOR],
  },
  {
    id: 'doctor-risk-assessment',
    title: 'General Triage & Risk Stratification',
    description: 'Enter patient vitals, age, and chief complaint to stratify risk (e.g., NEWS2, ASCVD, qSOFA) and determine disposition.',
    icon: <Icon name="shield-heart" />,
    roles: [UserRole.DOCTOR],
    customComponentId: 'PregnancyRiskAssessment', // Re-using ID key for mapping, but logic will be general
  },
  {
    id: 'doctor-lab',
    title: 'General Lab Result Analyzer',
    description: 'Interpret comprehensive metabolic panels, CBC, ABGs, and lipid profiles with clinical context.',
    icon: <Icon name="lab" />,
    roles: [UserRole.DOCTOR],
    customComponentId: 'LabResultAnalysis',
  },
  {
    id: 'doctor-guidelines',
    title: 'Clinical Guideline Search (NICE/CDC/WHO)',
    description: 'Query the latest standard treatment guidelines for internal medicine, pediatrics, and surgery.',
    icon: <Icon name="search" />,
    roles: [UserRole.DOCTOR],
  },
  {
    id: 'doctor-case-simulator',
    title: 'Clinical Case Simulator',
    description: 'Engage in realistic, AI-powered case simulations for training in complex multi-system diseases.',
    icon: <Icon name="clipboard-check" />,
    roles: [UserRole.DOCTOR],
  },
  {
    id: 'doctor-handout',
    title: 'General Patient Education',
    description: 'Create easy-to-understand patient handouts for chronic diseases (Diabetes, HTN) and acute conditions.',
    icon: <Icon name="handout" />,
    roles: [UserRole.DOCTOR],
  },
];

export const PREAUTH_DISCLAIMER = `
IMPORTANT DISCLAIMER

This pre-authorization request is generated using Aivana Clinical Documentation System based on clinical findings reported by the treating physician. 

Aivana DOES NOT:
• Independently verify test results or clinical observations
• Guarantee approval of pre-authorization by TPA/Insurer
• Take responsibility for accuracy of clinical information

The treating physician confirms that:
• All clinical information entered is accurate and complete
• Supporting documents attached are genuine and unaltered
• The proposed admission is medically necessary

DOCUMENTATION STATUS: {{DOCUMENT_STATUS}}
{{PENDING_DOCUMENTS_LIST}}
`;

export const generateDisclaimer = (status: 'complete' | 'pending_documents', pendingList: string[]) => {
  return PREAUTH_DISCLAIMER
    .replace('{{DOCUMENT_STATUS}}', status === 'complete' ? 'All documents attached' : 'PENDING - Some documents not attached')
    .replace('{{PENDING_DOCUMENTS_LIST}}',
      pendingList.length > 0
        ? `\nPending documents: ${pendingList.join(', ')}`
        : ''
    );
};
