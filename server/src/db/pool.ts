import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Flexible Konfiguration: URL oder einzelne Felder
const getPoolConfig = () => {
  if (process.env.DATABASE_URL) {
    return { uri: process.env.DATABASE_URL };
  }
  
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'gamepanel',
    password: process.env.DB_PASSWORD || 'gamepanel',
    database: process.env.DB_NAME || 'gamepanel',
  };
};

export const pool = mysql.createPool({
  ...getPoolConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test connection on startup
pool.getConnection()
  .then(connection => {
    console.log('Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
  });
