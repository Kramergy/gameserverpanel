import { pool } from './pool';

export async function initDatabase() {
  const client = await pool.connect();
  
  try {
    // Create enum type for roles
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE app_role AS ENUM ('admin', 'user');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Profiles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT,
        username TEXT,
        avatar_url TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // User roles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role app_role DEFAULT 'user',
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Server nodes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS server_nodes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER DEFAULT 22,
        username TEXT NOT NULL,
        auth_type TEXT DEFAULT 'password',
        os_type TEXT DEFAULT 'linux',
        game_path TEXT DEFAULT '/home/gameserver',
        status TEXT DEFAULT 'unknown',
        agent_token TEXT,
        agent_connected_at TIMESTAMPTZ,
        last_check TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Server instances table
    await client.query(`
      CREATE TABLE IF NOT EXISTS server_instances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        node_id UUID REFERENCES server_nodes(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        game TEXT NOT NULL,
        game_icon TEXT NOT NULL,
        status TEXT DEFAULT 'offline',
        ip TEXT DEFAULT '0.0.0.0',
        port INTEGER DEFAULT 25565,
        current_players INTEGER DEFAULT 0,
        max_players INTEGER DEFAULT 20,
        ram_allocated INTEGER DEFAULT 2048,
        cpu_usage INTEGER DEFAULT 0,
        ram_usage INTEGER DEFAULT 0,
        install_path TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Node commands table
    await client.query(`
      CREATE TABLE IF NOT EXISTS node_commands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        node_id UUID NOT NULL REFERENCES server_nodes(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        command_type TEXT NOT NULL,
        command_data JSONB DEFAULT '{}',
        status TEXT DEFAULT 'pending',
        result JSONB,
        executed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Server logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS server_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id UUID NOT NULL REFERENCES server_instances(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        log_type TEXT DEFAULT 'info',
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
      CREATE INDEX IF NOT EXISTS idx_server_nodes_user_id ON server_nodes(user_id);
      CREATE INDEX IF NOT EXISTS idx_server_instances_user_id ON server_instances(user_id);
      CREATE INDEX IF NOT EXISTS idx_server_instances_node_id ON server_instances(node_id);
      CREATE INDEX IF NOT EXISTS idx_node_commands_node_id ON node_commands(node_id);
      CREATE INDEX IF NOT EXISTS idx_node_commands_status ON node_commands(status);
      CREATE INDEX IF NOT EXISTS idx_server_logs_server_id ON server_logs(server_id);
      CREATE INDEX IF NOT EXISTS idx_server_nodes_agent_token ON server_nodes(agent_token);
    `);

    console.log('Database tables created successfully');
  } finally {
    client.release();
  }
}
