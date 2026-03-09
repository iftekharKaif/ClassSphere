const express = require('express');

const { query } = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

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

// Get announcements (teacher owner or approved student)
router.get('/classroom/:classroomId', requireAuth, async (req, res) => {
  const classroomId = Number(req.params.classroomId);
  const classRows = await query('SELECT id, teacher_id FROM classrooms WHERE id = ? LIMIT 1', [classroomId]);
  if (!classRows.length) return res.status(404).json({ error: 'Not found' });

  if (req.user.role === 'teacher') {
    if (Number(classRows[0].teacher_id) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  } else {
    if (!(await studentApproved(req.user.id, classroomId))) return res.status(403).json({ error: 'Not approved' });
  }

  const since = req.query.since ? String(req.query.since) : null;
  const rows = since
    ? await query(
        `SELECT a.id, a.message, a.created_at, u.full_name AS created_by
           FROM announcements a JOIN users u ON u.id = a.created_by
          WHERE a.classroom_id = ? AND a.created_at > ?
          ORDER BY a.created_at DESC
          LIMIT 200`,
        [classroomId, since]
      )
    : await query(
        `SELECT a.id, a.message, a.created_at, u.full_name AS created_by
           FROM announcements a JOIN users u ON u.id = a.created_by
          WHERE a.classroom_id = ?
          ORDER BY a.created_at DESC
          LIMIT 200`,
        [classroomId]
      );

  return res.json({ announcements: rows });
});

// Teacher: post announcement
router.post('/classroom/:classroomId', requireAuth, requireRole('teacher'), async (req, res) => {
  const classroomId = Number(req.params.classroomId);
  const { message } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'Message is required' });
  if (!(await teacherOwns(req.user.id, classroomId))) return res.status(403).json({ error: 'Forbidden' });

  const result = await query('INSERT INTO announcements (classroom_id, message, created_by) VALUES (?,?,?)', [
    classroomId,
    String(message).trim(),
    req.user.id,
  ]);
  return res.json({ announcement: { id: result.insertId } });
});

// Teacher: edit announcement message
router.put('/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const announcementId = Number(req.params.id);
  const { message } = req.body || {};
  if (!Number.isFinite(announcementId) || announcementId <= 0) return res.status(400).json({ error: 'Invalid id' });
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'Message is required' });

  const rows = await query(
    `SELECT a.id, a.classroom_id, c.teacher_id
       FROM announcements a
       JOIN classrooms c ON c.id = a.classroom_id
      WHERE a.id = ? LIMIT 1`,
    [announcementId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (Number(rows[0].teacher_id) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const r = await query('UPDATE announcements SET message = ? WHERE id = ?', [String(message).trim(), announcementId]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
  return res.json({ ok: true });
});

// Teacher: delete announcement
router.delete('/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const announcementId = Number(req.params.id);
  if (!Number.isFinite(announcementId) || announcementId <= 0) return res.status(400).json({ error: 'Invalid id' });

  const rows = await query(
    `SELECT a.id, a.classroom_id, c.teacher_id
       FROM announcements a
       JOIN classrooms c ON c.id = a.classroom_id
      WHERE a.id = ? LIMIT 1`,
    [announcementId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (Number(rows[0].teacher_id) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const r = await query('DELETE FROM announcements WHERE id = ?', [announcementId]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
  return res.json({ ok: true });
});

module.exports = router;

