import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

export const authRouter = Router();

// Register
authRouter.post('/signup', async (req: Request, res: Response) => {
  const { email, password, username } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if user exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'E-Mail bereits registriert' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const userResult = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, passwordHash]
    );

    const userId = userResult.rows[0].id;

    // Create profile
    await client.query(
      'INSERT INTO profiles (user_id, email, username) VALUES ($1, $2, $3)',
      [userId, email, username || null]
    );

    // Check if first user (make admin)
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    const role = parseInt(userCount.rows[0].count) === 1 ? 'admin' : 'user';

    await client.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
      [userId, role]
    );

    await client.query('COMMIT');

    // Generate JWT
    const token = jwt.sign(
      { userId, email },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      user: { id: userId, email },
      token,
      role
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
  } finally {
    client.release();
  }
});

// Login
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  }

  try {
    // Get user
    const userResult = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    // Get role
    const roleResult = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [user.id]
    );

    const role = roleResult.rows[0]?.role || 'user';

    // Get profile
    const profileResult = await pool.query(
      'SELECT * FROM profiles WHERE user_id = $1',
      [user.id]
    );

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      user: { id: user.id, email: user.email },
      profile: profileResult.rows[0] || null,
      token,
      role
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Anmeldung fehlgeschlagen' });
  }
});

// Get current user
authRouter.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await pool.query(
      'SELECT id, email FROM users WHERE id = $1',
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const profileResult = await pool.query(
      'SELECT * FROM profiles WHERE user_id = $1',
      [req.userId]
    );

    res.json({
      user: userResult.rows[0],
      profile: profileResult.rows[0] || null,
      role: req.userRole
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Benutzers' });
  }
});

// Logout (client-side, just confirm)
authRouter.post('/logout', (req: Request, res: Response) => {
  res.json({ success: true });
});
