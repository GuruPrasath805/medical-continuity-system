const express       = require('express');
const router        = express.Router();
const bcrypt        = require('bcrypt');
const multer        = require('multer');
const path          = require('path');
const fs            = require('fs');
const crypto        = require('crypto');
const Doctor        = require('../models/Doctor');
const Patient       = require('../models/Patient');
const MedicalRecord = require('../models/MedicalRecord');
const { sendOtpSms } = require('../utils/sms');
const { normalizePhone } = require('../utils/phone');

// ── OTP store ────────────────────────────────────────────────
const otpStore = {};

// ── Multer for license ───────────────────────────────────────
const licenseDir = path.join(__dirname, '..', 'public', 'uploads', 'licenses');
if (!fs.existsSync(licenseDir)) fs.mkdirSync(licenseDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, licenseDir),
    filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  })
});

// ── Auth middleware ──────────────────────────────────────────
const authDoctor = (req, res, next) => {
  if (!req.session.doctorId) return res.redirect('/doctor/login');
  next();
};

// ── Register ─────────────────────────────────────────────────
router.get('/register', (req, res) => res.render('doctor/register', { error: null }));

router.post('/register', upload.single('license'), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (await Doctor.findOne({ email }))
      return res.render('doctor/register', { error: 'Email already registered.' });
    const hashed = await bcrypt.hash(password, 10);
    await Doctor.create({
      name, email, password: hashed,
      license: req.file ? '/uploads/licenses/' + req.file.filename : ''
    });
    res.render('doctor/register-success');
  } catch (err) {
    res.render('doctor/register', { error: 'Error: ' + err.message });
  }
});

// ── Login ─────────────────────────────────────────────────────
router.get('/login', (req, res) => res.render('doctor/login', { error: null }));

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const doctor = await Doctor.findOne({ email });
  if (!doctor)          return res.render('doctor/login', { error: 'Email not found.' });
  if (!doctor.approved) return res.render('doctor/login', { error: 'Your account is pending admin approval.' });
  const ok = await bcrypt.compare(password, doctor.password);
  if (!ok)              return res.render('doctor/login', { error: 'Incorrect password.' });
  req.session.doctorId   = doctor._id;
  req.session.doctorName = doctor.name;
  res.redirect('/doctor/dashboard');
});

// ── Dashboard ─────────────────────────────────────────────────
router.get('/dashboard', authDoctor, (req, res) =>
  res.render('doctor/dashboard', {
    doctorName: req.session.doctorName,
    error: null, message: null
  })
);

// ── Request OTP ───────────────────────────────────────────────
router.post('/request-otp', authDoctor, async (req, res) => {
  const { phone } = req.body;
  const normPhone = normalizePhone(phone);
  // Try normalized first, then raw input
  let patient = await Patient.findOne({ phone: normPhone });
  if (!patient) patient = await Patient.findOne({ phone });
  if (!patient)
    return res.render('doctor/dashboard', {
      doctorName: req.session.doctorName,
      error: 'No patient found with phone: ' + phone + '. Make sure the number is registered.',
      message: null
    });

  const otp = crypto.randomInt(100000, 999999).toString();
  otpStore[normPhone] = { otp, expires: Date.now() + 5 * 60 * 1000 };
  console.log(`\n📱  OTP for ${phone} (${patient.name}) : ${otp}\n`);

  // Send OTP via SMS to the patient's emergency contact number
  const smsResult = await sendOtpSms(patient.emergencyContact, otp, patient.name);

  res.render('doctor/verify-otp', {
    phone: normPhone,
    patientName: patient.name,
    emergencyContact: patient.emergencyContact,
    devOtp: '',  // Never show OTP on website
    smsSent: smsResult.success,
    message: smsResult.success
      ? `OTP sent via SMS to emergency contact (${patient.emergencyContact})`
      : 'OTP generated (SMS not configured — check yellow box below)',
    error: null
  });
});

// ── Verify OTP ────────────────────────────────────────────────
router.post('/verify-otp', authDoctor, async (req, res) => {
  const { phone, otp } = req.body;
  const normPhone = normalizePhone(phone);
  const entry = otpStore[normPhone] || otpStore[phone];

  if (!entry || Date.now() > entry.expires)
    return res.render('doctor/verify-otp', {
      phone, patientName: '', emergencyContact: '', devOtp: '', smsSent: false, message: null,
      error: 'OTP expired. Go back and request a new one.'
    });

  if (entry.otp !== otp)
    return res.render('doctor/verify-otp', {
      phone, patientName: '', emergencyContact: '', devOtp: '', smsSent: false, message: null,
      error: 'Incorrect OTP. Please try again.'
    });

  delete otpStore[normPhone];
  delete otpStore[phone];
  let patient = await Patient.findOne({ phone: normPhone });
  if (!patient) patient = await Patient.findOne({ phone });
  if (!patient)
    return res.render('doctor/verify-otp', {
      phone, patientName: '', emergencyContact: '', devOtp: '', smsSent: false, message: null,
      error: 'Patient record not found. Please check the phone number.'
    });
  const records = await MedicalRecord.find({ patientId: patient._id }).sort({ date: -1 });
  res.render('doctor/patient-full', { patient, records });
});

module.exports = router;
