const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { initDB, getPool, getStatus } = require('./db/pool');
const { router: settingsRouter } = require('./routes/settingsRoutes');
const contactRouter = require('./routes/contactRoutes');
const templateRouter = require('./routes/templateRoutes');
const campaignRouter = require('./routes/campaignRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static frontend & uploads
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Global API status / stats endpoint
app.get('/api/stats', async (req, res) => {
  const pool = getPool();
  const dbStatus = getStatus();

  if (!pool || !dbStatus.connected) {
    return res.json({
      dbConnected: false,
      dbError: dbStatus.error,
      totalContacts: 0,
      totalLists: 0,
      totalTemplates: 0,
      totalCampaigns: 0,
      totalSent: 0,
      totalFailed: 0,
      successRate: 100
    });
  }

  try {
    const [cStats] = await pool.query('SELECT COUNT(*) as count FROM contacts');
    const [lStats] = await pool.query('SELECT COUNT(*) as count FROM contact_lists');
    const [tStats] = await pool.query('SELECT COUNT(*) as count FROM templates');
    const [campStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_campaigns,
        COALESCE(SUM(sent_count), 0) as total_sent,
        COALESCE(SUM(failed_count), 0) as total_failed
      FROM campaigns
    `);

    const sent = Number(campStats[0].total_sent) || 0;
    const failed = Number(campStats[0].total_failed) || 0;
    const totalProcessed = sent + failed;
    const successRate = totalProcessed > 0 ? Math.round((sent / totalProcessed) * 100) : 100;

    res.json({
      dbConnected: true,
      totalContacts: cStats[0].count,
      totalLists: lStats[0].count,
      totalTemplates: tStats[0].count,
      totalCampaigns: campStats[0].total_campaigns,
      totalSent: sent,
      totalFailed: failed,
      successRate
    });
  } catch (err) {
    res.status(500).json({ error: err.message, dbConnected: true });
  }
});

// Mount Routes
app.use('/api/settings', settingsRouter);
app.use('/api/contacts', contactRouter);
app.use('/api/templates', templateRouter);
app.use('/api/campaigns', campaignRouter);

// Fallback to index.html for SPA client-side routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Ensure MySQL Server is active
async function ensureMySqlServer() {
  const net = require('net');
  const port = parseInt(process.env.DB_PORT || '3306', 10);

  const isPortOpen = () => new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });

  const open = await isPortOpen();
  if (!open && port === 3307) {
    const { spawn } = require('child_process');
    const dataDir = path.join(__dirname, '../mysql_data');
    const mysqldBin = 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe';
    const fs = require('fs');

    if (fs.existsSync(mysqldBin) && fs.existsSync(dataDir)) {
      console.log('🔄 Spawning dedicated MySQL 8.0 daemon on port 3307...');
      const logPath = path.join(dataDir, 'mysql_3307.log');
      const logFd = fs.openSync(logPath, 'a');
      const proc = spawn(mysqldBin, [
        '--datadir=' + dataDir,
        '--port=3307',
        '--mysqlx=0',
        '--log-error=' + logPath
      ], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        windowsHide: true
      });
      proc.unref();

      // Poll until port is open (up to 6 seconds)
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (await isPortOpen()) {
          break;
        }
      }
    }
  }
}

// Start Server
app.listen(PORT, async () => {
  console.log(`\n🚀 ===============================================`);
  console.log(`🚀 Mass Personalized Mailer Server is running!`);
  console.log(`🚀 Open browser at: http://localhost:3000`);
  console.log(`🚀 ===============================================\n`);

  await ensureMySqlServer();

  // Attempt initial DB connection
  console.log('🔄 Connecting to MySQL database...');
  const res = await initDB();
  if (res.success) {
    console.log('✅ MySQL Database is connected and ready to use!');
  } else {
    console.warn('⚠️  MySQL is not connected yet:', res.error);
    console.log('👉 You can configure MySQL credentials anytime from the web app Settings page.');
  }
});
