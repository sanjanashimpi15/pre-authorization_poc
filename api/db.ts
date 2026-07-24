import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Determine database path depending on Vercel serverless vs local environment
const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;
const dbPath = isVercel
  ? path.join('/tmp', 'prior_auth_poc.db')
  : path.resolve(process.cwd(), 'prior_auth_poc.db');

// Helper to get db connection and ensure tables exist
let _dbInstance: Database.Database | null = null;
function getDb() {
  if (!_dbInstance) {
    // If running in Vercel temp, make sure dir exists (should exist)
    if (isVercel) {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    
    _dbInstance = new Database(dbPath);
    
    // Initialize schema
    _dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS patient_cases (
        id TEXT PRIMARY KEY,
        updatedAt TEXT,
        data TEXT
      );
      
      CREATE TABLE IF NOT EXISTS patients (
        id TEXT PRIMARY KEY,
        patientName TEXT,
        mobileNumber TEXT,
        uhid TEXT,
        data TEXT
      );
      
      CREATE TABLE IF NOT EXISTS icd_corrections (
        caseId TEXT,
        originalAiCode TEXT,
        humanCorrectedCode TEXT,
        clinicalContext TEXT,
        reasonForCorrection TEXT,
        timestamp TEXT
      );
      
      CREATE TABLE IF NOT EXISTS generated_packets (
        id TEXT PRIMARY KEY,
        patientId TEXT,
        data TEXT,
        createdAt TEXT
      );
    `);
  }
  return _dbInstance;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { action, args } = req.body;
  const db = getDb();

  try {
    switch (action) {
      case 'getPatientCase': {
        const row = db.prepare('SELECT data FROM patient_cases WHERE id = ?').get(args.id) as any;
        return res.status(200).json({ data: row ? JSON.parse(row.data) : null });
      }
      
      case 'savePatientCase': {
        const stmt = db.prepare(`
          INSERT INTO patient_cases (id, updatedAt, data)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            updatedAt = excluded.updatedAt,
            data = excluded.data
        `);
        stmt.run(args.id, args.updatedAt, JSON.stringify(args.data));
        return res.status(200).json({ success: true });
      }
      
      case 'getAllPatientCases': {
        const rows = db.prepare('SELECT data FROM patient_cases ORDER BY updatedAt DESC').all() as any[];
        const cases = rows.map(r => JSON.parse(r.data));
        return res.status(200).json({ cases });
      }
      
      case 'deletePatientCase': {
        db.prepare('DELETE FROM patient_cases WHERE id = ?').run(args.id);
        return res.status(200).json({ success: true });
      }
      
      case 'getPatient': {
        const row = db.prepare('SELECT data FROM patients WHERE id = ?').get(args.id) as any;
        return res.status(200).json({ data: row ? JSON.parse(row.data) : null });
      }
      
      case 'savePatient': {
        const stmt = db.prepare(`
          INSERT INTO patients (id, patientName, mobileNumber, uhid, data)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            patientName = excluded.patientName,
            mobileNumber = excluded.mobileNumber,
            uhid = excluded.uhid,
            data = excluded.data
        `);
        stmt.run(
          args.id,
          args.patientName,
          args.mobileNumber,
          args.uhid || '',
          JSON.stringify(args.data)
        );
        return res.status(200).json({ success: true });
      }
      
      case 'getAllPatients': {
        const rows = db.prepare('SELECT data FROM patients').all() as any[];
        const patients = rows.map(r => JSON.parse(r.data));
        return res.status(200).json({ patients });
      }
      
      case 'searchPatients': {
        const query = `%${args.query.toLowerCase()}%`;
        const rows = db.prepare(`
          SELECT data FROM patients 
          WHERE LOWER(patientName) LIKE ? 
             OR mobileNumber LIKE ? 
             OR LOWER(uhid) LIKE ?
        `).all(query, query, query) as any[];
        const patients = rows.map(r => JSON.parse(r.data));
        return res.status(200).json({ patients });
      }
      
      case 'saveCorrection': {
        const stmt = db.prepare(`
          INSERT INTO icd_corrections (caseId, originalAiCode, humanCorrectedCode, clinicalContext, reasonForCorrection, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          args.caseId,
          args.originalAiCode,
          args.humanCorrectedCode,
          args.clinicalContext,
          args.reasonForCorrection || '',
          args.timestamp
        );
        return res.status(200).json({ success: true });
      }
      
      case 'getAllCorrections': {
        const corrections = db.prepare('SELECT * FROM icd_corrections ORDER BY timestamp DESC').all();
        return res.status(200).json({ corrections });
      }
      
      case 'savePacket': {
        const stmt = db.prepare(`
          INSERT INTO generated_packets (id, patientId, data, createdAt)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            patientId = excluded.patientId,
            data = excluded.data,
            createdAt = excluded.createdAt
        `);
        stmt.run(args.id, args.patientId, JSON.stringify(args.data), args.createdAt);
        return res.status(200).json({ success: true });
      }
      
      case 'getPacket': {
        const row = db.prepare('SELECT data FROM generated_packets WHERE id = ?').get(args.id) as any;
        return res.status(200).json({ data: row ? JSON.parse(row.data) : null });
      }
      
      default:
        return res.status(400).send(`Unsupported db action: ${action}`);
    }
  } catch (err: any) {
    console.error("SQLite endpoint execution error:", err);
    return res.status(500).json({ error: err.message || "Failed to execute database operation" });
  }
}
