import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: 'admin' | 'user';
}

export interface JWTPayload {
  userId: string;
  email: string;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    req.userId = decoded.userId;

    // Fetch user role
    const result = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [decoded.userId]
    );

    req.userRole = result.rows[0]?.role || 'user';

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token ungültig' });
  }
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin-Berechtigung erforderlich' });
  }
  next();
}
