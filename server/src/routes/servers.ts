import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

export const serversRouter = Router();

serversRouter.use(authMiddleware);

// Get all servers for user
serversRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let query = `
      SELECT si.*, sn.name as node_name, sn.host as node_host, sn.status as node_status
      FROM server_instances si
      LEFT JOIN server_nodes sn ON si.node_id = sn.id
      WHERE si.user_id = $1
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

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Server' });
  }
});

// Get single server
serversRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT si.*, sn.name as node_name, sn.host as node_host, sn.status as node_status
       FROM server_instances si
       LEFT JOIN server_nodes sn ON si.node_id = sn.id
       WHERE si.id = $1 AND (si.user_id = $2 OR $3 = true)`,
      [req.params.id, req.userId, req.userRole === 'admin']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    res.json(result.rows[0]);
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
      const nodeCheck = await pool.query(
        'SELECT id FROM server_nodes WHERE id = $1 AND (user_id = $2 OR $3 = true)',
        [node_id, req.userId, req.userRole === 'admin']
      );

      if (nodeCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Node nicht gefunden oder keine Berechtigung' });
      }
    }

    const result = await pool.query(
      `INSERT INTO server_instances (user_id, node_id, name, game, game_icon, port, max_players, ram_allocated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.userId, node_id || null, name, game, game_icon, port || 25565, max_players || 20, ram_allocated || 2048]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Servers' });
  }
});

// Update server
serversRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const { name, status, port, max_players, ram_allocated, current_players, cpu_usage, ram_usage, install_path, node_id, ip } = req.body;

  try {
    const result = await pool.query(
      `UPDATE server_instances 
       SET name = COALESCE($1, name),
           status = COALESCE($2, status),
           port = COALESCE($3, port),
           max_players = COALESCE($4, max_players),
           ram_allocated = COALESCE($5, ram_allocated),
           current_players = COALESCE($6, current_players),
           cpu_usage = COALESCE($7, cpu_usage),
           ram_usage = COALESCE($8, ram_usage),
           install_path = COALESCE($9, install_path),
           node_id = COALESCE($10, node_id),
           ip = COALESCE($11, ip),
           updated_at = now()
       WHERE id = $12 AND (user_id = $13 OR $14 = true)
       RETURNING *`,
      [name, status, port, max_players, ram_allocated, current_players, cpu_usage, ram_usage, install_path, node_id, ip, req.params.id, req.userId, req.userRole === 'admin']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update server error:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Servers' });
  }
});

// Delete server
serversRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM server_instances WHERE id = $1 AND (user_id = $2 OR $3 = true) RETURNING id',
      [req.params.id, req.userId, req.userRole === 'admin']
    );

    if (result.rows.length === 0) {
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
    const serverResult = await pool.query(
      'SELECT * FROM server_instances WHERE id = $1 AND (user_id = $2 OR $3 = true)',
      [req.params.id, req.userId, req.userRole === 'admin']
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const server = serverResult.rows[0];

    if (!server.node_id) {
      return res.status(400).json({ error: 'Kein Node zugewiesen' });
    }

    // Create start command
    await pool.query(
      `INSERT INTO node_commands (node_id, user_id, command_type, command_data)
       VALUES ($1, $2, 'start_gameserver', $3)`,
      [server.node_id, req.userId, JSON.stringify({ serverId: server.id, game: server.game })]
    );

    // Update status
    await pool.query(
      'UPDATE server_instances SET status = $1 WHERE id = $2',
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
    const serverResult = await pool.query(
      'SELECT * FROM server_instances WHERE id = $1 AND (user_id = $2 OR $3 = true)',
      [req.params.id, req.userId, req.userRole === 'admin']
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const server = serverResult.rows[0];

    if (!server.node_id) {
      return res.status(400).json({ error: 'Kein Node zugewiesen' });
    }

    // Create stop command
    await pool.query(
      `INSERT INTO node_commands (node_id, user_id, command_type, command_data)
       VALUES ($1, $2, 'stop_gameserver', $3)`,
      [server.node_id, req.userId, JSON.stringify({ serverId: server.id })]
    );

    // Update status
    await pool.query(
      'UPDATE server_instances SET status = $1 WHERE id = $2',
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
    const serverResult = await pool.query(
      'SELECT * FROM server_instances WHERE id = $1 AND (user_id = $2 OR $3 = true)',
      [req.params.id, req.userId, req.userRole === 'admin']
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const server = serverResult.rows[0];

    if (!server.node_id) {
      return res.status(400).json({ error: 'Kein Node zugewiesen' });
    }

    // Create restart command
    await pool.query(
      `INSERT INTO node_commands (node_id, user_id, command_type, command_data)
       VALUES ($1, $2, 'restart_gameserver', $3)`,
      [server.node_id, req.userId, JSON.stringify({ serverId: server.id })]
    );

    // Update status
    await pool.query(
      'UPDATE server_instances SET status = $1 WHERE id = $2',
      ['restarting', server.id]
    );

    res.json({ success: true, message: 'Server wird neugestartet...' });
  } catch (error) {
    console.error('Restart server error:', error);
    res.status(500).json({ error: 'Fehler beim Neustarten des Servers' });
  }
});
