import { pool } from './pool';

export async function initDatabase() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Profiles table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS profiles (
        id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
        user_id CHAR(36) UNIQUE NOT NULL,
        email VARCHAR(255),
        username VARCHAR(255),
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // User roles table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
        user_id CHAR(36) UNIQUE NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Server nodes table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS server_nodes (
        id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
        user_id CHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        host VARCHAR(255) NOT NULL,
        port INT DEFAULT 22,
        username VARCHAR(255) NOT NULL,
        auth_type VARCHAR(50) DEFAULT 'password',
        os_type VARCHAR(50) DEFAULT 'linux',
        game_path VARCHAR(500) DEFAULT '/home/gameserver',
        status VARCHAR(50) DEFAULT 'unknown',
        agent_token VARCHAR(255),
        agent_connected_at TIMESTAMP NULL,
        last_check TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Server instances table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS server_instances (
        id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
        user_id CHAR(36) NOT NULL,
        node_id CHAR(36),
        name VARCHAR(255) NOT NULL,
        game VARCHAR(255) NOT NULL,
        game_icon VARCHAR(500) NOT NULL,
        status VARCHAR(50) DEFAULT 'offline',
        ip VARCHAR(50) DEFAULT '0.0.0.0',
        port INT DEFAULT 25565,
        current_players INT DEFAULT 0,
        max_players INT DEFAULT 20,
        ram_allocated INT DEFAULT 2048,
        cpu_usage INT DEFAULT 0,
        ram_usage INT DEFAULT 0,
        install_path VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (node_id) REFERENCES server_nodes(id) ON DELETE SET NULL
      )
    `);

    // Node commands table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS node_commands (
        id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
        node_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        command_type VARCHAR(100) NOT NULL,
        command_data JSON DEFAULT (JSON_OBJECT()),
        status VARCHAR(50) DEFAULT 'pending',
        result JSON,
        executed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (node_id) REFERENCES server_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Server logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS server_logs (
        id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
        server_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        log_type VARCHAR(50) DEFAULT 'info',
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES server_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create indexes (MySQL uses CREATE INDEX IF NOT EXISTS differently, we use a try-catch approach)
    const indexes = [
      'CREATE INDEX idx_profiles_user_id ON profiles(user_id)',
      'CREATE INDEX idx_user_roles_user_id ON user_roles(user_id)',
      'CREATE INDEX idx_server_nodes_user_id ON server_nodes(user_id)',
      'CREATE INDEX idx_server_instances_user_id ON server_instances(user_id)',
      'CREATE INDEX idx_server_instances_node_id ON server_instances(node_id)',
      'CREATE INDEX idx_node_commands_node_id ON node_commands(node_id)',
      'CREATE INDEX idx_node_commands_status ON node_commands(status)',
      'CREATE INDEX idx_server_logs_server_id ON server_logs(server_id)',
      'CREATE INDEX idx_server_nodes_agent_token ON server_nodes(agent_token)'
    ];

    for (const indexSql of indexes) {
      try {
        await connection.execute(indexSql);
      } catch (err: any) {
        // Ignore "Duplicate key name" errors (index already exists)
        if (err.code !== 'ER_DUP_KEYNAME') {
          throw err;
        }
      }
    }

    await connection.commit();
    console.log('Database tables created successfully');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
