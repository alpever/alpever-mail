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
      INDEX idx_contacts_created (created_at),
      INDEX idx_contacts_list_status (list_id, status),
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
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_templates_updated (updated_at)
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
      opened_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP NULL,
      finished_at TIMESTAMP NULL,
      INDEX idx_camp_status (status),
      INDEX idx_camp_created (created_at),
      INDEX idx_camp_started (started_at),
      INDEX idx_camp_status_created (status, created_at),
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
      opened_at TIMESTAMP NULL,
      open_count INT DEFAULT 0,
      user_agent VARCHAR(500) NULL,
      ip_address VARCHAR(100) NULL,
      INDEX idx_log_campaign (campaign_id),
      INDEX idx_log_status (status),
      INDEX idx_log_opened (opened_at),
      INDEX idx_cl_sent_at (sent_at),
      INDEX idx_cl_camp_status (campaign_id, status),
      INDEX idx_cl_camp_opened (campaign_id, opened_at),
      CONSTRAINT fk_log_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 7. Scheduled Drip Automations
    `CREATE TABLE IF NOT EXISTS automations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      template_id INT NOT NULL,
      list_id INT NOT NULL,
      from_name VARCHAR(255) NOT NULL,
      from_email VARCHAR(255) NOT NULL,
      reply_to VARCHAR(255) NULL,
      daily_limit INT NOT NULL DEFAULT 10,
      send_time VARCHAR(10) NOT NULL DEFAULT '10:00',
      status VARCHAR(50) DEFAULT 'active',
      total_count INT DEFAULT 0,
      sent_count INT DEFAULT 0,
      failed_count INT DEFAULT 0,
      opened_count INT DEFAULT 0,
      last_run_at TIMESTAMP NULL,
      last_run_date VARCHAR(20) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_auto_status (status),
      INDEX idx_auto_status_time (status, send_time),
      INDEX idx_auto_created (created_at),
      CONSTRAINT fk_auto_template FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
      CONSTRAINT fk_auto_list FOREIGN KEY (list_id) REFERENCES contact_lists(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    // 8. Automation Recipient Logs
    `CREATE TABLE IF NOT EXISTS automation_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      automation_id INT NOT NULL,
      contact_id INT,
      email VARCHAR(255) NOT NULL,
      recipient_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      resend_id VARCHAR(100),
      error_message TEXT,
      sent_at TIMESTAMP NULL,
      opened_at TIMESTAMP NULL,
      open_count INT DEFAULT 0,
      user_agent VARCHAR(500) NULL,
      ip_address VARCHAR(100) NULL,
      INDEX idx_al_auto (automation_id),
      INDEX idx_al_status (status),
      INDEX idx_al_auto_status (automation_id, status),
      INDEX idx_al_opened (opened_at),
      INDEX idx_al_sent_at (sent_at),
      CONSTRAINT fk_al_auto FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  ];

  for (const q of queries) {
    await pool.query(q);
  }

  // Safe migrations for existing databases
  const alterMigrations = [
    'ALTER TABLE campaign_logs ADD COLUMN opened_at TIMESTAMP NULL',
    'ALTER TABLE campaign_logs ADD COLUMN open_count INT DEFAULT 0',
    'ALTER TABLE campaign_logs ADD COLUMN user_agent VARCHAR(500) NULL',
    'ALTER TABLE campaign_logs ADD COLUMN ip_address VARCHAR(100) NULL',
    'ALTER TABLE campaigns ADD COLUMN opened_count INT DEFAULT 0',
    // Performance indexes for ultra-fast query execution
    'CREATE INDEX idx_camp_created ON campaigns (created_at)',
    'CREATE INDEX idx_camp_started ON campaigns (started_at)',
    'CREATE INDEX idx_camp_status_created ON campaigns (status, created_at)',
    'CREATE INDEX idx_cl_sent_at ON campaign_logs (sent_at)',
    'CREATE INDEX idx_cl_opened_at ON campaign_logs (opened_at)',
    'CREATE INDEX idx_cl_camp_status ON campaign_logs (campaign_id, status)',
    'CREATE INDEX idx_cl_camp_opened ON campaign_logs (campaign_id, opened_at)',
    'CREATE INDEX idx_contacts_created ON contacts (created_at)',
    'CREATE INDEX idx_contacts_list_status ON contacts (list_id, status)',
    'CREATE INDEX idx_templates_updated ON templates (updated_at)'
  ];

  for (const altQ of alterMigrations) {
    try {
      await pool.query(altQ);
    } catch (e) {
      // Column or index already exists - safely ignore
    }
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
