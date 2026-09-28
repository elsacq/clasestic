/* =============================================
   Main Application Entry Point
   Initializes all modules and event listeners
   ============================================= */

window.App = window.App || {};

// Settings modal functions
function openSettingsModal() {
  document.getElementById('settings-academy-name').value      = window.App.state.settings?.academyName    || '';
  document.getElementById('settings-default-individual-fee').value = window.App.state.settings?.defaultIndividualFee ?? 15;
  document.getElementById('settings-gcal-client-id').value    = window.App.state.settings?.gcalClientId   || '';
  document.getElementById('settings-gcal-calendar-id').value  = window.App.state.settings?.gcalCalendarId || 'primary';
  document.getElementById('settings-gh-token').value    = window.App.state.settings?.githubToken   || '';
  document.getElementById('settings-gh-gist-url').value = window.App.state.settings?.githubGistUrl || '';
  document.getElementById('settings-whatsapp-phone-id').value = window.App.state.settings?.whatsappPhoneId || '';
  document.getElementById('settings-whatsapp-token').value = window.App.state.settings?.whatsappToken || '';
  document.getElementById('settings-whatsapp-business-id').value = window.App.state.settings?.whatsappBusinessId || '';
  window.App.updateGCalUI();
  window.App.setGithubStatus(window.App.githubStatus);
  window.App.openModal('modal-settings');
}

function saveSettings() {
  const academyName    = document.getElementById('settings-academy-name').value.trim();
  const defaultIndividualFee = parseFloat(document.getElementById('settings-default-individual-fee').value) || 15;
  const gcalClientId   = document.getElementById('settings-gcal-client-id').value.trim();
  const gcalCalendarId = document.getElementById('settings-gcal-calendar-id').value.trim() || 'primary';
  const githubToken   = document.getElementById('settings-gh-token').value.trim();
  const githubGistUrl = document.getElementById('settings-gh-gist-url').value.trim();
  const whatsappPhoneId  = document.getElementById('settings-whatsapp-phone-id').value.trim();
  const whatsappToken  = document.getElementById('settings-whatsapp-token').value.trim();
  const whatsappBusinessId  = document.getElementById('settings-whatsapp-business-id').value.trim();
  
  window.App.state.settings = {
    academyName: academyName || 'Mi Academia',
    defaultIndividualFee,
    gcalClientId, gcalCalendarId,
    githubToken, githubGistUrl,
    whatsappPhoneId, whatsappToken, whatsappBusinessId,
  };
  
  // Update page title with academy name
  document.title = `${window.App.state.settings.academyName} - Gestión de Clases`;
  document.getElementById('app-title').textContent = window.App.state.settings.academyName;
  
  window.App.saveState();
  window.App.closeModal('modal-settings');
  window.App.showToast('Ajustes guardados', 'success');
  
  window.App.initGCalTokenClient();
  const cfg = window.App.getGithubConfig();
  window.App.setGithubStatus(cfg ? 'pending' : 'unconfigured');
}

// Initialize all event listeners
function initEvents() {
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => window.App.switchTab(btn.dataset.tab));
  });

  // Export / Import
  document.getElementById('btn-export').addEventListener('click', window.App.exportData);
  document.getElementById('btn-import-trigger').addEventListener('click', () =>
    document.getElementById('btn-import').click()
  );
  document.getElementById('btn-import').addEventListener('change', (e) => {
    if (e.target.files[0]) window.App.importData(e.target.files[0], window.App.renderAll);
  });

  // Settings
  if (document.getElementById('btn-settings')) {
    document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
  }
  if (document.getElementById('btn-save-settings')) {
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  }

  // GitHub Sync
  if (document.getElementById('btn-github-sync')) {
    document.getElementById('btn-github-sync').addEventListener('click', window.App.manualGithubSync);
  }
  if (document.getElementById('btn-test-github')) {
    document.getElementById('btn-test-github').addEventListener('click', window.App.testGithubConnection);
  }

  // Google Calendar
  if (document.getElementById('btn-gcal-connect')) {
    document.getElementById('btn-gcal-connect').addEventListener('click', window.App.connectGCal);
  }
  if (document.getElementById('btn-gcal-disconnect')) {
    document.getElementById('btn-gcal-disconnect').addEventListener('click', window.App.disconnectGCal);
  }
  if (document.getElementById('btn-gcal-sync')) {
    document.getElementById('btn-gcal-sync').addEventListener('click', window.App.syncAllToGCal);
  }

  // Modal close buttons & backdrop
  document.querySelectorAll('.modal-close, [data-modal]').forEach(el => {
    el.addEventListener('click', () => window.App.closeModal(el.dataset.modal));
  });
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', () => {
      const modal = backdrop.closest('.modal');
      if (modal) window.App.closeModal(modal.id);
    });
  });

  // Initialize module-specific events
  window.App.initConfirmEvents();
  window.App.initStudentEvents();
  window.App.initClassEvents();
  window.App.initGroupEvents();
  window.App.initReceiptEvents();
  window.App.initReportsEvents();
  window.App.initCourseEvents();
  window.App.initCalendarEvents();
  window.App.initDashboardEvents();
}

// Main initialization
async function init() {
  window.App.loadState();

  // Initialize flatpickr date picker (dd/mm/yyyy display, yyyy-mm-dd internal)
  window.App._datePicker = flatpickr('#class-date', {
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd/m/Y',
    allowInput: true,
    locale: { firstDayOfWeek: 1 },
    onChange: function(_dates, _dateStr, instance) {
      instance.input.dispatchEvent(new Event('change'));
    }
  });
  
  // Update page title with academy name
  const academyName = window.App.state.settings?.academyName || 'Academia TIC';
  document.title = `${academyName} - Gestión de Clases`;
  document.getElementById('app-title').textContent = academyName;
  
  initEvents();
  window.App.initGCalTokenClient();
  window.App.updateGCalUI();
  window.App.initGithubStatus();
  
  // Pull from GitHub FIRST to ensure we have latest data
  // This will overwrite local data if GitHub has newer version
  const pulled = await window.App.githubPull();
  
  // Update title again in case GitHub sync changed the academy name
  const finalAcademyName = window.App.state.settings?.academyName || 'Academia TIC';
  document.title = `${finalAcademyName} - Gestión de Clases`;
  document.getElementById('app-title').textContent = finalAcademyName;
  
  // Now render with the latest data (either from GitHub or local)
  window.App.renderDashboard();
}

// Make functions globally available for onclick handlers and Google SDK callback
if (typeof window !== 'undefined') {
  window.onGISLoaded = window.App.onGISLoaded;
  
  // Student functions
  window.openEditStudent = window.App.openEditStudent;
  window.deleteStudent = window.App.deleteStudent;
  window.generateReceipt = window.App.generateReceipt;
  window.openStudentReceipts = window.App.openStudentReceipts;
  
  // Class functions
  window.openNewClass = window.App.openNewClass;
  window.openClassDetail = window.App.openClassDetail;
  
  // Course functions
  window.openEditCourse = window.App.openEditCourse;
  window.deleteCourse = window.App.deleteCourse;
  
  // Calendar functions
  window.openDayClasses = window.App.openDayClasses;
  
  // Receipt functions
  window.cancelReceipt = window.App.cancelReceipt;
  window.downloadReceiptPdf = window.App.downloadReceiptPdf;
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', init);
