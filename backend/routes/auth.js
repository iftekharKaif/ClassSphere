const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

const { query } = require('../db');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '';
    cb(null, `profile-${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.post('/register', upload.single('profile'), async (req, res) => {
  const { fullName, email, password } = req.body || {};
  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existing = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const password_hash = await bcrypt.hash(String(password), 12);
  const profile_path = req.file ? `/uploads/${req.file.filename}` : null;

  const result = await query(
    'INSERT INTO users (full_name, email, password_hash, profile_path) VALUES (?,?,?,?)',
    [fullName, email, password_hash, profile_path]
  );

  // We no longer auto-log the user in after registration; frontend redirects
  // to the login page where the user chooses to join as student/teacher.
  return res.status(201).json({ ok: true });
});

router.post('/login', async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

  const users = await query(
    'SELECT id, full_name, email, password_hash, profile_path FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  if (!users.length) return res.status(401).json({ error: 'Invalid email or password' });

  const user = users[0];

  const ok = await bcrypt.compare(String(password), String(user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const normalizedRole = role && typeof role === 'string' ? role.toLowerCase() : null;
  const sessionRole = normalizedRole === 'teacher' || normalizedRole === 'student' ? normalizedRole : 'student';

  // Sign token with the chosen session role (student/teacher).
  const token = signToken({ ...user, role: sessionRole });
  return res.json({
    token,
    user: {
      id: user.id,
      role: sessionRole,
      email: user.email,
      fullName: user.full_name,
      profilePath: user.profile_path,
    },
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const rows = await query('SELECT id, full_name, email, profile_path FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  const u = rows[0];
  // Expose the active session role from the token instead of the stored DB role
  // so frontend always sees the portal (student/teacher) it logged into.
  return res.json({
    id: u.id,
    role: req.user.role,
    fullName: u.full_name,
    email: u.email,
    profilePath: u.profile_path,
  });
});

// Change password
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  // Get current user
  const users = await query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  if (!users.length) return res.status(404).json({ error: 'User not found' });

  const user = users[0];
  const ok = await bcrypt.compare(String(currentPassword), String(user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  const newHash = await bcrypt.hash(String(newPassword), 12);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

  return res.json({ ok: true });
});

module.exports = router;

