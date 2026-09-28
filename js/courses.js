/* =============================================
   Courses Module
   Course list, form, CRUD operations
   ============================================= */

window.App = window.App || {};

window.App.renderCourses = function() {
  const list = document.getElementById('courses-list');
  if (window.App.state.courses.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
          <path d="M6 12v5c3 3 9 3 12 0v-5"/>
        </svg>
        <p>No hay cursos creados</p>
      </div>`;
    return;
  }
  list.innerHTML = window.App.state.courses
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(c => {
      const studentCount = window.App.state.students.filter(s => s.course === c.name).length;
      return `
        <div class="card">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
            <div style="flex:1;min-width:0">
              <div style="font-size:0.95rem;font-weight:700;color:var(--gray-800)">${window.App.escHtml(c.name)}</div>
              ${c.description ? `<div style="font-size:0.78rem;color:var(--gray-500);margin-top:2px">${window.App.escHtml(c.description)}</div>` : ''}
              <div style="font-size:0.75rem;color:var(--gray-400);margin-top:5px">
                <span class="detail-student-chip">${studentCount} alumno${studentCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button class="btn btn-icon" onclick="window.openEditCourse('${c.id}')" title="Editar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn btn-icon" style="color:var(--danger)" onclick="window.deleteCourse('${c.id}')" title="Eliminar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
}

window.App.openNewCourse = function() {
  document.getElementById('modal-course-title').textContent = 'Nuevo curso';
  document.getElementById('course-id').value          = '';
  document.getElementById('course-name').value        = '';
  document.getElementById('course-description').value = '';
  window.App.openModal('modal-course');
}

window.App.openEditCourse = function(courseId) {
  const c = window.App.state.courses.find(c => c.id === courseId);
  if (!c) return;
  document.getElementById('modal-course-title').textContent = 'Editar curso';
  document.getElementById('course-id').value          = c.id;
  document.getElementById('course-name').value        = c.name;
  document.getElementById('course-description').value = c.description || '';
  window.App.openModal('modal-course');
}

window.App.saveCourse = function(e) {
  e.preventDefault();
  const id          = document.getElementById('course-id').value;
  const name        = document.getElementById('course-name').value.trim();
  const description = document.getElementById('course-description').value.trim();

  if (!name) { window.App.showToast('El nombre del curso es obligatorio', 'error'); return; }
  const duplicate = window.App.state.courses.find(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== id);
  if (duplicate) { window.App.showToast('Ya existe un curso con ese nombre', 'error'); return; }

  if (id) {
    const c = window.App.state.courses.find(c => c.id === id);
    if (c) {
      const oldName = c.name;
      c.name = name;
      c.description = description;
      // Rename references in students
      window.App.state.students.forEach(s  => { if (s.course   === oldName) s.course   = name; });
    }
  } else {
    window.App.state.courses.push({ id: window.App.uid(), name, description });
  }

  window.App.saveState();
  window.App.closeModal('modal-course');
  window.App.renderCurrentTab();
  window.App.showToast(id ? 'Curso actualizado' : 'Curso creado', 'success');
}

window.App.deleteCourse = function(courseId) {
  const c = window.App.state.courses.find(c => c.id === courseId);
  if (!c) return;
  const studentCount = window.App.state.students.filter(s => s.course === c.name).length;
  const extra = studentCount > 0
    ? ` Se borrará la referencia en ${studentCount} alumno${studentCount !== 1 ? 's' : ''}.`
    : '';
  window.App.confirmAction(
    'Eliminar curso',
    `¿Eliminar el curso "${c.name}"?${extra}`,
    () => {
      window.App.state.students.forEach(s  => { if (s.course  === c.name) s.course  = ''; });
      window.App.state.courses = window.App.state.courses.filter(co => co.id !== courseId);
      window.App.saveState();
      window.App.renderCurrentTab();
      window.App.showToast('Curso eliminado');
    }
  );
}

// Initialize course events
window.App.initCourseEvents = function() {
  document.getElementById('btn-new-course').addEventListener('click', window.App.openNewCourse);
  document.getElementById('form-course').addEventListener('submit', window.App.saveCourse);
}

// Make functions globally available for onclick handlers
if (typeof window !== 'undefined') {
  window.openEditCourse = window.App.openEditCourse;
  window.deleteCourse = window.App.deleteCourse;
}
