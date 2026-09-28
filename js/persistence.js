/* =============================================
   Persistence Module
   Handles localStorage, export, import
   ============================================= */

window.App = window.App || {};

// Save only to localStorage (no timestamp update, no GitHub push).
// Used internally by sync code to avoid re-triggering pushes.
window.App.saveLocalOnly = function() {
  try {
    localStorage.setItem(window.App.CONFIG.storageKey, JSON.stringify(window.App.state));
  } catch (e) {
    window.App.showToast(window.App.MESSAGES.errorSaving, 'error');
  }
};

// Save to localStorage, stamp lastModified, and schedule a GitHub push.
window.App.saveState = function() {
  window.App.state.lastModified = new Date().toISOString();
  window.App.saveLocalOnly();
  window.App.scheduleGithubPush();
};

window.App.loadState = function() {
  try {
    const raw = localStorage.getItem(window.App.CONFIG.storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.students) && Array.isArray(parsed.classes)) {
        window.App.setState(parsed);
        // backward-compat: old exports may not have courses
        if (!Array.isArray(window.App.state.courses)) window.App.state.courses = [];
      }
    }
  } catch (e) {
    // corrupt data – start fresh
    window.App.setState({ 
      courses: [], 
      students: [], 
      classes: [],
      settings: {},
      receiptCounter: 0,
      lastModified: null
    });
  }
  // backward-compat: ensure new fields exist
  if (!window.App.state.settings) {
    window.App.state.settings = { 
      academyName: window.App.CONFIG.defaultAcademyName,
      defaultIndividualFee: 15,
      defaultGroupFee: 10,
      gcalClientId: '', 
      gcalCalendarId: 'primary',
      githubToken: '',
      githubGistUrl: ''
    };
  }
  if (!window.App.state.settings.academyName)    window.App.state.settings.academyName    = window.App.CONFIG.defaultAcademyName;
  if (window.App.state.settings.defaultIndividualFee === undefined) window.App.state.settings.defaultIndividualFee = 15;
  if (window.App.state.settings.defaultGroupFee === undefined) window.App.state.settings.defaultGroupFee = 10;
  if (!window.App.state.settings.gcalCalendarId) window.App.state.settings.gcalCalendarId = 'primary';
  if (!window.App.state.settings.githubToken)    window.App.state.settings.githubToken    = '';
  if (!window.App.state.settings.githubGistUrl)  window.App.state.settings.githubGistUrl  = '';
  if (!Array.isArray(window.App.state.groups))   window.App.state.groups = [];
  if (!window.App.state.receiptCounter) window.App.state.receiptCounter = 0;
  if (!window.App.state.lastModified)   window.App.state.lastModified   = null;
  window.App.state.students.forEach(s => { if (!Array.isArray(s.receipts)) s.receipts = []; });
};

// Export data as JSON file
window.App.exportData = function() {
  const blob = new Blob([JSON.stringify(window.App.state, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `academia_mvp_${window.App.todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  window.App.showToast(window.App.MESSAGES.dataExported, 'success');
};

// Import data from JSON file
window.App.importData = function(file, renderAllCallback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!Array.isArray(parsed.students) || !Array.isArray(parsed.classes)) {
        window.App.showToast(window.App.MESSAGES.errorImporting, 'error');
        return;
      }
      if (!Array.isArray(parsed.courses)) parsed.courses = [];
      
      window.App.confirmAction(
        '¿Importar base de datos?',
        'Se reemplazarán todos los datos actuales. Esta acción no se puede deshacer.',
        () => {
          window.App.setState(parsed);
          window.App.saveState();
          if (renderAllCallback) renderAllCallback();
          window.App.showToast(window.App.MESSAGES.dataImported, 'success');
        }
      );
    } catch {
      window.App.showToast(window.App.MESSAGES.errorImporting, 'error');
    }
  };
  reader.readAsText(file);
  // reset input so same file can be imported again
  document.getElementById('btn-import').value = '';
};
