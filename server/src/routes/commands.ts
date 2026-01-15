import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

export const commandsRouter = Router();

commandsRouter.use(authMiddleware);

// Get commands for a node
commandsRouter.get('/node/:nodeId', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT nc.* FROM node_commands nc
       JOIN server_nodes sn ON nc.node_id = sn.id
       WHERE nc.node_id = $1 AND (sn.user_id = $2 OR $3 = true)
       ORDER BY nc.created_at DESC
       LIMIT 50`,
      [req.params.nodeId, req.userId, req.userRole === 'admin']
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get commands error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Befehle' });
  }
});

// Create command
commandsRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { node_id, command_type, command_data } = req.body;

  if (!node_id || !command_type) {
    return res.status(400).json({ error: 'Node ID und Befehlstyp erforderlich' });
  }

  try {
    // Verify node ownership
    const nodeCheck = await pool.query(
      'SELECT id FROM server_nodes WHERE id = $1 AND (user_id = $2 OR $3 = true)',
      [node_id, req.userId, req.userRole === 'admin']
    );

    if (nodeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Node nicht gefunden' });
    }

    const result = await pool.query(
      `INSERT INTO node_commands (node_id, user_id, command_type, command_data)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [node_id, req.userId, command_type, JSON.stringify(command_data || {})]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create command error:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Befehls' });
  }
});

// Get command status
commandsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT nc.* FROM node_commands nc
       JOIN server_nodes sn ON nc.node_id = sn.id
       WHERE nc.id = $1 AND (nc.user_id = $2 OR $3 = true)`,
      [req.params.id, req.userId, req.userRole === 'admin']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Befehl nicht gefunden' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get command error:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Befehls' });
  }
});
