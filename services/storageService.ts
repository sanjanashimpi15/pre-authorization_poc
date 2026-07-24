import { PreAuthRecord, PatientRecord } from '../components/PreAuthWizard/types';
import type { DenialAppealResult } from '../engine/denialAppealGenerator';
import { mapToWhoCode, validateCode, getDescription } from './icdService';

const DB_NAME = 'AivanaInsuranceDB';
const DB_VERSION = 2;
const PREAUTH_STORE = 'preauths';
const APPEALS_STORE = 'appeals';
const PATIENT_STORE = 'patients';

let db: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (db) { resolve(db); return; }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { db = request.result; resolve(db); };
        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;
            if (!database.objectStoreNames.contains(PREAUTH_STORE)) {
                database.createObjectStore(PREAUTH_STORE, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(PATIENT_STORE)) {
                database.createObjectStore(PATIENT_STORE, { keyPath: 'id' });
            }
            // v2: appeal drafts keyed by recordId
            if (!database.objectStoreNames.contains(APPEALS_STORE)) {
                database.createObjectStore(APPEALS_STORE, { keyPath: 'recordId' });
            }
        };
    });
};

const tx = async <T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

// ---- PreAuth Operations ----

export const savePreAuth = async (record: PreAuthRecord): Promise<void> => {
    // Enforce: NO non-WHO code is stored
    if (record.clinical?.diagnoses) {
        record.clinical.diagnoses = record.clinical.diagnoses.map(dx => {
            const code = dx.icd10Code;
            if (code && !code.toLowerCase().includes('pending') && !code.toLowerCase().includes('selection')) {
                if (validateCode(code)) {
                    return dx;
                }
                const mapped = mapToWhoCode(code);
                if (mapped) {
                    console.log(`[StorageSanitizer] Mapping non-WHO code "${code}" -> valid WHO code "${mapped}"`);
                    return {
                        ...dx,
                        icd10Code: mapped,
                        icd10Description: getDescription(mapped)
                    };
                }
                console.warn(`[StorageSanitizer] Invalid non-WHO code "${code}" could not be mapped. Resetting to Pending.`);
                return {
                    ...dx,
                    icd10Code: 'Pending ICD-10',
                    icd10Description: 'Selection required'
                };
            }
            return dx;
        });
    }

    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PREAUTH_STORE, 'readwrite');
        const store = transaction.objectStore(PREAUTH_STORE);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

export const getPreAuth = async (id: string): Promise<PreAuthRecord | undefined> => {
    return tx<PreAuthRecord | undefined>(PREAUTH_STORE, 'readonly', store => store.get(id));
};

export const getAllPreAuths = async (): Promise<PreAuthRecord[]> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PREAUTH_STORE, 'readonly');
        const store = transaction.objectStore(PREAUTH_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
};

export const deletePreAuth = async (id: string): Promise<void> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PREAUTH_STORE, 'readwrite');
        const store = transaction.objectStore(PREAUTH_STORE);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

// ---- Patient Operations ----

export const savePatient = async (patient: PatientRecord): Promise<void> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PATIENT_STORE, 'readwrite');
        const store = transaction.objectStore(PATIENT_STORE);
        const req = store.put(patient);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

export const getAllPatients = async (): Promise<PatientRecord[]> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(PATIENT_STORE, 'readonly');
        const store = transaction.objectStore(PATIENT_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
};

export const searchPatients = async (query: string): Promise<PatientRecord[]> => {
    const all = await getAllPatients();
    const q = query.toLowerCase();
    return all.filter(p =>
        p.patientName.toLowerCase().includes(q) ||
        p.mobileNumber.includes(q) ||
        (p.uhid && p.uhid.toLowerCase().includes(q)) ||
        (p.lastKnownPolicyNumber && p.lastKnownPolicyNumber.toLowerCase().includes(q))
    );
};

// ---- ID Generation ----

// ---- Appeal Operations ----

export const saveAppeal = async (appeal: DenialAppealResult): Promise<void> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(APPEALS_STORE, 'readwrite');
        const store = transaction.objectStore(APPEALS_STORE);
        const req = store.put(appeal);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

export const getAppeal = async (recordId: string): Promise<DenialAppealResult | undefined> => {
    return tx<DenialAppealResult | undefined>(APPEALS_STORE, 'readonly', store => store.get(recordId));
};

export const getAllAppeals = async (): Promise<DenialAppealResult[]> => {
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(APPEALS_STORE, 'readonly');
        const store = transaction.objectStore(APPEALS_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
};

export const updateAppealStatus = async (
    recordId: string,
    newStatus: DenialAppealResult['appealStatus']
): Promise<void> => {
    const existing = await getAppeal(recordId);
    if (!existing) return;
    await saveAppeal({ ...existing, appealStatus: newStatus });
};

// ---- ID Generation ----

export const generatePreAuthId = (): string => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const seq = String(Math.floor(Math.random() * 9000) + 1000);
    return `PA-AIVANA-${dateStr}-${seq}`;
};

export const generatePatientId = (): string => `PAT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
