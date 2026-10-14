/* =============================================
   Receipts Module
   Receipt generation, management, PDF export
   ============================================= */

window.App = window.App || {};

// Invoices (issued when a notice is paid) are numbered correlatively per year: YYYY-NNN.
function nextInvoiceNumber(year) {
  let max = 0;
  window.App.state.students.forEach(st => (st.receipts || []).forEach(r => {
    const m = /^(\d{4})-(\d+)$/.exec(r.invoice?.number || '');
    if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
  }));
  return `${year}-${String(max + 1).padStart(3, '0')}`;
}

function noticeMonth(r) {
  return r.monthlyItems?.[0]?.month || (r.generatedAt || window.App.todayStr()).substring(0, 7);
}

function receiptTitle(r) {
  return `Aviso de pago · ${getMonthLabel(noticeMonth(r))}${r.invoice ? ` · Factura ${r.invoice.number}` : ''}`;
}

function receiptActionsHtml(s, r) {
  return `
    ${r.status === 'pending' ? `
      <button class="btn btn-sm btn-secondary" onclick="window.markReceiptAsSent('${s.id}','${r.id}')">Marcar enviado</button>
      <button class="btn btn-sm btn-secondary" onclick="window.cancelReceipt('${s.id}','${r.id}')">Cancelar</button>
    ` : ''}
    ${r.status !== 'paid' ? `
      <button class="btn btn-sm btn-primary" onclick="window.markReceiptAsPaid('${s.id}','${r.id}')">Marcar pagado</button>
    ` : ''}
    <button class="btn btn-sm btn-secondary" onclick="window.downloadReceiptPdf('${s.id}','${r.id}')">PDF aviso</button>
    ${r.invoice ? `<button class="btn btn-sm btn-primary" onclick="window.downloadInvoicePdf('${s.id}','${r.id}')">PDF factura</button>` : ''}`;
}

// True if the group's monthly quota for the class's month was already billed in advance.
function isAdvanceBilled(s, c) {
  if (!c.groupId) return false;
  const month = c.date.substring(0, 7);
  return (s.receipts || []).some(r => (r.monthlyItems || []).some(i => i.month === month && (i.groupId === c.groupId || (i.extraGroupIds || []).includes(c.groupId))));
}

window.App.generateReceipt = function(studentId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;

  const today = window.App.todayStr();
  const billedClassIds = new Set();
  (s.receipts || []).forEach(r => (r.classIds || []).forEach(id => billedClassIds.add(id)));
  const unbilledClasses = window.App.state.classes.filter(
    c => c.date <= today && c.studentIds.includes(studentId) && !billedClassIds.has(c.id) && !isAdvanceBilled(s, c)
  );
  if (unbilledClasses.length === 0) {
    window.App.showToast('Este alumno no tiene clases pendientes de facturar', 'error');
    return;
  }

  const hasPending = (s.receipts || []).some(r => r.status === 'pending');
  if (hasPending) {
    window.App.confirmAction(
      'Ya existe un recibo pendiente',
      `${s.name} ya tiene un recibo sin descargar. ¿Generar uno nuevo de todas formas?`,
      () => doGenerateReceipt(s)
    );
  } else {
    doGenerateReceipt(s);
  }
}

// Generate receipts for all students with unbilled classes
window.App.generateAllReceipts = function() {
  const today = window.App.todayStr();
  
  // Find students with unbilled classes
  const studentsWithUnbilled = window.App.state.students.filter(s => {
    const billedClassIds = new Set();
    
    // Get all billed class IDs from ANY receipt
    (s.receipts || []).forEach(r => {
      if (r.classIds) {
        r.classIds.forEach(id => billedClassIds.add(id));
      }
    });
    
    // Check if student has past unbilled classes
    const unbilledClasses = window.App.state.classes.filter(c => 
      c.date <= today && 
      c.studentIds.includes(s.id) && 
      !billedClassIds.has(c.id) &&
      !isAdvanceBilled(s, c)
    );
    
    return unbilledClasses.length > 0;
  });
  
  if (studentsWithUnbilled.length === 0) {
    window.App.showToast('No hay clases pendientes de facturar', 'info');
    return;
  }
  
  window.App.confirmAction(
    'Generar recibos automáticamente',
    `Se generarán recibos para ${studentsWithUnbilled.length} alumno(s) con clases pendientes de facturar. ¿Continuar?`,
    () => processGenerateAllReceipts(studentsWithUnbilled)
  );
}

function processGenerateAllReceipts(students) {
  let generated = 0;
  let skipped = 0;
  
  students.forEach(s => {
    const hasPending = (s.receipts || []).some(r => r.status === 'pending');
    if (hasPending) {
      skipped++;
      return;
    }
    
    // Generate receipt for this student
    const result = doGenerateReceipt(s, true); // true = silent mode
    if (result) generated++;
  });
  
  window.App.saveState();
  window.App.renderCurrentTab();
  
  if (generated > 0 && skipped === 0) {
    window.App.showToast(`✓ ${generated} recibo(s) generado(s) automáticamente`, 'success');
  } else if (generated > 0) {
    window.App.showToast(`${generated} generado(s), ${skipped} omitido(s) (ya tenían recibos pendientes)`, 'info');
  } else {
    window.App.showToast('No se generó ningún recibo (todos tenían recibos pendientes)', 'info');
  }
}

// Generates one advance receipt per student for the current month's monthly-billing groups,
// one line per course (normal rate, or 2nd-subject rate when in several courses).
window.App.generateMonthlyGroupReceipts = function() {
  const month = document.getElementById('monthly-group-receipt-month')?.value || window.App.todayStr().substring(0, 7);
  const monthLabel = getMonthLabel(month);
  const plans = [];

  window.App.state.students.filter(s => s.active !== false).forEach(s => {
    const groups = window.App.state.groups.filter(g =>
      g.billingMode === 'monthly' && g.active !== false && g.courseId && (g.studentIds || []).includes(s.id));
    const billed = new Set();
    (s.receipts || []).forEach(r => (r.monthlyItems || []).forEach(i => {
      if (i.month === month) billed.add(i.courseId);
    }));
    const items = [];
    groups.forEach(g => {
      if (billed.has(g.courseId)) return;
      billed.add(g.courseId);
      const course = window.App.state.courses.find(c => c.id === g.courseId);
      if (!course) return;
      items.push({
        month, groupId: g.id, courseId: course.id, courseName: course.name,
        label: `Clases grupales ${monthLabel} ${course.name}`,
        fee: getStudentCourseFee(s, course),
      });
    });
    // Groups sharing a course are covered by one quota; keep all group ids for dedupe.
    groups.forEach(g => {
      const item = items.find(i => i.courseId === g.courseId);
      if (item && item.groupId !== g.id) (item.extraGroupIds = item.extraGroupIds || []).push(g.id);
    });
    if (items.length) plans.push({ s, items });
  });

  if (plans.length === 0) {
    window.App.showToast(`No hay cuotas mensuales pendientes de ${monthLabel}`, 'info');
    return;
  }

  window.App.confirmAction(
    'Generar recibos mensuales de grupos',
    `Se generarán ${plans.length} recibo(s) de clases grupales de ${monthLabel} por adelantado. ¿Continuar?`,
    () => {
      plans.forEach(({ s, items }) => {
        const amount = Math.round(items.reduce((sum, i) => sum + i.fee, 0) * 100) / 100;
        if (!s.receipts) s.receipts = [];
        s.receipts.push({
          id: window.App.uid(),
          number: null,
          generatedAt: `${month}-01`,
          dueDate: `${month}-05`,
          amount,
          classIds: [],
          monthlyItems: items,
          status: 'pending',
          sentAt: null,
          paidAt: null,
        });
      });
      window.App.saveState();
      window.App.renderCurrentTab();
      window.App.showToast(`${plans.length} recibo(s) de ${monthLabel} generado(s)`, 'success');
    }
  );
}

// Group classes in a monthly-billing group are charged a flat quota once per group+month
// (course normal/2nd-subject rate, see getStudentCourseFee).
function computeReceiptAmount(s, classIds) {
  const amount = getReceiptLineItems(s, { classIds }).reduce((sum, item) => sum + item.fee, 0);
  return Math.round(amount * 100) / 100;
}

function doGenerateReceipt(s, silent = false) {

  // Get classes to bill: past classes not yet billed
  const today = window.App.todayStr();
  const billedClassIds = new Set();
  
  // Get all class IDs already in ANY receipt (pending, sent, or paid)
  (s.receipts || []).forEach(r => {
    if (r.classIds) {
      r.classIds.forEach(id => billedClassIds.add(id));
    }
  });
  
  // Get unbilled past classes
  const classesToBill = window.App.state.classes
    .filter(c => c.date <= today && c.studentIds.includes(s.id) && !billedClassIds.has(c.id) && !isAdvanceBilled(s, c))
    .map(c => c.id);
  
  if (classesToBill.length === 0) {
    if (!silent) {
      window.App.showToast('No hay clases pendientes de facturar para este alumno', 'info');
    }
    return false;
  }
  
  const amount = computeReceiptAmount(s, classesToBill);

  const receipt = {
    id:          window.App.uid(),
    number:      null,
    generatedAt: window.App.todayStr(),
    amount:      amount,
    classIds:    classesToBill,  // Track which classes are being billed
    status:      'pending',  // pending | sent | paid
    sentAt:      null,
    paidAt:      null,
  };
  if (!s.receipts) s.receipts = [];
  s.receipts.push(receipt);
  
  if (!silent) {
    window.App.saveState();
    window.App.renderCurrentTab();
    window.App.showToast(`Aviso de pago generado · ${window.App.fmtCurrency(amount)}`, 'success');
    window.App.openStudentReceipts(s.id);
  }
  
  return true;
}

window.App.openStudentReceipts = function(studentId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;
  window.App.currentReceiptsStudentId = studentId; // Save for new receipt button
  renderReceiptsModal(s);
  window.App.openModal('modal-receipts');
}

// Determines the monthly fee a student pays for a given course: the "normal" rate for
// their primary course, and the "2nd subject" rate for any other course billed monthly
// simultaneously (based on the student's actual monthly-billing group memberships).
function getStudentCourseFee(s, course) {
  if (!course) return 0;
  const studentGroups = window.App.state.groups.filter(g => g.billingMode === 'monthly' && (g.studentIds || []).includes(s.id));
  const monthlyCourseIds = [...new Set(studentGroups.map(g => g.courseId).filter(Boolean))];

  if (monthlyCourseIds.length <= 1) return parseFloat(course.monthlyFeeNormal) || 0;

  const primaryCourseName = s.primaryCourse || s.course || '';
  const primaryCourse = window.App.state.courses.find(c => c.name === primaryCourseName && monthlyCourseIds.includes(c.id));
  const primaryCourseId = primaryCourse ? primaryCourse.id : monthlyCourseIds[0];

  return course.id === primaryCourseId
    ? (parseFloat(course.monthlyFeeNormal) || 0)
    : (parseFloat(course.monthlyFeeSecondSubject) || 0);
}

// Builds the billable line items for a receipt (date/month label, type label, amount),
// collapsing monthly-billing group classes into a single quota per group+month.
function getReceiptLineItems(s, r) {
  const classIds = r.classIds || [];
  const classes = classIds
    .map(id => window.App.state.classes.find(c => c.id === id))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  const monthlyShown = new Set();
  const items = (r.monthlyItems || []).map(i => ({ dateLabel: 'Mensual', typeLabel: i.label, fee: i.fee, courseName: i.courseName }));

  classes.forEach(c => {
    const group = c.groupId ? window.App.state.groups.find(g => g.id === c.groupId) : null;

    if (group && group.billingMode === 'monthly') {
      const monthKey = `${group.id}|${c.date.substring(0, 7)}`;
      if (monthlyShown.has(monthKey)) return; // already billed this group+month
      monthlyShown.add(monthKey);
      const course = window.App.state.courses.find(co => co.id === group.courseId);
      const fee = getStudentCourseFee(s, course);
      const courseLabel = course ? course.name : group.name;
      items.push({ dateLabel: getMonthLabel(c.date.substring(0, 7)), typeLabel: `Cuota mensual · ${courseLabel}`, fee, courseName: course?.name });
      return;
    }

    const groupName = group ? group.name : null;
    const typeLabel = c.type === 'individual' ? 'Individual' : (groupName || 'Grupal');
    const fee = parseFloat(c.fee) || 0;
    items.push({ dateLabel: window.App.fmtDate(c.date), typeLabel, fee });
  });

  return items;
}

function buildReceiptClassLines(s, r) {
  const items = getReceiptLineItems(s, r);
  if (items.length === 0) return '';
  const rows = items.map(item => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--gray-100);font-size:0.78rem;color:var(--gray-700)">
      <span>${window.App.escHtml(item.dateLabel)}&nbsp;&nbsp;<span style="color:var(--gray-500)">${window.App.escHtml(item.typeLabel)}</span></span>
      <span style="font-weight:600">${window.App.fmtCurrency(item.fee)}</span>
    </div>`).join('');
  return `<div style="margin:8px 0 4px;background:var(--gray-50);border-radius:6px;padding:6px 10px">${rows}</div>`;
}

function renderReceiptsModal(s) {
  document.getElementById('receipts-student-name').textContent = s.name;
  const receipts = (s.receipts || []).slice().sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const container = document.getElementById('receipts-list');

  if (receipts.length === 0) {
    container.innerHTML = `<p class="empty-state" style="padding:20px 0;text-align:center">No hay recibos generados</p>`;
    return;
  }

  const statusLabels = {
    pending: 'Pendiente',
    sent: 'Enviado',
    paid: 'Pagado'
  };
  
  container.innerHTML = receipts.map(r => `
    <div class="receipt-item ${r.status}">
      <div class="receipt-item-header">
        <span class="receipt-number">${window.App.escHtml(receiptTitle(r))}</span>
        <span class="receipt-status-badge ${r.status}">${statusLabels[r.status] || r.status}</span>
      </div>
      <div class="receipt-item-body">
        <div>
          <div class="receipt-date">Generado: ${window.App.fmtDate(r.generatedAt)}</div>
          ${r.sentAt ? `<div class="receipt-date" style="color:#f59e0b">Enviado: ${window.App.fmtDate(r.sentAt)}</div>` : ''}
          ${r.paidAt ? `<div class="receipt-date" style="color:var(--success)">Pagado: ${window.App.fmtDate(r.paidAt)}</div>` : ''}
        </div>
        <div class="receipt-amount">${window.App.fmtCurrency(r.amount)}</div>
      </div>
      ${buildReceiptClassLines(s, r)}
      <div class="receipt-item-actions">${receiptActionsHtml(s, r)}
      </div>
    </div>`).join('');
}

window.App.cancelReceipt = function(studentId, receiptId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;
  const r = (s.receipts || []).find(r => r.id === receiptId);
  if (!r || r.status !== 'pending') return;
  window.App.confirmAction('Cancelar aviso', `¿Cancelar este aviso de pago?`, () => {
    s.receipts = s.receipts.filter(r => r.id !== receiptId);
    window.App.saveState();
    renderReceiptsModal(s);
    window.App.renderCurrentTab();
    window.App.showToast('Aviso cancelado');
  });
}

// Payment notice (no fiscal numbering); the invoice is issued once it's paid.
function buildNoticePdf(s, r) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const st = window.App.state.settings || {};
  const m = 20;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - m * 2;
  const eur = v => window.App.fmtCurrency(v);
  const month = noticeMonth(r);
  const monthLabel = getMonthLabel(month);
  const BRAND = [79, 70, 229], INK = [31, 41, 55], MUTED = [107, 114, 128], SOFT = [243, 244, 246];
  const items = getReceiptLineItems(s, r);

  // Header band
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageW, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('AVISO DE PAGO', m, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Nota de cargo · Documento informativo sin validez fiscal', m, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(monthLabel, pageW - m, 16, { align: 'right' });

  // Info cards
  const gap = 6, cardW = (contentW - gap) / 2, cardH = 19;
  const card = (x, y, title, value) => {
    doc.setFillColor(...SOFT);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(title, x + 4, y + 6);
    doc.setTextColor(...INK);
    doc.setFontSize(11);
    doc.text(String(value || '—'), x + 4, y + 14);
  };
  let y = 44;
  card(m, y, 'PROFESOR', st.issuerName);
  card(m + cardW + gap, y, 'ALUMNO', s.name);
  y += cardH + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Fecha de emisión', m, y);
  doc.setTextColor(...INK);
  doc.text(window.App.fmtDate(r.generatedAt), m + 31, y);
  doc.setTextColor(...MUTED);
  doc.text('Vencimiento', m + cardW + gap, y);
  doc.setTextColor(...INK);
  doc.text(window.App.fmtDate(r.dueDate || `${month}-05`), m + cardW + gap + 25, y);
  y += 14;

  // Concepts table
  const colPeriod = m + contentW - 68, colAmount = m + contentW - 3;
  const conceptW = colPeriod - m - 9;
  doc.setFillColor(224, 231, 255);
  doc.rect(m, y - 5, contentW, 8, 'F');
  doc.setTextColor(...BRAND);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CONCEPTO', m + 3, y);
  doc.text('PERIODO', colPeriod + 2, y);
  doc.text('IMPORTE', colAmount, y, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  items.forEach(item => {
    const period = item.dateLabel === 'Mensual' ? monthLabel : item.dateLabel;
    const lines = doc.splitTextToSize(item.typeLabel, conceptW);
    if (y + lines.length * 5 > pageH - 90) { doc.addPage(); y = 25; }
    doc.text(lines, m + 3, y);
    doc.text(period, colPeriod + 2, y);
    doc.text(eur(item.fee), colAmount, y, { align: 'right' });
    y += lines.length * 5 + 2;
    doc.setDrawColor(229, 231, 235);
    doc.line(m, y - 1, m + contentW, y - 1);
    y += 4;
  });

  // Total
  doc.setFillColor(...SOFT);
  doc.roundedRect(m, y, contentW, 12, 1.5, 1.5, 'F');
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL A ABONAR', m + 4, y + 8);
  doc.setTextColor(...BRAND);
  doc.setFontSize(12);
  doc.text(eur(r.amount), colAmount, y + 8, { align: 'right' });
  y += 18;

  // Payment details box
  const boxH = 38;
  if (y + boxH > pageH - 30) { doc.addPage(); y = 25; }
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.5);
  doc.roundedRect(m, y, contentW, boxH, 2, 2, 'S');
  doc.setTextColor(...MUTED);
  doc.setFontSize(7);
  doc.text('DATOS DE PAGO', m + 5, y + 7);
  doc.setTextColor(...INK);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Método:', m + 5, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(`Bizum al número ${st.issuerPhone || '—'}`, m + 28, y + 16);
  doc.setFont('helvetica', 'bold');
  doc.text('Concepto:', m + 5, y + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(`"Clases ${s.name} ${monthLabel.split(' ')[0]}"`, m + 28, y + 24);
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('El concepto del Bizum es obligatorio para identificar tu pago.', m + 5, y + 32);
  y += boxH + 10;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize('Una vez recibido el pago, se emitirá y enviará la correspondiente factura simplificada exenta de IVA.', contentW), m, y);

  // Page footer
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.line(m, pageH - 18, pageW - m, pageH - 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${st.issuerName || ''}${st.issuerPhone ? ' · ' + st.issuerPhone : ''}`, pageW / 2, pageH - 12, { align: 'center' });

  return doc;
}

// Simplified invoice (VAT-exempt teaching services, art. 20.Uno.9º Ley 37/1992).
function buildInvoicePdf(s, r) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const st = window.App.state.settings || {};
  const m = 20;
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - m * 2;
  const eur = v => window.App.fmtCurrency(v);
  let y = 25;

  const label = (k, v) => {
    doc.setFont('helvetica', 'bold'); doc.text(k, m, y);
    doc.setFont('helvetica', 'normal'); doc.text(String(v || '—'), m + doc.getTextWidth(k) + 2, y);
    y += 6;
  };

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`RECIBO / FACTURA SIMPLIFICADA Nº: ${r.invoice.number}`, m, y);
  y += 9;
  doc.setFontSize(10);
  label('Fecha de emisión:', window.App.fmtDate(r.invoice.issueDate));

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL EMISOR (PROFESOR):', m, y); y += 6;
  label('Nombre y Apellidos:', st.issuerName);
  label('NIF / DNI:', st.issuerNif);
  label('Domicilio fiscal:', st.issuerAddress);

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL RECEPTOR (ALUMNO):', m, y); y += 6;
  label('Nombre del alumno:', s.name);

  y += 2;
  doc.setDrawColor(150);
  doc.line(m, y, pageW - m, y);
  y += 7;

  const colPrice = m + contentW - 62, colVat = m + contentW - 34, colTotal = m + contentW;
  const conceptW = colPrice - m - 22;
  doc.setFont('helvetica', 'bold');
  doc.text('Concepto', m, y);
  doc.text('Precio unitario', colPrice, y, { align: 'right' });
  doc.text('IVA', colVat, y, { align: 'center' });
  doc.text('Total', colTotal, y, { align: 'right' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  getReceiptLineItems(s, r).forEach(item => {
    const when = item.dateLabel === 'Mensual' ? '' : ` (${item.dateLabel})`;
    const lines = doc.splitTextToSize(`Servicios de enseñanza y apoyo escolar: ${item.typeLabel}${when}`, conceptW);
    if (y + lines.length * 5 > 250) { doc.addPage(); y = 25; }
    doc.text(lines, m, y);
    doc.text(eur(item.fee), colPrice, y, { align: 'right' });
    doc.text('0% (Exento)', colVat, y, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(eur(item.fee), colTotal, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += lines.length * 5 + 3;
  });

  doc.line(m, y, pageW - m, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text(`IMPORTE TOTAL RECIBIDO: ${eur(r.amount)}`, m, y);
  y += 7;
  label('Método de cobro:', 'Bizum');
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(doc.splitTextToSize('Factura exenta de IVA en virtud del Artículo 20.Uno.9º de la Ley 37/1992, de 28 de diciembre, del Impuesto sobre el Valor Añadido.', contentW), m, y);

  return doc;
}

window.App.downloadReceiptPdf = function(studentId, receiptId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;
  const r = (s.receipts || []).find(r => r.id === receiptId);
  if (!r) return;
  if (!window.jspdf?.jsPDF) { window.App.showToast('La librería PDF no está disponible', 'error'); return; }

  buildNoticePdf(s, r).save(`aviso_${noticeMonth(r)}_${s.name.replace(/\s+/g, '_')}.pdf`);
  window.App.showToast('Aviso de pago descargado', 'success');
}

window.App.downloadInvoicePdf = function(studentId, receiptId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  const r = s && (s.receipts || []).find(r => r.id === receiptId);
  if (!r || !r.invoice) return;
  if (!window.jspdf?.jsPDF) { window.App.showToast('La librería PDF no está disponible', 'error'); return; }

  buildInvoicePdf(s, r).save(`factura_${r.invoice.number}_${s.name.replace(/\s+/g, '_')}.pdf`);
  window.App.showToast(`Factura ${r.invoice.number} descargada`, 'success');
}

// Cancel all pending receipts
window.App.cancelAllPendingReceipts = function() {
  const pendingReceipts = [];
  
  window.App.state.students.forEach(s => {
    (s.receipts || []).forEach(r => {
      if (r.status === 'pending') {
        pendingReceipts.push({ student: s, receipt: r });
      }
    });
  });
  
  if (pendingReceipts.length === 0) {
    window.App.showToast('No hay recibos pendientes para cancelar', 'info');
    return;
  }
  
  window.App.confirmAction(
    'Cancelar todos los recibos pendientes',
    `Se cancelarán ${pendingReceipts.length} recibo(s) pendiente(s). Esta acción no se puede deshacer. ¿Continuar?`,
    () => {
      pendingReceipts.forEach(item => {
        item.student.receipts = item.student.receipts.filter(r => r.id !== item.receipt.id);
      });
      
      window.App.saveState();
      window.App.renderCurrentTab();
      window.App.showToast(`${pendingReceipts.length} recibo(s) cancelado(s)`, 'success');
    }
  );
}

// Download all receipt PDFs
window.App.downloadAllReceiptPdfs = function() {
  if (!window.jspdf?.jsPDF) {
    window.App.showToast('La librería PDF no está disponible', 'error');
    return;
  }
  
  const allReceipts = [];
  
  window.App.state.students.forEach(s => {
    (s.receipts || []).forEach(r => {
      allReceipts.push({ student: s, receipt: r });
    });
  });
  
  if (allReceipts.length === 0) {
    window.App.showToast('No hay recibos para descargar', 'info');
    return;
  }
  
  window.App.confirmAction(
    'Descargar todos los PDFs',
    `Se descargarán ${allReceipts.length} recibo(s) en PDF. ¿Continuar?`,
    () => {
      let downloaded = 0;
      allReceipts.forEach((item, index) => {
        // Add slight delay between downloads to avoid browser blocking
        setTimeout(() => {
          window.App.downloadReceiptPdf(item.student.id, item.receipt.id);
          downloaded++;
          if (downloaded === allReceipts.length) {
            window.App.showToast(`${downloaded} PDF(s) descargado(s)`, 'success');
          }
        }, index * 300);
      });
    }
  );
}

// Render receipts panel (all receipts grouped by student)
window.App.renderReceipts = function() {
  // Populate month filter with available months from receipts (last 12 months only)
  const monthSet = new Set();
  window.App.state.students.forEach(s => {
    (s.receipts || []).forEach(r => {
      if (r.generatedAt) {
        const [year, month] = r.generatedAt.split('-');
        monthSet.add(`${year}-${month}`);
      }
    });
  });
  
  // Get current year-month and calculate 12 months back
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const last12Months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    last12Months.push(ym);
  }
  
  // Filter to only include months that exist in receipts AND are in last 12 months
  const availableMonths = Array.from(monthSet)
    .filter(ym => last12Months.includes(ym))
    .sort()
    .reverse(); // Most recent first
  
  const monthFilter = document.getElementById('receipt-filter-month');
  if (monthFilter) {
    const currentValue = monthFilter.value;
    
    monthFilter.innerHTML = '<option value="">Todos los meses</option>' +
      availableMonths.map(ym => {
        const [year, month] = ym.split('-');
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const monthName = monthNames[parseInt(month) - 1];
        return `<option value="${ym}">${monthName} ${year}</option>`;
      }).join('');
    
    // Restore previous selection if it still exists
    if (currentValue && availableMonths.includes(currentValue)) {
      monthFilter.value = currentValue;
    }
  }
  
  window.App.applyReceiptFilters();
}

window.App.applyReceiptFilters = function() {
  const statusFilter = document.getElementById('receipt-filter-status')?.value || '';
  const monthFilter = document.getElementById('receipt-filter-month')?.value || '';
  const studentQuery = (document.getElementById('receipt-filter-student')?.value || '').trim().toLowerCase();
  const today = window.App.todayStr();
  
  // Get all students with receipts OR unbilled classes
  const studentsWithReceipts = window.App.state.students
    .map(s => {
      const allReceipts = (s.receipts || []).slice();
      
      // Check if student has unbilled past classes (use ALL receipts, not filtered)
      const billedClassIds = new Set();
      allReceipts.forEach(r => {
        if (r.classIds) {
          r.classIds.forEach(id => billedClassIds.add(id));
        }
      });
      
      const unbilledClasses = window.App.state.classes
        .filter(c => c.date <= today && c.studentIds.includes(s.id) && !billedClassIds.has(c.id));
      
      const hasUnbilledClasses = unbilledClasses.length > 0;
      
      // Now filter receipts for display
      let receipts = allReceipts.slice();
      
      // Apply month filter first
      if (monthFilter) {
        receipts = receipts.filter(r => {
          if (!r.generatedAt) return false;
          const receiptMonth = r.generatedAt.substring(0, 7); // Get YYYY-MM
          return receiptMonth === monthFilter;
        });
      }
      
      // Apply status filter
      if (statusFilter) {
        receipts = receipts.filter(r => r.status === statusFilter);
      }
      
      return { student: s, receipts, hasUnbilledClasses: monthFilter ? false : hasUnbilledClasses };
    })
    .filter(item => {
      if (!studentQuery) return true;
      return (item.student.name || '').toLowerCase().includes(studentQuery);
    })
    .sort((a, b) => (a.student.name || '').localeCompare((b.student.name || ''), 'es', { sensitivity: 'base' }))
    .filter(item => item.receipts.length > 0 || item.hasUnbilledClasses);
  
  const list = document.getElementById('receipts-panel-list');
  
  if (studentsWithReceipts.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <p>No hay recibos${statusFilter ? ' con este estado' : ''}</p>
      </div>`;
    return;
  }
  
  const statusLabels = { pending: 'Pendiente', sent: 'Enviado', paid: 'Pagado' };
  
  list.innerHTML = studentsWithReceipts.map(item => {
    const s = item.student;
    const receipts = item.receipts.slice().sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

    return `
      <div class="card" style="margin-bottom:16px">
        <div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--gray-200)">
          <h4 style="margin:0;font-size:0.95rem;font-weight:700;color:var(--gray-800)">${window.App.escHtml(s.name)}</h4>
          <div style="font-size:0.75rem;color:var(--gray-500);margin-top:2px">
            ${receipts.length > 0 ? `${receipts.length} recibo${receipts.length !== 1 ? 's' : ''}` : ''}
            ${receipts.length > 0 && item.hasUnbilledClasses ? ' · ' : ''}
            ${item.hasUnbilledClasses ? '<span style="color:var(--warning)">⚠ Clases sin cobrar</span>' : ''}
            ${s.phone ? ` · ${s.phone}` : ''}
          </div>
        </div>
        ${receipts.length > 0 ? receipts.map(r => `
          <div class="receipt-item ${r.status}" style="margin-bottom:10px">
            <div class="receipt-item-header">
              <span class="receipt-number">${window.App.escHtml(receiptTitle(r))}</span>
              <span class="receipt-status-badge ${r.status}">${statusLabels[r.status]}</span>
            </div>
            <div class="receipt-item-body">
              <div>
                <div class="receipt-date">Generado: ${window.App.fmtDate(r.generatedAt)}</div>
                ${r.sentAt ? `<div class="receipt-date" style="color:#f59e0b">Enviado: ${window.App.fmtDate(r.sentAt)}</div>` : ''}
                ${r.paidAt ? `<div class="receipt-date" style="color:var(--success)">Pagado: ${window.App.fmtDate(r.paidAt)}</div>` : ''}
              </div>
              <div class="receipt-amount">${window.App.fmtCurrency(r.amount)}</div>
            </div>
            ${buildReceiptClassLines(s, r)}
            <div class="receipt-item-actions">${receiptActionsHtml(s, r)}
            </div>
          </div>
        `).join('') : ''}
        ${item.hasUnbilledClasses ? `
          <div style="padding:12px;background:var(--warning-bg);border-radius:8px;margin-top:${receipts.length > 0 ? '10px' : '0'}">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div style="font-size:0.85rem;font-weight:600;color:var(--warning)">Clases pendientes de cobrar</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px">Genera un recibo para cobrarlas</div>
              </div>
              <button class="btn btn-sm btn-primary" onclick="window.App.generateReceipt('${s.id}')">Generar recibo</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Mark receipt as sent (balance is calculated dynamically)
window.App.markReceiptAsSent = function(studentId, receiptId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;
  const r = (s.receipts || []).find(r => r.id === receiptId);
  if (!r || r.status !== 'pending') return;
  
  r.status = 'sent';
  r.sentAt = window.App.todayStr();
  
  window.App.saveState();
  window.App.renderCurrentTab();
  window.App.showToast('Aviso marcado como enviado', 'success');
}

// Marking as paid issues the numbered invoice, dated today (editable in the invoices list).
window.App.markReceiptAsPaid = function(studentId, receiptId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;
  const r = (s.receipts || []).find(r => r.id === receiptId);
  if (!r) return;
  
  if (r.status === 'paid') {
    window.App.showToast('Este aviso ya está marcado como pagado', 'error');
    return;
  }
  
  const today = window.App.todayStr();
  r.status = 'paid';
  r.paidAt = today;
  r.invoice = { number: nextInvoiceNumber(Number(today.substring(0, 4))), issueDate: today, sentAt: null };
  
  window.App.saveState();
  
  // Update modal if it's open for this student
  if (window.App.currentReceiptsStudentId === studentId) {
    renderReceiptsModal(s);
  }
  
  window.App.renderCurrentTab();
  window.App.showToast(`Pagado · factura ${r.invoice.number} emitida`, 'success');
}

// Issued invoices list: edit the issue date and mark as sent.
function renderInvoicesList() {
  const rows = [];
  window.App.state.students.forEach(s => (s.receipts || []).forEach(r => {
    if (r.invoice) rows.push({ s, r });
  }));
  rows.sort((a, b) => a.r.invoice.number.localeCompare(b.r.invoice.number));
  const el = document.getElementById('invoices-list');
  if (rows.length === 0) {
    el.innerHTML = '<p class="empty-state" style="padding:20px 0;text-align:center">No hay facturas emitidas</p>';
    return;
  }
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.82rem">
    <thead><tr style="text-align:left;border-bottom:1px solid var(--gray-200)">
      <th>Nº</th><th>Alumno</th><th>Fecha</th><th>Importe</th><th></th></tr></thead>
    <tbody>${rows.map(({ s, r }) => `
      <tr style="border-bottom:1px solid var(--gray-100)">
        <td>${window.App.escHtml(r.invoice.number)}</td>
        <td>${window.App.escHtml(s.name)}</td>
        <td><input type="date" value="${r.invoice.issueDate}" ${r.invoice.sentAt ? 'disabled' : ''}
          onchange="window.updateInvoiceDate('${s.id}','${r.id}', this.value)" /></td>
        <td>${window.App.fmtCurrency(r.amount)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm btn-secondary" onclick="window.downloadInvoicePdf('${s.id}','${r.id}')">PDF</button>
          ${r.invoice.sentAt
            ? `<span style="color:var(--success)">Enviada ${window.App.fmtDate(r.invoice.sentAt)}</span>`
            : `<button class="btn btn-sm btn-primary" onclick="window.sendInvoice('${s.id}','${r.id}')">Enviar</button>
               <button class="btn btn-sm btn-secondary" onclick="window.markInvoiceSent('${s.id}','${r.id}')">Marcar enviada</button>`}
        </td>
      </tr>`).join('')}</tbody></table>`;
}

window.App.openInvoices = function() {
  renderInvoicesList();
  window.App.openModal('modal-invoices');
}

function findInvoice(studentId, receiptId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  const r = s && (s.receipts || []).find(r => r.id === receiptId);
  return r && r.invoice && !r.invoice.sentAt ? { s, r } : null;
}

window.App.updateInvoiceDate = function(studentId, receiptId, value) {
  const found = findInvoice(studentId, receiptId);
  if (!found || !value) { renderInvoicesList(); return; }
  found.r.invoice.issueDate = value;
  window.App.saveState();
  window.App.showToast('Fecha de la factura actualizada', 'success');
}

window.App.markInvoiceSent = function(studentId, receiptId) {
  const found = findInvoice(studentId, receiptId);
  if (!found) return;
  found.r.invoice.sentAt = window.App.todayStr();
  window.App.saveState();
  renderInvoicesList();
}

window.App.sendInvoice = async function(studentId, receiptId) {
  const found = findInvoice(studentId, receiptId);
  if (!found) return;
  const { s, r } = found;
  const phone = (s.phone || '').replace(/\D/g, '');
  if (!phone || !window.App.state.settings?.whatsappPhoneId || !window.App.state.settings?.whatsappToken) {
    window.App.showToast('Falta el teléfono del alumno o configurar WhatsApp Business API', 'error');
    return;
  }
  try {
    const blob = buildInvoicePdf(s, r).output('blob');
    const filename = `factura_${r.invoice.number}.pdf`;
    const mediaId = await uploadMediaToWhatsApp(blob, filename);
    const caption = `Hola ${s.name.split(' ')[0]}, te envío la factura ${r.invoice.number} por el pago recibido de ${window.App.fmtCurrency(r.amount)}. Gracias.`;
    await sendWhatsAppDocument(phone, mediaId, caption, filename);
    r.invoice.sentAt = window.App.todayStr();
    window.App.saveState();
    renderInvoicesList();
    window.App.showToast('Factura enviada por WhatsApp', 'success');
  } catch (e) {
    window.App.showToast(`Error enviando la factura: ${e.message}`, 'error');
  }
}

// Generate notice PDF as blob (for WhatsApp API upload)
async function generateReceiptPdfBlob(student, receipt) {
  return buildNoticePdf(student, receipt).output('blob');
}

// Upload PDF to WhatsApp Cloud API
async function uploadMediaToWhatsApp(pdfBlob, filename) {
  const phoneId = window.App.state.settings?.whatsappPhoneId;
  const token = window.App.state.settings?.whatsappToken;
  
  if (!phoneId || !token) {
    throw new Error('WhatsApp Business API no configurada');
  }
  
  const formData = new FormData();
  formData.append('file', pdfBlob, filename);
  formData.append('messaging_product', 'whatsapp');
  
  const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/media`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Error uploading media');
  }
  
  const data = await response.json();
  return data.id; // Media ID
}

// Send WhatsApp message with document
async function sendWhatsAppDocument(phone, mediaId, caption, filename) {
  const phoneId = window.App.state.settings?.whatsappPhoneId;
  const token = window.App.state.settings?.whatsappToken;
  
  if (!phoneId || !token) {
    throw new Error('WhatsApp Business API no configurada');
  }
  
  const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'document',
      document: {
        id: mediaId,
        caption: caption,
        filename: filename
      }
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Error sending message');
  }
  
  return await response.json();
}

// Send pending receipts via WhatsApp Business API
window.App.sendPendingReceipts = async function() {
  const phoneId = window.App.state.settings?.whatsappPhoneId;
  const token = window.App.state.settings?.whatsappToken;
  
  if (!phoneId || !token) {
    window.App.showToast('Configura WhatsApp Business API en Ajustes', 'error');
    return;
  }
  
  // Get all pending receipts grouped by student
  const studentsPending = window.App.state.students
    .map(s => {
      const pending = (s.receipts || []).filter(r => r.status === 'pending');
      return { student: s, receipts: pending };
    })
    .filter(item => item.receipts.length > 0 && item.student.phone);
  
  if (studentsPending.length === 0) {
    window.App.showToast('No hay recibos pendientes para enviar', 'error');
    return;
  }
  
  const totalReceipts = studentsPending.reduce((sum, item) => sum + item.receipts.length, 0);
  
  window.App.confirmAction(
    'Enviar recibos por WhatsApp',
    `Se enviarán automáticamente ${totalReceipts} recibo(s) con PDF adjunto a ${studentsPending.length} alumno(s) vía WhatsApp Business API. ¿Continuar?`,
    () => processPendingReceiptsAPI(studentsPending)
  );
};

async function processPendingReceiptsAPI(studentsPending) {
  let sent = 0;
  let failed = 0;
  
  for (const item of studentsPending) {
    const student = item.student;
    const phone = student.phone?.trim().replace(/\D/g, ''); // Clean phone number
    
    if (!phone) {
      failed += item.receipts.length;
      continue;
    }
    
    for (const receipt of item.receipts) {
      try {
        // Generate PDF as blob
        const pdfBlob = await generateReceiptPdfBlob(student, receipt);
        const filename = `aviso_${noticeMonth(receipt)}_${student.name.replace(/\s+/g, '_')}.pdf`;
        
        // Upload to WhatsApp Cloud API
        const mediaId = await uploadMediaToWhatsApp(pdfBlob, filename);
        
        // Send message with document
        const issuerName = window.App.state.settings?.issuerName || '';
        const firstName = student.name.split(' ')[0];
        const caption = `Hola ${firstName}, te envío el aviso de pago de ${getMonthLabel(noticeMonth(receipt))} por importe de ${window.App.fmtCurrency(receipt.amount)}. Gracias${issuerName ? `, ${issuerName}` : ''}`;
        
        await sendWhatsAppDocument(phone, mediaId, caption, filename);
        
        // Mark as sent
        receipt.status = 'sent';
        receipt.sentAt = window.App.todayStr();
        sent++;
        
        // Wait between receipts to avoid rate limiting
        await sleep(1000);
        
      } catch (e) {
        console.error(`Error sending notice for ${student.name}:`, e);
        window.App.showToast(`Error enviando a ${student.name}: ${e.message}`, 'error');
        failed++;
      }
    }
  }
  
  window.App.saveState();
  window.App.renderCurrentTab();
  
  if (sent > 0 && failed === 0) {
    window.App.showToast(`✓ ${sent} recibo(s) enviado(s) automáticamente por WhatsApp`, 'success');
  } else if (sent > 0) {
    window.App.showToast(`${sent} enviado(s), ${failed} fallido(s)`, 'info');
  } else {
    window.App.showToast('No se pudo enviar ningún recibo', 'error');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize receipt events
window.App.initReceiptEvents = function() {
  const btnGenerateAll = document.getElementById('btn-generate-all-receipts');
  if (btnGenerateAll) {
    btnGenerateAll.addEventListener('click', window.App.generateAllReceipts);
  }

  const btnMonthlyGroups = document.getElementById('btn-generate-monthly-group-receipts');
  if (btnMonthlyGroups) {
    const monthInput = document.getElementById('monthly-group-receipt-month');
    if (monthInput) monthInput.value = window.App.todayStr().substring(0, 7);
    btnMonthlyGroups.addEventListener('click', window.App.generateMonthlyGroupReceipts);
  }
  
  const btnOpenInvoices = document.getElementById('btn-open-invoices');
  if (btnOpenInvoices) {
    btnOpenInvoices.addEventListener('click', window.App.openInvoices);
  }

  const filterStatus = document.getElementById('receipt-filter-status');
  if (filterStatus) {
    filterStatus.addEventListener('change', window.App.applyReceiptFilters);
  }
  
  const filterMonth = document.getElementById('receipt-filter-month');
  if (filterMonth) {
    filterMonth.addEventListener('change', window.App.applyReceiptFilters);
  }

  const filterStudent = document.getElementById('receipt-filter-student');
  if (filterStudent) {
    filterStudent.addEventListener('input', window.App.applyReceiptFilters);
  }
  
  const btnSend = document.getElementById('btn-send-pending-receipts');
  if (btnSend) {
    btnSend.addEventListener('click', window.App.sendPendingReceipts);
  }
  
  const btnCancelAll = document.getElementById('btn-cancel-all-receipts');
  if (btnCancelAll) {
    btnCancelAll.addEventListener('click', window.App.cancelAllPendingReceipts);
  }
  
  const btnDownloadAll = document.getElementById('btn-download-all-receipts');
  if (btnDownloadAll) {
    btnDownloadAll.addEventListener('click', window.App.downloadAllReceiptPdfs);
  }
  
  const btnNewReceipt = document.getElementById('btn-new-receipt');
  if (btnNewReceipt) {
    btnNewReceipt.addEventListener('click', () => {
      if (window.App.currentReceiptsStudentId) {
        window.App.generateReceipt(window.App.currentReceiptsStudentId);
      }
    });
  }
}

// Make functions globally available for onclick handlers
if (typeof window !== 'undefined') {
  window.generateReceipt = window.App.generateReceipt;
  window.openStudentReceipts = window.App.openStudentReceipts;
  window.cancelReceipt = window.App.cancelReceipt;
  window.downloadReceiptPdf = window.App.downloadReceiptPdf;
  window.downloadInvoicePdf = window.App.downloadInvoicePdf;
  window.updateInvoiceDate = window.App.updateInvoiceDate;
  window.markInvoiceSent = window.App.markInvoiceSent;
  window.sendInvoice = window.App.sendInvoice;
  window.markReceiptAsSent = window.App.markReceiptAsSent;
  window.markReceiptAsPaid = window.App.markReceiptAsPaid;
}
