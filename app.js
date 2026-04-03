require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// ── Connect MongoDB ─────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB Error:', err);
    process.exit(1);
  });

// ── View Engine ─────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Middleware ───────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve public folder
app.use(express.static(path.join(__dirname, 'public')));

// VERY IMPORTANT: serve uploaded files and QR files explicitly
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/qrcodes', express.static(path.join(__dirname, 'public', 'qrcodes')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// ── Make BASE_URL available in every EJS template ───────────
app.use((req, res, next) => {
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.locals.BASE_URL = baseUrl;
  next();
});

// ── Routes ───────────────────────────────────────────────────
app.use('/', require('./routes/index'));
app.use('/patient', require('./routes/patient'));
app.use('/doctor', require('./routes/doctor'));
app.use('/admin', require('./routes/admin'));

// ── 404 ──────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).send('<h2>404 - Page Not Found</h2><a href="/">Home</a>')
);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀  Server running on port ${PORT}`);
  console.log(`🔐  Admin  → /admin/login  (admin / admin123)\n`);
});