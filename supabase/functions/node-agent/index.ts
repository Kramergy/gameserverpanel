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

    socket.send(JSON.stringify({ type: 'connected', nodeId: node.id, requestSystemInfo: true }));
    
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
        
        // Auto-update host IP if it was set to auto-detect
        if (message.data?.local_ip && (node.host === 'auto-detect' || node.host === '0.0.0.0')) {
          const detectedIp = message.data.public_ip || message.data.local_ip;
          console.log(`Auto-updating host IP for ${node.name}: ${detectedIp}`);
          
          await supabase
            .from('server_nodes')
            .update({ host: detectedIp })
            .eq('id', node.id);
        }
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
    
    // Generate both Windows and Linux scripts
    const windowsScript = generateWindowsInstallScript(node.name, node.game_path, wsUrl);
    const linuxScript = generateLinuxInstallScript(node.name, node.game_path, wsUrl);
    
    // Return appropriate script based on OS type
    const installScript = node.os_type === 'linux' ? linuxScript : windowsScript;

    return new Response(
      JSON.stringify({ 
        success: true,
        agentToken,
        installScript,
        linuxScript,
        windowsScript,
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

function generateWindowsInstallScript(nodeName: string, gamePath: string, wsUrl: string): string {
  return `
# GameServer Panel Agent - Installation Script (Windows)
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
            "install_gameserver" {
                # Game server installation command
                $gameId = $commandData.gameId
                $serverName = $commandData.serverName
                $serverId = $commandData.serverId
                $installPath = "$gamePath\\$gameId-$serverId"
                $installType = $commandData.installType
                $steamAppId = $commandData.steamAppId
                $downloadUrl = $commandData.downloadUrl
                $executable = $commandData.executable
                $port = $commandData.port
                $maxPlayers = $commandData.maxPlayers
                $ram = $commandData.ram
                $startArgs = $commandData.startArgs

                # Send progress update
                function Send-Progress {
                    param($stage, $percent, $message)
                    $progress = @{
                        type = "install_progress"
                        serverId = $serverId
                        stage = $stage
                        percent = $percent
                        message = $message
                    } | ConvertTo-Json -Depth 5
                    Send-Message -ws $ws -message $progress -cts $cts
                }

                try {
                    Send-Progress -stage "init" -percent 5 -message "Installation wird vorbereitet..."
                    
                    # Create install directory
                    New-Item -ItemType Directory -Force -Path $installPath | Out-Null
                    
                    switch ($installType) {
                        "steamcmd" {
                            # Install via SteamCMD
                            $steamCmdPath = "$gamePath\\SteamCMD"
                            
                            # Check if SteamCMD exists, if not download it
                            if (-not (Test-Path "$steamCmdPath\\steamcmd.exe")) {
                                Send-Progress -stage "steamcmd" -percent 10 -message "SteamCMD wird heruntergeladen..."
                                New-Item -ItemType Directory -Force -Path $steamCmdPath | Out-Null
                                $steamZip = "$steamCmdPath\\steamcmd.zip"
                                Invoke-WebRequest -Uri "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip" -OutFile $steamZip
                                Expand-Archive -Path $steamZip -DestinationPath $steamCmdPath -Force
                                Remove-Item $steamZip -Force
                            }
                            
                            Send-Progress -stage "download" -percent 20 -message "Gameserver wird heruntergeladen (Steam App $steamAppId)..."
                            
                            # Run SteamCMD to download game server
                            $steamArgs = '+force_install_dir "' + $installPath + '" +login anonymous +app_update ' + $steamAppId + ' validate +quit'
                            $steamProcess = Start-Process -FilePath "$steamCmdPath\\steamcmd.exe" -ArgumentList $steamArgs -Wait -PassThru -NoNewWindow
                            
                            if ($steamProcess.ExitCode -ne 0 -and $steamProcess.ExitCode -ne 7) {
                                throw "SteamCMD failed with exit code: $($steamProcess.ExitCode)"
                            }
                        }
                        "direct" {
                            # Direct download (e.g., Minecraft Bedrock)
                            Send-Progress -stage "download" -percent 20 -message "Server-Dateien werden heruntergeladen..."
                            
                            $fileName = [System.IO.Path]::GetFileName($downloadUrl)
                            $downloadPath = "$installPath\\$fileName"
                            Invoke-WebRequest -Uri $downloadUrl -OutFile $downloadPath
                            
                            # If it's a zip, extract it
                            if ($fileName -like "*.zip") {
                                Send-Progress -stage "extract" -percent 50 -message "Dateien werden entpackt..."
                                Expand-Archive -Path $downloadPath -DestinationPath $installPath -Force
                                Remove-Item $downloadPath -Force
                            }
                        }
                        "java" {
                            # Java server (Minecraft Java)
                            Send-Progress -stage "download" -percent 20 -message "Server JAR wird heruntergeladen..."
                            
                            # Check if Java is installed
                            $javaPath = (Get-Command java -ErrorAction SilentlyContinue).Path
                            if (-not $javaPath) {
                                Send-Progress -stage "java" -percent 25 -message "Java wird installiert..."
                                # Download and install OpenJDK
                                $jdkUrl = "https://download.java.net/java/GA/jdk21.0.1/415e3f918a1f4062a0074a2794853d0d/12/GPL/openjdk-21.0.1_windows-x64_bin.zip"
                                $jdkZip = "$gamePath\\openjdk.zip"
                                $jdkPath = "$gamePath\\jdk"
                                Invoke-WebRequest -Uri $jdkUrl -OutFile $jdkZip
                                Expand-Archive -Path $jdkZip -DestinationPath $jdkPath -Force
                                Remove-Item $jdkZip -Force
                                $javaPath = Get-ChildItem -Path $jdkPath -Recurse -Filter "java.exe" | Select-Object -First 1 -ExpandProperty FullName
                            }
                            
                            # Download server.jar
                            $jarPath = "$installPath\\server.jar"
                            Invoke-WebRequest -Uri $downloadUrl -OutFile $jarPath
                            
                            # Create eula.txt
                            Set-Content -Path "$installPath\\eula.txt" -Value "eula=true"
                            
                            # Create start script
                            $ramMb = $ram
                            $startScript = "@echo off" + [char]10 + "java -Xmx" + $ramMb + "M -Xms" + $ramMb + "M -jar server.jar nogui"
                            Set-Content -Path "$installPath\\start.bat" -Value $startScript
                        }
                    }
                    
                    Send-Progress -stage "config" -percent 80 -message "Server wird konfiguriert..."
                    
                    # Create server info file
                    $serverInfo = @{
                        gameId = $gameId
                        serverName = $serverName
                        serverId = $serverId
                        port = $port
                        maxPlayers = $maxPlayers
                        ram = $ram
                        executable = $executable
                        startArgs = $startArgs
                        installPath = $installPath
                        installedAt = (Get-Date).ToString("o")
                    } | ConvertTo-Json -Depth 5
                    Set-Content -Path "$installPath\\server_info.json" -Value $serverInfo
                    
                    # Create start script
                    $finalStartArgs = $startArgs -replace "{PORT}", $port -replace "{MAXPLAYERS}", $maxPlayers -replace "{NAME}", $serverName -replace "{RAM}", $ram
                    $startBat = "@echo off" + [char]10 + "cd /d " + [char]34 + $installPath + [char]34 + [char]10 + [char]34 + $installPath + "\\" + $executable + [char]34 + " " + $finalStartArgs
                    Set-Content -Path "$installPath\\start_server.bat" -Value $startBat
                    
                    Send-Progress -stage "complete" -percent 100 -message "Installation abgeschlossen!"
                    
                    $result.success = $true
                    $result.output = @{
                        installPath = $installPath
                        executable = $executable
                        startScript = "$installPath\\start_server.bat"
                    }
                } catch {
                    $result.error = $_.Exception.Message
                    Send-Progress -stage "error" -percent 0 -message "Fehler: $($_.Exception.Message)"
                }
            }
            "start_gameserver" {
                $serverId = $commandData.serverId
                $installPath = $commandData.installPath
                $startScript = "$installPath\\start_server.bat"
                
                if (Test-Path $startScript) {
                    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList ("/c " + [char]34 + $startScript + [char]34) -WorkingDirectory $installPath -PassThru
                    $result.success = $true
                    $result.output = @{ pid = $proc.Id; serverId = $serverId }
                } else {
                    $result.error = "Start script not found: $startScript"
                }
            }
            "stop_gameserver" {
                $executable = $commandData.executable
                Stop-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($executable)) -Force -ErrorAction SilentlyContinue
                $result.success = $true
                $result.output = "Game server stopped"
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
        
        # Send initial system info with IP addresses
        $localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress
        $publicIp = try { (Invoke-RestMethod -Uri 'https://api.ipify.org?format=json' -TimeoutSec 5).ip } catch { $null }
        $sysInfo = @{
            type = "system_info"
            data = @{
                hostname = $env:COMPUTERNAME
                local_ip = $localIp
                public_ip = $publicIp
                os = (Get-WmiObject Win32_OperatingSystem).Caption
                game_path = $GamePath
            }
        } | ConvertTo-Json -Depth 5
        Send-Message -ws $ws -message $sysInfo -cts $cts
        
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

function generateLinuxInstallScript(nodeName: string, gamePath: string, wsUrl: string): string {
  return `#!/bin/bash
# GameServer Panel Agent - Installation Script (Linux)
# Node: ${nodeName}

set -e

AGENT_PATH="/opt/gameserver-agent"
GAME_PATH="${gamePath}"
WS_URL="${wsUrl}"

echo -e "\\e[36mInstalling GameServer Agent...\\e[0m"

# Check if running as root
if [ "\\$EUID" -ne 0 ]; then
    echo -e "\\e[31mBitte als root ausfuehren: sudo bash install.sh\\e[0m"
    exit 1
fi

# Create directories
mkdir -p "\\$AGENT_PATH"
mkdir -p "\\$GAME_PATH"

# Install dependencies
echo "Installing dependencies..."
if command -v apt-get &> /dev/null; then
    apt-get update -qq
    apt-get install -y -qq curl wget jq unzip lib32gcc-s1 2>/dev/null || apt-get install -y -qq curl wget jq unzip lib32gcc1 2>/dev/null || true
elif command -v yum &> /dev/null; then
    yum install -y curl wget jq unzip glibc.i686 libstdc++.i686 2>/dev/null || true
elif command -v dnf &> /dev/null; then
    dnf install -y curl wget jq unzip glibc.i686 libstdc++.i686 2>/dev/null || true
fi

# Install websocat
if ! command -v websocat &> /dev/null; then
    echo "Installing websocat..."
    curl -sSL https://github.com/vi/websocat/releases/download/v1.13.0/websocat.x86_64-unknown-linux-musl -o /usr/local/bin/websocat
    chmod +x /usr/local/bin/websocat
fi

# Create the agent script
cat > "\\$AGENT_PATH/agent.sh" << 'AGENTEOF'
#!/bin/bash

GAME_PATH="\\$1"
WS_URL="\\$2"
LOG_FILE="/var/log/gameserver-agent.log"

log() {
    echo "[\\$(date '+%Y-%m-%d %H:%M:%S')] \\$1" | tee -a "\\$LOG_FILE"
}

execute_command() {
    local cmd_type="\\$1"
    local cmd_data="\\$2"
    local cmd_id="\\$3"
    
    local success="false"
    local error=""
    local output=""
    
    case "\\$cmd_type" in
        "ping")
            success="true"
            output="pong"
            ;;
        "get_system_info")
            local cpu=\\$(top -bn1 | grep "Cpu(s)" | awk '{print \\$2}' | cut -d'%' -f1 2>/dev/null || echo "0")
            local mem_total=\\$(free -g 2>/dev/null | awk '/^Mem:/{print \\$2}' || echo "0")
            local mem_used=\\$(free -g 2>/dev/null | awk '/^Mem:/{print \\$3}' || echo "0")
            success="true"
            output="{\\"cpu_percent\\": \\$cpu, \\"memory_used_gb\\": \\$mem_used, \\"memory_total_gb\\": \\$mem_total, \\"hostname\\": \\"\\$(hostname)\\"}"
            ;;
        "check_path")
            local path_check=\\$(echo "\\$cmd_data" | jq -r '.path // "'"\\$GAME_PATH"'"')
            if [ -e "\\$path_check" ]; then
                if [ -d "\\$path_check" ]; then
                    output='{"exists": true, "is_directory": true}'
                else
                    output='{"exists": true, "is_directory": false}'
                fi
            else
                output='{"exists": false, "is_directory": false}'
            fi
            success="true"
            ;;
        "list_directory")
            local target_path=\\$(echo "\\$cmd_data" | jq -r '.path // "'"\\$GAME_PATH"'"')
            if [ -d "\\$target_path" ]; then
                output=\\$(ls -la "\\$target_path" 2>&1 | jq -Rs '.')
                success="true"
            else
                error="Path not found: \\$target_path"
            fi
            ;;
        "run_script")
            local script=\\$(echo "\\$cmd_data" | jq -r '.script')
            if [ -n "\\$script" ]; then
                output=\\$(bash -c "\\$script" 2>&1 | jq -Rs '.')
                success="true"
            else
                error="No script provided"
            fi
            ;;
        "install_gameserver")
            local game_id=\\$(echo "\\$cmd_data" | jq -r '.gameId')
            local server_name=\\$(echo "\\$cmd_data" | jq -r '.serverName')
            local server_id=\\$(echo "\\$cmd_data" | jq -r '.serverId')
            local install_path="\\$GAME_PATH/\\$game_id-\\$server_id"
            local install_type=\\$(echo "\\$cmd_data" | jq -r '.installType')
            local steam_app_id=\\$(echo "\\$cmd_data" | jq -r '.steamAppId // empty')
            local download_url=\\$(echo "\\$cmd_data" | jq -r '.downloadUrl // empty')
            local executable=\\$(echo "\\$cmd_data" | jq -r '.executable')
            local port=\\$(echo "\\$cmd_data" | jq -r '.port')
            local max_players=\\$(echo "\\$cmd_data" | jq -r '.maxPlayers')
            local ram=\\$(echo "\\$cmd_data" | jq -r '.ram')
            local start_args=\\$(echo "\\$cmd_data" | jq -r '.startArgs // empty')
            
            log "Installing \\$game_id to \\$install_path"
            
            # Send progress via stdout (will be piped to websocket)
            send_progress() {
                echo '{"type":"install_progress","serverId":"'\\$server_id'","stage":"'\\$1'","percent":'\\$2',"message":"'\\$3'"}'
            }
            
            send_progress "init" 5 "Installation wird vorbereitet..."
            
            # Create install directory
            mkdir -p "\\$install_path"
            
            case "\\$install_type" in
                "steamcmd")
                    STEAMCMD_PATH="\\$GAME_PATH/steamcmd"
                    
                    # Install SteamCMD if not exists
                    if [ ! -f "\\$STEAMCMD_PATH/steamcmd.sh" ]; then
                        send_progress "steamcmd" 10 "SteamCMD wird installiert..."
                        mkdir -p "\\$STEAMCMD_PATH"
                        cd "\\$STEAMCMD_PATH"
                        curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf -
                    fi
                    
                    send_progress "download" 20 "Gameserver wird heruntergeladen (Steam App \\$steam_app_id)..."
                    
                    # Run SteamCMD
                    "\\$STEAMCMD_PATH/steamcmd.sh" +force_install_dir "\\$install_path" +login anonymous +app_update "\\$steam_app_id" validate +quit || true
                    
                    send_progress "config" 80 "Server wird konfiguriert..."
                    ;;
                "direct")
                    send_progress "download" 20 "Server-Dateien werden heruntergeladen..."
                    
                    local filename=\\$(basename "\\$download_url")
                    wget -q -O "\\$install_path/\\$filename" "\\$download_url"
                    
                    # Extract if zip
                    if [[ "\\$filename" == *.zip ]]; then
                        send_progress "extract" 50 "Dateien werden entpackt..."
                        unzip -q -o "\\$install_path/\\$filename" -d "\\$install_path"
                        rm "\\$install_path/\\$filename"
                    fi
                    
                    send_progress "config" 80 "Server wird konfiguriert..."
                    ;;
                "java")
                    send_progress "download" 20 "Server JAR wird heruntergeladen..."
                    
                    # Check for Java
                    if ! command -v java &> /dev/null; then
                        send_progress "java" 25 "Java wird installiert..."
                        if command -v apt-get &> /dev/null; then
                            apt-get install -y openjdk-21-jre-headless 2>/dev/null || apt-get install -y openjdk-17-jre-headless 2>/dev/null || apt-get install -y default-jre 2>/dev/null || true
                        elif command -v yum &> /dev/null; then
                            yum install -y java-21-openjdk 2>/dev/null || yum install -y java-17-openjdk 2>/dev/null || true
                        fi
                    fi
                    
                    # Download server.jar
                    wget -q -O "\\$install_path/server.jar" "\\$download_url"
                    
                    # Create eula.txt
                    echo "eula=true" > "\\$install_path/eula.txt"
                    
                    send_progress "config" 80 "Server wird konfiguriert..."
                    ;;
            esac
            
            # Create server_info.json
            cat > "\\$install_path/server_info.json" << SRVINFO
{
    "gameId": "\\$game_id",
    "serverName": "\\$server_name",
    "serverId": "\\$server_id",
    "port": \\$port,
    "maxPlayers": \\$max_players,
    "ram": \\$ram,
    "executable": "\\$executable",
    "startArgs": "\\$start_args",
    "installPath": "\\$install_path",
    "installedAt": "\\$(date -Iseconds)"
}
SRVINFO
            
            # Create start script
            local final_args=\\$(echo "\\$start_args" | sed "s/{PORT}/\\$port/g" | sed "s/{MAXPLAYERS}/\\$max_players/g" | sed "s/{NAME}/\\$server_name/g" | sed "s/{RAM}/\\$ram/g")
            
            cat > "\\$install_path/start_server.sh" << STARTSCRIPT
#!/bin/bash
cd "\\$install_path"
./\\$executable \\$final_args
STARTSCRIPT
            chmod +x "\\$install_path/start_server.sh"
            
            # Make executable runnable
            if [ -f "\\$install_path/\\$executable" ]; then
                chmod +x "\\$install_path/\\$executable"
            fi
            
            send_progress "complete" 100 "Installation abgeschlossen!"
            
            success="true"
            output='{"installPath":"'\\$install_path'","executable":"'\\$executable'","startScript":"'\\$install_path'/start_server.sh"}'
            ;;
        "start_gameserver")
            local server_id=\\$(echo "\\$cmd_data" | jq -r '.serverId')
            local install_path=\\$(echo "\\$cmd_data" | jq -r '.installPath')
            
            if [ -f "\\$install_path/start_server.sh" ]; then
                cd "\\$install_path"
                nohup ./start_server.sh > "\\$install_path/server.log" 2>&1 &
                local pid=\\$!
                success="true"
                output='{"pid":'\\$pid',"serverId":"'\\$server_id'"}'
            else
                error="Start script not found: \\$install_path/start_server.sh"
            fi
            ;;
        "stop_gameserver")
            local executable=\\$(echo "\\$cmd_data" | jq -r '.executable')
            local exe_name=\\$(basename "\\$executable" | sed 's/\\\\.[^.]*\\$//')
            pkill -f "\\$exe_name" 2>/dev/null || true
            success="true"
            output='"Game server stopped"'
            ;;
        *)
            error="Unknown command: \\$cmd_type"
            ;;
    esac
    
    # Return result
    if [ "\\$success" = "true" ]; then
        echo '{"type":"command_result","commandId":"'\\$cmd_id'","success":true,"result":{"success":true,"output":'\\$output'}}'
    else
        echo '{"type":"command_result","commandId":"'\\$cmd_id'","success":false,"result":{"success":false,"error":"'\\$error'"}}'
    fi
}

# Main loop
main() {
    log "Starting GameServer Agent..."
    
    while true; do
        log "Connecting to GameServer Panel..."
        
        # Get system info
        local_ip=\\$(hostname -I 2>/dev/null | awk '{print \\$1}' || echo "")
        public_ip=\\$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo "")
        hostname_val=\\$(hostname)
        
        # Create a temp file for bidirectional communication
        FIFO_IN="/tmp/agent_in_\\$\\$"
        FIFO_OUT="/tmp/agent_out_\\$\\$"
        mkfifo "\\$FIFO_IN" "\\$FIFO_OUT" 2>/dev/null || true
        
        # Connect via websocat
        (
            # Send system info first
            echo '{"type":"system_info","data":{"hostname":"'\\$hostname_val'","local_ip":"'\\$local_ip'","public_ip":"'\\$public_ip'","os":"Linux","game_path":"'"\\$GAME_PATH"'"}}'
            
            # Heartbeat sender
            while true; do
                sleep 30
                echo '{"type":"heartbeat"}'
            done &
            HEARTBEAT_PID=\\$!
            
            # Read commands from websocket and execute
            cat "\\$FIFO_OUT"
            
            kill \\$HEARTBEAT_PID 2>/dev/null
        ) | websocat -t "\\$WS_URL" 2>&1 | while read -r line; do
            log "Received: \\$line"
            if echo "\\$line" | jq -e '.type == "execute_command"' > /dev/null 2>&1; then
                cmd_type=\\$(echo "\\$line" | jq -r '.commandType')
                cmd_data=\\$(echo "\\$line" | jq -c '.data')
                cmd_id=\\$(echo "\\$line" | jq -r '.commandId')
                
                log "Executing command: \\$cmd_type (ID: \\$cmd_id)"
                result=\\$(execute_command "\\$cmd_type" "\\$cmd_data" "\\$cmd_id")
                log "Result: \\$result"
                echo "\\$result"
            fi
        done | websocat -t "\\$WS_URL" 2>/dev/null &
        
        # Wait a bit then check if still running
        sleep 60
        
        log "Connection lost. Reconnecting in 5 seconds..."
        sleep 5
    done
}

main "\\$@"
AGENTEOF

chmod +x "\\$AGENT_PATH/agent.sh"

# Create systemd service
cat > /etc/systemd/system/gameserver-agent.service << EOF
[Unit]
Description=GameServer Panel Agent
After=network.target

[Service]
Type=simple
ExecStart=\\$AGENT_PATH/agent.sh "\\$GAME_PATH" "\\$WS_URL"
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
systemctl daemon-reload
systemctl enable gameserver-agent
systemctl start gameserver-agent

echo ""
echo -e "\\e[32m========================================\\e[0m"
echo -e "\\e[32m GameServer Agent erfolgreich installiert!\\e[0m"
echo -e "\\e[32m========================================\\e[0m"
echo ""
echo "Der Agent verbindet sich jetzt automatisch mit dem Panel."
echo "Game-Installationspfad: \\$GAME_PATH"
echo ""
echo "Status pruefen: systemctl status gameserver-agent"
echo "Logs anzeigen: journalctl -u gameserver-agent -f"
echo ""
`;
}
