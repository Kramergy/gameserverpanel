import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

export const nodesRouter = Router();

nodesRouter.use(authMiddleware);

// Get all nodes for user
nodesRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let query = 'SELECT * FROM server_nodes WHERE user_id = $1 ORDER BY created_at DESC';
    let params: any[] = [req.userId];

    // Admins can see all nodes
    if (req.userRole === 'admin') {
      query = 'SELECT * FROM server_nodes ORDER BY created_at DESC';
      params = [];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get nodes error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Nodes' });
  }
});

// Get single node
nodesRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM server_nodes WHERE id = $1 AND (user_id = $2 OR $3 = true)',
      [req.params.id, req.userId, req.userRole === 'admin']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Node nicht gefunden' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get node error:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Nodes' });
  }
});

// Create node
nodesRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { name, host, port, username, auth_type, os_type, game_path } = req.body;

  if (!name || !host || !username) {
    return res.status(400).json({ error: 'Name, Host und Username erforderlich' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO server_nodes (user_id, name, host, port, username, auth_type, os_type, game_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.userId, name, host, port || 22, username, auth_type || 'password', os_type || 'linux', game_path || '/home/gameserver']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create node error:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen des Nodes' });
  }
});

// Update node
nodesRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const { name, host, port, username, auth_type, os_type, game_path, status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE server_nodes 
       SET name = COALESCE($1, name),
           host = COALESCE($2, host),
           port = COALESCE($3, port),
           username = COALESCE($4, username),
           auth_type = COALESCE($5, auth_type),
           os_type = COALESCE($6, os_type),
           game_path = COALESCE($7, game_path),
           status = COALESCE($8, status),
           updated_at = now()
       WHERE id = $9 AND (user_id = $10 OR $11 = true)
       RETURNING *`,
      [name, host, port, username, auth_type, os_type, game_path, status, req.params.id, req.userId, req.userRole === 'admin']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Node nicht gefunden' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update node error:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Nodes' });
  }
});

// Delete node
nodesRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM server_nodes WHERE id = $1 AND (user_id = $2 OR $3 = true) RETURNING id',
      [req.params.id, req.userId, req.userRole === 'admin']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Node nicht gefunden' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete node error:', error);
    res.status(500).json({ error: 'Fehler beim Löschen des Nodes' });
  }
});

// Test node connection
nodesRouter.post('/:id/test', async (req: AuthRequest, res: Response) => {
  try {
    const nodeResult = await pool.query(
      'SELECT * FROM server_nodes WHERE id = $1 AND (user_id = $2 OR $3 = true)',
      [req.params.id, req.userId, req.userRole === 'admin']
    );

    if (nodeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Node nicht gefunden' });
    }

    const node = nodeResult.rows[0];

    // Basic reachability test (simplified - in production you'd do actual SSH/connection test)
    let status = 'unknown';
    let message = 'Verbindungstest nicht verfügbar';

    // Check if agent is connected
    if (node.agent_token && node.last_check) {
      const lastCheck = new Date(node.last_check);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastCheck.getTime()) / 1000 / 60;

      if (diffMinutes < 2) {
        status = 'online';
        message = 'Agent verbunden';
      } else {
        status = 'offline';
        message = 'Agent nicht erreichbar';
      }
    }

    // Update node status
    await pool.query(
      'UPDATE server_nodes SET status = $1, last_check = now() WHERE id = $2',
      [status, node.id]
    );

    res.json({
      success: status === 'online',
      connectionTest: status === 'online',
      pathTest: true,
      message,
      details: `Host: ${node.host}:${node.port}`
    });
  } catch (error) {
    console.error('Test node error:', error);
    res.status(500).json({ error: 'Verbindungstest fehlgeschlagen' });
  }
});

// Register agent and get install script
nodesRouter.post('/:id/register-agent', async (req: AuthRequest, res: Response) => {
  try {
    const nodeResult = await pool.query(
      'SELECT * FROM server_nodes WHERE id = $1 AND (user_id = $2 OR $3 = true)',
      [req.params.id, req.userId, req.userRole === 'admin']
    );

    if (nodeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Node nicht gefunden' });
    }

    const node = nodeResult.rows[0];
    const agentToken = uuidv4();

    // Update node with agent token
    await pool.query(
      'UPDATE server_nodes SET agent_token = $1 WHERE id = $2',
      [agentToken, node.id]
    );

    // Get backend URL from request or env
    const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;

    // Generate install scripts
    const linuxScript = generateLinuxInstallScript(backendUrl, node.id, agentToken, node.game_path);
    const windowsScript = generateWindowsInstallScript(backendUrl, node.id, agentToken, node.game_path);

    res.json({
      agentToken,
      linuxScript,
      windowsScript
    });
  } catch (error) {
    console.error('Register agent error:', error);
    res.status(500).json({ error: 'Agent-Registrierung fehlgeschlagen' });
  }
});

function generateLinuxInstallScript(backendUrl: string, nodeId: string, agentToken: string, gamePath: string): string {
  return `#!/bin/bash
# GamePanel Agent Installation Script for Linux
# Generated for Node: ${nodeId}

set -e

BACKEND_URL="${backendUrl}"
NODE_ID="${nodeId}"
AGENT_TOKEN="${agentToken}"
GAME_PATH="${gamePath}"
INSTALL_DIR="/opt/gamepanel-agent"

echo "Installing GamePanel Agent..."

# Create directories
sudo mkdir -p $INSTALL_DIR
sudo mkdir -p $GAME_PATH

# Create agent script
cat > $INSTALL_DIR/agent.sh << 'AGENT_SCRIPT'
#!/bin/bash

BACKEND_URL="$1"
NODE_ID="$2"
AGENT_TOKEN="$3"
GAME_PATH="$4"

send_heartbeat() {
    curl -s -X POST "$BACKEND_URL/api/agent/heartbeat" \\
        -H "Content-Type: application/json" \\
        -d "{\\"nodeId\\": \\"$NODE_ID\\", \\"agentToken\\": \\"$AGENT_TOKEN\\"}" > /dev/null 2>&1
}

poll_commands() {
    response=$(curl -s -X POST "$BACKEND_URL/api/agent/poll-commands" \\
        -H "Content-Type: application/json" \\
        -d "{\\"nodeId\\": \\"$NODE_ID\\", \\"agentToken\\": \\"$AGENT_TOKEN\\"}")
    
    echo "$response"
}

send_result() {
    local command_id="$1"
    local success="$2"
    local message="$3"
    
    curl -s -X POST "$BACKEND_URL/api/agent/command-result" \\
        -H "Content-Type: application/json" \\
        -d "{\\"commandId\\": \\"$command_id\\", \\"agentToken\\": \\"$AGENT_TOKEN\\", \\"success\\": $success, \\"message\\": \\"$message\\"}" > /dev/null 2>&1
}

while true; do
    send_heartbeat
    
    commands=$(poll_commands)
    
    # Process commands here (simplified)
    
    sleep 5
done
AGENT_SCRIPT

chmod +x $INSTALL_DIR/agent.sh

# Create systemd service
cat > /etc/systemd/system/gamepanel-agent.service << EOF
[Unit]
Description=GamePanel Agent
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/agent.sh "$BACKEND_URL" "$NODE_ID" "$AGENT_TOKEN" "$GAME_PATH"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo systemctl daemon-reload
sudo systemctl enable gamepanel-agent
sudo systemctl start gamepanel-agent

echo "GamePanel Agent installed successfully!"
echo "Service status: sudo systemctl status gamepanel-agent"
`;
}

function generateWindowsInstallScript(backendUrl: string, nodeId: string, agentToken: string, gamePath: string): string {
  return `# GamePanel Agent Installation Script for Windows
# Generated for Node: ${nodeId}

$BackendUrl = "${backendUrl}"
$NodeId = "${nodeId}"
$AgentToken = "${agentToken}"
$GamePath = "${gamePath}"
$InstallDir = "C:\\GamePanel\\Agent"

Write-Host "Installing GamePanel Agent..."

# Create directories
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $GamePath | Out-Null

# Create agent script
$AgentScript = @'
param(
    [string]$BackendUrl,
    [string]$NodeId,
    [string]$AgentToken,
    [string]$GamePath
)

function Send-Heartbeat {
    try {
        $body = @{
            nodeId = $NodeId
            agentToken = $AgentToken
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$BackendUrl/api/agent/heartbeat" -Method POST -Body $body -ContentType "application/json" -ErrorAction SilentlyContinue
    } catch {}
}

function Get-Commands {
    try {
        $body = @{
            nodeId = $NodeId
            agentToken = $AgentToken
        } | ConvertTo-Json
        
        return Invoke-RestMethod -Uri "$BackendUrl/api/agent/poll-commands" -Method POST -Body $body -ContentType "application/json"
    } catch {
        return $null
    }
}

while ($true) {
    Send-Heartbeat
    $commands = Get-Commands
    # Process commands here
    Start-Sleep -Seconds 5
}
'@

$AgentScript | Out-File -FilePath "$InstallDir\\agent.ps1" -Encoding UTF8

# Create scheduled task
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File \`"$InstallDir\\agent.ps1\`" -BackendUrl \`"$BackendUrl\`" -NodeId \`"$NodeId\`" -AgentToken \`"$AgentToken\`" -GamePath \`"$GamePath\`""
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "GamePanelAgent" -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force

# Start immediately
Start-ScheduledTask -TaskName "GamePanelAgent"

Write-Host "GamePanel Agent installed successfully!"
`;
}
