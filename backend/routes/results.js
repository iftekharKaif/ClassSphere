const express = require('express');
const multer = require('multer');
const path = require('path');

const { query } = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `result-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

async function teacherOwns(teacherId, classroomId) {
  const rows = await query('SELECT id FROM classrooms WHERE id = ? AND teacher_id = ? LIMIT 1', [classroomId, teacherId]);
  return rows.length > 0;
}

async function studentApproved(studentId, classroomId) {
  const rows = await query(
    "SELECT id FROM classroom_memberships WHERE classroom_id = ? AND student_id = ? AND status = 'approved' LIMIT 1",
    [classroomId, studentId]
  );
  return rows.length > 0;
}

// List results (teacher owner or approved student)
router.get('/classroom/:classroomId', requireAuth, async (req, res) => {
  const classroomId = Number(req.params.classroomId);
  const classRows = await query('SELECT id, teacher_id FROM classrooms WHERE id = ? LIMIT 1', [classroomId]);
  if (!classRows.length) return res.status(404).json({ error: 'Not found' });

  if (req.user.role === 'teacher') {
    if (Number(classRows[0].teacher_id) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  } else {
    if (!(await studentApproved(req.user.id, classroomId))) return res.status(403).json({ error: 'Not approved' });
  }

  const rows = await query(
    `SELECT id, title, file_path, created_at
       FROM results
      WHERE classroom_id = ?
      ORDER BY created_at DESC
      LIMIT 200`,
    [classroomId]
  );
  return res.json({ results: rows });
});

// Teacher: upload result file
router.post('/classroom/:classroomId', requireAuth, requireRole('teacher'), upload.single('file'), async (req, res) => {
  const classroomId = Number(req.params.classroomId);
  if (!(await teacherOwns(req.user.id, classroomId))) return res.status(403).json({ error: 'Forbidden' });
  if (!req.file) return res.status(400).json({ error: 'Missing file' });

  const { title } = req.body || {};
  const t = title || req.file.originalname || 'Result file';
  const p = `/uploads/${req.file.filename}`;

  const result = await query('INSERT INTO results (classroom_id, title, file_path, uploaded_by) VALUES (?,?,?,?)', [
    classroomId,
    t,
    p,
    req.user.id,
  ]);
  return res.json({ result: { id: result.insertId, title: t, file_path: p } });
});

// Teacher: delete result
router.delete('/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const resultId = Number(req.params.id);
  const rows = await query(
    `SELECT r.id, r.classroom_id, r.file_path, c.teacher_id
       FROM results r
       JOIN classrooms c ON c.id = r.classroom_id
      WHERE r.id = ? LIMIT 1`,
    [resultId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const row = rows[0];
  if (Number(row.teacher_id) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  await query('DELETE FROM results WHERE id = ?', [resultId]);
  return res.json({ ok: true });
});

module.exports = router;

