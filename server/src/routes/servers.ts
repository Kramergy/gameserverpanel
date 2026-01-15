import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { gameServerManager } from '../services/LocalGameServerManager';

export const serversRouter = Router();

serversRouter.use(authMiddleware);

// Get all servers for user
serversRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let query = `SELECT * FROM server_instances WHERE user_id = ? ORDER BY created_at DESC`;
    let params: any[] = [req.userId];

    if (req.userRole === 'admin') {
      query = `SELECT * FROM server_instances ORDER BY created_at DESC`;
      params = [];
    }

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    
    // Update status for running servers
    const serversWithStatus = rows.map(server => ({
      ...server,
      status: gameServerManager.getServerStatus(server.id) === 'online' 
        ? 'online' 
        : server.status === 'online' ? 'offline' : server.status
    }));
    
    res.json(serversWithStatus);
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
        ? `SELECT * FROM server_instances WHERE id = ?`
        : `SELECT * FROM server_instances WHERE id = ? AND user_id = ?`,
      isAdmin ? [req.params.id] : [req.params.id, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const server = rows[0];
    // Update real-time status
    server.status = gameServerManager.getServerStatus(server.id) === 'online' 
      ? 'online' 
      : server.status === 'online' ? 'offline' : server.status;

    res.json(server);
  } catch (error) {
    console.error('Get server error:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Servers' });
  }
});

// Create server
serversRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { name, game, game_icon, port, max_players, ram_allocated } = req.body;

  if (!name || !game || !game_icon) {
    return res.status(400).json({ error: 'Name, Spiel und Icon erforderlich' });
  }

  try {
    const serverId = uuidv4();
    const installPath = gameServerManager.getServerPath(serverId);
    
    await pool.execute(
      `INSERT INTO server_instances (id, user_id, name, game, game_icon, port, max_players, ram_allocated, install_path, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'installing')`,
      [serverId, req.userId, name, game, game_icon, port || 25565, max_players || 20, ram_allocated || 2048, installPath]
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

// Install server
serversRouter.post('/:id/install', async (req: AuthRequest, res: Response) => {
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

    // Start installation in background
    gameServerManager.installServer(server.id, server.game, {
      port: server.port,
      maxPlayers: server.max_players,
      ram: server.ram_allocated,
      serverName: server.name,
    }).then(async (result) => {
      // Update server status after installation
      await pool.execute(
        'UPDATE server_instances SET status = ?, install_path = ? WHERE id = ?',
        [result.success ? 'offline' : 'error', result.installPath, server.id]
      );
    }).catch(async (error) => {
      console.error('Installation error:', error);
      await pool.execute(
        'UPDATE server_instances SET status = ? WHERE id = ?',
        ['error', server.id]
      );
    });

    res.json({ success: true, message: 'Installation gestartet...' });
  } catch (error) {
    console.error('Install server error:', error);
    res.status(500).json({ error: 'Fehler beim Starten der Installation' });
  }
});

// Update server
serversRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const { name, status, port, max_players, ram_allocated, current_players, cpu_usage, ram_usage, install_path, ip } = req.body;

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
           ip = COALESCE(?, ip)
       WHERE id = ?`,
      [name, status, port, max_players, ram_allocated, current_players, cpu_usage, ram_usage, install_path, ip, req.params.id]
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
    
    // Get server info first
    const [rows] = await pool.execute<RowDataPacket[]>(
      isAdmin 
        ? 'SELECT * FROM server_instances WHERE id = ?'
        : 'SELECT * FROM server_instances WHERE id = ? AND user_id = ?',
      isAdmin ? [req.params.id] : [req.params.id, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    // Delete server files
    await gameServerManager.deleteServer(req.params.id);

    // Delete from database
    const [result] = await pool.execute<ResultSetHeader>(
      isAdmin 
        ? 'DELETE FROM server_instances WHERE id = ?'
        : 'DELETE FROM server_instances WHERE id = ? AND user_id = ?',
      isAdmin ? [req.params.id] : [req.params.id, req.userId]
    );

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

    // Start server directly
    const result = await gameServerManager.startServer(server.id, server.game, {
      port: server.port,
      ram: server.ram_allocated,
    });

    if (result.success) {
      await pool.execute(
        'UPDATE server_instances SET status = ? WHERE id = ?',
        ['online', server.id]
      );
      res.json({ success: true, message: 'Server gestartet' });
    } else {
      res.status(400).json({ error: result.error || 'Fehler beim Starten' });
    }
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

    // Stop server directly
    const result = await gameServerManager.stopServer(server.id, server.game);

    if (result.success) {
      await pool.execute(
        'UPDATE server_instances SET status = ? WHERE id = ?',
        ['offline', server.id]
      );
      res.json({ success: true, message: 'Server gestoppt' });
    } else {
      res.status(400).json({ error: result.error || 'Fehler beim Stoppen' });
    }
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

    // Stop first
    await gameServerManager.stopServer(server.id, server.game);
    
    // Update status
    await pool.execute(
      'UPDATE server_instances SET status = ? WHERE id = ?',
      ['restarting', server.id]
    );

    // Start again
    const result = await gameServerManager.startServer(server.id, server.game, {
      port: server.port,
      ram: server.ram_allocated,
    });

    if (result.success) {
      await pool.execute(
        'UPDATE server_instances SET status = ? WHERE id = ?',
        ['online', server.id]
      );
      res.json({ success: true, message: 'Server neugestartet' });
    } else {
      await pool.execute(
        'UPDATE server_instances SET status = ? WHERE id = ?',
        ['offline', server.id]
      );
      res.status(400).json({ error: result.error || 'Fehler beim Neustarten' });
    }
  } catch (error) {
    console.error('Restart server error:', error);
    res.status(500).json({ error: 'Fehler beim Neustarten des Servers' });
  }
});

// Send command to server console
serversRouter.post('/:id/command', async (req: AuthRequest, res: Response) => {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Befehl erforderlich' });
  }

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

    const result = gameServerManager.sendCommand(req.params.id, command);

    if (result.success) {
      res.json({ success: true, message: 'Befehl gesendet' });
    } else {
      res.status(400).json({ error: result.error || 'Fehler beim Senden' });
    }
  } catch (error) {
    console.error('Send command error:', error);
    res.status(500).json({ error: 'Fehler beim Senden des Befehls' });
  }
});
