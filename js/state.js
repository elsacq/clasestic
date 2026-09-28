/* =============================================
   State Management
   ============================================= */

window.App = window.App || {};

window.App.state = {
  courses:  [],   // { id, name, description }
  students: [],   // { id, name, phone, course, groups, createdAt, balance, receipts[] }
  groups:   [],   // { id, name, description, studentIds[] }
  classes:  [],   // { id, type, course, date, time, fee, studentIds, groupId, gcalEventId? }
  settings: {
    academyName: 'Mi Academia',
    defaultIndividualFee: 15,
    defaultGroupFee: 10,
    gcalClientId: '',
    gcalCalendarId: 'primary',
    githubToken: '',
    githubGistUrl: '',
    whatsappPhoneId: '',
    whatsappToken: '',
    whatsappBusinessId: '',
  },
  receiptCounter: 0,
  lastModified: null,
};

// UI State
window.App.calendarDate = new Date();  // currently viewed month
window.App.detailClassId = null;
window.App.confirmCallback = null;

// Google Calendar state
window.App.gcalTokenClient = null;
window.App.gcalAccessToken = null;

// GitHub state
window.App.githubSyncTimer = null;
window.App.githubPullTimer = null;
window.App.githubSyncing = false;
window.App.githubLastSync = null;
window.App.githubStatus = 'unconfigured';

window.App.setState = function(newState) {
  Object.assign(window.App.state, newState);
};

window.App.setCalendarDate = function(date) {
  window.App.calendarDate = date;
};

window.App.setDetailClassId = function(id) {
  window.App.detailClassId = id;
};

window.App.setConfirmCallback = function(callback) {
  window.App.confirmCallback = callback;
};

window.App.setGcalTokenClient = function(client) {
  window.App.gcalTokenClient = client;
};

window.App.setGcalAccessToken = function(token) {
  window.App.gcalAccessToken = token;
};

window.App.setGithubSyncTimer = function(timer) {
  window.App.githubSyncTimer = timer;
};

window.App.setGithubSyncing = function(syncing) {
  window.App.githubSyncing = syncing;
};

window.App.setGithubLastSync = function(date) {
  window.App.githubLastSync = date;
};

window.App.setGithubStatus = function(status) {
  window.App.githubStatus = status;
};
