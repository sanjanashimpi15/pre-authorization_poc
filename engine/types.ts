import { Message, DoctorProfile, PreCodedGpt, ClinicalProtocol } from '../types';

// The context object that flows through the NEXUS workflow pipeline
export interface NexusContext {
  // Input
  initialMessage: string;
  history: Message[];
  doctorProfile: DoctorProfile;
  language: string;
  activeGpt?: PreCodedGpt;
  isDoctorVerified: boolean;
  knowledgeBase: ClinicalProtocol[];

  // State
  activeProtocols: ClinicalProtocol[];
  normalizedInput: string;
  systemInstruction: string;
  llmResponseStream?: AsyncGenerator<any>;
  llmFullResponse?: string;

  // Output
  finalOutput?: AsyncGenerator<NexusOutput>;
  
  // Audit Trail
  auditTrail: string[];
}

// The standardized output from the NEXUS workflow
export interface NexusOutput {
  textChunk?: string;
  citations?: { uri: string; title: string }[];
  structuredData?: any;
  source_protocol_id?: string;
  source_protocol_last_reviewed?: string;
  action_type?: 'Informational' | 'Requires Clinician Confirmation';
  error?: string;
}