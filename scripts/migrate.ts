import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env and .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL;

async function migrate() {
    if (!connectionString) {
        console.error("❌ DATABASE_URL environment variable is not defined!");
        console.error("Please add DATABASE_URL to your .env.local file first.");
        process.exit(1);
    }

    console.log("⚡ Connecting to Neon Postgres...");
    try {
        const sql = neon(connectionString);
        
        console.log("⚡ Creating 'users' table if not exists...");
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                phone TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            );
        `;
        console.log("✅ Migration completed successfully! 'users' table is ready.");
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
}

migrate();
