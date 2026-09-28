/* =============================================
   Groups Module
   Group list, form, CRUD operations
   ============================================= */

window.App = window.App || {};

window.App.renderGroups = function() {
  const groups = window.App.state.groups || [];
  const list = document.getElementById('groups-list');
  
  if (groups.length === 0) {
    list.innerHTML = '<p class="empty-state">No hay grupos creados. Crea uno con el botón "+".</p>';
    return;
  }
  
  const sorted = [...groups].sort((a, b) => a.name.localeCompare(b.name));
  list.innerHTML = sorted.map(g => window.App.buildGroupCard(g)).join('');
};

window.App.buildGroupCard = function(g) {
  const studentCount = (g.studentIds || []).length;
  const studentNames = (g.studentIds || []).map(id => {
    const s = window.App.state.students.find(st => st.id === id);
    return s ? s.name : '?';
  }).slice(0, 3);
  
  const moreStudents = studentCount > 3 ? ` +${studentCount - 3} más` : '';
  const feeStr = g.fee != null ? `${parseFloat(g.fee).toFixed(2).replace('.', ',')} €/alumno` : 'Sin tarifa';
  
  return `
    <div class="group-card">
      <div class="group-card-header">
        <h4>${window.App.escHtml(g.name)}</h4>
      </div>
      ${g.description ? `<p class="group-description">${window.App.escHtml(g.description)}</p>` : ''}
      <div class="group-stats">
        <span class="group-student-count">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          ${studentCount} alumno${studentCount !== 1 ? 's' : ''}
        </span>
        <span style="font-size:0.78rem;color:var(--gray-500)">${feeStr}</span>
      </div>
      ${studentCount > 0 ? `<div class="group-students">${studentNames.join(', ')}${moreStudents}</div>` : ''}
      <div class="group-card-actions">
        <button class="btn btn-sm btn-primary" onclick="window.createClassFromGroup('${g.id}')" title="Crear clase para este grupo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Crear clase
        </button>
        <button class="btn btn-icon" onclick="window.openEditGroup('${g.id}')" title="Editar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-icon btn-icon--danger" onclick="window.deleteGroup('${g.id}')" title="Eliminar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`;
};

window.App.openNewGroup = function() {
  document.getElementById('modal-group-title').textContent = 'Nuevo grupo';
  document.getElementById('group-id').value = '';
  document.getElementById('group-name').value = '';
  document.getElementById('group-description').value = '';
  document.getElementById('group-fee').value = '';
  window.App.buildGroupStudentsPicker([]);
  window.App.openModal('modal-group');
};

window.App.openEditGroup = function(groupId) {
  const g = window.App.state.groups.find(gr => gr.id === groupId);
  if (!g) return;
  
  document.getElementById('modal-group-title').textContent = 'Editar grupo';
  document.getElementById('group-id').value = g.id;
  document.getElementById('group-name').value = g.name;
  document.getElementById('group-description').value = g.description || '';
  document.getElementById('group-fee').value = g.fee != null ? g.fee : '';
  window.App.buildGroupStudentsPicker(g.studentIds || []);
  window.App.openModal('modal-group');
};

window.App.saveGroup = function(e) {
  e.preventDefault();
  
  const id = document.getElementById('group-id').value;
  const name = document.getElementById('group-name').value.trim();
  const description = document.getElementById('group-description').value.trim();
  const fee = parseFloat(document.getElementById('group-fee').value);
  
  if (!name) {
    window.App.showToast('El nombre del grupo es obligatorio', 'error');
    return;
  }
  if (isNaN(fee) || fee < 0) {
    window.App.showToast('La tarifa debe ser un número positivo', 'error');
    return;
  }
  
  const selectedStudents = window.App.getGroupPickerSelected();
  
  if (id) {
    // Edit existing
    const g = window.App.state.groups.find(gr => gr.id === id);
    if (g) {
      g.name = name;
      g.description = description;
      g.fee = fee;
      g.studentIds = selectedStudents;
      window.App.showToast('Grupo actualizado', 'success');
    }
  } else {
    // Create new
    window.App.state.groups.push({
      id: window.App.uid(),
      name,
      description,
      fee,
      studentIds: selectedStudents,
    });
    window.App.showToast('Grupo creado', 'success');
  }
  
  window.App.saveState();
  window.App.renderGroups();
  window.App.closeModal('modal-group');
};

window.App.deleteGroup = function(groupId) {
  const g = window.App.state.groups.find(gr => gr.id === groupId);
  if (!g) return;
  
  // Check if group is used in any class
  const usedInClasses = window.App.state.classes.some(c => c.groupId === groupId);
  if (usedInClasses) {
    window.App.showToast('No se puede eliminar: hay clases asociadas a este grupo', 'error');
    return;
  }
  
  window.App.confirmAction(
    'Eliminar grupo',
    `¿Seguro que quieres eliminar el grupo "${g.name}"?`,
    () => {
      window.App.state.groups = window.App.state.groups.filter(gr => gr.id !== groupId);
      window.App.saveState();
      window.App.renderGroups();
      window.App.showToast('Grupo eliminado', 'success');
    }
  );
};

window.App.buildGroupStudentsPicker = function(selectedIds) {
  const picker = document.getElementById('group-students-picker');
  // Only show active students (active !== false)
  const students = [...window.App.state.students]
    .filter(s => s.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name));
  
  if (students.length === 0) {
    picker.innerHTML = '<p class="form-hint">No hay alumnos activos disponibles.</p>';
    return;
  }
  
  picker.innerHTML = students.map(s => {
    const isChecked = selectedIds.includes(s.id);
    return `
      <label class="picker-student ${isChecked ? 'selected' : ''}" data-id="${s.id}">
        <input type="checkbox" name="group_student" value="${s.id}" ${isChecked ? 'checked' : ''} />
        <div class="picker-check">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="2 6 5 9 10 3"/>
          </svg>
        </div>
        <span class="picker-name">${window.App.escHtml(s.name)}</span>
      </label>`;
  }).join('');
  
  // Add interaction
  picker.querySelectorAll('.picker-student').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const input = el.querySelector('input');
      el.classList.toggle('selected');
      input.checked = el.classList.contains('selected');
    });
  });
};

window.App.getGroupPickerSelected = function() {
  return Array.from(document.querySelectorAll('#group-students-picker input:checked')).map(cb => cb.value);
};

// Initialize group events
window.App.initGroupEvents = function() {
  const btnNew = document.getElementById('btn-new-group');
  if (btnNew) {
    btnNew.addEventListener('click', window.App.openNewGroup);
  }
  
  const form = document.getElementById('form-group');
  if (form) {
    form.addEventListener('submit', window.App.saveGroup);
  }
};

// Make functions globally available for onclick handlers
if (typeof window !== 'undefined') {
  window.openEditGroup = window.App.openEditGroup;
  window.deleteGroup = window.App.deleteGroup;
  window.createClassFromGroup = function(groupId) {
    window.App.openNewClassFromGroup(groupId);
  };
}
