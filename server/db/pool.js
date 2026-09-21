const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

let pool = null;
let dbStatus = {
  connected: false,
  message: 'Database not initialized yet',
  error: null,
  config: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    database: process.env.DB_NAME || 'mass_mailer_db'
  }
};

/**
 * Initialize MySQL Connection Pool and ensure database exists
 */
async function initDB(overrideConfig = {}) {
  const config = {
    host: overrideConfig.host || process.env.DB_HOST || '127.0.0.1',
    port: parseInt(overrideConfig.port || process.env.DB_PORT || '3306', 10),
    user: overrideConfig.user || process.env.DB_USER || 'root',
    password: overrideConfig.password !== undefined ? overrideConfig.password : (process.env.DB_PASSWORD || ''),
    database: overrideConfig.database || process.env.DB_NAME || 'mass_mailer_db',
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  };

  dbStatus.config = {
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database
  };

  try {
    // 1. First connect without database selected to ensure DB exists
    const rootConnection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      connectTimeout: 5000
    });

    await rootConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await rootConnection.end();

    // 2. Now create the pooled connection
    if (pool) {
      await pool.end().catch(() => {});
    }

    pool = mysql.createPool(config);

    // Test a ping query
    const [rows] = await pool.query('SELECT 1 as connected');
    dbStatus.connected = true;
    dbStatus.message = `Successfully connected to MySQL database: ${config.database}`;
    dbStatus.error = null;

    // Run schema migrations
    const { runMigrations } = require('./schema');
    await runMigrations(pool);

    return { success: true, message: dbStatus.message };
  } catch (err) {
    dbStatus.connected = false;
    dbStatus.error = err.message;
    dbStatus.message = `MySQL Connection failed: ${err.message}`;
    console.warn('⚠️  [MySQL Warning]', dbStatus.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get current active pool
 */
function getPool() {
  return pool;
}

/**
 * Get connection status
 */
function getStatus() {
  return dbStatus;
}

module.exports = {
  initDB,
  getPool,
  getStatus
};
