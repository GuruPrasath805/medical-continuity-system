let twilioClient = null;

async function sendOtpSms(toPhone, otp, patientName) {
  let phone = toPhone.toString().replace(/[\s\-\.]/g, '');
  if (!phone.startsWith('+')) phone = '+91' + phone;

  if (!twilioClient) {
    if (!process.env.TWILIO_SID || !process.env.TWILIO_TOKEN) {
      console.log(`\n📱  [DEV MODE] OTP for ${phone}: ${otp}\n`);
      return { success: false, dev: true };
    }
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  }

  try {
    await twilioClient.messages.create({
      body: `Medical Continuity: OTP ${otp} requested by doctor to view patient records. Valid 5 mins. Do NOT share.`,
      from: process.env.TWILIO_PHONE,
      to: phone
    });
    console.log(`✅ OTP SMS sent to ${phone}`);
    return { success: true };
  } catch (err) {
    console.error('❌ Twilio error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendOtpSms };