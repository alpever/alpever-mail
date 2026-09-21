/**
 * Production Reset Script
 * Cleans all contacts, lists, campaigns, and delivery logs.
 * Retains exactly 1 high-converting starter template.
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function resetDb() {
  console.log('Connecting to MySQL...');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3307', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mass_mailer_db'
  });

  console.log('Disabling foreign key checks...');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  console.log('Truncating tables...');
  await conn.query('TRUNCATE TABLE campaign_logs');
  await conn.query('TRUNCATE TABLE campaigns');
  await conn.query('TRUNCATE TABLE contacts');
  await conn.query('TRUNCATE TABLE contact_lists');
  await conn.query('TRUNCATE TABLE templates');

  console.log('Re-enabling foreign key checks...');
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  console.log('Seeding 1 clean starter template...');
  const templateName = 'Personalized Business Outreach';
  const subject = 'Quick question regarding {{company | "your team"}} growth, {{name}}';
  const bodyHtml = `<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
  <p style="font-size: 16px; line-height: 1.6;">Hi <strong>{{name}}</strong>,</p>
  <p style="font-size: 15px; line-height: 1.6; color: #475569;">
    I came across your work at <strong>{{company | "your company"}}</strong> and wanted to reach out directly. We've been helping leaders like you streamline communications and save hours every week.
  </p>
  <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 16px; border-radius: 6px; margin: 20px 0;">
    <p style="margin: 0; font-size: 15px; color: #334155; font-weight: 500;">
      "We'd love to share how teams in your industry are scaling their personalized outreach with 3x higher reply rates."
    </p>
  </div>
  <p style="font-size: 15px; line-height: 1.6; color: #475569;">
    Would you be open to a quick 5-minute chat this Thursday or Friday?
  </p>
  <div style="margin: 28px 0 20px;">
    <a href="https://alpever.com" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
      Schedule a Quick Call &rarr;
    </a>
  </div>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="font-size: 13px; color: #94a3b8; margin: 0;">
    Best regards,<br/>
    <strong>{{sender_name | "Alpever AI Team"}}</strong><br/>
    Sent to {{email}}
  </p>
</div>`;
  const vars = JSON.stringify(['name', 'company', 'sender_name', 'email']);

  await conn.query(
    'INSERT INTO templates (id, name, subject, body_html, variables) VALUES (1, ?, ?, ?, ?)',
    [templateName, subject, bodyHtml, vars]
  );

  const [t] = await conn.query('SELECT count(*) as count FROM templates');
  const [cl] = await conn.query('SELECT count(*) as count FROM contact_lists');
  const [c] = await conn.query('SELECT count(*) as count FROM contacts');
  const [cp] = await conn.query('SELECT count(*) as count FROM campaigns');
  const [l] = await conn.query('SELECT count(*) as count FROM campaign_logs');

  console.log('\n========================================');
  console.log('✅ FRESH PRODUCTION STATE CONFIRMED:');
  console.log(`- Templates:     ${t[0].count} (Personalized Business Outreach)`);
  console.log(`- Contact Lists: ${cl[0].count}`);
  console.log(`- Contacts:      ${c[0].count}`);
  console.log(`- Campaigns:     ${cp[0].count}`);
  console.log(`- Delivery Logs: ${l[0].count}`);
  console.log('========================================\n');

  await conn.end();
}

resetDb().catch(err => {
  console.error('Reset failed:', err);
  process.exit(1);
});
