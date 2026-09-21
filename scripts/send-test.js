const { sendSingleEmail } = require('../server/services/resendService');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.RESEND_API_KEY;
const targetEmail = process.argv[2] || 'lokeshsinghtanwar78@gmail.com';

async function main() {
  console.log(`🚀 Sending test email to: ${targetEmail}`);
  console.log(`🔑 Using Resend API Key: ${apiKey.slice(0, 8)}...`);

  try {
    const res = await sendSingleEmail(apiKey, {
      from: 'Alpever AI <notifications@alpever.com>',
      to: targetEmail,
      subject: 'Test Email from Alpever Mail — System Working Perfectly! 🚀',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="background: #e0e7ff; color: #4338ca; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase;">System Test Verified</span>
          </div>
          <h2 style="color: #1e1b4b; text-align: center; margin-top: 0;">Hello Lokesh! 👋</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #334155; text-align: center;">
            Aapka <strong>Personalized Mass Mailer System</strong> Resend API aur MySQL ke saath 100% perfectly configure ho chuka hai!
          </p>
          <div style="background: #f8fafc; border-left: 4px solid #6366f1; padding: 16px 20px; border-radius: 8px; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e293b;"><strong>✅ System Status:</strong> All systems operational</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e293b;"><strong>🌐 Verified Domain:</strong> alpever.com</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e293b;"><strong>🗄️ Database:</strong> MySQL 8.0 (mass_mailer_db on port 3307)</p>
            <p style="margin: 0; font-size: 14px; color: #1e293b;"><strong>⚡ Delivery Engine:</strong> Resend Batch API Queue</p>
          </div>
          <p style="font-size: 13px; color: #64748b; text-align: center; margin: 24px 0 0 0;">
            Sent successfully at ${new Date().toLocaleString()}<br/>
            &copy; 2026 Alpever AI. All rights reserved.
          </p>
        </div>
      `
    });

    console.log('✅ TEST_EMAIL_SUCCESS!');
    console.log('📬 Resend Message ID:', res.id);
  } catch (err) {
    console.error('❌ TEST_EMAIL_FAILED:', err.message);
    if (err.data) console.error('Details:', err.data);
  }
}

main();
