/* =============================================
   UI Module
   Toast notifications, modals, confirm dialogs, navigation
   ============================================= */

window.App = window.App || {};

let toastTimer = null;

window.App.showToast = function(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add('hidden'); }, 2600);
};

window.App.confirmAction = function(title, message, onConfirm) {
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').textContent = message;
  window.App.setConfirmCallback(onConfirm);
  window.App.openModal('modal-confirm');
};

window.App.openModal = function(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

window.App.closeModal = function(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
};

window.App.switchTab = function(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${tabName}"]`).classList.add('active');

  // Call render functions directly instead of dynamic import
  if (tabName === 'dashboard') {
    window.App.renderDashboard();
  }
  if (tabName === 'students') {
    window.App.renderStudents();
  }
  if (tabName === 'classes') {
    window.App.renderClasses();
  }
  if (tabName === 'calendar') {
    window.App.renderCalendar();
  }
  if (tabName === 'groups') {
    window.App.renderGroups();
  }
  if (tabName === 'receipts') {
    window.App.renderReceipts();
  }
  if (tabName === 'reports') {
    window.App.renderReports();
  }
  if (tabName === 'courses') {
    window.App.renderCourses();
  }
};

window.App.renderCurrentTab = function() {
  const active = document.querySelector('.tab-content.active');
  if (!active) return;
  const tab = active.id.replace('tab-', '');
  
  // Call render functions directly instead of dynamic import
  if (tab === 'dashboard') {
    window.App.renderDashboard();
  }
  if (tab === 'students') {
    window.App.renderStudents();
  }
  if (tab === 'classes') {
    window.App.renderClasses();
  }
  if (tab === 'calendar') {
    window.App.renderCalendar();
  }
  if (tab === 'groups') {
    window.App.renderGroups();
  }
  if (tab === 'receipts') {
    window.App.renderReceipts();
  }
  if (tab === 'reports') {
    window.App.renderReports();
  }
  if (tab === 'courses') {
    window.App.renderCourses();
  }
};

// Initialize confirm modal events
window.App.initConfirmEvents = function() {
  document.getElementById('confirm-ok').addEventListener('click', () => {
    window.App.closeModal('modal-confirm');
    if (typeof window.App.confirmCallback === 'function') {
      window.App.confirmCallback();
      window.App.setConfirmCallback(null);
    }
  });
  document.getElementById('confirm-cancel').addEventListener('click', () => {
    window.App.closeModal('modal-confirm');
    window.App.setConfirmCallback(null);
  });
};
