import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';

export const commandsRouter = Router();

commandsRouter.use(authMiddleware);

// Get commands for a node
commandsRouter.get('/node/:nodeId', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const [rows] = await pool.execute<RowDataPacket[]>(
      isAdmin
        ? `SELECT nc.* FROM node_commands nc
           JOIN server_nodes sn ON nc.node_id = sn.id
           WHERE nc.node_id = ?
           ORDER BY nc.created_at DESC
           LIMIT 50`
        : `SELECT nc.* FROM node_commands nc
           JOIN server_nodes sn ON nc.node_id = sn.id
           WHERE nc.node_id = ? AND sn.user_id = ?
           ORDER BY nc.created_at DESC
           LIMIT 50`,
      isAdmin ? [req.params.nodeId] : [req.params.nodeId, req.userId]
    );

    res.json(rows);
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
    const isAdmin = req.userRole === 'admin';
    const [nodeCheck] = await pool.execute<RowDataPacket[]>(
      isAdmin 
        ? 'SELECT id FROM server_nodes WHERE id = ?'
        : 'SELECT id FROM server_nodes WHERE id = ? AND user_id = ?',
      isAdmin ? [node_id] : [node_id, req.userId]
    );

    if (nodeCheck.length === 0) {
      return res.status(404).json({ error: 'Node nicht gefunden' });
    }

    const commandId = uuidv4();
    await pool.execute(
      `INSERT INTO node_commands (id, node_id, user_id, command_type, command_data)
       VALUES (?, ?, ?, ?, ?)`,
      [commandId, node_id, req.userId, command_type, JSON.stringify(command_data || {})]
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM node_commands WHERE id = ?',
      [commandId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Create command error:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Befehls' });
  }
});

// Get command status
commandsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const [rows] = await pool.execute<RowDataPacket[]>(
      isAdmin
        ? `SELECT nc.* FROM node_commands nc
           JOIN server_nodes sn ON nc.node_id = sn.id
           WHERE nc.id = ?`
        : `SELECT nc.* FROM node_commands nc
           JOIN server_nodes sn ON nc.node_id = sn.id
           WHERE nc.id = ? AND nc.user_id = ?`,
      isAdmin ? [req.params.id] : [req.params.id, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Befehl nicht gefunden' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Get command error:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Befehls' });
  }
});
