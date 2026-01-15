import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

export const logsRouter = Router();

logsRouter.use(authMiddleware);

// Get logs for a server
logsRouter.get('/server/:serverId', async (req: AuthRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;

  try {
    const result = await pool.query(
      `SELECT sl.* FROM server_logs sl
       JOIN server_instances si ON sl.server_id = si.id
       WHERE sl.server_id = $1 AND (si.user_id = $2 OR $3 = true)
       ORDER BY sl.created_at DESC
       LIMIT $4`,
      [req.params.serverId, req.userId, req.userRole === 'admin', limit]
    );

    // Return in chronological order
    res.json(result.rows.reverse());
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Logs' });
  }
});

// Clear logs for a server
logsRouter.delete('/server/:serverId', async (req: AuthRequest, res: Response) => {
  try {
    const serverCheck = await pool.query(
      'SELECT id FROM server_instances WHERE id = $1 AND (user_id = $2 OR $3 = true)',
      [req.params.serverId, req.userId, req.userRole === 'admin']
    );

    if (serverCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    await pool.query(
      'DELETE FROM server_logs WHERE server_id = $1',
      [req.params.serverId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Clear logs error:', error);
    res.status(500).json({ error: 'Fehler beim Löschen der Logs' });
  }
});
