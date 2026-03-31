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

const otpStore = {};

// Multer: license + doctor photo
const licenseDir = path.join(__dirname, '..', 'public', 'uploads', 'licenses');
const docPhotoDir = path.join(__dirname, '..', 'public', 'uploads', 'doctor-photos');
if (!fs.existsSync(licenseDir))   fs.mkdirSync(licenseDir,   { recursive: true });
if (!fs.existsSync(docPhotoDir))  fs.mkdirSync(docPhotoDir,  { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'photo') cb(null, docPhotoDir);
      else cb(null, licenseDir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const authDoctor = (req, res, next) => {
  if (!req.session.doctorId) return res.redirect('/doctor/login');
  next();
};

// Register
router.get('/register', (req, res) => res.render('doctor/register', { error: null }));

router.post('/register', upload.fields([
  { name: 'license', maxCount: 1 },
  { name: 'photo',   maxCount: 1 }
]), async (req, res) => {
  try {
    const { name, email, password, hospitalName } = req.body;
    if (await Doctor.findOne({ email }))
      return res.render('doctor/register', { error: 'Email already registered.' });
    const hashed = await bcrypt.hash(password, 10);
    await Doctor.create({
      name, email, password: hashed,
      hospitalName: hospitalName || '',
      license: req.files && req.files['license'] ? '/uploads/licenses/' + req.files['license'][0].filename : '',
      photo:   req.files && req.files['photo']   ? '/uploads/doctor-photos/' + req.files['photo'][0].filename : ''
    });
    res.render('doctor/register-success');
  } catch (err) {
    res.render('doctor/register', { error: 'Error: ' + err.message });
  }
});

// Login
router.get('/login', (req, res) => res.render('doctor/login', { error: null }));

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const doctor = await Doctor.findOne({ email });
  if (!doctor)          return res.render('doctor/login', { error: 'Email not found.' });
  if (!doctor.approved) return res.render('doctor/login', { error: 'Your account is pending admin approval.' });
  const ok = await bcrypt.compare(password, doctor.password);
  if (!ok)              return res.render('doctor/login', { error: 'Incorrect password.' });
  req.session.doctorId      = doctor._id;
  req.session.doctorName    = doctor.name;
  req.session.doctorPhoto   = doctor.photo || '';
  req.session.doctorHospital = doctor.hospitalName || '';
  res.redirect('/doctor/dashboard');
});

// Logout
router.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/doctor/login'); });

// Dashboard
router.get('/dashboard', authDoctor, (req, res) =>
  res.render('doctor/dashboard', {
    doctorName:     req.session.doctorName,
    doctorPhoto:    req.session.doctorPhoto || '',
    doctorHospital: req.session.doctorHospital || '',
    error: null, message: null
  })
);

// Request OTP
router.post('/request-otp', authDoctor, async (req, res) => {
  const { phone } = req.body;
  const normPhone = normalizePhone(phone);
  let patient = await Patient.findOne({ phone: normPhone });
  if (!patient) patient = await Patient.findOne({ phone });
  if (!patient)
    return res.render('doctor/dashboard', {
      doctorName: req.session.doctorName,
      doctorPhoto: req.session.doctorPhoto || '',
      doctorHospital: req.session.doctorHospital || '',
      error: 'No patient found with phone: ' + phone,
      message: null
    });

  const otp = crypto.randomInt(100000, 999999).toString();
  otpStore[normPhone] = { otp, expires: Date.now() + 5 * 60 * 1000 };
  console.log('\nOTP for ' + phone + ' (' + patient.name + ') : ' + otp + '\n');

  const smsResult = await sendOtpSms(patient.emergencyContact, otp, patient.name);

  res.render('doctor/verify-otp', {
    phone: normPhone,
    patientName: patient.name,
    emergencyContact: patient.emergencyContact,
    devOtp: '',
    smsSent: smsResult.success,
    message: smsResult.success
      ? 'OTP sent via SMS to emergency contact (' + patient.emergencyContact + ')'
      : 'OTP generated - check terminal for code',
    error: null
  });
});

// Verify OTP
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
      error: 'Patient record not found.'
    });
  const records = await MedicalRecord.find({ patientId: patient._id }).sort({ date: -1 });
  res.render('doctor/patient-full', { patient, records });
});

module.exports = router;