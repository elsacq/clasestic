/* =============================================
   Utility Functions
   ============================================= */

window.App = window.App || {};

// Calculate student balance dynamically based on past classes
window.App.calculateStudentBalance = function(studentId) {
  const s = window.App.state.students.find(st => st.id === studentId);
  if (!s) return 0;
  
  const today = window.App.todayStr();
  
  // Get past classes
  const pastClasses = window.App.state.classes.filter(c => c.date <= today && c.studentIds.includes(studentId));
  
  // Sum fees from past classes (date <= today)
  const classesTotal = pastClasses.reduce((sum, c) => sum + (parseFloat(c.fee) || 0), 0);
  
  // Sum amounts from paid receipts only (sent receipts are still debt)
  const studentReceipts = s.receipts || [];
  const receiptsTotal = studentReceipts
    .filter(r => r.status === 'paid')
    .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  
  // Debug logging (remove after verification)
  if (window.location.hash === '#debug') {
    console.log(`[${s.name}] Today: ${today}`);
    console.log('Past classes:', pastClasses.map(c => ({date: c.date, fee: c.fee, isPast: c.date <= today})));
    console.log(`Classes Total: ${classesTotal}€, Receipts Total: ${receiptsTotal}€, Balance: ${classesTotal - receiptsTotal}€`);
    console.log('Receipts:', studentReceipts.map(r => ({number: r.number, amount: r.amount, status: r.status})));
  }
  
  return Math.max(0, classesTotal - receiptsTotal);
};

window.App.uid = function() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
};

window.App.fmtDate = function(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

window.App.fmtCurrency = function(val) {
  const n = parseFloat(val) || 0;
  return n.toFixed(2).replace('.', ',') + ' €';
};

window.App.dayOfWeek = function(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0=Sun
  return window.App.DAYS_ES[dow === 0 ? 6 : dow - 1];    // Mon=0 in our array
};

window.App.initials = function(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
};

window.App.todayStr = function() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Convert yyyy-mm-dd → dd/mm/yyyy (for display)
window.App.toDisplayDate = function(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
};

// Convert dd/mm/yyyy → yyyy-mm-dd (for storage)
window.App.fromDisplayDate = function(displayDate) {
  if (!displayDate) return '';
  const [d, m, y] = displayDate.split('/');
  if (!d || !m || !y) return '';
  return `${y}-${m}-${d}`;
};

window.App.currentTimeStr = function() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

window.App.formatDateStr = function(year, month, day) {
  const y = year;
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

window.App.escHtml = function(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};
