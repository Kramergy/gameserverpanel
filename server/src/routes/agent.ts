import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export const agentRouter = Router();

// Agent heartbeat
agentRouter.post('/heartbeat', async (req: Request, res: Response) => {
  const { nodeId, agentToken } = req.body;

  if (!nodeId || !agentToken) {
    return res.status(400).json({ error: 'nodeId und agentToken erforderlich' });
  }

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE server_nodes 
       SET last_check = NOW(), status = 'online', agent_connected_at = COALESCE(agent_connected_at, NOW())
       WHERE id = ? AND agent_token = ?`,
      [nodeId, agentToken]
    );

    if (result.affectedRows === 0) {
      return res.status(401).json({ error: 'Ungültiger Node oder Token' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ error: 'Heartbeat fehlgeschlagen' });
  }
});

// Agent polls for commands
agentRouter.post('/poll-commands', async (req: Request, res: Response) => {
  const { nodeId, agentToken } = req.body;

  if (!nodeId || !agentToken) {
    return res.status(400).json({ error: 'nodeId und agentToken erforderlich' });
  }

  try {
    // Verify agent
    const [nodes] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM server_nodes WHERE id = ? AND agent_token = ?',
      [nodeId, agentToken]
    );

    if (nodes.length === 0) {
      return res.status(401).json({ error: 'Ungültiger Node oder Token' });
    }

    const node = nodes[0];

    // Update last check
    await pool.execute(
      'UPDATE server_nodes SET last_check = NOW(), status = ? WHERE id = ?',
      ['online', nodeId]
    );

    // Get pending commands
    const [commands] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM node_commands 
       WHERE node_id = ? AND status = 'pending'
       ORDER BY created_at ASC`,
      [nodeId]
    );

    // Get game paths for servers on this node
    const [servers] = await pool.execute<RowDataPacket[]>(
      `SELECT id, game, install_path FROM server_instances WHERE node_id = ?`,
      [nodeId]
    );

    res.json({
      commands,
      gamePath: node.game_path,
      servers
    });
  } catch (error) {
    console.error('Poll commands error:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Befehle' });
  }
});

// Agent reports command result
agentRouter.post('/command-result', async (req: Request, res: Response) => {
  const { commandId, agentToken, success, message, data } = req.body;

  if (!commandId || !agentToken) {
    return res.status(400).json({ error: 'commandId und agentToken erforderlich' });
  }

  try {
    // Verify agent owns this command's node
    const [commands] = await pool.execute<RowDataPacket[]>(
      `SELECT nc.*, sn.agent_token 
       FROM node_commands nc
       JOIN server_nodes sn ON nc.node_id = sn.id
       WHERE nc.id = ?`,
      [commandId]
    );

    if (commands.length === 0) {
      return res.status(404).json({ error: 'Befehl nicht gefunden' });
    }

    const command = commands[0];

    if (command.agent_token !== agentToken) {
      return res.status(401).json({ error: 'Ungültiger Token' });
    }

    // Update command
    await pool.execute(
      `UPDATE node_commands 
       SET status = ?, result = ?, executed_at = NOW()
       WHERE id = ?`,
      [success ? 'completed' : 'failed', JSON.stringify({ success, message, data }), commandId]
    );

    // If this was a game server command, update server status
    const commandData = command.command_data;
    if (commandData?.serverId) {
      let newStatus = 'offline';
      if (command.command_type === 'start_gameserver' && success) {
        newStatus = 'online';
      } else if (command.command_type === 'stop_gameserver' && success) {
        newStatus = 'offline';
      } else if (command.command_type === 'install_gameserver' && success) {
        newStatus = 'offline';
      }

      await pool.execute(
        'UPDATE server_instances SET status = ? WHERE id = ?',
        [newStatus, commandData.serverId]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Command result error:', error);
    res.status(500).json({ error: 'Fehler beim Speichern des Ergebnisses' });
  }
});

// Agent sends log
agentRouter.post('/send-log', async (req: Request, res: Response) => {
  const { serverId, agentToken, logType, message } = req.body;

  if (!serverId || !agentToken || !message) {
    return res.status(400).json({ error: 'serverId, agentToken und message erforderlich' });
  }

  try {
    // Verify agent owns this server
    const [servers] = await pool.execute<RowDataPacket[]>(
      `SELECT si.*, sn.agent_token 
       FROM server_instances si
       JOIN server_nodes sn ON si.node_id = sn.id
       WHERE si.id = ?`,
      [serverId]
    );

    if (servers.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const server = servers[0];

    if (server.agent_token !== agentToken) {
      return res.status(401).json({ error: 'Ungültiger Token' });
    }

    // Insert log
    const { v4: uuidv4 } = await import('uuid');
    await pool.execute(
      `INSERT INTO server_logs (id, server_id, user_id, log_type, message)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), serverId, server.user_id, logType || 'info', message]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Send log error:', error);
    res.status(500).json({ error: 'Fehler beim Speichern des Logs' });
  }
});
