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
    cb(null, `file-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

async function teacherOwnsClassroom(teacherId, classroomId) {
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

// List folders for classroom (teacher owner or approved student)
router.get('/classroom/:classroomId', requireAuth, async (req, res) => {
  const classroomId = Number(req.params.classroomId);
  const classes = await query('SELECT id, teacher_id FROM classrooms WHERE id = ? LIMIT 1', [classroomId]);
  if (!classes.length) return res.status(404).json({ error: 'Not found' });

  if (req.user.role === 'teacher') {
    if (Number(classes[0].teacher_id) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  } else {
    if (!(await studentApproved(req.user.id, classroomId))) return res.status(403).json({ error: 'Not approved' });
  }

  const rows = await query('SELECT id, name, created_at, updated_at FROM folders WHERE classroom_id = ? ORDER BY name ASC', [classroomId]);
  return res.json({ folders: rows });
});

// Teacher: create folder
router.post('/', requireAuth, requireRole('teacher'), async (req, res) => {
  const { classroomId, name } = req.body || {};
  const cid = Number(classroomId);
  if (!cid || !name) return res.status(400).json({ error: 'Missing classroomId or name' });
  if (!(await teacherOwnsClassroom(req.user.id, cid))) return res.status(403).json({ error: 'Forbidden' });

  const result = await query('INSERT INTO folders (classroom_id, name) VALUES (?,?)', [cid, name]);
  return res.json({ folder: { id: result.insertId, classroom_id: cid, name } });
});

// Teacher: rename folder
router.patch('/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Missing name' });

  const rows = await query(
    'SELECT f.id, f.classroom_id, c.teacher_id FROM folders f JOIN classrooms c ON c.id = f.classroom_id WHERE f.id = ? LIMIT 1',
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (Number(rows[0].teacher_id) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  await query('UPDATE folders SET name = ? WHERE id = ?', [name, id]);
  return res.json({ ok: true });
});

// Teacher: delete folder (cascade deletes materials)
router.delete('/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const id = Number(req.params.id);
  const rows = await query(
    'SELECT f.id, c.teacher_id FROM folders f JOIN classrooms c ON c.id = f.classroom_id WHERE f.id = ? LIMIT 1',
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (Number(rows[0].teacher_id) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  await query('DELETE FROM folders WHERE id = ?', [id]);
  return res.json({ ok: true });
});

// List materials in a folder (teacher owner or approved student)
router.get('/:id/materials', requireAuth, async (req, res) => {
  const folderId = Number(req.params.id);
  const rows = await query(
    `SELECT f.id AS folder_id, f.classroom_id, c.teacher_id
       FROM folders f
       JOIN classrooms c ON c.id = f.classroom_id
      WHERE f.id = ? LIMIT 1`,
    [folderId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });

  const { classroom_id: classroomId, teacher_id: teacherId } = rows[0];
  if (req.user.role === 'teacher') {
    if (Number(teacherId) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  } else {
    if (!(await studentApproved(req.user.id, Number(classroomId)))) return res.status(403).json({ error: 'Not approved' });
  }

  const items = await query(
    'SELECT id, type, title, url_or_path, created_at FROM materials WHERE folder_id = ? ORDER BY created_at DESC',
    [folderId]
  );
  return res.json({ materials: items });
});

// Teacher: add material (file OR link)
router.post('/:id/materials', requireAuth, requireRole('teacher'), upload.single('file'), async (req, res) => {
  const folderId = Number(req.params.id);
  const folderRows = await query(
    `SELECT f.id, f.classroom_id, f.name AS folder_name, c.teacher_id
       FROM folders f JOIN classrooms c ON c.id = f.classroom_id
      WHERE f.id = ? LIMIT 1`,
    [folderId]
  );
  if (!folderRows.length) return res.status(404).json({ error: 'Folder not found' });
  if (Number(folderRows[0].teacher_id) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const { title, link } = req.body || {};
  if (req.file) {
    const t = title || req.file.originalname || 'File';
    const p = `/uploads/${req.file.filename}`;
    const result = await query(
      "INSERT INTO materials (folder_id, type, title, url_or_path, uploaded_by) VALUES (?,?,?,?,?)",
      [folderId, 'file', t, p, req.user.id]
    );
    // Auto-create an announcement for this upload
    const folderName = folderRows[0].folder_name || 'a folder';
    const when = new Date().toISOString();
    const message = `${t} has been uploaded in ${folderName} folder at ${when}.`;
    await query('INSERT INTO announcements (classroom_id, message, created_by) VALUES (?,?,?)', [
      folderRows[0].classroom_id,
      message,
      req.user.id,
    ]);

    return res.json({ material: { id: result.insertId, type: 'file', title: t, url_or_path: p } });
  }

  const url = String(link || '').trim();
  if (!url) return res.status(400).json({ error: 'Provide a file or a link' });
  const t = title || 'Link';
  const result = await query(
    "INSERT INTO materials (folder_id, type, title, url_or_path, uploaded_by) VALUES (?,?,?,?,?)",
    [folderId, 'link', t, url, req.user.id]
  );
  return res.json({ material: { id: result.insertId, type: 'link', title: t, url_or_path: url } });
});

// Teacher: delete a single material from a folder
router.delete('/materials/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const materialId = Number(req.params.id);
  if (!materialId) return res.status(400).json({ error: 'Invalid material id' });

  const rows = await query(
    `SELECT m.id, f.classroom_id, c.teacher_id
       FROM materials m
       JOIN folders f ON f.id = m.folder_id
       JOIN classrooms c ON c.id = f.classroom_id
      WHERE m.id = ? LIMIT 1`,
    [materialId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (Number(rows[0].teacher_id) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  await query('DELETE FROM materials WHERE id = ?', [materialId]);
  return res.json({ ok: true });
});

module.exports = router;

