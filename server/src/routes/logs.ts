import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const logsRouter = Router();

logsRouter.use(authMiddleware);

// Get logs for a server
logsRouter.get('/server/:serverId', async (req: AuthRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;

  try {
    const isAdmin = req.userRole === 'admin';
    const [rows] = await pool.execute<RowDataPacket[]>(
      isAdmin
        ? `SELECT sl.* FROM server_logs sl
           JOIN server_instances si ON sl.server_id = si.id
           WHERE sl.server_id = ?
           ORDER BY sl.created_at DESC
           LIMIT ?`
        : `SELECT sl.* FROM server_logs sl
           JOIN server_instances si ON sl.server_id = si.id
           WHERE sl.server_id = ? AND si.user_id = ?
           ORDER BY sl.created_at DESC
           LIMIT ?`,
      isAdmin ? [req.params.serverId, limit] : [req.params.serverId, req.userId, limit]
    );

    // Return in chronological order
    res.json(rows.reverse());
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Logs' });
  }
});

// Clear logs for a server
logsRouter.delete('/server/:serverId', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const [serverCheck] = await pool.execute<RowDataPacket[]>(
      isAdmin 
        ? 'SELECT id FROM server_instances WHERE id = ?'
        : 'SELECT id FROM server_instances WHERE id = ? AND user_id = ?',
      isAdmin ? [req.params.serverId] : [req.params.serverId, req.userId]
    );

    if (serverCheck.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    await pool.execute(
      'DELETE FROM server_logs WHERE server_id = ?',
      [req.params.serverId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Clear logs error:', error);
    res.status(500).json({ error: 'Fehler beim Löschen der Logs' });
  }
});
