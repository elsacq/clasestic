/* =============================================
   Students Module
   Student list, form, CRUD operations
   ============================================= */

window.App = window.App || {};

window.App.renderStudents = function() {
  // Populate course filter from window.App.state.courses (plus any orphan course names on students)
  const courseNames = [...new Set([
    ...window.App.state.courses.map(c => c.name),
    ...window.App.state.students.flatMap(s => s.courses || (s.course ? [s.course] : [])).filter(Boolean),
  ])].sort();
  const filterEl = document.getElementById('student-filter-course');
  const prevVal = filterEl.value;
  filterEl.innerHTML = `<option value="">Curso</option>` +
    courseNames.map(c => `<option value="${window.App.escHtml(c)}" ${prevVal === c ? 'selected' : ''}>${window.App.escHtml(c)}</option>`).join('');

  // Populate group filter
  const groups = (window.App.state.groups || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const groupFilterEl = document.getElementById('student-filter-group');
  const prevGroupVal = groupFilterEl.value;
  groupFilterEl.innerHTML = `<option value="">Grupo</option>` +
    groups.map(g => `<option value="${g.id}" ${prevGroupVal === g.id ? 'selected' : ''}>${window.App.escHtml(g.name)}</option>`).join('');

  window.App.applyStudentFilters();
};

window.App.applyStudentFilters = function() {
  const query  = document.getElementById('student-search').value.toLowerCase().trim();
  const course = document.getElementById('student-filter-course').value;
  const groupId = document.getElementById('student-filter-group').value;
  const activeFilter = document.getElementById('student-filter-active').value;

  let students = window.App.state.students;
  if (query)  students = students.filter(s => s.name.toLowerCase().includes(query) || (s.phone || '').includes(query));
  if (course) students = students.filter(s => (s.courses || []).includes(course));
  
  // Filter by group
  if (groupId) {
    const group = window.App.state.groups?.find(g => g.id === groupId);
    if (group) {
      students = students.filter(s => (group.studentIds || []).includes(s.id));
    }
  }
  
  // Filter by active status (default to active if property doesn't exist)
  if (activeFilter === 'active') {
    students = students.filter(s => s.active !== false);
  } else if (activeFilter === 'inactive') {
    students = students.filter(s => s.active === false);
  }

  const list = document.getElementById('students-list');
  if (students.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
        </svg>
        <p>No hay alumnos registrados</p>
      </div>`;
  } else {
    // Sort students alphabetically by name
    const sortedStudents = students.slice().sort((a, b) => a.name.localeCompare(b.name));
    list.innerHTML = sortedStudents.map(s => window.App.buildStudentCard(s)).join('');
  }
}

window.App.buildStudentCard = function(s) {
  const pendingReceipts = (s.receipts || []).filter(r => r.status === 'pending');
  const isActive = s.active !== false; // Default to active if not set
  
  // Get student groups
  const studentGroups = window.App.state.groups.filter(g => (g.studentIds || []).includes(s.id));
  const groupsText = studentGroups.length > 0 
    ? studentGroups.map(g => g.name).join(', ')
    : '–';
  const coursesText = (s.courses || []).join(', ');
  const multiCourseBadge = window.App.isMultiCourseStudent(s)
    ? '<span style="background:#6366f1;color:white;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;margin-left:6px;">Multi-curso</span>'
    : '';
  
  return `
    <div class="student-card" style="${!isActive ? 'opacity:0.6;' : ''}">
      <div style="display:flex;gap:12px;margin-bottom:12px;">
        <div class="student-avatar">${window.App.initials(s.name)}</div>
        <div class="student-info">
          <div class="student-name">${window.App.escHtml(s.name)}${multiCourseBadge}</div>
          <div class="student-meta">
            ${coursesText ? '<strong>Cursos:</strong> ' + window.App.escHtml(coursesText) : ''}
            ${coursesText && studentGroups.length > 0 ? ' · ' : ''}
            ${studentGroups.length > 0 ? '<strong>Grupos:</strong> ' + window.App.escHtml(groupsText) : ''}
            ${(coursesText || studentGroups.length > 0) && s.phone ? '<br>' : ''}
            ${s.phone ? '📱 ' + window.App.escHtml(s.phone) : ''}          ${s.phone && s.createdAt ? '<br>' : ''}
          ${s.createdAt ? '📅 Desde: ' + window.App.fmtDate(s.createdAt) : ''}          </div>
          ${pendingReceipts.length > 0 ? `
            <button class="receipt-pending-badge" onclick="window.openStudentReceipts('${s.id}')">
              📄 ${pendingReceipts.length} recibo${pendingReceipts.length !== 1 ? 's' : ''} pendiente${pendingReceipts.length !== 1 ? 's' : ''}
            </button>` : ''}
        </div>
        <div class="student-actions">
          ${!isActive ? '<span style="background:#ef4444;color:white;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;margin-bottom:8px;">INACTIVO</span>' : ''}
          <button class="btn btn-sm ${isActive ? 'btn-secondary' : 'btn-primary'}" onclick="window.App.toggleStudentActive('${s.id}')" title="${isActive ? 'Desactivar' : 'Activar'} alumno" style="width:100%">
            ${isActive ? '❌ Desactivar' : '✅ Activar'}
          </button>
        </div>
      </div>
      <div class="student-card-actions">
        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); window.App.createClassForStudent('${s.id}')" title="Crear clase individual" ${!isActive ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Crear clase
        </button>
        <button class="btn btn-sm btn-success" onclick="window.openStudentReceipts('${s.id}')" title="Ver recibos">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Recibos
        </button>
        <button class="btn btn-icon" onclick="window.openEditStudent('${s.id}')" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-icon" style="color:var(--danger)" onclick="window.deleteStudent('${s.id}')" title="Eliminar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
}

window.App.openNewStudent = function() {
  document.getElementById('modal-student-title').textContent = 'Nuevo alumno';
  document.getElementById('student-id').value      = '';
  document.getElementById('student-name').value    = '';
  document.getElementById('student-phone').value   = '';
  document.getElementById('student-balance').value = '0';
  populateCoursesMultiSelect('student-courses', []);
  populatePrimaryCourseSelect('');
  window.App.openModal('modal-student');
}

window.App.openEditStudent = function(studentId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;
  document.getElementById('modal-student-title').textContent = 'Editar alumno';
  document.getElementById('student-id').value      = s.id;
  document.getElementById('student-name').value    = s.name;
  document.getElementById('student-phone').value   = s.phone || '';
  document.getElementById('student-balance').value = parseFloat(s.balance) || 0;
  populateCoursesMultiSelect('student-courses', s.courses || (s.course ? [s.course] : []));
  populatePrimaryCourseSelect(s.primaryCourse || '');
  window.App.openModal('modal-student');
}

window.App.saveStudent = function(e) {
  e.preventDefault();
  const id      = document.getElementById('student-id').value;
  const name    = document.getElementById('student-name').value.trim();
  const phone   = document.getElementById('student-phone').value.trim();
  const courses = Array.from(document.getElementById('student-courses').selectedOptions).map(o => o.value);
  const primaryCourse = document.getElementById('student-primary-course').value || courses[0] || '';
  const balance = parseFloat(document.getElementById('student-balance').value) || 0;

  if (!name) {
    window.App.showToast('El nombre es obligatorio', 'error');
    return;
  }

  if (id) {
    const s = window.App.state.students.find(s => s.id === id);
    if (s) { s.name = name; s.phone = phone; s.courses = courses; s.course = courses[0] || ''; s.primaryCourse = primaryCourse; s.balance = balance; }
  } else {
    window.App.state.students.push({ 
      id: window.App.uid(), 
      name, 
      phone, 
      courses,
      course: courses[0] || '',
      primaryCourse,
      createdAt: window.App.todayStr(), 
      balance,
      receipts: [],
      active: true  // New students are active by default
    });
  }

  window.App.saveState();
  window.App.closeModal('modal-student');
  window.App.renderCurrentTab();
  window.App.showToast(id ? 'Alumno actualizado' : 'Alumno añadido', 'success');
}

window.App.deleteStudent = function(studentId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;
  window.App.confirmAction(
    'Eliminar alumno',
    `¿Eliminar a ${s.name}? Se eliminará de todas las clases.`,
    () => {
      window.App.state.students = window.App.state.students.filter(s => s.id !== studentId);
      window.App.state.classes.forEach(c => {
        c.studentIds = c.studentIds.filter(id => id !== studentId);
      });
      window.App.state.classes = window.App.state.classes.filter(c => c.studentIds.length > 0);
      window.App.saveState();
      window.App.renderCurrentTab();
      window.App.showToast('Alumno eliminado');
    }
  );
}

// Toggle student active/inactive status
window.App.toggleStudentActive = function(studentId) {
  const student = window.App.state.students.find(s => s.id === studentId);
  if (!student) return;
  
  const isActive = student.active !== false;
  const newStatus = !isActive;
  
  window.App.confirmAction(
    newStatus ? 'Activar alumno' : 'Desactivar alumno',
    newStatus 
      ? `¿Activar a ${student.name}? Podrá ser seleccionado en clases y grupos.`
      : `¿Desactivar a ${student.name}? No podrá ser seleccionado en nuevas clases o grupos, pero se conservará su histórico.`,
    () => {
      student.active = newStatus;
      window.App.saveState();
      window.App.renderStudents();
      window.App.showToast(
        `${student.name} ${newStatus ? 'activado' : 'desactivado'}`,
        'success'
      );
    }
  );
}

function populateCoursesMultiSelect(selectId, selectedValues) {
  const sel = document.getElementById(selectId);
  const sorted = window.App.state.courses.slice().sort((a, b) => a.name.localeCompare(b.name));
  // Include orphan course names (old data) not in courses list
  const extra = (selectedValues || []).filter(v => v && !sorted.find(c => c.name === v));
  sel.innerHTML = sorted.map(c =>
      `<option value="${window.App.escHtml(c.name)}" ${selectedValues.includes(c.name) ? 'selected' : ''}>${window.App.escHtml(c.name)}</option>`
    ).join('') +
    extra.map(v => `<option value="${window.App.escHtml(v)}" selected>${window.App.escHtml(v)} (sin lista)</option>`).join('');
  if (sorted.length === 0 && extra.length === 0) {
    sel.innerHTML = `<option value="" disabled style="color:var(--gray-400)">— Crea cursos desde la pestaña Cursos —</option>`;
  }
}

// Populate the "primary course" select from the currently selected courses in the picker.
function populatePrimaryCourseSelect(selectedValue) {
  const wrap = document.getElementById('student-primary-course-wrap');
  const sel = document.getElementById('student-primary-course');
  const selectedCourses = Array.from(document.getElementById('student-courses').selectedOptions).map(o => o.value);

  if (selectedCourses.length < 2) {
    if (wrap) wrap.classList.add('hidden');
    sel.innerHTML = selectedCourses.map(c => `<option value="${window.App.escHtml(c)}">${window.App.escHtml(c)}</option>`).join('');
    return;
  }
  if (wrap) wrap.classList.remove('hidden');
  const primary = selectedCourses.includes(selectedValue) ? selectedValue : selectedCourses[0];
  sel.innerHTML = selectedCourses.map(c =>
    `<option value="${window.App.escHtml(c)}" ${c === primary ? 'selected' : ''}>${window.App.escHtml(c)}</option>`
  ).join('');
}

// A student enrolled in more than one course simultaneously
window.App.isMultiCourseStudent = function(s) {
  return (s.courses || (s.course ? [s.course] : [])).length > 1;
};

// Initialize student events
window.App.initStudentEvents = function() {
  document.getElementById('btn-new-student').addEventListener('click', window.App.openNewStudent);
  document.getElementById('form-student').addEventListener('submit', window.App.saveStudent);
  document.getElementById('student-search').addEventListener('input', window.App.applyStudentFilters);
  document.getElementById('student-filter-course').addEventListener('change', window.App.applyStudentFilters);
  document.getElementById('student-filter-group').addEventListener('change', window.App.applyStudentFilters);
  document.getElementById('student-filter-active').addEventListener('change', window.App.applyStudentFilters);
  document.getElementById('student-courses').addEventListener('change', () => populatePrimaryCourseSelect(document.getElementById('student-primary-course').value));
}

// Create a new individual class for a specific student
window.App.createClassForStudent = function(studentId) {
  const student = window.App.state.students.find(s => s.id === studentId);
  if (!student) return;
  
  // Switch to classes tab
  window.App.switchTab('classes');
  
  // Small delay to ensure tab is rendered
  setTimeout(() => {
    // Open new class modal with locked student
    window.App.openNewClass(null, studentId);
  }, 100);
}

// Make functions globally available for onclick handlers
if (typeof window !== 'undefined') {
  window.openEditStudent = window.App.openEditStudent;
  window.deleteStudent = window.App.deleteStudent;
}
