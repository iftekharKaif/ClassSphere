const express = require('express');

const { query } = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

function randomJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function ensureTeacherOwnsClassroom(teacherId, classroomId) {
  const rows = await query('SELECT id FROM classrooms WHERE id = ? AND teacher_id = ? LIMIT 1', [classroomId, teacherId]);
  return rows.length > 0;
}

async function ensureStudentApproved(studentId, classroomId) {
  const rows = await query(
    "SELECT id FROM classroom_memberships WHERE classroom_id = ? AND student_id = ? AND status = 'approved' LIMIT 1",
    [classroomId, studentId]
  );
  return rows.length > 0;
}

// Teacher: list own classrooms
router.get('/', requireAuth, async (req, res) => {
  if (req.user.role === 'teacher') {
    const rows = await query(
      'SELECT id, name, section, subject, room, join_code, auto_approve_enabled, roll_min, roll_max, created_at FROM classrooms WHERE teacher_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    return res.json({ classrooms: rows });
  }

  // Student: list joined/approved + pending
  const rows = await query(
    `SELECT c.id, c.name, c.section, c.subject, c.room, c.join_code,
            m.status, m.roll_id, m.requested_at, m.approved_at,
            u.full_name AS teacher_name
       FROM classroom_memberships m
       JOIN classrooms c ON c.id = m.classroom_id
       JOIN users u ON u.id = c.teacher_id
      WHERE m.student_id = ?
      ORDER BY m.requested_at DESC`,
    [req.user.id]
  );
  return res.json({ classrooms: rows });
});

// Teacher: create classroom
router.post('/', requireAuth, requireRole('teacher'), async (req, res) => {
  const { name, section, subject, room, autoApproveEnabled, rollMin, rollMax } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Class name is required' });

  let joinCode = randomJoinCode();
  // Try a few times to avoid collisions
  for (let i = 0; i < 5; i++) {
    const exists = await query('SELECT id FROM classrooms WHERE join_code = ? LIMIT 1', [joinCode]);
    if (!exists.length) break;
    joinCode = randomJoinCode();
  }

  const auto = autoApproveEnabled ? 1 : 0;
  const rMin = rollMin !== undefined && rollMin !== null && rollMin !== '' ? Number(rollMin) : null;
  const rMax = rollMax !== undefined && rollMax !== null && rollMax !== '' ? Number(rollMax) : null;

  const result = await query(
    'INSERT INTO classrooms (teacher_id, name, section, subject, room, join_code, auto_approve_enabled, roll_min, roll_max) VALUES (?,?,?,?,?,?,?,?,?)',
    [req.user.id, name, section || null, subject || null, room || null, joinCode, auto, rMin, rMax]
  );

  return res.json({
    classroom: {
      id: result.insertId,
      name,
      section: section || null,
      subject: subject || null,
      room: room || null,
      join_code: joinCode,
      auto_approve_enabled: auto,
      roll_min: rMin,
      roll_max: rMax,
    },
  });
});

// Teacher: delete classroom (cascade deletes)
router.delete('/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const id = Number(req.params.id);
  if (!(await ensureTeacherOwnsClassroom(req.user.id, id))) return res.status(404).json({ error: 'Not found' });

  await query('DELETE FROM classrooms WHERE id = ? AND teacher_id = ?', [id, req.user.id]);
  return res.json({ ok: true });
});

// Student: join classroom by code + rollId (creates pending, auto-approves if enabled and in range)
router.post('/join', requireAuth, requireRole('student'), async (req, res) => {
  const { code, rollId } = req.body || {};
  const joinCode = String(code || '').trim().toUpperCase();
  const roll = String(rollId || '').trim();
  if (!/^[A-Z0-9]{5,12}$/.test(joinCode)) return res.status(400).json({ error: 'Invalid class code' });
  if (!roll) return res.status(400).json({ error: 'Roll ID is required' });

  const classrooms = await query(
    'SELECT id, teacher_id, auto_approve_enabled, roll_min, roll_max, name FROM classrooms WHERE join_code = ? LIMIT 1',
    [joinCode]
  );
  if (!classrooms.length) return res.status(404).json({ error: 'Class not found' });
  const classroom = classrooms[0];

  const existing = await query(
    'SELECT id, status FROM classroom_memberships WHERE classroom_id = ? AND student_id = ? LIMIT 1',
    [classroom.id, req.user.id]
  );
  if (existing.length) return res.status(409).json({ error: `Already requested/joined (status: ${existing[0].status})` });

  const rollTaken = await query(
    'SELECT id FROM classroom_memberships WHERE classroom_id = ? AND roll_id = ? LIMIT 1',
    [classroom.id, roll]
  );
  if (rollTaken.length) {
    return res.status(400).json({ error: 'The roll already exists in this classroom.' });
  }

  const rollNum = Number(roll);
  const canAuto =
    classroom.auto_approve_enabled === 1 &&
    Number.isFinite(rollNum) &&
    (classroom.roll_min === null || rollNum >= Number(classroom.roll_min)) &&
    (classroom.roll_max === null || rollNum <= Number(classroom.roll_max));

  const status = canAuto ? 'approved' : 'pending';
  const approvedAt = canAuto ? new Date() : null;

  try {
    const result = await query(
      "INSERT INTO classroom_memberships (classroom_id, student_id, roll_id, status, approved_at) VALUES (?,?,?,?,?)",
      [classroom.id, req.user.id, roll, status, approvedAt]
    );
    return res.json({
      membership: {
        id: result.insertId,
        classroomId: classroom.id,
        classroomName: classroom.name,
        status,
        rollId: roll,
      },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      return res.status(400).json({ error: 'The roll already exists in this classroom.' });
    }
    throw err;
  }
});

// Student: leave classroom (delete membership)
router.delete('/:id/leave', requireAuth, requireRole('student'), async (req, res) => {
  const classroomId = Number(req.params.id);
  await query('DELETE FROM classroom_memberships WHERE classroom_id = ? AND student_id = ?', [classroomId, req.user.id]);
  return res.json({ ok: true });
});

// Teacher: pending join requests
router.get('/:id/requests', requireAuth, requireRole('teacher'), async (req, res) => {
  const classroomId = Number(req.params.id);
  if (!(await ensureTeacherOwnsClassroom(req.user.id, classroomId))) return res.status(404).json({ error: 'Not found' });

  const rows = await query(
    `SELECT m.id, m.roll_id, m.requested_at, u.id AS student_id, u.full_name, u.email, u.profile_path
       FROM classroom_memberships m
       JOIN users u ON u.id = m.student_id
      WHERE m.classroom_id = ? AND m.status = 'pending'
      ORDER BY m.requested_at ASC`,
    [classroomId]
  );
  return res.json({ requests: rows });
});

// Teacher: approve request (must be defined before generic /:id to match)
router.post('/:id/requests/:requestId/approve', requireAuth, requireRole('teacher'), async (req, res) => {
  const classroomId = Number(req.params.id);
  const requestId = Number(req.params.requestId);
  if (!Number.isFinite(classroomId) || !Number.isFinite(requestId)) return res.status(400).json({ error: 'Invalid request' });
  if (!(await ensureTeacherOwnsClassroom(req.user.id, classroomId))) return res.status(404).json({ error: 'Not found' });

  const r = await query(
    "UPDATE classroom_memberships SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE id = ? AND classroom_id = ? AND status = 'pending'",
    [requestId, classroomId]
  );
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Request not found or already processed' });
  return res.json({ ok: true });
});

// Teacher: reject request
router.post('/:id/requests/:requestId/reject', requireAuth, requireRole('teacher'), async (req, res) => {
  const classroomId = Number(req.params.id);
  const requestId = Number(req.params.requestId);
  if (!Number.isFinite(classroomId) || !Number.isFinite(requestId)) return res.status(400).json({ error: 'Invalid request' });
  if (!(await ensureTeacherOwnsClassroom(req.user.id, classroomId))) return res.status(404).json({ error: 'Not found' });

  const r = await query(
    "UPDATE classroom_memberships SET status = 'rejected' WHERE id = ? AND classroom_id = ? AND status = 'pending'",
    [requestId, classroomId]
  );
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Request not found or already processed' });
  return res.json({ ok: true });
});

// Teacher: list approved students in a classroom
router.get('/:id/students', requireAuth, requireRole('teacher'), async (req, res) => {
  const classroomId = Number(req.params.id);
  if (!(await ensureTeacherOwnsClassroom(req.user.id, classroomId))) return res.status(404).json({ error: 'Not found' });

  const rows = await query(
    `SELECT m.student_id AS id,
            m.roll_id,
            m.status,
            m.approved_at,
            u.full_name,
            u.email,
            u.profile_path
       FROM classroom_memberships m
       JOIN users u ON u.id = m.student_id
      WHERE m.classroom_id = ? AND m.status = 'approved'
      ORDER BY m.roll_id ASC, u.full_name ASC`,
    [classroomId]
  );

  return res.json({ students: rows });
});

// Teacher: kick student (remove membership)
router.delete('/:id/students/:studentId', requireAuth, requireRole('teacher'), async (req, res) => {
  const classroomId = Number(req.params.id);
  const studentId = Number(req.params.studentId);
  if (!(await ensureTeacherOwnsClassroom(req.user.id, classroomId))) return res.status(404).json({ error: 'Not found' });

  await query('DELETE FROM classroom_memberships WHERE classroom_id = ? AND student_id = ?', [classroomId, studentId]);
  return res.json({ ok: true });
});

// Teacher/Student: classroom detail (teacher owns OR student approved)
router.get('/:id', requireAuth, async (req, res) => {
  const classroomId = Number(req.params.id);
  const rows = await query(
    `SELECT c.id, c.teacher_id, c.name, c.section, c.subject, c.room, c.join_code,
            c.auto_approve_enabled, c.roll_min, c.roll_max, u.full_name AS teacher_name
       FROM classrooms c
       LEFT JOIN users u ON u.id = c.teacher_id
      WHERE c.id = ? LIMIT 1`,
    [classroomId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const classroom = rows[0];

  if (req.user.role === 'teacher') {
    if (Number(classroom.teacher_id) !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    return res.json({ classroom });
  }

  if (!(await ensureStudentApproved(req.user.id, classroomId))) return res.status(403).json({ error: 'Not approved' });
  return res.json({ classroom });
});

module.exports = router;

