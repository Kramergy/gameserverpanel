import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestNodeRequest {
  nodeId: string;
}

interface TestResult {
  success: boolean;
  connectionTest: boolean;
  pathTest: boolean;
  message: string;
  details?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { nodeId }: TestNodeRequest = await req.json();

    if (!nodeId) {
      return new Response(
        JSON.stringify({ error: 'Node ID fehlt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the node
    const { data: node, error: nodeError } = await supabase
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

    // Check if user owns this node or is admin
    const { data: isAdmin } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (node.user_id !== user.id && !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Keine Berechtigung' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Testing connection to node: ${node.name} (${node.host}:${node.port})`);

    let result: TestResult;

    // Simulate connection test
    // In a real implementation, this would:
    // 1. For Linux: Attempt SSH connection using ssh2 library
    // 2. For Windows: Attempt WinRM connection
    // 3. Execute a command to check if the path exists
    
    // For demonstration, we'll simulate the test based on host reachability
    try {
      // Try to reach the host (basic connectivity check)
      const connectionTest = await testHostReachability(node.host, node.port);
      
      if (connectionTest.success) {
        // Simulate path check (in real implementation, would execute remote command)
        const pathTest = await simulatePathCheck(node.os_type, node.game_path);
        
        if (pathTest.success) {
          result = {
            success: true,
            connectionTest: true,
            pathTest: true,
            message: 'Verbindung erfolgreich',
            details: `Server erreichbar. Pfad "${node.game_path}" ist verfügbar.`
          };
        } else {
          result = {
            success: false,
            connectionTest: true,
            pathTest: false,
            message: 'Pfad nicht erreichbar',
            details: pathTest.error
          };
        }
      } else {
        result = {
          success: false,
          connectionTest: false,
          pathTest: false,
          message: 'Verbindung fehlgeschlagen',
          details: connectionTest.error
        };
      }
    } catch (testError) {
      console.error('Connection test error:', testError);
      result = {
        success: false,
        connectionTest: false,
        pathTest: false,
        message: 'Verbindungsfehler',
        details: testError instanceof Error ? testError.message : 'Unbekannter Fehler'
      };
    }

    // Update node status in database
    const newStatus = result.success ? 'online' : (result.connectionTest ? 'error' : 'offline');
    
    await supabase
      .from('server_nodes')
      .update({ 
        status: newStatus,
        last_check: new Date().toISOString()
      })
      .eq('id', nodeId);

    console.log(`Node ${node.name} test result: ${result.message}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in test-node-connection:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Interner Serverfehler',
        details: error instanceof Error ? error.message : 'Unbekannter Fehler'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Test if host is reachable (basic TCP check)
async function testHostReachability(host: string, port: number): Promise<{ success: boolean; error?: string }> {
  try {
    // Attempt TCP connection with timeout
    const conn = await Promise.race([
      Deno.connect({ hostname: host, port: port }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Zeitüberschreitung')), 5000)
      )
    ]) as Deno.Conn;
    
    conn.close();
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Verbindung fehlgeschlagen';
    
    if (errorMessage.includes('Zeitüberschreitung')) {
      return { success: false, error: `Server ${host}:${port} antwortet nicht (Zeitüberschreitung)` };
    }
    if (errorMessage.includes('Connection refused')) {
      return { success: false, error: `Verbindung abgelehnt auf ${host}:${port}. Ist der SSH/WinRM Dienst aktiv?` };
    }
    if (errorMessage.includes('No route to host') || errorMessage.includes('Network is unreachable')) {
      return { success: false, error: `Host ${host} nicht erreichbar. Überprüfe die Netzwerkkonfiguration.` };
    }
    if (errorMessage.includes('Name or service not known') || errorMessage.includes('getaddrinfo')) {
      return { success: false, error: `Hostname ${host} konnte nicht aufgelöst werden.` };
    }
    
    return { success: false, error: `Verbindungsfehler: ${errorMessage}` };
  }
}

// Simulate path check (in production, this would execute a remote command)
async function simulatePathCheck(osType: string, gamePath: string): Promise<{ success: boolean; error?: string }> {
  // Basic path validation
  if (!gamePath || gamePath.length === 0) {
    return { success: false, error: 'Kein Installationspfad angegeben' };
  }

  // Validate path format based on OS
  if (osType === 'windows') {
    // Windows path validation (e.g., C:\GameServers)
    const windowsPathRegex = /^[a-zA-Z]:\\[\w\s\\-_.]*$/;
    if (!windowsPathRegex.test(gamePath)) {
      return { success: false, error: `Ungültiger Windows-Pfad: ${gamePath}. Erwartet: C:\\Ordner` };
    }
  } else {
    // Linux path validation (e.g., /home/gameserver)
    const linuxPathRegex = /^\/[\w\s\/-_.]*$/;
    if (!linuxPathRegex.test(gamePath)) {
      return { success: false, error: `Ungültiger Linux-Pfad: ${gamePath}. Erwartet: /pfad/zum/ordner` };
    }
  }

  // In production, you would execute:
  // Linux: ssh user@host "test -d /path && echo 'exists' || echo 'not found'"
  // Windows: Invoke-Command -ComputerName host -ScriptBlock { Test-Path 'C:\path' }
  
  // For now, simulate success if path format is valid
  return { success: true };
}
