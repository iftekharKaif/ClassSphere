let currentFolderId = null;

// Fake database
let folderData = {1: [], 2: [], 3: []};

function _escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
/** Red warning dialog for delete/remove. Returns a Promise<boolean>: true = confirm, false = cancel. */
function showDeleteConfirm(options) {
  const title = options.title != null ? options.title : 'Confirm';
  const message = options.message != null ? options.message : 'Are you sure you want to delete?';
  return new Promise((resolve) => {
    let el = document.getElementById('cs-delete-confirm-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cs-delete-confirm-root';
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div class="cs-delete-confirm-backdrop" id="cs-delete-confirm-backdrop">
        <div class="cs-delete-confirm-box">
          <h3 class="cs-delete-confirm-title">${_escapeHtml(title)}</h3>
          <p class="cs-delete-confirm-message">${_escapeHtml(message)}</p>
          <div class="cs-delete-confirm-actions">
            <button type="button" class="cs-delete-confirm-cancel" id="cs-delete-confirm-cancel">Cancel</button>
            <button type="button" class="cs-delete-confirm-ok" id="cs-delete-confirm-ok">Yes, delete</button>
          </div>
        </div>
      </div>
    `;
    const backdrop = document.getElementById('cs-delete-confirm-backdrop');
    const cancelBtn = document.getElementById('cs-delete-confirm-cancel');
    const okBtn = document.getElementById('cs-delete-confirm-ok');
    function finish(confirmed) {
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      resolve(confirmed);
    }
    cancelBtn.addEventListener('click', () => finish(false));
    okBtn.addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(false); });
  });
}

// Open upload modal
function openUploadModal(folderId) {
  currentFolderId = folderId;
  document.getElementById("uploadModal").style.display = "block";
  document.getElementById("fileInput").value = '';
  document.getElementById("linkInput").value = '';
}

// Close upload modal
function closeModal() { document.getElementById("uploadModal").style.display = "none"; }

// Save attachment
function saveAttachment() {
  const file = document.getElementById("fileInput").files[0];
  const link = document.getElementById("linkInput").value;

  if (file) folderData[currentFolderId].push(file.name);
  if (link) folderData[currentFolderId].push(link);

  alert("Attachment Added");
  closeModal();
}

// View folder contents
function viewFolder(folderId) {
  const items = folderData[folderId];
  const list = document.getElementById('folderItems');
  list.innerHTML = '';
  if(items.length === 0){
    list.innerHTML = '<li>No content inside</li>';
  } else {
    items.forEach(i => list.innerHTML += `<li>${i}</li>`);
  }
  document.getElementById('viewModal').style.display = 'block';
}

// Close view modal
function closeViewModal() { document.getElementById('viewModal').style.display = 'none'; }

// Delete folder
async function deleteFolder(btn) {
  const ok = await showDeleteConfirm({ message: 'Are you sure you want to delete this folder?' });
  if (!ok) return;
  const id = btn.closest('.folder-card').getAttribute('data-id');
  delete folderData[id];
  btn.closest('.folder-card').remove();
}

// Inline + card logic
function showNewFolderInput() {
  const addCard = document.querySelector('.add-new-folder');
  addCard.innerHTML = `<input type="text" id="newFolderInput" placeholder="Folder Name" style="width: 80%; padding:4px;">`;

  const input = document.getElementById('newFolderInput');
  input.focus();

  // Press Enter to create folder
  input.addEventListener('keypress', function handler(e){
    if(e.key==='Enter'){
      const folderName = input.value.trim();
      if(folderName) addNewFolder(folderName);
    }
  });
}

// Add new folder dynamically
function addNewFolder(name){
  const newId = Object.keys(folderData).length > 0 ? Math.max(...Object.keys(folderData).map(Number)) + 1 : 1;
  folderData[newId] = [];

  const folderContainer = document.querySelector('.folder-container');
  const div = document.createElement('div');
  div.className = 'folder-card';
  div.setAttribute('data-id', newId);
  div.innerHTML = `
    <span class="folder-title">${name}</span>
    <div class="folder-actions">
      <button class="icon-btn upload-btn" onclick="openUploadModal(${newId})">➕</button>
      <button class="icon-btn view-btn" onclick="viewFolder(${newId})">👁️</button>
      <button class="icon-btn delete-btn" onclick="deleteFolder(this)">🗑️</button>
    </div>
  `;

  const addCard = document.querySelector('.add-new-folder');
  folderContainer.insertBefore(div, addCard);

  // Reset + card
  addCard.innerHTML = '<span style="font-size:24px; font-weight:bold;">➕</span>';
}

// Close modals if click outside
window.addEventListener('click', function (event) {
  const uploadModal = document.getElementById('uploadModal');
  const viewModal = document.getElementById('viewModal');
  if (uploadModal && event.target === uploadModal) closeModal();
  if (viewModal && event.target === viewModal) closeViewModal();
});

/* =========================================================
   Student Dashboard (backend-connected)
   ========================================================= */

const ClassSphereStudentDashboard = (() => {
  const bannerPalettes = [
    ['#2563eb', '#60a5fa'],
    ['#7c3aed', '#a78bfa'],
    ['#059669', '#34d399'],
    ['#db2777', '#fb7185'],
    ['#b45309', '#f59e0b'],
    ['#0f766e', '#2dd4bf'],
  ];

  function normalizeCode(code) {
    return String(code || '').trim().replace(/\s+/g, '').toUpperCase();
  }

  function isValidCode(code) {
    return /^[A-Z0-9]{5,12}$/.test(code);
  }

  function pickPalette(seedText) {
    let hash = 0;
    for (let i = 0; i < seedText.length; i++) hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
    return bannerPalettes[hash % bannerPalettes.length];
  }

  function setJoinError(el, message) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.textContent = message;
    el.hidden = false;
  }

  function mapApiClasses(rows) {
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      section: r.section,
      teacher: r.teacher_name,
      code: r.join_code,
      status: r.status,
    }));
  }

  function render(classes) {
    const grid = document.getElementById('classesGrid');
    const empty = document.getElementById('emptyState');
    if (!grid || !empty) return;

    grid.innerHTML = '';
    empty.hidden = classes.length !== 0;

    classes.forEach((cls) => {
      const [a, b] = pickPalette(cls.code || cls.name || cls.id);
      const isPending = cls.status && cls.status !== 'approved';

      const card = document.createElement('article');
      card.className = 'cs-class-card';
      card.style.setProperty('--cs-banner-a', a);
      card.style.setProperty('--cs-banner-b', b);

      const banner = document.createElement('div');
      banner.className = 'cs-class-banner';

      const body = document.createElement('div');
      body.className = 'cs-class-body';

      const title = document.createElement('h3');
      title.className = 'cs-class-name';
      title.textContent = cls.name || 'Untitled class';

      const meta = document.createElement('p');
      meta.className = 'cs-class-meta';
      const bits = [];
      if (cls.section) bits.push(cls.section);
      if (cls.teacher) bits.push(cls.teacher);
      if (cls.code) bits.push(`Code: ${cls.code}`);
      if (isPending) bits.push('Pending approval');
      meta.textContent = bits.join(' • ') || '—';

      body.appendChild(title);
      body.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'cs-class-actions';

      const open = document.createElement('a');
      open.className = 'cs-link-btn';
      open.textContent = isPending ? 'Pending approval' : 'Open';

      if (isPending) {
        open.href = '#';
        open.classList.add('cs-link-btn-disabled');
        open.addEventListener('click', (e) => e.preventDefault());
      } else {
        open.href = `classroom_StudentView.html?classId=${encodeURIComponent(cls.id)}`;
      }

      const leave = document.createElement('button');
      leave.className = 'cs-link-btn cs-danger-btn';
      leave.type = 'button';
      leave.textContent = 'Leave';
      leave.addEventListener('click', async () => {
        const ok = await showDeleteConfirm({ message: 'Are you sure you want to leave this class? You will need a new code to rejoin.' });
        if (!ok) return;
        try {
          const res = await ClassSphereAuth.authFetch(`/api/classrooms/${encodeURIComponent(cls.id)}/leave`, {
            method: 'DELETE',
          });
          if (!res.ok) return;
          await reload();
        } catch {
          // ignore for now
        }
      });

      actions.appendChild(open);
      actions.appendChild(leave);

      card.appendChild(banner);
      card.appendChild(body);
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  async function reload() {
    try {
      const res = await ClassSphereAuth.authFetch('/api/classrooms');
      if (res.status === 401) {
        ClassSphereAuth.clearAuth();
        window.location.href = 'login.html';
        return;
      }
      const data = await res.json().catch(() => ({ classrooms: [] }));
      const classes = Array.isArray(data.classrooms) ? mapApiClasses(data.classrooms) : [];
      render(classes);
    } catch {
      render([]);
    }
  }

  function init() {
    const page = document.body && document.body.getAttribute('data-page');
    if (page !== 'student-dashboard') return;

    const user = ClassSphereAuth.getUser();
    if (!user || user.role !== 'student') {
      window.location.href = 'login.html';
      return;
    }

    const modal = document.getElementById('joinClassModal');
    const openBtn = document.getElementById('joinClassBtn');
    const openBtnEmpty = document.getElementById('joinClassBtnEmpty');
    const closeBtn = document.getElementById('joinClassCloseBtn');
    const cancelBtn = document.getElementById('joinClassCancelBtn');
    const form = document.getElementById('joinClassForm');
    const codeInput = document.getElementById('classCodeInput');
    const rollInput = document.getElementById('rollIdInput');
    const error = document.getElementById('joinClassError');

    let lastFocus = null;

    function openModal() {
      if (!modal) return;
      lastFocus = document.activeElement;
      setJoinError(error, '');
      modal.style.display = 'block';
      if (codeInput) {
        codeInput.value = '';
        codeInput.focus();
      }
      if (rollInput) rollInput.value = '';
    }

    function closeModal() {
      if (!modal) return;
      modal.style.display = 'none';
      setJoinError(error, '');
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (openBtnEmpty) openBtnEmpty.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.style.display === 'block') closeModal();
    });

    window.addEventListener('click', (e) => {
      if (modal && e.target === modal) closeModal();
    });

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = normalizeCode(codeInput ? codeInput.value : '');
        const rollId = rollInput ? rollInput.value.trim() : '';

        if (!isValidCode(code)) {
          setJoinError(error, 'Please enter a valid class code (5–12 letters/numbers).');
          if (codeInput) codeInput.focus();
          return;
        }
        if (!rollId) {
          setJoinError(error, 'Please enter your Roll ID for this class.');
          if (rollInput) rollInput.focus();
          return;
        }

        try {
          setJoinError(error, '');
          const res = await ClassSphereAuth.authFetch('/api/classrooms/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, rollId }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setJoinError(error, data.error || 'Could not join class. Please try again.');
            return;
          }

          closeModal();
          await reload();
        } catch {
          setJoinError(error, 'Unable to reach server. Please try again.');
        }
      });
    }

    reload();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  ClassSphereStudentDashboard.init();
});

/* =========================================================
   Classroom - Student View (backend-connected)
   ========================================================= */

const ClassSphereStudentClassroom = (() => {
  function getClassIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('classId');
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function handleAuthError(role) {
    ClassSphereAuth.clearAuth();
    window.location.href = 'login.html';
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function renderClassHeader(classroom) {
    const titleEl = document.getElementById('classroomTitle');
    const metaEl = document.getElementById('studentClassMeta');
    const teacherEl = document.getElementById('studentTeacherName');
    const parts = [];
    if (classroom.section) parts.push(classroom.section);
    if (classroom.subject) parts.push(classroom.subject);
    if (classroom.room) parts.push(`Room ${classroom.room}`);
    if (classroom.join_code) parts.push(`Code: ${classroom.join_code}`);

    if (titleEl) titleEl.textContent = classroom.name || 'Classroom';
    if (metaEl) metaEl.textContent = parts.join(' • ');
    if (teacherEl) teacherEl.textContent = classroom.teacher_name ? `Teacher: ${classroom.teacher_name}` : '';
    if (classroom.name) document.title = `${classroom.name} - Student View`;
  }

  function renderFolders(folders, onSelectFolder) {
    const container = document.getElementById('studentFolderList');
    const empty = document.getElementById('studentFolderEmpty');
    if (!container || !empty) return;

    container.innerHTML = '';
    if (!folders.length) {
      empty.textContent = 'No folders yet. Your teacher can add materials here.';
      return;
    }

    empty.textContent = '';
    folders.forEach((folder) => {
      const card = document.createElement('div');
      card.className = 'folder-card student-folder-card';

      const title = document.createElement('span');
      title.className = 'folder-title';
      title.textContent = folder.name || 'Untitled folder';

      const actions = document.createElement('div');
      actions.className = 'folder-actions';
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'icon-btn view-btn';
      viewBtn.textContent = 'Open';
      viewBtn.title = 'Open folder';
      viewBtn.addEventListener('click', () => onSelectFolder(folder));
      actions.appendChild(viewBtn);

      card.appendChild(title);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  function renderMaterials(folder, materials) {
    const container = document.getElementById('studentMaterials');
    if (!container) return;
    container.innerHTML = '';

    const heading = document.createElement('p');
    heading.style.marginBottom = '8px';
    heading.style.color = '#4b5563';
    heading.style.fontSize = '14px';
    heading.textContent = folder
      ? `Materials in “${folder.name || 'Folder'}”`
      : 'Select a folder to view materials.';
    container.appendChild(heading);

    if (!materials || !materials.length) {
      const p = document.createElement('p');
      p.style.color = '#6b7280';
      p.style.fontSize = '14px';
      p.textContent = folder
        ? 'No materials have been added to this folder yet.'
        : 'No materials to show.';
      container.appendChild(p);
      return;
    }

    materials.forEach((m) => {
      const item = document.createElement('div');
      item.className = 'announcement-card';

      const title = document.createElement('div');
      title.style.fontWeight = '600';

      if (m.type === 'file') {
        const link = document.createElement('a');
        link.href = m.url_or_path;
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
        link.textContent = m.title || 'File';
        title.appendChild(link);
      } else {
        const link = document.createElement('a');
        link.href = m.url_or_path;
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
        link.textContent = m.title || 'Link';
        title.appendChild(link);
      }

      const meta = document.createElement('div');
      meta.style.fontSize = '12px';
      meta.style.color = '#6b7280';
      meta.textContent = formatDateTime(m.created_at);

      item.appendChild(title);
      item.appendChild(meta);
      container.appendChild(item);
    });
  }

  function renderAnnouncements(announcements) {
    const container = document.getElementById('studentAnnouncements');
    if (!container) return;
    container.innerHTML = '';

    if (!announcements.length) {
      const p = document.createElement('p');
      p.style.color = '#6b7280';
      p.style.fontSize = '14px';
      p.textContent = 'No announcements yet.';
      container.appendChild(p);
      return;
    }

    announcements.forEach((a) => {
      const card = document.createElement('div');
      card.className = 'announcement-card';

      const msg = document.createElement('p');
      msg.className = 'announcement-message';
      msg.textContent = a.message;

      const meta = document.createElement('div');
      meta.className = 'announcement-meta';
      const parts = [];
      if (a.created_by) parts.push(a.created_by);
      if (a.created_at) parts.push(formatDateTime(a.created_at));
      meta.textContent = parts.join(' • ');

      card.appendChild(msg);
      card.appendChild(meta);
      container.appendChild(card);
    });
  }

  function renderResults(results) {
    const container = document.getElementById('studentResults');
    if (!container) return;
    container.innerHTML = '';

    if (!results.length) {
      const p = document.createElement('p');
      p.style.color = '#6b7280';
      p.style.fontSize = '14px';
      p.textContent = 'No results have been uploaded yet.';
      container.appendChild(p);
      return;
    }

    results.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'announcement-card';

      const link = document.createElement('a');
      link.href = r.file_path;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = r.title || 'Result file';

      const meta = document.createElement('div');
      meta.style.fontSize = '12px';
      meta.style.color = '#6b7280';
      meta.textContent = formatDateTime(r.created_at);

      card.appendChild(link);
      card.appendChild(meta);
      container.appendChild(card);
    });
  }

  async function loadFoldersAndMaterials(classId) {
    try {
      const res = await ClassSphereAuth.authFetch(`/api/folders/classroom/${encodeURIComponent(classId)}`);
      if (res.status === 401) {
        handleAuthError('student');
        return;
      }
      const data = await res.json().catch(() => ({ folders: [] }));
      const folders = Array.isArray(data.folders) ? data.folders : [];

      renderFolders(folders, (folder) => {
        const url = new URL('classroom_StudentFolderView.html', window.location.href);
        url.searchParams.set('classId', String(classId));
        url.searchParams.set('folderId', String(folder.id));
        if (folder.name) url.searchParams.set('folderName', folder.name);
        window.location.href = url.toString();
      });

      // Default message when no folder is selected on this page.
      renderMaterials(null, []);
    } catch {
      renderFolders([], () => {});
      renderMaterials(null, []);
    }
  }

  async function loadAnnouncements(classId) {
    try {
      const res = await ClassSphereAuth.authFetch(`/api/announcements/classroom/${encodeURIComponent(classId)}`);
      if (res.status === 401) {
        handleAuthError('student');
        return;
      }
      const data = await res.json().catch(() => ({ announcements: [] }));
      const items = Array.isArray(data.announcements) ? data.announcements : [];
      renderAnnouncements(items);
    } catch {
      renderAnnouncements([]);
    }
  }

  async function loadResults(classId) {
    try {
      const res = await ClassSphereAuth.authFetch(`/api/results/classroom/${encodeURIComponent(classId)}`);
      if (res.status === 401) {
        handleAuthError('student');
        return;
      }
      const data = await res.json().catch(() => ({ results: [] }));
      const items = Array.isArray(data.results) ? data.results : [];
      renderResults(items);
    } catch {
      renderResults([]);
    }
  }

  function renderStudentsForStudent(students) {
    const list = document.getElementById('teacherStudentsList');
    const countEl = document.getElementById('teacherStudentsCount');
    if (!list) return;
    list.innerHTML = '';
    if (countEl) countEl.textContent = `Joined: ${Array.isArray(students) ? students.length : 0}`;

    if (!students || !students.length) {
      const li = document.createElement('li');
      li.style.color = '#6b7280';
      li.style.fontSize = '14px';
      li.textContent = 'No students joined yet.';
      list.appendChild(li);
      return;
    }

    const sorted = students.slice().sort((a, b) => {
      const ra = String(a.roll_id != null ? a.roll_id : '');
      const rb = String(b.roll_id != null ? b.roll_id : '');
      const na = parseInt(ra, 10);
      const nb = parseInt(rb, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return ra.localeCompare(rb, undefined, { numeric: true });
    });

    sorted.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'student-item';

      const info = document.createElement('div');
      info.className = 'student-info';
      const rollLine = document.createElement('div');
      rollLine.className = 'student-roll-line';
      const rollBadge = document.createElement('span');
      rollBadge.className = 'student-roll-badge';
      rollBadge.textContent = s.roll_id != null && s.roll_id !== '' ? `Roll ${s.roll_id}` : '—';
      rollLine.appendChild(rollBadge);
      const nameLine = document.createElement('div');
      nameLine.className = 'student-name-line';
      nameLine.textContent = s.full_name || s.email || 'Student';

      info.appendChild(rollLine);
      info.appendChild(nameLine);
      li.appendChild(info);
      list.appendChild(li);
    });
  }

  async function loadStudents(classId) {
    try {
      const res = await ClassSphereAuth.authFetch(`/api/classrooms/${encodeURIComponent(classId)}/students`);
      if (res.status === 401) {
        handleAuthError('student');
        return;
      }
      const data = await res.json().catch(() => ({ students: [] }));
      const items = Array.isArray(data.students) ? data.students : [];
      renderStudentsForStudent(items);
    } catch {
      renderStudentsForStudent([]);
    }
  }

  async function loadClassroom(classId) {
    try {
      const res = await ClassSphereAuth.authFetch(`/api/classrooms/${encodeURIComponent(classId)}`);
      if (res.status === 401) {
        handleAuthError('student');
        return null;
      }
      if (!res.ok) {
        window.location.href = 'student-dashboard.html';
        return null;
      }
      const data = await res.json().catch(() => ({}));
      if (data && data.classroom) {
        renderClassHeader(data.classroom);
      }
      return data.classroom || null;
    } catch (err) {
      if (err && err.message === 'no-token') {
        handleAuthError('student');
        return null;
      }
      window.location.href = 'student-dashboard.html';
      return null;
    }
  }

  async function init() {
    const page = document.body && document.body.getAttribute('data-page');
    if (page !== 'classroom-student') return;

    const user = ClassSphereAuth.getUser();
    if (!user || user.role !== 'student') {
      handleAuthError('student');
      return;
    }

    const backBtn = document.getElementById('leaveClassroomBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.location.href = 'student-dashboard.html';
      });
    }

    const classId = getClassIdFromQuery();
    if (!classId) {
      window.location.href = 'student-dashboard.html';
      return;
    }

    const classroom = await loadClassroom(classId);
    if (!classroom) return;

    await Promise.allSettled([
      loadFoldersAndMaterials(classId),
      loadAnnouncements(classId),
      loadResults(classId),
      loadStudents(classId),
    ]);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  ClassSphereStudentClassroom.init();
});

/* =========================================================
   Classroom - Student Folder Detail View
   ========================================================= */

const ClassSphereStudentFolderView = (() => {
  function getIdsFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const rawClassId = params.get('classId');
    const rawFolderId = params.get('folderId');
    const classId = Number(rawClassId);
    const folderId = Number(rawFolderId);
    const folderName = params.get('folderName') || '';
    return {
      classId: Number.isFinite(classId) && classId > 0 ? classId : null,
      folderId: Number.isFinite(folderId) && folderId > 0 ? folderId : null,
      folderName,
    };
  }

  function handleAuthError() {
    ClassSphereAuth.clearAuth();
    window.location.href = 'login.html';
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function renderHeader(classroom, folderName) {
    const titleEl = document.getElementById('folderPageTitle');
    const metaEl = document.getElementById('folderPageMeta');
    const parts = [];
    if (classroom && classroom.name) parts.push(classroom.name);
    if (folderName) parts.push(`Folder: ${folderName}`);

    if (titleEl) {
      titleEl.textContent = folderName || (classroom && classroom.name) || 'Folder';
    }
    if (metaEl) metaEl.textContent = parts.join(' • ');
    if (classroom && classroom.name && folderName) {
      document.title = `${folderName} – ${classroom.name}`;
    }
  }

  function renderMaterials(folderName, materials) {
    const container = document.getElementById('folderMaterials');
    if (!container) return;
    container.innerHTML = '';

    const heading = document.createElement('p');
    heading.style.marginBottom = '8px';
    heading.style.color = '#4b5563';
    heading.style.fontSize = '14px';
    heading.textContent = folderName
      ? `Materials in “${folderName}”`
      : 'Materials in this folder.';
    container.appendChild(heading);

    if (!materials || !materials.length) {
      const p = document.createElement('p');
      p.style.color = '#6b7280';
      p.style.fontSize = '14px';
      p.textContent = 'No materials have been added to this folder yet.';
      container.appendChild(p);
      return;
    }

    materials.forEach((m) => {
      const item = document.createElement('div');
      item.className = 'announcement-card';

      const title = document.createElement('div');
      title.style.fontWeight = '600';

      const link = document.createElement('a');
      link.href = m.type === 'file' ? m.url_or_path : m.url_or_path;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = m.title || (m.type === 'file' ? 'File' : 'Link');
      title.appendChild(link);

      const meta = document.createElement('div');
      meta.style.fontSize = '12px';
      meta.style.color = '#6b7280';
      meta.textContent = formatDateTime(m.created_at);

      item.appendChild(title);
      item.appendChild(meta);
      container.appendChild(item);
    });
  }

  async function loadClassroom(classId, folderName) {
    try {
      const res = await ClassSphereAuth.authFetch(`/api/classrooms/${encodeURIComponent(classId)}`);
      if (res.status === 401) {
        handleAuthError();
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      renderHeader(data.classroom || null, folderName);
      return data.classroom || null;
    } catch (err) {
      if (err && err.message === 'no-token') {
        handleAuthError();
      }
      return null;
    }
  }

  async function loadMaterials(folderId, folderName) {
    try {
      const res = await ClassSphereAuth.authFetch(`/api/folders/${encodeURIComponent(folderId)}/materials`);
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      const data = await res.json().catch(() => ({ materials: [] }));
      const materials = Array.isArray(data.materials) ? data.materials : [];
      renderMaterials(folderName, materials);
    } catch (err) {
      if (err && err.message === 'no-token') {
        handleAuthError();
        return;
      }
      renderMaterials(folderName, []);
    }
  }

  async function init() {
    const page = document.body && document.body.getAttribute('data-page');
    if (page !== 'classroom-student-folder') return;

    const user = ClassSphereAuth.getUser();
    if (!user || user.role !== 'student') {
      handleAuthError();
      return;
    }

    const { classId, folderId, folderName } = getIdsFromQuery();
    if (!classId || !folderId) {
      window.location.href = 'student-dashboard.html';
      return;
    }

    const backBtn = document.getElementById('folderBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        const url = new URL('classroom_StudentView.html', window.location.href);
        url.searchParams.set('classId', String(classId));
        window.location.href = url.toString();
      });
    }

    await loadClassroom(classId, folderName);
    await loadMaterials(folderId, folderName);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  ClassSphereStudentFolderView.init();
});

/* =========================================================
   Auth (login/register) with backend API
   ========================================================= */

const ClassSphereAuth = (() => {
  const TOKEN_KEY = 'cs_token';
  const USER_KEY = 'cs_user';

  function saveAuth(token, user) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // ignore storage errors
    }
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  }

  function clearAuth() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
  }

  async function authFetch(url, options = {}) {
    const token = getToken();
    if (!token) throw new Error('no-token');
    const headers = Object.assign({}, options.headers || {}, {
      Authorization: `Bearer ${token}`,
    });
    return fetch(url, { ...options, headers });
  }

  function getRoleFromQueryOrUser(defaultRole) {
    const user = getUser();
    if (user && (user.role === 'teacher' || user.role === 'student')) return user.role;
    return defaultRole;
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message || '';
  }

  function initLogin() {
    const form = document.querySelector('[data-auth="login-form"]');
    if (!form) return;

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorEl = document.getElementById('authError');
    const titleEl = document.getElementById('authTitle');
    const portalLabel = document.getElementById('portalLabel');
    const roleRadios = form.querySelectorAll('input[name="joinAs"]');

    function getSelectedRole() {
      const checked = Array.from(roleRadios).find((r) => r.checked);
      const value = checked && typeof checked.value === 'string' ? checked.value.toLowerCase() : null;
      if (value === 'teacher' || value === 'student') return value;
      return 'student';
    }

    function updateLabels() {
      const role = getSelectedRole();
      if (titleEl) titleEl.textContent = 'Login';
      if (portalLabel) portalLabel.textContent = role === 'teacher' ? 'Joining as Teacher' : 'Joining as Student';
    }

    // Default selection based on last-used role if we have one
    const lastRole = getRoleFromQueryOrUser('student');
    roleRadios.forEach((r) => {
      if (r.value === lastRole) r.checked = true;
      r.addEventListener('change', updateLabels);
    });
    updateLabels();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!emailInput || !passwordInput) return;

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        showError(errorEl, 'Please enter both email and password.');
        return;
      }

      try {
        showError(errorEl, '');
        const role = getSelectedRole();
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, role }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showError(errorEl, data.error || 'Invalid email or password.');
          return;
        }

        saveAuth(data.token, data.user);
        const dest = data.user && data.user.role === 'teacher' ? 'teacher-dashboard.html' : 'student-dashboard.html';
        window.location.href = dest;
      } catch {
        showError(errorEl, 'Unable to reach server. Please try again.');
      }
    });
  }

  function initRegister() {
    const form = document.querySelector('[data-auth="register-form"]');
    if (!form) return;

    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const fileInput = document.getElementById('profile');
    const errorEl = document.getElementById('authError');
    const titleEl = document.getElementById('authTitle');
    const portalLabel = document.getElementById('portalLabel');

    if (titleEl) titleEl.textContent = 'Create Account';
    if (portalLabel) portalLabel.textContent = 'One account for both student and teacher portals.';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!nameInput || !emailInput || !passwordInput) return;

      const fullName = nameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!fullName || !email || !password) {
        showError(errorEl, 'Please fill in all required fields.');
        return;
      }

      try {
        showError(errorEl, '');
        const fd = new FormData();
        fd.append('fullName', fullName);
        fd.append('email', email);
        fd.append('password', password);
        if (fileInput && fileInput.files[0]) {
          fd.append('profile', fileInput.files[0]);
        }

        const res = await fetch('/api/auth/register', {
          method: 'POST',
          body: fd,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showError(errorEl, data.error || 'Registration failed. Please try again.');
          return;
        }
        // Registration succeeded; take user to login to choose how to join.
        window.location.href = 'login.html';
      } catch {
        showError(errorEl, 'Unable to reach server. Please try again.');
      }
    });
  }

  function init() {
    const page = document.body && document.body.getAttribute('data-page');
    if (page === 'login') initLogin();
    if (page === 'register') initRegister();
  }

  return { init, clearAuth, getUser, getToken, authFetch };
})();

document.addEventListener('DOMContentLoaded', () => {
  ClassSphereAuth.init();
});

/* =========================================================
   Teacher Dashboard (backend-connected)
   ========================================================= */

const ClassSphereTeacherDashboard = (() => {
  const bannerPalettes = [
    ['#2563eb', '#60a5fa'],
    ['#7c3aed', '#a78bfa'],
    ['#059669', '#34d399'],
    ['#db2777', '#fb7185'],
    ['#b45309', '#f59e0b'],
    ['#0f766e', '#2dd4bf'],
  ];

  function pickPalette(seedText) {
    const s = String(seedText || '');
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return bannerPalettes[hash % bannerPalettes.length];
  }

  async function createClassFlow() {
    const name = window.prompt('Class name (e.g. Mathematics 101):');
    if (!name || !name.trim()) return;
    try {
      const res = await ClassSphereAuth.authFetch('/api/classrooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) return;
      await reload();
    } catch {
      // ignore
    }
  }

  function render(classes) {
    const empty = document.getElementById('teacherEmptyState');
    const grid = document.getElementById('teacherClassGrid');
    const stats = document.getElementById('teacherDashboardStats');
    if (!grid || !empty) return;

    const items = Array.isArray(classes) ? classes : [];
    grid.innerHTML = '';

    if (stats) stats.textContent = `Total classes: ${items.length}`;

    if (!items.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    items.forEach((cls) => {
      const [a, b] = pickPalette(cls.name || cls.id);

      const card = document.createElement('article');
      card.className = 'cs-class-card';
      card.style.setProperty('--cs-banner-a', a);
      card.style.setProperty('--cs-banner-b', b);

      const banner = document.createElement('div');
      banner.className = 'cs-class-banner';

      const body = document.createElement('div');
      body.className = 'cs-class-body';
      const name = document.createElement('h3');
      name.className = 'cs-class-name';
      name.textContent = cls.name || 'Untitled class';
      const meta = document.createElement('p');
      meta.className = 'cs-class-meta';
      meta.textContent = 'Manage materials, results, and announcements';
      body.appendChild(name);
      body.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'cs-class-actions';

      const enter = document.createElement('a');
      enter.className = 'cs-link-btn';
      enter.href = `classroom_TeacherView.html?classId=${encodeURIComponent(cls.id)}`;
      enter.textContent = 'Enter';

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'cs-link-btn cs-danger-btn';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        const ok = await showDeleteConfirm({ message: 'Are you sure you want to delete this classroom? This cannot be undone.' });
        if (!ok) return;
        try {
          const res = await ClassSphereAuth.authFetch(`/api/classrooms/${encodeURIComponent(cls.id)}`, {
            method: 'DELETE',
          });
          if (!res.ok) return;
          await reload();
        } catch {
          // ignore
        }
      });

      actions.appendChild(enter);
      actions.appendChild(del);

      card.appendChild(banner);
      card.appendChild(body);
      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  async function reload() {
    try {
      const res = await ClassSphereAuth.authFetch('/api/classrooms');
      if (res.status === 401) {
        ClassSphereAuth.clearAuth();
        window.location.href = 'login.html';
        return;
      }
      const data = await res.json().catch(() => ({ classrooms: [] }));
      const classes = Array.isArray(data.classrooms) ? data.classrooms : [];
      render(classes);
    } catch {
      render([]);
    }
  }

  function init() {
    const page = document.body && document.body.getAttribute('data-page');
    if (page !== 'teacher-dashboard') return;

    const user = ClassSphereAuth.getUser();
    if (!user || user.role !== 'teacher') {
      window.location.href = 'login.html';
      return;
    }

    const createBtn = document.getElementById('createClassBtn');
    if (createBtn) {
      createBtn.addEventListener('click', createClassFlow);
    }

    const emptyCreateBtn = document.getElementById('teacherEmptyCreateBtn');
    if (emptyCreateBtn) emptyCreateBtn.addEventListener('click', createClassFlow);

    const avatar = document.querySelector('.cs-avatar');
    if (avatar) avatar.textContent = (user.full_name || user.email || 'T').trim().slice(0, 1).toUpperCase();

    reload();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  ClassSphereTeacherDashboard.init();
});

/* =========================================================
   Classroom - Teacher View (backend-connected)
   ========================================================= */

const ClassSphereTeacherClassroom = (() => {
  let classroomId = null;
  let uploadContext = null; // { type: 'material', folderId, folderName } | { type: 'result' }

  function getClassIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('classId');
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function handleAuthError() {
    ClassSphereAuth.clearAuth();
    window.location.href = 'login.html';
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function renderClassHeader(classroom) {
    const titleEl = document.getElementById('teacherClassTitle');
    const metaEl = document.getElementById('teacherClassMeta');
    const parts = [];
    if (classroom.section) parts.push(classroom.section);
    if (classroom.subject) parts.push(classroom.subject);
    if (classroom.room) parts.push(`Room ${classroom.room}`);
    if (classroom.join_code) parts.push(`Code: ${classroom.join_code}`);

    if (titleEl) titleEl.textContent = classroom.name || 'Classroom';
    if (metaEl) metaEl.textContent = parts.join(' • ');
  }

  function renderSidebarClasses(classes) {
    const list = document.getElementById('teacherSidebarClasses');
    if (!list) return;
    list.innerHTML = '';

    if (!classes.length) {
      const li = document.createElement('li');
      li.style.color = '#6b7280';
      li.style.fontSize = '14px';
      li.textContent = 'No classrooms yet.';
      list.appendChild(li);
      return;
    }

    classes.forEach((cls) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn sidebar-class-btn';
      btn.textContent = cls.name || 'Untitled class';
      btn.addEventListener('click', () => {
        if (cls.id === classroomId) return;
        window.location.href = `classroom_TeacherView.html?classId=${encodeURIComponent(cls.id)}`;
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function renderJoinRequests(requests) {
    const list = document.getElementById('joinRequestsList');
    if (!list) return;
    list.innerHTML = '';

    if (!requests.length) {
      const li = document.createElement('li');
      li.style.color = '#6b7280';
      li.style.fontSize = '14px';
      li.textContent = 'No pending join requests.';
      list.appendChild(li);
      return;
    }

    requests.forEach((r) => {
      const li = document.createElement('li');
      li.className = 'student-item';

      const info = document.createElement('div');
      info.className = 'student-info';
      const name = document.createElement('div');
      name.textContent = r.full_name || r.email || 'Student';
      const meta = document.createElement('div');
      meta.style.fontSize = '12px';
      meta.style.color = '#6b7280';
      const parts = [];
      if (r.roll_id) parts.push(`Roll ${r.roll_id}`);
      if (r.requested_at) parts.push(formatDateTime(r.requested_at));
      meta.textContent = parts.join(' • ');
      info.appendChild(name);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'student-actions';
      const approveBtn = document.createElement('button');
      approveBtn.type = 'button';
      approveBtn.className = 'btn approve-btn';
      approveBtn.textContent = 'Approve';
      approveBtn.addEventListener('click', async () => {
        try {
          const res = await ClassSphereAuth.authFetch(
            `/api/classrooms/${encodeURIComponent(classroomId)}/requests/${encodeURIComponent(r.id)}/approve`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            }
          );
          if (res.status === 401) {
            handleAuthError();
            return;
          }
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            console.error('Approve failed:', res.status, data);
            return;
          }
          await Promise.allSettled([loadJoinRequests(), loadStudents()]);
        } catch (err) {
          if (err && err.message === 'no-token') handleAuthError();
          else console.error('Approve error:', err);
        }
      });

      const rejectBtn = document.createElement('button');
      rejectBtn.type = 'button';
      rejectBtn.className = 'btn delete-btn';
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', async () => {
        const ok = await showDeleteConfirm({ message: 'Are you sure you want to reject this join request?' });
        if (!ok) return;
        try {
          const res = await ClassSphereAuth.authFetch(
            `/api/classrooms/${encodeURIComponent(classroomId)}/requests/${encodeURIComponent(r.id)}/reject`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            }
          );
          if (res.status === 401) {
            handleAuthError();
            return;
          }
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            console.error('Reject failed:', res.status, data);
            return;
          }
          await loadJoinRequests();
        } catch (err) {
          if (err && err.message === 'no-token') handleAuthError();
          else console.error('Reject error:', err);
        }
      });

      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
      li.appendChild(info);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  function renderStudents(students) {
    const list = document.getElementById('teacherStudentsList');
    const countEl = document.getElementById('teacherStudentsCount');
    if (!list) return;
    list.innerHTML = '';
    if (countEl) countEl.textContent = `Joined: ${Array.isArray(students) ? students.length : 0}`;

    if (!students.length) {
      const li = document.createElement('li');
      li.style.color = '#6b7280';
      li.style.fontSize = '14px';
      li.textContent = 'No students joined yet.';
      list.appendChild(li);
      return;
    }

    const sorted = students.slice().sort((a, b) => {
      const ra = String(a.roll_id != null ? a.roll_id : '');
      const rb = String(b.roll_id != null ? b.roll_id : '');
      const na = parseInt(ra, 10); const nb = parseInt(rb, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return ra.localeCompare(rb, undefined, { numeric: true });
    });

    sorted.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'student-item';

      const info = document.createElement('div');
      info.className = 'student-info';
      const rollLine = document.createElement('div');
      rollLine.className = 'student-roll-line';
      const rollBadge = document.createElement('span');
      rollBadge.className = 'student-roll-badge';
      rollBadge.textContent = s.roll_id != null && s.roll_id !== '' ? `Roll ${s.roll_id}` : '—';
      rollLine.appendChild(rollBadge);
      const nameLine = document.createElement('div');
      nameLine.className = 'student-name-line';
      nameLine.textContent = s.full_name || s.email || 'Student';
      const metaLine = document.createElement('div');
      metaLine.className = 'student-meta-line';
      metaLine.textContent = s.approved_at ? `Joined ${formatDateTime(s.approved_at)}` : '';
      info.appendChild(rollLine);
      info.appendChild(nameLine);
      info.appendChild(metaLine);

      const actions = document.createElement('div');
      actions.className = 'student-actions';
      const kickBtn = document.createElement('button');
      kickBtn.type = 'button';
      kickBtn.className = 'btn delete-btn';
      kickBtn.textContent = 'Remove';
      kickBtn.addEventListener('click', async () => {
        const ok = await showDeleteConfirm({ message: 'Are you sure you want to remove this student from the classroom?' });
        if (!ok) return;
        try {
          const res = await ClassSphereAuth.authFetch(
            `/api/classrooms/${encodeURIComponent(classroomId)}/students/${encodeURIComponent(s.id)}`,
            { method: 'DELETE' }
          );
          if (res.status === 401) {
            handleAuthError();
            return;
          }
          if (!res.ok) return;
          await loadStudents();
        } catch (err) {
          if (err && err.message === 'no-token') handleAuthError();
        }
      });

      actions.appendChild(kickBtn);
      li.appendChild(info);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  function openUploadModal(context) {
    uploadContext = context;
    const modal = document.getElementById('uploadModal');
    const titleEl = document.getElementById('uploadModalTitle');
    const fileInput = document.getElementById('fileInput');
    const linkInput = document.getElementById('linkInput');
    const titleInput = document.getElementById('titleInput');
    const errorEl = document.getElementById('uploadError');

    if (!modal || !fileInput || !linkInput || !titleInput || !errorEl || !titleEl) return;

    fileInput.value = '';
    linkInput.value = '';
    titleInput.value = '';
    errorEl.textContent = '';

    if (context.type === 'material') {
      titleEl.textContent = context.folderName
        ? `Add material to “${context.folderName}”`
        : 'Add material';
      linkInput.style.display = '';
    } else {
      titleEl.textContent = 'Upload result';
      linkInput.style.display = 'none';
    }

    modal.style.display = 'block';
  }

  function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    const errorEl = document.getElementById('uploadError');
    if (modal) modal.style.display = 'none';
    if (errorEl) errorEl.textContent = '';
    uploadContext = null;
  }

  function openViewModal(folder, materials) {
    const modal = document.getElementById('viewModal');
    const titleEl = document.getElementById('viewModalTitle');
    const list = document.getElementById('folderItems');
    if (!modal || !titleEl || !list) return;

    titleEl.textContent = folder.name || 'Folder contents';
    list.innerHTML = '';

    if (!materials.length) {
      const li = document.createElement('li');
      li.textContent = 'No materials in this folder.';
      list.appendChild(li);
    } else {
      materials.forEach((m) => {
        const li = document.createElement('li');

        const info = document.createElement('div');
        const titleSpan = document.createElement('span');
        titleSpan.style.fontWeight = '600';

        const link = document.createElement('a');
        link.href = m.url_or_path;
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
        link.textContent = m.title || (m.type === 'file' ? 'File' : 'Link');
        titleSpan.appendChild(link);

        const meta = document.createElement('span');
        meta.style.fontSize = '12px';
        meta.style.color = '#6b7280';
        meta.style.marginLeft = '8px';
        meta.textContent = formatDateTime(m.created_at);

        info.appendChild(titleSpan);
        info.appendChild(meta);

        const actions = document.createElement('div');
        actions.style.marginTop = '4px';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn delete-btn';
        deleteBtn.style.padding = '4px 8px';
        deleteBtn.style.fontSize = '12px';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
          const ok = await showDeleteConfirm({ message: 'Are you sure you want to delete this material?' });
          if (!ok) return;
          try {
            const res = await ClassSphereAuth.authFetch(
              `/api/folders/materials/${encodeURIComponent(m.id)}`,
              { method: 'DELETE' }
            );
            if (res.status === 401) {
              handleAuthError();
              return;
            }
            if (!res.ok) return;
            // Refresh materials list for this folder
            try {
              const refreshed = await ClassSphereAuth.authFetch(
                `/api/folders/${encodeURIComponent(folder.id)}/materials`
              );
              if (refreshed.status === 401) {
                handleAuthError();
                return;
              }
              const data = await refreshed.json().catch(() => ({ materials: [] }));
              const mats = Array.isArray(data.materials) ? data.materials : [];
              openViewModal(folder, mats);
            } catch (err) {
              if (err && err.message === 'no-token') handleAuthError();
            }
          } catch (err) {
            if (err && err.message === 'no-token') handleAuthError();
          }
        });

        actions.appendChild(deleteBtn);

        li.appendChild(info);
        li.appendChild(actions);
        list.appendChild(li);
      });
    }

    modal.style.display = 'block';
  }

  function closeViewModal() {
    const modal = document.getElementById('viewModal');
    if (modal) modal.style.display = 'none';
  }

  function renderFolders(folders) {
    const container = document.getElementById('teacherFolderContainer');
    const empty = document.getElementById('teacherFolderEmpty');
    if (!container || !empty) return;

    container.innerHTML = '';
    if (!folders.length) {
      empty.textContent = 'No folders yet. Create a folder to organize your materials.';
      return;
    }

    empty.textContent = '';
    folders.forEach((folder) => {
      const card = document.createElement('div');
      card.className = 'folder-card teacher-folder-card';

      const title = document.createElement('span');
      title.className = 'folder-title';
      title.textContent = folder.name || 'Untitled folder';

      const actions = document.createElement('div');
      actions.className = 'folder-actions';

      const uploadBtn = document.createElement('button');
      uploadBtn.className = 'icon-btn upload-btn';
      uploadBtn.type = 'button';
      uploadBtn.innerHTML = '<img src="assets/add.png" alt="Upload" style="width:18px;height:18px;">';
      uploadBtn.title = 'Add material';
      uploadBtn.addEventListener('click', () => {
        openUploadModal({ type: 'material', folderId: folder.id, folderName: folder.name });
      });

      const viewBtn = document.createElement('button');
      viewBtn.className = 'icon-btn view-btn';
      viewBtn.type = 'button';
      viewBtn.innerHTML = '<img src="assets/view.png" alt="View" style="width:18px;height:18px;">';
      viewBtn.title = 'View materials';
      viewBtn.addEventListener('click', async () => {
        try {
          const res = await ClassSphereAuth.authFetch(`/api/folders/${encodeURIComponent(folder.id)}/materials`);
          if (res.status === 401) {
            handleAuthError();
            return;
          }
          const data = await res.json().catch(() => ({ materials: [] }));
          const materials = Array.isArray(data.materials) ? data.materials : [];
          openViewModal(folder, materials);
        } catch (err) {
          if (err && err.message === 'no-token') handleAuthError();
        }
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn delete-btn';
      deleteBtn.type = 'button';
      deleteBtn.innerHTML = '<img src="assets/delete.png" alt="Delete" style="width:18px;height:18px;">';
      deleteBtn.title = 'Delete folder';
      deleteBtn.addEventListener('click', async () => {
        const ok = await showDeleteConfirm({ message: 'Are you sure you want to delete this folder and all of its materials?' });
        if (!ok) return;
        try {
          const res = await ClassSphereAuth.authFetch(`/api/folders/${encodeURIComponent(folder.id)}`, {
            method: 'DELETE',
          });
          if (res.status === 401) {
            handleAuthError();
            return;
          }
          if (!res.ok) return;
          await loadFolders();
        } catch (err) {
          if (err && err.message === 'no-token') handleAuthError();
        }
      });

      actions.appendChild(uploadBtn);
      actions.appendChild(viewBtn);
      actions.appendChild(deleteBtn);

      card.appendChild(title);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  function renderTeacherAnnouncements(announcements) {
    const container = document.getElementById('teacherAnnouncements');
    if (!container) return;
    container.innerHTML = '';

    if (!announcements.length) {
      const p = document.createElement('p');
      p.style.color = '#6b7280';
      p.style.fontSize = '14px';
      p.textContent = 'No announcements yet.';
      container.appendChild(p);
      return;
    }

    announcements.forEach((a) => {
      const card = document.createElement('div');
      card.className = 'announcement-card';

      const msg = document.createElement('p');
      msg.className = 'announcement-message';
      msg.textContent = a.message;

      const meta = document.createElement('div');
      meta.className = 'announcement-meta';
      const parts = [];
      if (a.created_by) parts.push(a.created_by);
      if (a.created_at) parts.push(formatDateTime(a.created_at));
      meta.textContent = parts.join(' • ');

      const actions = document.createElement('div');
      actions.className = 'announcement-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'icon-btn announcement-edit-btn';
      editBtn.textContent = '✏️';
      editBtn.title = 'Edit announcement';
      editBtn.addEventListener('click', async () => {
        const next = window.prompt('Edit announcement message:', a.message || '');
        if (next == null) return; // cancelled
        const trimmed = String(next).trim();
        if (!trimmed) return;
        try {
          const res = await ClassSphereAuth.authFetch(`/api/announcements/${encodeURIComponent(a.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: trimmed }),
          });
          if (res.status === 401) { handleAuthError(); return; }
          if (!res.ok) return;
          await loadAnnouncements();
        } catch (err) {
          if (err && err.message === 'no-token') handleAuthError();
        }
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'icon-btn delete-btn announcement-delete-btn';
      deleteBtn.innerHTML = '<img src="assets/delete.png" alt="Delete" style="width:18px;height:18px;">';
      deleteBtn.title = 'Delete announcement';
      deleteBtn.addEventListener('click', async () => {
        const ok = await showDeleteConfirm({ message: 'Are you sure you want to delete this announcement?' });
        if (!ok) return;
        try {
          const res = await ClassSphereAuth.authFetch(`/api/announcements/${encodeURIComponent(a.id)}`, {
            method: 'DELETE',
          });
          if (res.status === 401) { handleAuthError(); return; }
          if (!res.ok) return;
          await loadAnnouncements();
        } catch (err) {
          if (err && err.message === 'no-token') handleAuthError();
        }
      });

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      card.appendChild(msg);
      card.appendChild(meta);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  function renderTeacherResults(results) {
    const container = document.getElementById('teacherResultsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!results.length) {
      const p = document.createElement('p');
      p.style.color = '#6b7280';
      p.style.fontSize = '14px';
      p.textContent = 'No results uploaded yet. Use "Upload Result" to add files.';
      container.appendChild(p);
      return;
    }

    results.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'folder-card result-card';

      const resultUrl = r.file_path.startsWith('http') ? r.file_path : (window.location.origin + r.file_path);
      const titleLink = document.createElement('a');
      titleLink.className = 'result-card-link';
      titleLink.href = resultUrl;
      titleLink.target = '_blank';
      titleLink.rel = 'noopener noreferrer';
      titleLink.textContent = r.title || 'Result file';

      const meta = document.createElement('div');
      meta.className = 'result-card-meta';
      meta.textContent = formatDateTime(r.created_at);

      const actions = document.createElement('div');
      actions.className = 'result-card-actions';
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'icon-btn delete-btn';
      deleteBtn.innerHTML = '<img src="assets/delete.png" alt="Delete" style="width:18px;height:18px;">';
      deleteBtn.title = 'Delete result';
      deleteBtn.addEventListener('click', async () => {
        const ok = await showDeleteConfirm({ message: 'Are you sure you want to delete this result?' });
        if (!ok) return;
        try {
          const res = await ClassSphereAuth.authFetch(`/api/results/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
          if (res.status === 401) { handleAuthError(); return; }
          if (!res.ok) return;
          await loadResults();
        } catch (err) {
          if (err && err.message === 'no-token') handleAuthError();
        }
      });
      actions.appendChild(deleteBtn);

      card.appendChild(titleLink);
      card.appendChild(meta);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  async function loadSidebarClasses() {
    try {
      const res = await ClassSphereAuth.authFetch('/api/classrooms');
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      const data = await res.json().catch(() => ({ classrooms: [] }));
      const classes = Array.isArray(data.classrooms) ? data.classrooms : [];
      renderSidebarClasses(classes);
    } catch (err) {
      if (err && err.message === 'no-token') handleAuthError();
    }
  }

  async function loadClassroomDetail() {
    try {
      const res = await ClassSphereAuth.authFetch(`/api/classrooms/${encodeURIComponent(classroomId)}`);
      if (res.status === 401) {
        handleAuthError();
        return null;
      }
      if (!res.ok) {
        window.location.href = 'teacher-dashboard.html';
        return null;
      }
      const data = await res.json().catch(() => ({}));
      if (data && data.classroom) {
        renderClassHeader(data.classroom);
      }
      return data.classroom || null;
    } catch (err) {
      if (err && err.message === 'no-token') {
        handleAuthError();
        return null;
      }
      window.location.href = 'teacher-dashboard.html';
      return null;
    }
  }

  async function loadFolders() {
    try {
      const res = await ClassSphereAuth.authFetch(`/api/folders/classroom/${encodeURIComponent(classroomId)}`);
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      const data = await res.json().catch(() => ({ folders: [] }));
      const folders = Array.isArray(data.folders) ? data.folders : [];
      renderFolders(folders);
    } catch (err) {
      if (err && err.message === 'no-token') handleAuthError();
    }
  }

  async function loadAnnouncements() {
    try {
      const res = await ClassSphereAuth.authFetch(`/api/announcements/classroom/${encodeURIComponent(classroomId)}`);
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      const data = await res.json().catch(() => ({ announcements: [] }));
      const items = Array.isArray(data.announcements) ? data.announcements : [];
      renderTeacherAnnouncements(items);
    } catch (err) {
      if (err && err.message === 'no-token') handleAuthError();
    }
  }

  async function loadResults() {
    try {
      const res = await ClassSphereAuth.authFetch(`/api/results/classroom/${encodeURIComponent(classroomId)}`);
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      const data = await res.json().catch(() => ({ results: [] }));
      const items = Array.isArray(data.results) ? data.results : [];
      renderTeacherResults(items);
    } catch (err) {
      if (err && err.message === 'no-token') handleAuthError();
    }
  }

  async function loadJoinRequests() {
    try {
      const res = await ClassSphereAuth.authFetch(
        `/api/classrooms/${encodeURIComponent(classroomId)}/requests`
      );
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      const data = await res.json().catch(() => ({ requests: [] }));
      const items = Array.isArray(data.requests) ? data.requests : [];
      renderJoinRequests(items);
    } catch (err) {
      if (err && err.message === 'no-token') handleAuthError();
    }
  }

  async function loadStudents() {
    try {
      const res = await ClassSphereAuth.authFetch(
        `/api/classrooms/${encodeURIComponent(classroomId)}/students`
      );
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      const data = await res.json().catch(() => ({ students: [] }));
      const items = Array.isArray(data.students) ? data.students : [];
      renderStudents(items);
    } catch (err) {
      if (err && err.message === 'no-token') handleAuthError();
    }
  }

  async function handleUploadSave() {
    const fileInput = document.getElementById('fileInput');
    const linkInput = document.getElementById('linkInput');
    const titleInput = document.getElementById('titleInput');
    const errorEl = document.getElementById('uploadError');
    if (!uploadContext || !fileInput || !linkInput || !titleInput || !errorEl) return;

    errorEl.textContent = '';
    const file = fileInput.files[0] || null;
    const link = (linkInput.value || '').trim();
    const title = (titleInput.value || '').trim();

    try {
      if (uploadContext.type === 'material') {
        if (!file && !link) {
          errorEl.textContent = 'Please select a file or provide a link.';
          return;
        }
        const fd = new FormData();
        if (file) fd.append('file', file);
        if (link && !file) fd.append('link', link);
        if (title) fd.append('title', title);

        const res = await ClassSphereAuth.authFetch(
          `/api/folders/${encodeURIComponent(uploadContext.folderId)}/materials`,
          {
            method: 'POST',
            body: fd,
          }
        );
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          handleAuthError();
          return;
        }
        if (!res.ok) {
          errorEl.textContent = data.error || 'Failed to upload material.';
          return;
        }
        closeUploadModal();
        await loadFolders();
      } else {
        if (!file) {
          errorEl.textContent = 'Please select a result file.';
          return;
        }
        const fd = new FormData();
        fd.append('file', file);
        if (title) fd.append('title', title);

        const res = await ClassSphereAuth.authFetch(
          `/api/results/classroom/${encodeURIComponent(classroomId)}`,
          {
            method: 'POST',
            body: fd,
          }
        );
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          handleAuthError();
          return;
        }
        if (!res.ok) {
          errorEl.textContent = data.error || 'Failed to upload result.';
          return;
        }
        closeUploadModal();
        await loadResults();
      }
    } catch (err) {
      if (err && err.message === 'no-token') {
        handleAuthError();
        return;
      }
      errorEl.textContent = 'Something went wrong. Please try again.';
    }
  }

  function wireModalControls() {
    const uploadSaveBtn = document.getElementById('uploadSaveBtn');
    const uploadCancelBtn = document.getElementById('uploadCancelBtn');
    const viewCloseBtn = document.getElementById('viewCloseBtn');

    if (uploadSaveBtn && !uploadSaveBtn.dataset.csBound) {
      uploadSaveBtn.dataset.csBound = 'true';
      uploadSaveBtn.addEventListener('click', () => {
        void handleUploadSave();
      });
    }
    if (uploadCancelBtn && !uploadCancelBtn.dataset.csBound) {
      uploadCancelBtn.dataset.csBound = 'true';
      uploadCancelBtn.addEventListener('click', () => {
        closeUploadModal();
      });
    }
    if (viewCloseBtn && !viewCloseBtn.dataset.csBound) {
      viewCloseBtn.dataset.csBound = 'true';
      viewCloseBtn.addEventListener('click', () => {
        closeViewModal();
      });
    }

    // Click-outside to close
    window.addEventListener('click', (event) => {
      const uploadModal = document.getElementById('uploadModal');
      const viewModal = document.getElementById('viewModal');
      if (uploadModal && event.target === uploadModal) closeUploadModal();
      if (viewModal && event.target === viewModal) closeViewModal();
    });
  }

  async function init() {
    const page = document.body && document.body.getAttribute('data-page');
    if (page !== 'classroom-teacher') return;

    const user = ClassSphereAuth.getUser();
    if (!user || user.role !== 'teacher') {
      handleAuthError();
      return;
    }

    classroomId = getClassIdFromQuery();
    if (!classroomId) {
      window.location.href = 'teacher-dashboard.html';
      return;
    }

    const createFolderBtn = document.getElementById('createFolderBtn');
    const uploadResultBtn = document.getElementById('uploadResultBtn');

    if (createFolderBtn) {
      createFolderBtn.addEventListener('click', async () => {
        const name = window.prompt('Folder name (e.g. Unit 1 Notes):');
        if (!name || !name.trim()) return;
        try {
          const res = await ClassSphereAuth.authFetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classroomId, name: name.trim() }),
          });
          if (res.status === 401) {
            handleAuthError();
            return;
          }
          if (!res.ok) return;
          await loadFolders();
        } catch (err) {
          if (err && err.message === 'no-token') handleAuthError();
        }
      });
    }

    if (uploadResultBtn) {
      uploadResultBtn.addEventListener('click', () => {
        openUploadModal({ type: 'result' });
      });
    }

    const postAnnouncementBtn = document.getElementById('postAnnouncementBtn');
    const teacherAnnouncementInput = document.getElementById('teacherAnnouncementInput');
    if (postAnnouncementBtn && teacherAnnouncementInput) {
      postAnnouncementBtn.addEventListener('click', async () => {
        const message = (teacherAnnouncementInput.value || '').trim();
        if (!message) return;
        try {
          const res = await ClassSphereAuth.authFetch(
            `/api/announcements/classroom/${encodeURIComponent(classroomId)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message }),
            }
          );
          if (res.status === 401) {
            handleAuthError();
            return;
          }
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return;
          }
          teacherAnnouncementInput.value = '';
          await loadAnnouncements();
        } catch (err) {
          if (err && err.message === 'no-token') handleAuthError();
        }
      });
    }

    wireModalControls();

    const classroom = await loadClassroomDetail();
    if (!classroom) return;

    await Promise.allSettled([
      loadFolders(),
      loadAnnouncements(),
      loadResults(),
      loadJoinRequests(),
      loadStudents(),
    ]);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  ClassSphereTeacherClassroom.init();
});