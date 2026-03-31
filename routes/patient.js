const express  = require('express');
const router   = express.Router();
const QRCode   = require('qrcode');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const { v4: uuidv4 } = require('uuid');
const Patient  = require('../models/Patient');
const { normalizePhone } = require('../utils/phone');

// ── Multer ───────────────────────────────────────────────────
const photoDir = path.join(__dirname, '..', 'public', 'uploads', 'photos');
if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });
const reportDir = path.join(__dirname, '..', 'public', 'uploads', 'reports');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'photo') cb(null, photoDir);
      else cb(null, reportDir);
    },
    filename: (req, file, cb) =>
      cb(null, Date.now() + '_' + Math.random().toString(36).slice(2) + path.extname(file.originalname))
  })
});

// GET register
router.get('/register', (req, res) => res.render('patient/register', { error: null }));

// POST register
router.post('/register',
  upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'reportFiles', maxCount: 10 }]),
  async (req, res) => {
    try {
      const {
        name, phone, dateOfBirth, gender, bloodGroup, address,
        emergencyName, emergencyContact, emergencyRelation,
        allergies, chronicDiseases,
        medicineName, medicineDosage, medicineDuration, medicineReason,
        historyDate, historyHospital, historyDiagnosis, historyTreatment, historyDoctor
      } = req.body;

      // Normalize phones for consistent storage
      const normPhone    = normalizePhone(phone);
      const normEmergency = normalizePhone(emergencyContact);

      const exists = await Patient.findOne({ phone: normPhone });
      if (exists) return res.render('patient/register', { error: 'This phone number is already registered.' });

      // Build medicines
      const medicines = [];
      if (medicineName) {
        const names = Array.isArray(medicineName) ? medicineName : [medicineName];
        names.forEach((n, i) => {
          if (n && n.trim()) {
            medicines.push({
              name:     n,
              dosage:   Array.isArray(medicineDosage)   ? medicineDosage[i]   : medicineDosage   || '',
              duration: Array.isArray(medicineDuration) ? medicineDuration[i] : medicineDuration || '',
              reason:   Array.isArray(medicineReason)   ? medicineReason[i]   : medicineReason   || ''
            });
          }
        });
      }

      // Build history
      const medicalHistory = [];
      if (historyDate) {
        const dates = Array.isArray(historyDate) ? historyDate : [historyDate];
        dates.forEach((d, i) => {
          if (d && d.trim()) {
            medicalHistory.push({
              date:      d,
              hospital:  Array.isArray(historyHospital)  ? historyHospital[i]  : historyHospital  || '',
              diagnosis: Array.isArray(historyDiagnosis) ? historyDiagnosis[i] : historyDiagnosis || '',
              treatment: Array.isArray(historyTreatment) ? historyTreatment[i] : historyTreatment || '',
              doctor:    Array.isArray(historyDoctor)    ? historyDoctor[i]    : historyDoctor    || ''
            });
          }
        });
      }

      const qrToken = uuidv4();

      const patient = new Patient({
        name, phone: normPhone, dateOfBirth, gender, bloodGroup, address,
        emergencyName,
        emergencyContact: normEmergency,
        emergencyRelation, allergies, chronicDiseases,
        medicines, medicalHistory,
        photo: req.files && req.files['photo'] ? '/uploads/photos/' + req.files['photo'][0].filename : '',
        qrToken
      });
      await patient.save();

      // Generate QR
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const qrUrl   = `${baseUrl}/patient/emergency/${qrToken}`;
      const qrDir   = path.join(__dirname, '..', 'public', 'qrcodes');
      if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
      await QRCode.toFile(path.join(qrDir, patient._id + '.png'), qrUrl, { width: 300, margin: 2 });
      patient.qrCode = '/qrcodes/' + patient._id + '.png';

      // Save uploaded reports
      const reportFiles = req.files && req.files['reportFiles'] ? req.files['reportFiles'] : [];
      const reportTitles = req.body.reportTitle
        ? (Array.isArray(req.body.reportTitle) ? req.body.reportTitle : [req.body.reportTitle]) : [];
      const reportDescs = req.body.reportDescription
        ? (Array.isArray(req.body.reportDescription) ? req.body.reportDescription : [req.body.reportDescription]) : [];
      reportFiles.forEach((file, i) => {
        patient.reports.push({
          title:       reportTitles[i] || 'Medical Report',
          description: reportDescs[i]  || '',
          fileUrl:     '/uploads/reports/' + file.filename
        });
      });

      await patient.save();
      res.render('patient/success', { patient });
    } catch (err) {
      console.error(err);
      res.render('patient/register', { error: 'Server error: ' + err.message });
    }
  }
);

// PUBLIC Emergency page
router.get('/emergency/:token', async (req, res) => {
  try {
    const patient = await Patient.findOne({ qrToken: req.params.token });
    if (!patient) return res.render('patient/emergency-notfound');
    res.render('patient/emergency-public', { patient });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Patient Dashboard — normalize phone for lookup
router.get('/dashboard/:phone', async (req, res) => {
  try {
    const normPhone = normalizePhone(req.params.phone);
    // Try normalized first, then raw
    let patient = await Patient.findOne({ phone: normPhone });
    if (!patient) patient = await Patient.findOne({ phone: req.params.phone });
    if (!patient) return res.render('patient/register', { error: 'No patient found with this phone number. Please register first.' });
    res.render('patient/dashboard', { patient, error: null, success: null });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Patient uploads report
const reportUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '..', 'public', 'uploads', 'reports');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
  })
});

router.post('/upload-report/:phone', reportUpload.single('reportFile'), async (req, res) => {
  try {
    const normPhone = normalizePhone(req.params.phone);
    let patient = await Patient.findOne({ phone: normPhone });
    if (!patient) patient = await Patient.findOne({ phone: req.params.phone });
    if (!patient) return res.redirect('/patient/register');
    const { title, description } = req.body;
    patient.reports.push({
      title:       title || 'My Report',
      description: description || '',
      fileUrl:     req.file ? '/uploads/reports/' + req.file.filename : ''
    });
    await patient.save();
    res.render('patient/dashboard', { patient, error: null, success: 'Report uploaded successfully!' });
  } catch (err) {
    res.render('patient/dashboard', { patient: null, error: 'Upload failed: ' + err.message, success: null });
  }
});

module.exports = router;

// ── Update patient medical details ───────────────────────────
router.get('/update/:phone', async (req, res) => {
  try {
    const normPhone = normalizePhone(req.params.phone);
    let patient = await Patient.findOne({ phone: normPhone });
    if (!patient) patient = await Patient.findOne({ phone: req.params.phone });
    if (!patient) return res.redirect('/patient/register');
    res.render('patient/update', { patient, error: null, success: null });
  } catch (err) {
    res.status(500).send('Server error: ' + err.message);
  }
});

router.post('/update/:phone', async (req, res) => {
  try {
    const normPhone = normalizePhone(req.params.phone);
    let patient = await Patient.findOne({ phone: normPhone });
    if (!patient) patient = await Patient.findOne({ phone: req.params.phone });
    if (!patient) return res.redirect('/patient/register');

    const {
      emergencyName, emergencyContact, emergencyRelation,
      allergies, chronicDiseases,
      medicineName, medicineDosage, medicineDuration, medicineReason,
      historyDate, historyHospital, historyDiagnosis, historyTreatment, historyDoctor
    } = req.body;

    // Update emergency contact
    patient.emergencyName     = emergencyName || patient.emergencyName;
    patient.emergencyContact  = normalizePhone(emergencyContact) || patient.emergencyContact;
    patient.emergencyRelation = emergencyRelation || patient.emergencyRelation;
    patient.allergies         = allergies || '';
    patient.chronicDiseases   = chronicDiseases || '';

    // Rebuild medicines
    const medicines = [];
    if (medicineName) {
      const names = Array.isArray(medicineName) ? medicineName : [medicineName];
      names.forEach((n, i) => {
        if (n && n.trim()) {
          medicines.push({
            name:     n,
            dosage:   Array.isArray(medicineDosage)   ? medicineDosage[i]   : medicineDosage   || '',
            duration: Array.isArray(medicineDuration) ? medicineDuration[i] : medicineDuration || '',
            reason:   Array.isArray(medicineReason)   ? medicineReason[i]   : medicineReason   || ''
          });
        }
      });
    }
    patient.medicines = medicines;

    // Rebuild history
    const medicalHistory = [];
    if (historyDate) {
      const dates = Array.isArray(historyDate) ? historyDate : [historyDate];
      dates.forEach((d, i) => {
        if (d && d.trim()) {
          medicalHistory.push({
            date:      d,
            hospital:  Array.isArray(historyHospital)  ? historyHospital[i]  : historyHospital  || '',
            diagnosis: Array.isArray(historyDiagnosis) ? historyDiagnosis[i] : historyDiagnosis || '',
            treatment: Array.isArray(historyTreatment) ? historyTreatment[i] : historyTreatment || '',
            doctor:    Array.isArray(historyDoctor)    ? historyDoctor[i]    : historyDoctor    || ''
          });
        }
      });
    }
    patient.medicalHistory = medicalHistory;

    await patient.save();
    res.render('patient/update', { patient, error: null, success: 'Medical details updated successfully!' });
  } catch (err) {
    res.render('patient/update', { patient: null, error: 'Update failed: ' + err.message, success: null });
  }
});