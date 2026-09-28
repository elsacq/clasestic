/* =============================================
   Dashboard Module
   Dashboard view with stats and upcoming classes
   ============================================= */

window.App = window.App || {};

window.App.renderDashboard = function() {
  // Stats - only count active students (active !== false)
  const totalStudents = window.App.state.students.filter(s => s.active !== false).length;
  const inactiveStudents = window.App.state.students.filter(s => s.active === false).length;
  const totalGroups = (window.App.state.groups || []).length;
  const totalCourses = (window.App.state.courses || []).length;
  
  // Count classes for current month (past and future)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const nowDateTime = `${window.App.todayStr()}T${window.App.currentTimeStr()}`;
  
  const classesThisMonth = window.App.state.classes.filter(c => c.date.startsWith(monthPrefix));
  const pastClassesThisMonth = classesThisMonth.filter(c => {
    const classDateTime = `${c.date}T${c.time}`;
    return classDateTime <= nowDateTime;
  }).length;
  const futureClassesThisMonth = classesThisMonth.filter(c => {
    const classDateTime = `${c.date}T${c.time}`;
    return classDateTime > nowDateTime;
  }).length;
  
  // Students with debt: ONLY those with unpaid receipts (sent/pending)
  const studentsWithDebt = window.App.state.students.filter(s => {
    // Check for unpaid receipts (pending or sent, not paid)
    const unpaidReceipts = (s.receipts || []).filter(r => r.status !== 'paid');
    return unpaidReceipts.length > 0;
  });
  
  // Calculate total debt from unpaid receipts only
  const totalDebt = studentsWithDebt.reduce((sum, s) => {
    const unpaidAmount = (s.receipts || [])
      .filter(r => r.status !== 'paid')
      .reduce((s2, r) => s2 + (parseFloat(r.amount) || 0), 0);
    return sum + unpaidAmount;
  }, 0);

  // Calculate income from past classes this month (impartidas)
  const pastClasses = classesThisMonth.filter(c => {
    const classDateTime = `${c.date}T${c.time}`;
    return classDateTime <= nowDateTime;
  });
  const monthIncome = pastClasses.reduce((sum, c) => {
    const fee = parseFloat(c.fee) || 0;
    const studentCount = (c.studentIds || []).length;
    return sum + (fee * studentCount);
  }, 0);

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card stat-primary">
      <span class="stat-label">Alumnos</span>
      <span class="stat-value">${totalStudents}</span>
      <small style="font-size:0.75rem;opacity:0.8;margin-top:4px">${totalGroups} grupos · ${totalCourses} cursos${inactiveStudents > 0 ? ` · ${inactiveStudents} inactivo${inactiveStudents !== 1 ? 's' : ''}` : ''}</small>
    </div>
    <div class="stat-card stat-warning">
      <span class="stat-label">Clases este mes</span>
      <span class="stat-value">${pastClassesThisMonth} + ${futureClassesThisMonth}</span>
      <small style="font-size:0.75rem;opacity:0.8;margin-top:4px">Impartidas + Futuras</small>
    </div>
    <div class="stat-card stat-danger">
      <span class="stat-label">Con deuda</span>
      <span class="stat-value">${studentsWithDebt.length}</span>
      <small style="font-size:0.75rem;opacity:0.8;margin-top:4px">${window.App.fmtCurrency(totalDebt)} · Recibos no pagados</small>
    </div>
    <div class="stat-card stat-success">
      <span class="stat-label">Ingresos mes</span>
      <span class="stat-value" style="font-size:1.1rem">${window.App.fmtCurrency(monthIncome)}</span>
      <small style="font-size:0.75rem;opacity:0.8;margin-top:4px">${pastClasses.length} clases impartidas</small>
    </div>
  `;

  // Upcoming classes (future from current moment, sorted)
  const upcoming = window.App.state.classes
    .filter(c => {
      const classDateTime = `${c.date}T${c.time}`;
      return classDateTime > nowDateTime;
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 5);

  const upcomingEl = document.getElementById('upcoming-classes');
  if (upcoming.length === 0) {
    upcomingEl.innerHTML = `<p class="empty-state" style="padding:20px 0"><small>No hay clases próximas</small></p>`;
  } else {
    upcomingEl.innerHTML = upcoming.map(c => {
      const d = c.date.split('-');
      const names = c.studentIds.map(id => {
        const s = window.App.state.students.find(s => s.id === id);
        return s ? s.name.split(' ')[0] : '?';
      }).join(', ');
      return `
        <div class="upcoming-item" data-class-id="${c.id}">
          <div class="upcoming-date-block">
            <div class="day">${d[2]}</div>
            <div class="month">${window.App.MONTHS_SHORT[parseInt(d[1]) - 1]}</div>
          </div>
          <div class="upcoming-info">
            <div class="title">${c.course || (c.type === 'individual' ? 'Individual' : 'Grupal')}</div>
            <div class="meta">${c.time} · ${c.studentIds.length} alumno${c.studentIds.length !== 1 ? 's' : ''} · ${names}</div>
          </div>
          <span class="class-type-badge ${c.type}">${c.type}</span>
        </div>`;
    }).join('');
  }

  // Students with debt (unpaid receipts only)
  const debtorEl = document.getElementById('debtor-students');
  if (studentsWithDebt.length === 0) {
    debtorEl.innerHTML = `<p class="empty-state" style="padding:20px 0"><small>Sin recibos pendientes de pago 🎉</small></p>`;
  } else {
    // Sort by total unpaid receipt amount (highest first)
    const sorted = [...studentsWithDebt].sort((a, b) => {
      const getUnpaidAmount = (s) => {
        return (s.receipts || [])
          .filter(r => r.status !== 'paid')
          .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
      };
      return getUnpaidAmount(b) - getUnpaidAmount(a);
    }).slice(0, 6);
    debtorEl.innerHTML = sorted.map(s => window.App.buildDebtorCard(s)).join('');
  }
}

// Build debtor card for dashboard (shows only unpaid receipts)
window.App.buildDebtorCard = function(s) {
  const today = window.App.todayStr();
  
  // Get unpaid receipts (pending or sent)
  const unpaidReceipts = (s.receipts || [])
    .filter(r => r.status !== 'paid')
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  
  const totalDebt = unpaidReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  
  const statusLabels = { pending: 'Pendiente', sent: 'Enviado', paid: 'Pagado' };
  const statusColors = { pending: '#f59e0b', sent: '#3b82f6', paid: '#10b981' };
  
  return `
    <div class="student-card">
      <div class="student-avatar">${window.App.initials(s.name)}</div>
      <div class="student-info">
        <div class="student-name">${window.App.escHtml(s.name)}</div>
        <div class="student-meta">
          <strong>${window.App.fmtCurrency(totalDebt)}</strong> · 
          ${unpaidReceipts.length} recibo${unpaidReceipts.length !== 1 ? 's' : ''} sin pagar
        </div>
        <div style="margin-top:8px; font-size:0.85rem; color:var(--text-secondary);">
          ${unpaidReceipts.map(r => `
            <div style="display:flex; justify-content:space-between; padding:6px 8px; margin:4px -8px; border-bottom:1px solid var(--border-light); background:#fff8e1; border-radius:4px;">
              <span style="color:${statusColors[r.status]};font-weight:500;">📄 Recibo ${r.number} · ${statusLabels[r.status]}</span>
              <span style="font-weight:600;">${window.App.fmtCurrency(r.amount)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
}

window.App.renderAll = function() {
  window.App.renderCurrentTab();
}

// Initialize dashboard events
window.App.initDashboardEvents = function() {
  document.getElementById('upcoming-classes').addEventListener('click', (e) => {
    const item = e.target.closest('[data-class-id]');
    if (item) {
      window.App.openClassDetail(item.dataset.classId);
    }
  });
}
