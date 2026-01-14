import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // Route based on path
  if (path.endsWith('/send-command')) {
    return handleSendCommand(req);
  }
  
  if (path.endsWith('/poll-commands')) {
    return handlePollCommands(req);
  }
  
  if (path.endsWith('/command-result')) {
    return handleCommandResult(req);
  }
  
  if (path.endsWith('/heartbeat')) {
    return handleHeartbeat(req);
  }

  if (req.method === 'POST') {
    return handleAgentRegistration(req);
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});

// Agent polls for pending commands
async function handlePollCommands(req: Request): Promise<Response> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get agent token from header
    const agentToken = req.headers.get('x-agent-token');
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Agent token required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify agent token
    const { data: node, error: nodeError } = await supabase
      .from('server_nodes')
      .select('*')
      .eq('agent_token', agentToken)
      .single();

    if (nodeError || !node) {
      return new Response(
        JSON.stringify({ error: 'Invalid agent token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last check and status
    await supabase
      .from('server_nodes')
      .update({ 
        status: 'online',
        last_check: new Date().toISOString()
      })
      .eq('id', node.id);

    // Get pending commands
    const { data: commands, error: cmdError } = await supabase
      .from('node_commands')
      .select('*')
      .eq('node_id', node.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (cmdError) {
      console.error('Error fetching commands:', cmdError);
      return new Response(
        JSON.stringify({ error: 'Error fetching commands' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark commands as sent
    if (commands && commands.length > 0) {
      const commandIds = commands.map(c => c.id);
      await supabase
        .from('node_commands')
        .update({ status: 'sent' })
        .in('id', commandIds);

      console.log(`Sending ${commands.length} commands to node ${node.name}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        commands: commands || [],
        gamePath: node.game_path
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in poll-commands:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Agent sends command result
async function handleCommandResult(req: Request): Promise<Response> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get agent token from header
    const agentToken = req.headers.get('x-agent-token');
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Agent token required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify agent token
    const { data: node, error: nodeError } = await supabase
      .from('server_nodes')
      .select('id')
      .eq('agent_token', agentToken)
      .single();

    if (nodeError || !node) {
      return new Response(
        JSON.stringify({ error: 'Invalid agent token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { commandId, success, result } = body;

    if (!commandId) {
      return new Response(
        JSON.stringify({ error: 'Command ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update command status
    const { error: updateError } = await supabase
      .from('node_commands')
      .update({ 
        status: success ? 'completed' : 'failed',
        result: result,
        executed_at: new Date().toISOString()
      })
      .eq('id', commandId)
      .eq('node_id', node.id);

    if (updateError) {
      console.error('Error updating command:', updateError);
    }

    // If this was a gameserver install, update the server instance
    if (result?.output?.installPath) {
      const { data: command } = await supabase
        .from('node_commands')
        .select('command_data')
        .eq('id', commandId)
        .single();

      if (command?.command_data?.serverId) {
        await supabase
          .from('server_instances')
          .update({ 
            status: success ? 'installed' : 'error',
            install_path: result.output.installPath
          })
          .eq('id', command.command_data.serverId);
      }
    }

    console.log(`Command ${commandId} result: ${success ? 'success' : 'failed'}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in command-result:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Agent sends heartbeat
async function handleHeartbeat(req: Request): Promise<Response> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const agentToken = req.headers.get('x-agent-token');
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Agent token required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: node, error: nodeError } = await supabase
      .from('server_nodes')
      .select('id, name')
      .eq('agent_token', agentToken)
      .single();

    if (nodeError || !node) {
      return new Response(
        JSON.stringify({ error: 'Invalid agent token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabase
      .from('server_nodes')
      .update({ 
        status: 'online',
        last_check: new Date().toISOString()
      })
      .eq('id', node.id);

    return new Response(
      JSON.stringify({ success: true, nodeName: node.name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in heartbeat:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

    console.log(`Command ${command.id} (${commandType}) created for node ${node.name}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        command,
        message: 'Befehl erstellt. Wird beim nächsten Poll gesendet.'
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

    // API URL for polling
    const apiUrl = `${supabaseUrl}/functions/v1/node-agent`;
    
    // Generate both Windows and Linux scripts
    const windowsScript = generateWindowsInstallScript(node.name, node.game_path, apiUrl, agentToken);
    const linuxScript = generateLinuxInstallScript(node.name, node.game_path, apiUrl, agentToken);
    
    // Return appropriate script based on OS type
    const installScript = node.os_type === 'linux' ? linuxScript : windowsScript;

    return new Response(
      JSON.stringify({ 
        success: true,
        agentToken,
        installScript,
        linuxScript,
        windowsScript,
        apiUrl
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

function generateWindowsInstallScript(nodeName: string, gamePath: string, apiUrl: string, agentToken: string): string {
  return `
# GameServer Panel Agent - Installation Script (Windows)
# Node: ${nodeName}

$AgentPath = "$env:ProgramData\\GameServerAgent"
$ServiceName = "GameServerAgent"
$GamePath = "${gamePath}"
$ApiUrl = "${apiUrl}"
$AgentToken = "${agentToken}"

Write-Host "Installing GameServer Agent..." -ForegroundColor Cyan

# Create directory
New-Item -ItemType Directory -Force -Path $AgentPath | Out-Null
New-Item -ItemType Directory -Force -Path $GamePath | Out-Null

# Create agent script with HTTP polling
$AgentScript = @'
param([string]$ApiUrl, [string]$AgentToken, [string]$GamePath)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

function Log {
    param($Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message"
    Add-Content -Path "$env:ProgramData\\GameServerAgent\\agent.log" -Value "[$timestamp] $Message" -ErrorAction SilentlyContinue
}

function Send-Result {
    param($CommandId, $Success, $Result)
    try {
        $body = @{
            commandId = $CommandId
            success = $Success
            result = $Result
        } | ConvertTo-Json -Depth 10
        
        Invoke-RestMethod -Uri "$ApiUrl/command-result" -Method POST -Body $body -ContentType "application/json" -Headers @{"x-agent-token" = $AgentToken} -TimeoutSec 30
    } catch {
        Log "Error sending result: $_"
    }
}

function Execute-Command {
    param($Command)
    
    $commandType = $Command.command_type
    $commandData = $Command.command_data
    $commandId = $Command.id
    
    Log "Executing command: $commandType (ID: $commandId)"
    
    $result = @{ success = $false; output = $null; error = "" }
    
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
            "install_gameserver" {
                $gameId = $commandData.gameId
                $serverName = $commandData.serverName
                $serverId = $commandData.serverId
                $installPath = Join-Path $GamePath "$gameId-$serverId"
                $installType = $commandData.installType
                $steamAppId = $commandData.steamAppId
                $downloadUrl = $commandData.downloadUrl
                $executable = $commandData.executable
                $port = $commandData.port
                $maxPlayers = $commandData.maxPlayers
                $ram = $commandData.ram
                $startArgs = $commandData.startArgs
                
                Log "Installing $gameId to $installPath"
                
                New-Item -ItemType Directory -Force -Path $installPath | Out-Null
                
                switch ($installType) {
                    "steamcmd" {
                        Log "Installing via SteamCMD (AppID: $steamAppId)"
                        $steamCmdPath = Join-Path $GamePath "steamcmd"
                        
                        if (-not (Test-Path "$steamCmdPath\\steamcmd.exe")) {
                            Log "Downloading SteamCMD..."
                            New-Item -ItemType Directory -Force -Path $steamCmdPath | Out-Null
                            $steamZip = Join-Path $env:TEMP "steamcmd.zip"
                            Invoke-WebRequest -Uri "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip" -OutFile $steamZip
                            Expand-Archive -Path $steamZip -DestinationPath $steamCmdPath -Force
                            Remove-Item $steamZip -Force
                        }
                        
                        Log "Running SteamCMD..."
                        $steamArgs = '+force_install_dir "' + $installPath + '" +login anonymous +app_update ' + $steamAppId + ' validate +quit'
                        Start-Process -FilePath "$steamCmdPath\\steamcmd.exe" -ArgumentList $steamArgs -Wait -NoNewWindow
                    }
                    "direct" {
                        Log "Downloading from $downloadUrl"
                        $fileName = [System.IO.Path]::GetFileName($downloadUrl)
                        $dlPath = Join-Path $installPath $fileName
                        Invoke-WebRequest -Uri $downloadUrl -OutFile $dlPath
                        
                        if ($fileName -match '\\.zip$') {
                            Expand-Archive -Path $dlPath -DestinationPath $installPath -Force
                            Remove-Item $dlPath -Force
                        }
                    }
                    "java" {
                        Log "Downloading Java server..."
                        $jarPath = Join-Path $installPath "server.jar"
                        Invoke-WebRequest -Uri $downloadUrl -OutFile $jarPath
                        Set-Content -Path (Join-Path $installPath "eula.txt") -Value "eula=true"
                    }
                }
                
                # Create server info
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
                Set-Content -Path (Join-Path $installPath "server_info.json") -Value $serverInfo
                
                # Create start script
                $finalArgs = $startArgs -replace "{PORT}", $port -replace "{MAXPLAYERS}", $maxPlayers -replace "{NAME}", $serverName -replace "{RAM}", $ram
                $startBat = "@echo off" + [char]13 + [char]10 + "cd /d " + [char]34 + $installPath + [char]34 + [char]13 + [char]10 + [char]34 + $installPath + "\\" + $executable + [char]34 + " " + $finalArgs
                Set-Content -Path (Join-Path $installPath "start_server.bat") -Value $startBat
                
                Log "Installation complete!"
                $result.success = $true
                $result.output = @{
                    installPath = $installPath
                    executable = $executable
                    startScript = "$installPath\\start_server.bat"
                }
            }
            "start_gameserver" {
                $installPath = $commandData.installPath
                $startScript = Join-Path $installPath "start_server.bat"
                
                if (Test-Path $startScript) {
                    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList ("/c " + [char]34 + $startScript + [char]34) -WorkingDirectory $installPath -PassThru
                    $result.success = $true
                    $result.output = @{ pid = $proc.Id; serverId = $commandData.serverId }
                } else {
                    $result.error = "Start script not found: $startScript"
                }
            }
            "stop_gameserver" {
                $executable = $commandData.executable
                $exeName = [System.IO.Path]::GetFileNameWithoutExtension($executable)
                Stop-Process -Name $exeName -Force -ErrorAction SilentlyContinue
                $result.success = $true
                $result.output = "Game server stopped"
            }
            default {
                $result.error = "Unknown command: $commandType"
            }
        }
    } catch {
        $result.error = $_.Exception.Message
        Log "Error executing command: $($_.Exception.Message)"
    }
    
    Send-Result -CommandId $commandId -Success $result.success -Result $result
}

Log "GameServer Agent starting..."
Log "API URL: $ApiUrl"
Log "Game Path: $GamePath"

while ($true) {
    try {
        $response = Invoke-RestMethod -Uri "$ApiUrl/poll-commands" -Method GET -Headers @{"x-agent-token" = $AgentToken} -TimeoutSec 30
        
        if ($response.commands -and $response.commands.Count -gt 0) {
            foreach ($cmd in $response.commands) {
                Execute-Command -Command $cmd
            }
        }
    } catch {
        Log "Poll error: $_"
    }
    
    Start-Sleep -Seconds 5
}
'@

Set-Content -Path "$AgentPath\\Agent.ps1" -Value $AgentScript -Encoding UTF8

# Create wrapper for service
$WrapperContent = '$ApiUrl = "' + $ApiUrl + '"' + [char]13 + [char]10
$WrapperContent += '$AgentToken = "' + $AgentToken + '"' + [char]13 + [char]10
$WrapperContent += '$GamePath = "' + $GamePath + '"' + [char]13 + [char]10
$WrapperContent += '& "' + $AgentPath + '\\Agent.ps1" -ApiUrl $ApiUrl -AgentToken $AgentToken -GamePath $GamePath'

Set-Content -Path "$AgentPath\\AgentWrapper.ps1" -Value $WrapperContent -Encoding UTF8

# Remove existing task if present
Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false -ErrorAction SilentlyContinue

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
`;
}

function generateLinuxInstallScript(nodeName: string, gamePath: string, apiUrl: string, agentToken: string): string {
  // The agent script content - will be written to file via heredoc
  // Using 'AGENTEOF' (quoted) means NO variable substitution, so we use literal $
  const agentScript = `#!/bin/bash

API_URL="$1"
AGENT_TOKEN="$2"
GAME_PATH="$3"
LOG_FILE="/var/log/gameserver-agent.log"

log() {
    echo "[\$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

send_result() {
    local cmd_id="$1"
    local success="$2"
    local result="$3"
    
    curl -s -X POST "$API_URL/command-result" \\
        -H "Content-Type: application/json" \\
        -H "x-agent-token: $AGENT_TOKEN" \\
        -d "{\\"commandId\\":\\"$cmd_id\\",\\"success\\":$success,\\"result\\":$result}" \\
        --max-time 30 || log "Failed to send result for $cmd_id"
}

execute_command() {
    local cmd_type="$1"
    local cmd_data="$2"
    local cmd_id="$3"
    
    log "Executing command: $cmd_type (ID: $cmd_id)"
    
    local success="false"
    local result="{}"
    
    case "$cmd_type" in
        "ping")
            success="true"
            result='{"success":true,"output":"pong"}'
            ;;
        "get_system_info")
            local cpu=\$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 2>/dev/null || echo "0")
            local mem_total=\$(free -g 2>/dev/null | awk '/^Mem:/{print $2}' || echo "0")
            local mem_used=\$(free -g 2>/dev/null | awk '/^Mem:/{print $3}' || echo "0")
            success="true"
            result="{\\"success\\":true,\\"output\\":{\\"cpu_percent\\":$cpu,\\"memory_used_gb\\":$mem_used,\\"memory_total_gb\\":$mem_total,\\"hostname\\":\\"\$(hostname)\\"}}"
            ;;
        "install_gameserver")
            local game_id=\$(echo "$cmd_data" | jq -r '.gameId')
            local server_name=\$(echo "$cmd_data" | jq -r '.serverName')
            local server_id=\$(echo "$cmd_data" | jq -r '.serverId')
            local install_path="$GAME_PATH/$game_id-$server_id"
            local install_type=\$(echo "$cmd_data" | jq -r '.installType')
            local steam_app_id=\$(echo "$cmd_data" | jq -r '.steamAppId // empty')
            local download_url=\$(echo "$cmd_data" | jq -r '.downloadUrl // empty')
            local executable=\$(echo "$cmd_data" | jq -r '.executable')
            local port=\$(echo "$cmd_data" | jq -r '.port')
            local max_players=\$(echo "$cmd_data" | jq -r '.maxPlayers')
            local ram=\$(echo "$cmd_data" | jq -r '.ram')
            local start_args=\$(echo "$cmd_data" | jq -r '.startArgs // empty')
            
            log "Installing $game_id to $install_path"
            mkdir -p "$install_path"
            
            case "$install_type" in
                "steamcmd")
                    log "Installing via SteamCMD (AppID: $steam_app_id)"
                    
                    if [ ! -f "$GAME_PATH/steamcmd/steamcmd.sh" ]; then
                        log "Installing SteamCMD..."
                        mkdir -p "$GAME_PATH/steamcmd"
                        cd "$GAME_PATH/steamcmd"
                        wget -q "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz"
                        tar -xzf steamcmd_linux.tar.gz
                        rm -f steamcmd_linux.tar.gz
                    fi
                    
                    log "Running SteamCMD..."
                    cd "$GAME_PATH/steamcmd"
                    ./steamcmd.sh +force_install_dir "$install_path" +login anonymous +app_update $steam_app_id validate +quit
                    ;;
                "direct")
                    log "Downloading from $download_url"
                    local filename=\$(basename "$download_url")
                    wget -q -O "$install_path/$filename" "$download_url"
                    
                    if [[ "$filename" == *.zip ]]; then
                        cd "$install_path"
                        unzip -q "$filename"
                        rm -f "$filename"
                    fi
                    ;;
                "java")
                    log "Downloading Java server..."
                    wget -q -O "$install_path/server.jar" "$download_url"
                    echo "eula=true" > "$install_path/eula.txt"
                    ;;
            esac
            
            cat > "$install_path/server_info.json" << SRVINFO
{
    "gameId": "$game_id",
    "serverName": "$server_name",
    "serverId": "$server_id",
    "port": $port,
    "maxPlayers": $max_players,
    "ram": $ram,
    "executable": "$executable",
    "startArgs": "$start_args",
    "installPath": "$install_path",
    "installedAt": "\$(date -Iseconds)"
}
SRVINFO
            
            local final_args=\$(echo "$start_args" | sed "s/{PORT}/$port/g" | sed "s/{MAXPLAYERS}/$max_players/g" | sed "s/{NAME}/$server_name/g" | sed "s/{RAM}/$ram/g")
            
            cat > "$install_path/start_server.sh" << STARTSCRIPT
#!/bin/bash
cd "$install_path"
./$executable $final_args
STARTSCRIPT
            chmod +x "$install_path/start_server.sh"
            
            if [ -f "$install_path/$executable" ]; then
                chmod +x "$install_path/$executable"
            fi
            
            log "Installation complete!"
            success="true"
            result="{\\"success\\":true,\\"output\\":{\\"installPath\\":\\"$install_path\\",\\"executable\\":\\"$executable\\",\\"startScript\\":\\"$install_path/start_server.sh\\"}}"
            ;;
        "start_gameserver")
            local install_path=\$(echo "$cmd_data" | jq -r '.installPath')
            local server_id=\$(echo "$cmd_data" | jq -r '.serverId')
            
            if [ -f "$install_path/start_server.sh" ]; then
                cd "$install_path"
                nohup ./start_server.sh > "$install_path/server.log" 2>&1 &
                local pid=$!
                success="true"
                result="{\\"success\\":true,\\"output\\":{\\"pid\\":$pid,\\"serverId\\":\\"$server_id\\"}}"
            else
                result="{\\"success\\":false,\\"error\\":\\"Start script not found\\"}"
            fi
            ;;
        "stop_gameserver")
            local executable=\$(echo "$cmd_data" | jq -r '.executable')
            local exe_name=\$(basename "$executable" | sed 's/\\.[^.]*$//')
            pkill -f "$exe_name" 2>/dev/null || true
            success="true"
            result="{\\"success\\":true,\\"output\\":\\"Game server stopped\\"}"
            ;;
        *)
            result="{\\"success\\":false,\\"error\\":\\"Unknown command: $cmd_type\\"}"
            ;;
    esac
    
    send_result "$cmd_id" "$success" "$result"
}

log "GameServer Agent starting..."
log "API URL: $API_URL"
log "Game Path: $GAME_PATH"

while true; do
    response=\$(curl -s -X GET "$API_URL/poll-commands" \\
        -H "x-agent-token: $AGENT_TOKEN" \\
        --max-time 30 2>/dev/null)
    
    if [ -n "$response" ]; then
        commands=\$(echo "$response" | jq -c '.commands[]?' 2>/dev/null)
        
        if [ -n "$commands" ]; then
            echo "$commands" | while read -r cmd; do
                if [ -n "$cmd" ]; then
                    cmd_type=\$(echo "$cmd" | jq -r '.command_type')
                    cmd_data=\$(echo "$cmd" | jq -c '.command_data')
                    cmd_id=\$(echo "$cmd" | jq -r '.id')
                    
                    execute_command "$cmd_type" "$cmd_data" "$cmd_id"
                fi
            done
        fi
    fi
    
    sleep 5
done`;

  return `#!/bin/bash
# GameServer Panel Agent - Installation Script (Linux)
# Node: ${nodeName}

set -e

AGENT_PATH="/opt/gameserver-agent"
GAME_PATH="${gamePath}"
API_URL="${apiUrl}"
AGENT_TOKEN="${agentToken}"

echo -e "\\e[36mInstalling GameServer Agent...\\e[0m"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "\\e[31mBitte als root ausfuehren: sudo bash install.sh\\e[0m"
    exit 1
fi

# Create directories
mkdir -p "$AGENT_PATH"
mkdir -p "$GAME_PATH"

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

# Create the agent script
cat > "$AGENT_PATH/agent.sh" << 'AGENTEOF'
${agentScript}
AGENTEOF

chmod +x "$AGENT_PATH/agent.sh"

# Create systemd service
cat > /etc/systemd/system/gameserver-agent.service << SERVICEEOF
[Unit]
Description=GameServer Panel Agent
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/opt/gameserver-agent/agent.sh "${apiUrl}" "${agentToken}" "${gamePath}"
Restart=always
RestartSec=5
User=root
StandardOutput=journal
StandardError=journal
Environment="PATH=/usr/local/bin:/usr/bin:/bin"

[Install]
WantedBy=multi-user.target
SERVICEEOF

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
echo "Game-Installationspfad: $GAME_PATH"
echo ""
echo "Status pruefen: systemctl status gameserver-agent"
echo "Logs anzeigen: journalctl -u gameserver-agent -f"
echo ""
`;
}
