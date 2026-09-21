const { getPool, initDB } = require('../server/db/pool');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const sampleRows = [
  { email: 'rahul.sharma@example.com', name: 'Rahul Sharma', company: 'TechCorp India', custom_fields: { role: 'Head of Growth', city: 'Bengaluru', discount: '25%' } },
  { email: 'priya.patel@example.com', name: 'Priya Patel', company: 'Nexus Systems', custom_fields: { role: 'CTO', city: 'Mumbai', discount: '30%' } },
  { email: 'amit.verma@example.com', name: 'Amit Verma', company: 'Alpha Logistics', custom_fields: { role: 'Operations Director', city: 'Delhi', discount: '20%' } },
  { email: 'sneha.reddy@example.com', name: 'Sneha Reddy', company: 'CloudScale Solutions', custom_fields: { role: 'Product Manager', city: 'Hyderabad', discount: '25%' } },
  { email: 'vikram.singh@example.com', name: 'Vikram Singh', company: 'Zenith Retail', custom_fields: { role: 'Founder & CEO', city: 'Jaipur', discount: '35%' } },
  { email: 'ananya.das@example.com', name: 'Ananya Das', company: 'Creative Hive', custom_fields: { role: 'Marketing Lead', city: 'Kolkata', discount: '20%' } },
  { email: 'rohit.mehta@example.com', name: 'Rohit Mehta', company: 'FinEdge Capital', custom_fields: { role: 'Managing Director', city: 'Pune', discount: '30%' } },
  { email: 'pooja.nair@example.com', name: 'Pooja Nair', company: 'BioHealth Labs', custom_fields: { role: 'VP Research', city: 'Chennai', discount: '25%' } },
  { email: 'karan.malhotra@example.com', name: 'Karan Malhotra', company: 'Apex Global', custom_fields: { role: 'Strategy Head', city: 'Gurugram', discount: '20%' } },
  { email: 'neha.gupta@example.com', name: 'Neha Gupta', company: 'Gupta Enterprises', custom_fields: { role: 'Operations Lead', city: 'Noida', discount: '25%' } }
];

async function seed() {
  await initDB();
  const pool = getPool();
  if (!pool) return;

  const [existing] = await pool.query('SELECT COUNT(*) as c FROM contact_lists WHERE name = "Sample VIP Customers (10)"');
  if (existing[0].c > 0) {
    console.log('Sample audience already exists.');
    process.exit(0);
  }

  const [lRes] = await pool.query(
    'INSERT INTO contact_lists (name, description, total_contacts) VALUES (?, ?, ?)',
    ['Sample VIP Customers (10)', 'Pre-loaded 10 customers with rich attributes for instant testing', sampleRows.length]
  );
  const listId = lRes.insertId;

  const values = sampleRows.map(r => [
    listId,
    r.email,
    r.name,
    r.company,
    JSON.stringify(r.custom_fields),
    'active'
  ]);

  await pool.query('INSERT INTO contacts (list_id, email, name, company, custom_fields, status) VALUES ?', [values]);
  console.log(`✅ Seeded 10 sample customers into audience list ID ${listId}!`);
  process.exit(0);
}

seed();
