import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';

export const agentRouter = Router();

// Agent heartbeat
agentRouter.post('/heartbeat', async (req: Request, res: Response) => {
  const { nodeId, agentToken } = req.body;

  if (!nodeId || !agentToken) {
    return res.status(400).json({ error: 'nodeId und agentToken erforderlich' });
  }

  try {
    const result = await pool.query(
      `UPDATE server_nodes 
       SET last_check = now(), status = 'online', agent_connected_at = COALESCE(agent_connected_at, now())
       WHERE id = $1 AND agent_token = $2
       RETURNING id`,
      [nodeId, agentToken]
    );

    if (result.rows.length === 0) {
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
    const nodeResult = await pool.query(
      'SELECT * FROM server_nodes WHERE id = $1 AND agent_token = $2',
      [nodeId, agentToken]
    );

    if (nodeResult.rows.length === 0) {
      return res.status(401).json({ error: 'Ungültiger Node oder Token' });
    }

    const node = nodeResult.rows[0];

    // Update last check
    await pool.query(
      'UPDATE server_nodes SET last_check = now(), status = $1 WHERE id = $2',
      ['online', nodeId]
    );

    // Get pending commands
    const commandsResult = await pool.query(
      `SELECT * FROM node_commands 
       WHERE node_id = $1 AND status = 'pending'
       ORDER BY created_at ASC`,
      [nodeId]
    );

    // Get game paths for servers on this node
    const serversResult = await pool.query(
      `SELECT id, game, install_path FROM server_instances WHERE node_id = $1`,
      [nodeId]
    );

    res.json({
      commands: commandsResult.rows,
      gamePath: node.game_path,
      servers: serversResult.rows
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
    const commandResult = await pool.query(
      `SELECT nc.*, sn.agent_token 
       FROM node_commands nc
       JOIN server_nodes sn ON nc.node_id = sn.id
       WHERE nc.id = $1`,
      [commandId]
    );

    if (commandResult.rows.length === 0) {
      return res.status(404).json({ error: 'Befehl nicht gefunden' });
    }

    const command = commandResult.rows[0];

    if (command.agent_token !== agentToken) {
      return res.status(401).json({ error: 'Ungültiger Token' });
    }

    // Update command
    await pool.query(
      `UPDATE node_commands 
       SET status = $1, result = $2, executed_at = now()
       WHERE id = $3`,
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

      await pool.query(
        'UPDATE server_instances SET status = $1 WHERE id = $2',
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
    const serverResult = await pool.query(
      `SELECT si.*, sn.agent_token 
       FROM server_instances si
       JOIN server_nodes sn ON si.node_id = sn.id
       WHERE si.id = $1`,
      [serverId]
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const server = serverResult.rows[0];

    if (server.agent_token !== agentToken) {
      return res.status(401).json({ error: 'Ungültiger Token' });
    }

    // Insert log
    await pool.query(
      `INSERT INTO server_logs (server_id, user_id, log_type, message)
       VALUES ($1, $2, $3, $4)`,
      [serverId, server.user_id, logType || 'info', message]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Send log error:', error);
    res.status(500).json({ error: 'Fehler beim Speichern des Logs' });
  }
});
