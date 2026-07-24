import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { email, password } = req.body;
  const connectionString = process.env.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET;

  if (!connectionString) {
    return res.status(500).json({ error: "Server-side DATABASE_URL is not configured." });
  }
  if (!jwtSecret) {
    return res.status(500).json({ error: "Server-side JWT_SECRET is not configured." });
  }

  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password." });
  }

  try {
    const sql = neon(connectionString);
    const normalizedEmail = email.toLowerCase().trim();

    // Look up user
    const users = await sql`
      SELECT id, email, password_hash as "passwordHash", first_name as "firstName", last_name as "lastName"
      FROM users
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `;

    if (!users || users.length === 0) {
      // 401 on user not found (same error message to avoid enumeration leak)
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = users[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      // 401 on wrong password (same error message)
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // On success: Issue JWT
    const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error: any) {
    console.error("Login error:", error);
    return res.status(500).json({ error: error.message || "Failed to log in." });
  }
}
