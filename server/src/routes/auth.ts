import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';

export const authRouter = Router();

// Register
authRouter.post('/signup', async (req: Request, res: Response) => {
  const { email, password, username } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check if user exists
    const [existingUsers] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'E-Mail bereits registriert' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user with UUID
    const userId = uuidv4();
    await connection.execute(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      [userId, email, passwordHash]
    );

    // Create profile
    await connection.execute(
      'INSERT INTO profiles (id, user_id, email, username) VALUES (?, ?, ?, ?)',
      [uuidv4(), userId, email, username || null]
    );

    // Check if first user (make admin)
    const [userCount] = await connection.execute<RowDataPacket[]>('SELECT COUNT(*) as count FROM users');
    const role = userCount[0].count === 1 ? 'admin' : 'user';

    await connection.execute(
      'INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)',
      [uuidv4(), userId, role]
    );

    await connection.commit();

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
    await connection.rollback();
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
  } finally {
    connection.release();
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
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT id, email, password_hash FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    const user = users[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    // Get role
    const [roles] = await pool.execute<RowDataPacket[]>(
      'SELECT role FROM user_roles WHERE user_id = ?',
      [user.id]
    );

    const role = roles[0]?.role || 'user';

    // Get profile
    const [profiles] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM profiles WHERE user_id = ?',
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
      profile: profiles[0] || null,
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
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT id, email FROM users WHERE id = ?',
      [req.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const [profiles] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM profiles WHERE user_id = ?',
      [req.userId]
    );

    res.json({
      user: users[0],
      profile: profiles[0] || null,
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
