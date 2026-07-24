export interface IcdAuditEntry {
  caseId: string;
  inputText: string;
  candidatesShown: string[];
  chosenCode: string;
  matchMethod: string;
  confirmedBy: string;
  timestamp: string;
}

/**
 * Logs an ICD-10 assignment decision to local storage and standard output.
 */
export function logIcdAssignment(entry: Omit<IcdAuditEntry, 'timestamp'>) {
  const auditEntry: IcdAuditEntry = {
    ...entry,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[ICD AUDIT] Case: ${auditEntry.caseId} | Chosen: ${auditEntry.chosenCode} via ${auditEntry.matchMethod}`);

  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const logs = JSON.parse(localStorage.getItem('nexus_icd_audit_logs') || '[]');
    logs.push(auditEntry);
    localStorage.setItem('nexus_icd_audit_logs', JSON.stringify(logs));
  } catch (err) {
    console.error('Failed to save ICD assignment audit log:', err);
  }
}
