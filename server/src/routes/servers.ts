import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';

export const serversRouter = Router();

serversRouter.use(authMiddleware);

// Get all servers for user
serversRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let query = `
      SELECT si.*, sn.name as node_name, sn.host as node_host, sn.status as node_status
      FROM server_instances si
      LEFT JOIN server_nodes sn ON si.node_id = sn.id
      WHERE si.user_id = ?
      ORDER BY si.created_at DESC
    `;
    let params: any[] = [req.userId];

    if (req.userRole === 'admin') {
      query = `
        SELECT si.*, sn.name as node_name, sn.host as node_host, sn.status as node_status
        FROM server_instances si
        LEFT JOIN server_nodes sn ON si.node_id = sn.id
        ORDER BY si.created_at DESC
      `;
      params = [];
    }

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Server' });
  }
});

// Get single server
serversRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const [rows] = await pool.execute<RowDataPacket[]>(
      isAdmin
        ? `SELECT si.*, sn.name as node_name, sn.host as node_host, sn.status as node_status
           FROM server_instances si
           LEFT JOIN server_nodes sn ON si.node_id = sn.id
           WHERE si.id = ?`
        : `SELECT si.*, sn.name as node_name, sn.host as node_host, sn.status as node_status
           FROM server_instances si
           LEFT JOIN server_nodes sn ON si.node_id = sn.id
           WHERE si.id = ? AND si.user_id = ?`,
      isAdmin ? [req.params.id] : [req.params.id, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Get server error:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Servers' });
  }
});

// Create server
serversRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { name, game, game_icon, node_id, port, max_players, ram_allocated } = req.body;

  if (!name || !game || !game_icon) {
    return res.status(400).json({ error: 'Name, Spiel und Icon erforderlich' });
  }

  try {
    // Verify node ownership if provided
    if (node_id) {
      const isAdmin = req.userRole === 'admin';
      const [nodeCheck] = await pool.execute<RowDataPacket[]>(
        isAdmin 
          ? 'SELECT id FROM server_nodes WHERE id = ?'
          : 'SELECT id FROM server_nodes WHERE id = ? AND user_id = ?',
        isAdmin ? [node_id] : [node_id, req.userId]
      );

      if (nodeCheck.length === 0) {
        return res.status(400).json({ error: 'Node nicht gefunden oder keine Berechtigung' });
      }
    }

    const serverId = uuidv4();
    await pool.execute(
      `INSERT INTO server_instances (id, user_id, node_id, name, game, game_icon, port, max_players, ram_allocated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [serverId, req.userId, node_id || null, name, game, game_icon, port || 25565, max_players || 20, ram_allocated || 2048]
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM server_instances WHERE id = ?',
      [serverId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Servers' });
  }
});

// Update server
serversRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const { name, status, port, max_players, ram_allocated, current_players, cpu_usage, ram_usage, install_path, node_id, ip } = req.body;

  try {
    const isAdmin = req.userRole === 'admin';
    
    // Check if server exists and user has permission
    const [existing] = await pool.execute<RowDataPacket[]>(
      isAdmin 
        ? 'SELECT id FROM server_instances WHERE id = ?'
        : 'SELECT id FROM server_instances WHERE id = ? AND user_id = ?',
      isAdmin ? [req.params.id] : [req.params.id, req.userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    await pool.execute(
      `UPDATE server_instances 
       SET name = COALESCE(?, name),
           status = COALESCE(?, status),
           port = COALESCE(?, port),
           max_players = COALESCE(?, max_players),
           ram_allocated = COALESCE(?, ram_allocated),
           current_players = COALESCE(?, current_players),
           cpu_usage = COALESCE(?, cpu_usage),
           ram_usage = COALESCE(?, ram_usage),
           install_path = COALESCE(?, install_path),
           node_id = COALESCE(?, node_id),
           ip = COALESCE(?, ip)
       WHERE id = ?`,
      [name, status, port, max_players, ram_allocated, current_players, cpu_usage, ram_usage, install_path, node_id, ip, req.params.id]
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM server_instances WHERE id = ?',
      [req.params.id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Update server error:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Servers' });
  }
});

// Delete server
serversRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const [result] = await pool.execute<ResultSetHeader>(
      isAdmin 
        ? 'DELETE FROM server_instances WHERE id = ?'
        : 'DELETE FROM server_instances WHERE id = ? AND user_id = ?',
      isAdmin ? [req.params.id] : [req.params.id, req.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete server error:', error);
    res.status(500).json({ error: 'Fehler beim Löschen des Servers' });
  }
});

// Start server
serversRouter.post('/:id/start', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const [rows] = await pool.execute<RowDataPacket[]>(
      isAdmin 
        ? 'SELECT * FROM server_instances WHERE id = ?'
        : 'SELECT * FROM server_instances WHERE id = ? AND user_id = ?',
      isAdmin ? [req.params.id] : [req.params.id, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const server = rows[0];

    if (!server.node_id) {
      return res.status(400).json({ error: 'Kein Node zugewiesen' });
    }

    // Create start command
    await pool.execute(
      `INSERT INTO node_commands (id, node_id, user_id, command_type, command_data)
       VALUES (?, ?, ?, 'start_gameserver', ?)`,
      [uuidv4(), server.node_id, req.userId, JSON.stringify({ serverId: server.id, game: server.game })]
    );

    // Update status
    await pool.execute(
      'UPDATE server_instances SET status = ? WHERE id = ?',
      ['starting', server.id]
    );

    res.json({ success: true, message: 'Server wird gestartet...' });
  } catch (error) {
    console.error('Start server error:', error);
    res.status(500).json({ error: 'Fehler beim Starten des Servers' });
  }
});

// Stop server
serversRouter.post('/:id/stop', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const [rows] = await pool.execute<RowDataPacket[]>(
      isAdmin 
        ? 'SELECT * FROM server_instances WHERE id = ?'
        : 'SELECT * FROM server_instances WHERE id = ? AND user_id = ?',
      isAdmin ? [req.params.id] : [req.params.id, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const server = rows[0];

    if (!server.node_id) {
      return res.status(400).json({ error: 'Kein Node zugewiesen' });
    }

    // Create stop command
    await pool.execute(
      `INSERT INTO node_commands (id, node_id, user_id, command_type, command_data)
       VALUES (?, ?, ?, 'stop_gameserver', ?)`,
      [uuidv4(), server.node_id, req.userId, JSON.stringify({ serverId: server.id })]
    );

    // Update status
    await pool.execute(
      'UPDATE server_instances SET status = ? WHERE id = ?',
      ['stopping', server.id]
    );

    res.json({ success: true, message: 'Server wird gestoppt...' });
  } catch (error) {
    console.error('Stop server error:', error);
    res.status(500).json({ error: 'Fehler beim Stoppen des Servers' });
  }
});

// Restart server
serversRouter.post('/:id/restart', async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const [rows] = await pool.execute<RowDataPacket[]>(
      isAdmin 
        ? 'SELECT * FROM server_instances WHERE id = ?'
        : 'SELECT * FROM server_instances WHERE id = ? AND user_id = ?',
      isAdmin ? [req.params.id] : [req.params.id, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const server = rows[0];

    if (!server.node_id) {
      return res.status(400).json({ error: 'Kein Node zugewiesen' });
    }

    // Create restart command
    await pool.execute(
      `INSERT INTO node_commands (id, node_id, user_id, command_type, command_data)
       VALUES (?, ?, ?, 'restart_gameserver', ?)`,
      [uuidv4(), server.node_id, req.userId, JSON.stringify({ serverId: server.id })]
    );

    // Update status
    await pool.execute(
      'UPDATE server_instances SET status = ? WHERE id = ?',
      ['restarting', server.id]
    );

    res.json({ success: true, message: 'Server wird neugestartet...' });
  } catch (error) {
    console.error('Restart server error:', error);
    res.status(500).json({ error: 'Fehler beim Neustarten des Servers' });
  }
});
