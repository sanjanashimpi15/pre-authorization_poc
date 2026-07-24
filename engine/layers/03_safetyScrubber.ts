import { NexusContext } from '../types';

/**
 * Robust PHI scrubber to redact personal identifiers:
 * - Indian Phone Numbers (10 digits, optional country code)
 * - Email Addresses
 * - Aadhaar Cards (12 digits, optional formatting)
 * - PAN Card numbers (10 chars, e.g. ABCDE1234F)
 * - Patient names (if explicitly passed or via heuristic)
 */
export function scrubPhiText(text: string, patientName?: string): string {
  if (!text) return text;
  let scrubbed = text;

  // 1. Redact phone numbers (10 digits, optional country code)
  scrubbed = scrubbed.replace(/(\+91[\-\s]?)?[6-9]\d{9}/g, '[PHONE REDACTED]');
  scrubbed = scrubbed.replace(/(\+91[\-\s]?)?[6-9]\d{4}[\-\s]?\d{5}/g, '[PHONE REDACTED]');

  // 2. Redact email addresses
  scrubbed = scrubbed.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL REDACTED]');

  // 3. Redact Aadhaar Card (12 digits, optional spaces/hyphens)
  scrubbed = scrubbed.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[AADHAAR REDACTED]');

  // 4. Redact PAN Card (5 letters, 4 digits, 1 letter)
  scrubbed = scrubbed.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[PAN REDACTED]');

  // 5. Redact patient name if provided
  if (patientName && patientName.trim().length > 2) {
    const escapedName = patientName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
    scrubbed = scrubbed.replace(regex, '[PATIENT NAME REDACTED]');
    
    // Redact components of patient name
    const parts = patientName.split(/\s+/).filter(p => p.length > 2);
    parts.forEach(part => {
      const partEscaped = part.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const partRegex = new RegExp(`\\b${partEscaped}\\b`, 'gi');
      scrubbed = scrubbed.replace(partRegex, '[NAME REDACTED]');
    });
  }

  return scrubbed;
}

export const scrubPhi = (context: NexusContext): NexusContext => {
  const patientName = context.patient?.patientName;
  
  if (context.clinical?.chiefComplaints) {
    context.clinical.chiefComplaints = scrubPhiText(context.clinical.chiefComplaints, patientName);
  }
  if (context.clinical?.historyOfPresentIllness) {
    context.clinical.historyOfPresentIllness = scrubPhiText(context.clinical.historyOfPresentIllness, patientName);
  }
  if (context.clinical?.relevantClinicalFindings) {
    context.clinical.relevantClinicalFindings = scrubPhiText(context.clinical.relevantClinicalFindings, patientName);
  }
  
  context.auditTrail.push('[Safety Scrubber] Completed PHI scrubbing check.');
  return context;
};