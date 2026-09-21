/**
 * Schema migrations & initial template seeding for MySQL
 */

async function runMigrations(pool) {
  if (!pool) return;

  const queries = [
    // 1. Settings
    `CREATE TABLE IF NOT EXISTS settings (
      key_name VARCHAR(100) PRIMARY KEY,
      value_text TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 2. Contact Lists
    `CREATE TABLE IF NOT EXISTS contact_lists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      total_contacts INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 3. Contacts
    `CREATE TABLE IF NOT EXISTS contacts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      list_id INT NOT NULL,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      company VARCHAR(255),
      custom_fields JSON,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_list_id (list_id),
      INDEX idx_email (email),
      CONSTRAINT fk_contacts_list FOREIGN KEY (list_id) REFERENCES contact_lists(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 4. Dynamic Templates
    `CREATE TABLE IF NOT EXISTS templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subject VARCHAR(500) NOT NULL,
      body_html LONGTEXT NOT NULL,
      body_text LONGTEXT,
      variables JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 5. Campaigns
    `CREATE TABLE IF NOT EXISTS campaigns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      template_id INT NOT NULL,
      list_id INT NOT NULL,
      from_name VARCHAR(255) NOT NULL,
      from_email VARCHAR(255) NOT NULL,
      reply_to VARCHAR(255),
      status VARCHAR(50) DEFAULT 'draft',
      total_count INT DEFAULT 0,
      sent_count INT DEFAULT 0,
      failed_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP NULL,
      finished_at TIMESTAMP NULL,
      INDEX idx_camp_status (status),
      CONSTRAINT fk_camp_template FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
      CONSTRAINT fk_camp_list FOREIGN KEY (list_id) REFERENCES contact_lists(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 6. Campaign Delivery Logs
    `CREATE TABLE IF NOT EXISTS campaign_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      campaign_id INT NOT NULL,
      contact_id INT,
      email VARCHAR(255) NOT NULL,
      recipient_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      resend_id VARCHAR(100),
      error_message TEXT,
      sent_at TIMESTAMP NULL,
      INDEX idx_log_campaign (campaign_id),
      INDEX idx_log_status (status),
      CONSTRAINT fk_log_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  ];

  for (const q of queries) {
    await pool.query(q);
  }

  // Seed default templates if none exist
  await seedDefaultTemplates(pool);
}

async function seedDefaultTemplates(pool) {
  const [rows] = await pool.query('SELECT COUNT(*) as count FROM templates');
  if (rows[0].count > 0) return;

  const starterTemplates = [
    {
      name: 'Personalized Business Outreach',
      subject: 'Quick question regarding {{company | "your team"}} growth, {{name}}',
      body_html: `<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
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
</div>`,
      variables: JSON.stringify(['name', 'company', 'sender_name', 'email'])
    }
  ];

  for (const t of starterTemplates) {
    await pool.query(
      'INSERT INTO templates (name, subject, body_html, variables) VALUES (?, ?, ?, ?)',
      [t.name, t.subject, t.body_html, t.variables]
    );
  }
}

module.exports = {
  runMigrations
};
