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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's JWT to verify authentication
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Nicht autorisiert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { nodeId }: TestNodeRequest = await req.json();

    if (!nodeId) {
      return new Response(
        JSON.stringify({ error: 'Node ID fehlt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the node
    const { data: node, error: nodeError } = await supabaseAdmin
      .from('server_nodes')
      .select('*')
      .eq('id', nodeId)
      .single();

    if (nodeError || !node) {
      console.error('Node fetch error:', nodeError);
      return new Response(
        JSON.stringify({ error: 'Node nicht gefunden' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user owns this node or is admin
    const { data: isAdmin } = await supabaseAdmin
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (node.user_id !== user.id && !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Keine Berechtigung' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Testing connection to node: ${node.name} (${node.host}:${node.port})`);

    let result: TestResult;

    try {
      // Try to reach the host (basic connectivity check)
      const connectionTest = await testHostReachability(node.host, node.port);
      
      if (connectionTest.success) {
        // Validate path format
        const pathTest = validatePath(node.os_type, node.game_path);
        
        if (pathTest.success) {
          result = {
            success: true,
            connectionTest: true,
            pathTest: true,
            message: 'Verbindung erfolgreich',
            details: `Server erreichbar auf ${node.host}:${node.port}. Pfad "${node.game_path}" ist gültig.`
          };
        } else {
          result = {
            success: false,
            connectionTest: true,
            pathTest: false,
            message: 'Pfad ungültig',
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
    
    await supabaseAdmin
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
      return { success: false, error: `Server ${host}:${port} antwortet nicht (Zeitüberschreitung nach 5s)` };
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

// Validate path format based on OS
function validatePath(osType: string, gamePath: string): { success: boolean; error?: string } {
  if (!gamePath || gamePath.length === 0) {
    return { success: false, error: 'Kein Installationspfad angegeben' };
  }

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

  return { success: true };
}
