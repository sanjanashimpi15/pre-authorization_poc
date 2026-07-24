import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { email, password, firstName, lastName, phone } = req.body;
  const connectionString = process.env.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET;

  if (!connectionString) {
    return res.status(500).json({ error: "Server-side DATABASE_URL is not configured." });
  }
  if (!jwtSecret) {
    return res.status(500).json({ error: "Server-side JWT_SECRET is not configured." });
  }

  // Validate request body
  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: "Missing required fields: email, password, firstName, lastName are required." });
  }

  try {
    const sql = neon(connectionString);
    
    // Check if user already exists
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await sql`SELECT id FROM users WHERE email = ${normalizedEmail} LIMIT 1`;
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: "Email is already registered." });
    }

    // Hash password (10 rounds)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const result = await sql`
      INSERT INTO users (email, password_hash, first_name, last_name, phone)
      VALUES (${normalizedEmail}, ${passwordHash}, ${firstName}, ${lastName}, ${phone || null})
      RETURNING id, email, first_name as "firstName", last_name as "lastName"
    `;

    const user = result[0];

    // Issue JWT
    const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    return res.status(500).json({ error: error.message || "Failed to complete signup." });
  }
}
