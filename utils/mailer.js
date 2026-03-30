const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendDoctorApprovalEmail(doctorEmail, doctorName) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  const mailOptions = {
    from: `"Medical Continuity" <${process.env.EMAIL_USER}>`,
    to: doctorEmail,
    subject: 'Your Doctor Account Has Been Verified — Medical Continuity',
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f0fdf4;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;padding:40px 20px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
<tr><td style="background:linear-gradient(135deg,#052e16,#166534);padding:36px 40px;text-align:center">
  <h1 style="color:white;margin:0;font-size:24px;font-weight:700">🏥 Medical Continuity</h1>
  <p style="color:rgba(255,255,255,0.6);margin:6px 0 0;font-size:13px">Secure Health Record Platform</p>
</td></tr>
<tr><td style="padding:36px 40px">
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;text-align:center;margin-bottom:24px">
    <div style="font-size:32px;margin-bottom:6px">✅</div>
    <h2 style="color:#166534;margin:0;font-size:18px">Account Verified!</h2>
  </div>
  <p style="color:#374151;font-size:15px;line-height:1.7">Dear <strong>Dr. ${doctorName}</strong>,</p>
  <p style="color:#374151;font-size:15px;line-height:1.7">Your doctor registration on <strong>Medical Continuity</strong> has been <strong style="color:#16a34a">approved and verified</strong> by our admin team. You can now log in and access patient records securely.</p>
  <table style="background:#f9fafb;border-radius:10px;padding:18px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td>
    <p style="color:#111827;font-weight:700;font-size:13px;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">What you can do now</p>
    <p style="color:#374151;font-size:14px;margin:0 0 8px">✓ &nbsp;Log in with your registered email and password</p>
    <p style="color:#374151;font-size:14px;margin:0 0 8px">✓ &nbsp;Request OTP access to view patient medical history</p>
    <p style="color:#374151;font-size:14px;margin:0">✓ &nbsp;View medicines, reports, allergies and full records</p>
  </td></tr></table>
  <div style="text-align:center;margin:24px 0">
    <a href="${baseUrl}/doctor/login" style="display:inline-block;background:#16a34a;color:white;text-decoration:none;padding:13px 32px;border-radius:9px;font-weight:700;font-size:15px">Login to Doctor Portal →</a>
  </div>
  <p style="color:#9ca3af;font-size:13px;margin:0">Welcome to Medical Continuity. Together we ensure patients get the right care at the right time.</p>
</td></tr>
<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 40px;text-align:center">
  <p style="color:#9ca3af;font-size:12px;margin:0">© 2026 Medical Continuity · Automated message — do not reply</p>
</td></tr>
</table></td></tr></table></body></html>`
  };
  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Approval email sent to', doctorEmail);
  } catch (err) {
    console.error('❌ Email failed:', err.message);
  }
}

module.exports = { sendDoctorApprovalEmail };
