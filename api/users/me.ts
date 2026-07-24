import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const authHeader = req.headers.authorization;
  const connectionString = process.env.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET;

  if (!connectionString) {
    return res.status(500).json({ error: "Server-side DATABASE_URL is not configured." });
  }
  if (!jwtSecret) {
    return res.status(500).json({ error: "Server-side JWT_SECRET is not configured." });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token format." });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify JWT
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: "Unauthorized: Invalid token payload." });
    }

    const sql = neon(connectionString);

    // Look up user by id
    const users = await sql`
      SELECT id, email, first_name as "firstName", last_name as "lastName"
      FROM users
      WHERE id = ${decoded.userId}
      LIMIT 1
    `;

    if (!users || users.length === 0) {
      return res.status(401).json({ error: "Unauthorized: User not found." });
    }

    const user = users[0];

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error: any) {
    console.error("Auth me error:", error);
    return res.status(401).json({ error: "Unauthorized: Token verification failed." });
  }
}
