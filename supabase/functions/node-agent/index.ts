import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Store active WebSocket connections (in-memory, per instance)
const activeConnections = new Map<string, WebSocket>();

serve(async (req) => {
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Check if this is a WebSocket upgrade request
  if (upgradeHeader.toLowerCase() === "websocket") {
    return handleWebSocket(req);
  }

  // Handle HTTP requests
  if (req.method === 'POST') {
    const url = new URL(req.url);
    if (url.pathname.endsWith('/send-command')) {
      return handleSendCommand(req);
    }
    return handleAgentRegistration(req);
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});

async function handleWebSocket(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const agentToken = url.searchParams.get('token');

  if (!agentToken) {
    return new Response("Missing agent token", { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify agent token
  const { data: node, error } = await supabase
    .from('server_nodes')
    .select('*')
    .eq('agent_token', agentToken)
    .single();

  if (error || !node) {
    console.error('Invalid agent token:', agentToken);
    return new Response("Invalid agent token", { status: 401 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = async () => {
    console.log(`Agent connected: ${node.name} (${node.id})`);
    
    // Store connection
    activeConnections.set(node.id, socket);
    
    // Update node status
    await supabase
      .from('server_nodes')
      .update({ 
        status: 'online',
        agent_connected_at: new Date().toISOString(),
        last_check: new Date().toISOString()
      })
      .eq('id', node.id);

    socket.send(JSON.stringify({ type: 'connected', nodeId: node.id }));
    
    // Send any pending commands
    await sendPendingCommands(node.id, socket, supabase);
  };

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log(`Message from ${node.name}:`, message.type);

      if (message.type === 'heartbeat') {
        await supabase
          .from('server_nodes')
          .update({ last_check: new Date().toISOString() })
          .eq('id', node.id);
        
        socket.send(JSON.stringify({ type: 'heartbeat_ack' }));
        
        // Check for pending commands on each heartbeat
        await sendPendingCommands(node.id, socket, supabase);
      }

      if (message.type === 'command_result') {
        // Update command status with result
        await supabase
          .from('node_commands')
          .update({ 
            status: message.success ? 'completed' : 'failed',
            result: message.result,
            executed_at: new Date().toISOString()
          })
          .eq('id', message.commandId);
        
        console.log(`Command ${message.commandId} result:`, message.success ? 'success' : 'failed');
      }

      if (message.type === 'system_info') {
        console.log(`System info from ${node.name}:`, message.data);
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  };

  socket.onclose = async () => {
    console.log(`Agent disconnected: ${node.name}`);
    activeConnections.delete(node.id);
    
    await supabase
      .from('server_nodes')
      .update({ 
        status: 'offline',
        last_check: new Date().toISOString()
      })
      .eq('id', node.id);
  };

  socket.onerror = (error) => {
    console.error(`WebSocket error for ${node.name}:`, error);
  };

  return response;
}

async function sendPendingCommands(nodeId: string, socket: WebSocket, supabase: any) {
  try {
    const { data: commands, error } = await supabase
      .from('node_commands')
      .select('*')
      .eq('node_id', nodeId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error || !commands?.length) return;

    for (const cmd of commands) {
      socket.send(JSON.stringify({
        type: 'execute_command',
        commandId: cmd.id,
        commandType: cmd.command_type,
        data: cmd.command_data
      }));

      // Update status to sent
      await supabase
        .from('node_commands')
        .update({ status: 'sent' })
        .eq('id', cmd.id);

      console.log(`Sent command ${cmd.id} (${cmd.command_type}) to node ${nodeId}`);
    }
  } catch (err) {
    console.error('Error sending pending commands:', err);
  }
}

async function handleSendCommand(req: Request): Promise<Response> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub as string;
    const { nodeId, commandType, commandData } = await req.json();

    if (!nodeId || !commandType) {
      return new Response(
        JSON.stringify({ error: 'Node ID und Command Type erforderlich' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify ownership
    const { data: node, error: nodeError } = await supabaseAdmin
      .from('server_nodes')
      .select('*')
      .eq('id', nodeId)
      .single();

    if (nodeError || !node) {
      return new Response(
        JSON.stringify({ error: 'Node nicht gefunden' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: isAdmin } = await supabaseAdmin
      .rpc('has_role', { _user_id: userId, _role: 'admin' });

    if (node.user_id !== userId && !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Keine Berechtigung' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create command
    const { data: command, error: cmdError } = await supabaseAdmin
      .from('node_commands')
      .insert({
        node_id: nodeId,
        user_id: userId,
        command_type: commandType,
        command_data: commandData || {}
      })
      .select()
      .single();

    if (cmdError) {
      console.error('Error creating command:', cmdError);
      return new Response(
        JSON.stringify({ error: 'Fehler beim Erstellen des Befehls' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to send immediately if agent is connected
    const activeSocket = activeConnections.get(nodeId);
    if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
      activeSocket.send(JSON.stringify({
        type: 'execute_command',
        commandId: command.id,
        commandType: command.command_type,
        data: command.command_data
      }));

      await supabaseAdmin
        .from('node_commands')
        .update({ status: 'sent' })
        .eq('id', command.id);

      return new Response(
        JSON.stringify({ success: true, command, sent: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        command, 
        sent: false,
        message: 'Befehl erstellt. Wird gesendet sobald Agent verbunden ist.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-command:', error);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleAgentRegistration(req: Request): Promise<Response> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub as string;
    const { nodeId } = await req.json();

    if (!nodeId) {
      return new Response(
        JSON.stringify({ error: 'Node ID fehlt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify ownership
    const { data: node, error: nodeError } = await supabaseAdmin
      .from('server_nodes')
      .select('*')
      .eq('id', nodeId)
      .single();

    if (nodeError || !node) {
      return new Response(
        JSON.stringify({ error: 'Node nicht gefunden' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: isAdmin } = await supabaseAdmin
      .rpc('has_role', { _user_id: userId, _role: 'admin' });

    if (node.user_id !== userId && !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Keine Berechtigung' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate new agent token
    const agentToken = crypto.randomUUID() + '-' + crypto.randomUUID();

    await supabaseAdmin
      .from('server_nodes')
      .update({ agent_token: agentToken })
      .eq('id', nodeId);

    // Generate PowerShell install script
    const wsUrl = `wss://${supabaseUrl.replace('https://', '')}/functions/v1/node-agent?token=${agentToken}`;
    
    const installScript = generateInstallScript(node.name, node.game_path, wsUrl);

    return new Response(
      JSON.stringify({ 
        success: true,
        agentToken,
        installScript,
        wsUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in agent registration:', error);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

function generateInstallScript(nodeName: string, gamePath: string, wsUrl: string): string {
  return `
# GameServer Panel Agent - Installation Script
# Node: ${nodeName}

$AgentPath = "$env:ProgramData\\GameServerAgent"
$ServiceName = "GameServerAgent"
$GamePath = "${gamePath}"

Write-Host "Installing GameServer Agent..." -ForegroundColor Cyan

# Create directory
New-Item -ItemType Directory -Force -Path $AgentPath | Out-Null
New-Item -ItemType Directory -Force -Path $GamePath | Out-Null

# Create agent script with command handling
$AgentScript = @'
param([string]$WebSocketUrl, [string]$GamePath)

Add-Type -AssemblyName System.Net.WebSockets

function Send-Message {
    param($ws, $message, $cts)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($message)
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
    $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()
}

function Execute-Command {
    param($commandType, $commandData, $commandId, $ws, $cts, $gamePath)
    
    $result = @{ success = $false; output = ""; error = "" }
    
    try {
        switch ($commandType) {
            "ping" {
                $result.success = $true
                $result.output = "pong"
            }
            "get_system_info" {
                $cpu = (Get-WmiObject Win32_Processor).LoadPercentage
                $mem = Get-WmiObject Win32_OperatingSystem
                $memUsed = [math]::Round(($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / 1MB, 2)
                $memTotal = [math]::Round($mem.TotalVisibleMemorySize / 1MB, 2)
                $result.success = $true
                $result.output = @{
                    cpu_percent = $cpu
                    memory_used_gb = $memUsed
                    memory_total_gb = $memTotal
                    hostname = $env:COMPUTERNAME
                }
            }
            "check_path" {
                $pathToCheck = if ($commandData.path) { $commandData.path } else { $gamePath }
                $result.success = $true
                $result.output = @{
                    path = $pathToCheck
                    exists = (Test-Path $pathToCheck)
                    is_directory = (Test-Path $pathToCheck -PathType Container)
                }
            }
            "list_directory" {
                $targetPath = if ($commandData.path) { $commandData.path } else { $gamePath }
                if (Test-Path $targetPath) {
                    $items = Get-ChildItem -Path $targetPath | Select-Object Name, Mode, Length, LastWriteTime
                    $result.success = $true
                    $result.output = @{ path = $targetPath; items = $items }
                } else {
                    $result.error = "Path not found: $targetPath"
                }
            }
            "run_script" {
                if ($commandData.script) {
                    $scriptBlock = [ScriptBlock]::Create($commandData.script)
                    $output = & $scriptBlock 2>&1
                    $result.success = $true
                    $result.output = $output | Out-String
                } else {
                    $result.error = "No script provided"
                }
            }
            "start_process" {
                if ($commandData.executable) {
                    $procArgs = @{ FilePath = $commandData.executable; PassThru = $true }
                    if ($commandData.arguments) { $procArgs.ArgumentList = $commandData.arguments }
                    if ($commandData.workingDirectory) { $procArgs.WorkingDirectory = $commandData.workingDirectory }
                    $proc = Start-Process @procArgs
                    $result.success = $true
                    $result.output = @{ pid = $proc.Id; name = $proc.Name }
                } else {
                    $result.error = "No executable specified"
                }
            }
            "stop_process" {
                if ($commandData.processName) {
                    Stop-Process -Name $commandData.processName -Force -ErrorAction SilentlyContinue
                    $result.success = $true
                    $result.output = "Process stopped: $($commandData.processName)"
                } elseif ($commandData.pid) {
                    Stop-Process -Id $commandData.pid -Force -ErrorAction SilentlyContinue
                    $result.success = $true
                    $result.output = "Process stopped: PID $($commandData.pid)"
                } else {
                    $result.error = "No process name or PID specified"
                }
            }
            "get_processes" {
                $filter = if ($commandData.filter) { "*$($commandData.filter)*" } else { "*" }
                $procs = Get-Process | Where-Object { $_.Name -like $filter } | Select-Object Id, Name, CPU, WorkingSet64
                $result.success = $true
                $result.output = $procs
            }
            default {
                $result.error = "Unknown command: $commandType"
            }
        }
    } catch {
        $result.error = $_.Exception.Message
    }
    
    # Send result back
    $response = @{
        type = "command_result"
        commandId = $commandId
        success = $result.success
        result = $result
    } | ConvertTo-Json -Depth 10
    
    Send-Message -ws $ws -message $response -cts $cts
}

$maxRetries = 999999
$retryCount = 0
$retryDelay = 5

while ($retryCount -lt $maxRetries) {
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $uri = [System.Uri]$WebSocketUrl
    $cts = New-Object System.Threading.CancellationTokenSource

    try {
        Write-Host "Connecting to GameServer Panel..."
        $ws.ConnectAsync($uri, $cts.Token).Wait()
        Write-Host "Connected!" -ForegroundColor Green
        $retryCount = 0
        
        $buffer = New-Object byte[] 65536
        $heartbeatTimer = [System.Diagnostics.Stopwatch]::StartNew()
        
        while ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            # Send heartbeat every 30 seconds
            if ($heartbeatTimer.Elapsed.TotalSeconds -gt 30) {
                Send-Message -ws $ws -message '{"type":"heartbeat"}' -cts $cts
                $heartbeatTimer.Restart()
            }
            
            # Check for messages with timeout
            $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
            $receiveTask = $ws.ReceiveAsync($segment, $cts.Token)
            
            if ($receiveTask.Wait(1000)) {
                $result = $receiveTask.Result
                
                if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Text) {
                    $message = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
                    $json = $message | ConvertFrom-Json
                    
                    if ($json.type -eq "execute_command") {
                        Write-Host "Executing command: $($json.commandType)" -ForegroundColor Yellow
                        Execute-Command -commandType $json.commandType -commandData $json.data -commandId $json.commandId -ws $ws -cts $cts -gamePath $GamePath
                    }
                }
            }
        }
    } catch {
        Write-Host "Connection error: $_" -ForegroundColor Red
    } finally {
        if ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "", $cts.Token).Wait()
        }
        $ws.Dispose()
    }
    
    $retryCount++
    Write-Host "Reconnecting in $retryDelay seconds... (Attempt $retryCount)" -ForegroundColor Yellow
    Start-Sleep -Seconds $retryDelay
}
'@

Set-Content -Path "$AgentPath\\Agent.ps1" -Value $AgentScript -Encoding UTF8

# Create wrapper for service
$WrapperScript = @"
\$WebSocketUrl = "${wsUrl}"
\$GamePath = "$GamePath"
& "$AgentPath\\Agent.ps1" -WebSocketUrl \$WebSocketUrl -GamePath \$GamePath
"@

Set-Content -Path "$AgentPath\\AgentWrapper.ps1" -Value $WrapperScript -Encoding UTF8

# Remove existing task if present
Unregister-ScheduledTask -TaskName $ServiceName -Confirm:\$false -ErrorAction SilentlyContinue

# Register as scheduled task (runs at startup)
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File $AgentPath\\AgentWrapper.ps1"
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $ServiceName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null

# Start immediately
Start-ScheduledTask -TaskName $ServiceName

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " GameServer Agent erfolgreich installiert!" -ForegroundColor Green  
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Der Agent verbindet sich jetzt automatisch mit dem Panel."
Write-Host "Game-Installationspfad: $GamePath"
Write-Host ""
Write-Host "Verfuegbare Befehle vom Panel:"
Write-Host "  - System-Info abrufen"
Write-Host "  - Verzeichnisse auflisten"
Write-Host "  - Prozesse starten/stoppen"
Write-Host "  - Scripts ausfuehren"
Write-Host ""
`;
}
