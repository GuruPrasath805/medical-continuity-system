const express       = require('express');
const router        = express.Router();
const multer        = require('multer');
const path          = require('path');
const fs            = require('fs');
const Doctor        = require('../models/Doctor');
const Patient       = require('../models/Patient');
const MedicalRecord = require('../models/MedicalRecord');
const { sendDoctorApprovalEmail } = require('../utils/mailer');
const { normalizePhone } = require('../utils/phone');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

const authAdmin = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
};

const reportDir = path.join(__dirname, '..', 'public', 'uploads', 'reports');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, reportDir),
    filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  })
});

router.get('/login',  (req, res) => res.render('admin/login', { error: null }));
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.redirect('/admin/patients');
  }
  res.render('admin/login', { error: 'Invalid credentials. Please try again.' });
});
router.get('/logout', (req, res) => { req.session.isAdmin = false; res.redirect('/admin/login'); });
router.get('/', authAdmin, (req, res) => res.redirect('/admin/patients'));

// ── PATIENTS ─────────────────────────────────────────────────
router.get('/patients', authAdmin, async (req, res) => {
  const patients = await Patient.find().sort({ createdAt: -1 });
  res.render('admin/patients', { patients });
});

router.get('/patient/:id', authAdmin, async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  const records = await MedicalRecord.find({ patientId: req.params.id }).sort({ date: -1 });
  res.render('admin/patient-detail', { patient, records });
});

router.get('/patient/:id/add-record', authAdmin, async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  res.render('admin/add-record', { patient, error: null });
});

router.post('/patient/:id/add-record', authAdmin, upload.single('reportImage'), async (req, res) => {
  const { title, description } = req.body;
  await MedicalRecord.create({
    patientId:   req.params.id,
    title:       title || 'Report',
    description: description || '',
    reportImage: req.file ? '/uploads/reports/' + req.file.filename : ''
  });
  res.redirect('/admin/patient/' + req.params.id);
});

// ── DELETE PATIENT ────────────────────────────────────────────
router.post('/patient/:id/delete', authAdmin, async (req, res) => {
  try {
    await MedicalRecord.deleteMany({ patientId: req.params.id });
    await Patient.findByIdAndDelete(req.params.id);
    res.redirect('/admin/patients');
  } catch (err) {
    console.error('Delete patient error:', err);
    res.redirect('/admin/patients');
  }
});

router.post('/record/:id/delete', authAdmin, async (req, res) => {
  const rec = await MedicalRecord.findById(req.params.id);
  const pid = rec ? rec.patientId : '';
  await MedicalRecord.findByIdAndDelete(req.params.id);
  res.redirect('/admin/patient/' + pid);
});

// ── DOCTORS ───────────────────────────────────────────────────
router.get('/doctors', authAdmin, async (req, res) => {
  const pending  = await Doctor.find({ approved: false });
  const approved = await Doctor.find({ approved: true });
  res.render('admin/doctors', { pending, approved });
});

// Approve doctor + send email
router.post('/doctors/approve/:id', authAdmin, async (req, res) => {
  try {
    const doc = await Doctor.findByIdAndUpdate(req.params.id, { approved: true }, { new: true });
    if (doc) {
      await sendDoctorApprovalEmail(doc.email, doc.name);
    }
  } catch (err) {
    console.error('Approve error:', err.message);
  }
  res.redirect('/admin/doctors');
});

router.post('/doctors/remove/:id', authAdmin, async (req, res) => {
  await Doctor.findByIdAndDelete(req.params.id);
  res.redirect('/admin/doctors');
});

router.post('/doctors/reject/:id', authAdmin, async (req, res) => {
  await Doctor.findByIdAndDelete(req.params.id);
  res.redirect('/admin/doctors');
});

module.exports = router;
