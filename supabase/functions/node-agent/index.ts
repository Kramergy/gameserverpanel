import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  // Handle HTTP requests for agent registration
  if (req.method === 'POST') {
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
      }

      if (message.type === 'path_check_result') {
        // Handle path check result from agent
        socket.send(JSON.stringify({ 
          type: 'path_check_ack',
          exists: message.exists,
          path: message.path
        }));
      }

      if (message.type === 'system_info') {
        // Agent sends system info periodically
        console.log(`System info from ${node.name}:`, message.data);
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  };

  socket.onclose = async () => {
    console.log(`Agent disconnected: ${node.name}`);
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
    
    const installScript = `
# GameServer Panel Agent - Installation Script
# Node: ${node.name}

$AgentPath = "$env:ProgramData\\GameServerAgent"
$ServiceName = "GameServerAgent"

# Create directory
New-Item -ItemType Directory -Force -Path $AgentPath | Out-Null

# Create agent script
$AgentScript = @'
param([string]$WebSocketUrl)

Add-Type -AssemblyName System.Net.WebSockets

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$uri = [System.Uri]$WebSocketUrl
$cts = New-Object System.Threading.CancellationTokenSource

try {
    $ws.ConnectAsync($uri, $cts.Token).Wait()
    Write-Host "Connected to GameServer Panel"
    
    # Start heartbeat
    $heartbeatJob = Start-Job -ScriptBlock {
        param($wsUrl)
        while ($true) {
            Start-Sleep -Seconds 30
        }
    } -ArgumentList $WebSocketUrl
    
    # Receive loop
    $buffer = New-Object byte[] 4096
    while ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
        $result = $ws.ReceiveAsync($segment, $cts.Token).Result
        
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Text) {
            $message = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
            $json = $message | ConvertFrom-Json
            
            # Send heartbeat response
            if ($json.type -eq "connected") {
                $response = '{"type":"heartbeat"}' 
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($response)
                $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
                $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()
            }
        }
        
        Start-Sleep -Milliseconds 100
    }
} catch {
    Write-Host "Error: $_"
} finally {
    if ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "", $cts.Token).Wait()
    }
}
'@

Set-Content -Path "$AgentPath\\Agent.ps1" -Value $AgentScript

# Create wrapper for service
$WrapperScript = @"

\$WebSocketUrl = "${wsUrl}"
while (\$true) {
    try {
        & "$AgentPath\\Agent.ps1" -WebSocketUrl \$WebSocketUrl
    } catch {
        Write-Host "Agent crashed, restarting in 10 seconds..."
    }
    Start-Sleep -Seconds 10
}
"@

Set-Content -Path "$AgentPath\\AgentWrapper.ps1" -Value $WrapperScript

# Register as scheduled task (runs at startup)
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File $AgentPath\\AgentWrapper.ps1"
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $ServiceName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force

# Start immediately
Start-ScheduledTask -TaskName $ServiceName

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " GameServer Agent erfolgreich installiert!" -ForegroundColor Green  
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Der Agent verbindet sich jetzt automatisch mit dem Panel."
Write-Host "Status kann im Panel unter Einstellungen > Externe Server geprueft werden."
Write-Host ""
`;

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
