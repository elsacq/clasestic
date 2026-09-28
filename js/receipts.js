/* =============================================
   Receipts Module
   Receipt generation, management, PDF export
   ============================================= */

window.App = window.App || {};

window.App.generateReceipt = function(studentId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;

  const today = window.App.todayStr();
  const billedClassIds = new Set();
  (s.receipts || []).forEach(r => (r.classIds || []).forEach(id => billedClassIds.add(id)));
  const unbilledClasses = window.App.state.classes.filter(
    c => c.date <= today && c.studentIds.includes(studentId) && !billedClassIds.has(c.id)
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
      !billedClassIds.has(c.id)
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

function doGenerateReceipt(s, silent = false) {
  window.App.state.receiptCounter = (window.App.state.receiptCounter || 0) + 1;
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const seq   = String(window.App.state.receiptCounter).padStart(3, '0');

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
    .filter(c => c.date <= today && c.studentIds.includes(s.id) && !billedClassIds.has(c.id))
    .map(c => c.id);
  
  if (classesToBill.length === 0) {
    if (!silent) {
      window.App.showToast('No hay clases pendientes de facturar para este alumno', 'info');
    }
    return false;
  }
  
  const amount = classesToBill.reduce((sum, classId) => {
    const c = window.App.state.classes.find(cl => cl.id === classId);
    return sum + (parseFloat(c.fee) || 0);
  }, 0);

  const receipt = {
    id:          window.App.uid(),
    number:      `${year}${month}-${seq}`,
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
    window.App.showToast(`Recibo ${receipt.number} generado · ${window.App.fmtCurrency(amount)}`, 'success');
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

// Build the class-lines HTML block for a receipt
function buildReceiptClassLines(r) {
  const classIds = r.classIds || [];
  if (classIds.length === 0) return '';
  const classes = classIds
    .map(id => window.App.state.classes.find(c => c.id === id))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  const rows = classes.map(c => {
    const groupName = c.groupId
      ? (window.App.state.groups.find(g => g.id === c.groupId)?.name || 'Grupo')
      : null;
    const typeLabel = c.type === 'individual' ? 'Individual' : (groupName || 'Grupal');
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--gray-100);font-size:0.78rem;color:var(--gray-700)">
      <span>${window.App.fmtDate(c.date)}&nbsp;&nbsp;<span style="color:var(--gray-500)">${window.App.escHtml(typeLabel)}</span></span>
      <span style="font-weight:600">${window.App.fmtCurrency(c.fee)}</span>
    </div>`;
  }).join('');
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
        <span class="receipt-number">Nº ${window.App.escHtml(r.number)}</span>
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
      ${buildReceiptClassLines(r)}
      <div class="receipt-item-actions">
        ${r.status === 'pending' ? `
          <button class="btn btn-sm btn-secondary" onclick="window.markReceiptAsSent('${s.id}','${r.id}')">Marcar enviado</button>
          <button class="btn btn-sm btn-secondary" onclick="window.cancelReceipt('${s.id}','${r.id}')">Cancelar</button>
        ` : ''}
        ${r.status === 'sent' ? `
          <button class="btn btn-sm btn-primary" onclick="window.markReceiptAsPaid('${s.id}','${r.id}')">Marcar pagado</button>
        ` : ''}
        <button class="btn btn-sm ${r.status === 'paid' ? 'btn-secondary' : 'btn-primary'}" onclick="window.downloadReceiptPdf('${s.id}','${r.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          PDF
        </button>
      </div>
    </div>`).join('');
}

window.App.cancelReceipt = function(studentId, receiptId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;
  const r = (s.receipts || []).find(r => r.id === receiptId);
  if (!r || r.status !== 'pending') return;
  window.App.confirmAction('Cancelar recibo', `¿Cancelar el recibo ${r.number}?`, () => {
    s.receipts = s.receipts.filter(r => r.id !== receiptId);
    window.App.saveState();
    renderReceiptsModal(s);
    window.App.renderCurrentTab();
    window.App.showToast(`Recibo ${r.number} cancelado`);
  });
}

window.App.downloadReceiptPdf = function(studentId, receiptId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;
  const r = (s.receipts || []).find(r => r.id === receiptId);
  if (!r) return;

  if (!window.jspdf?.jsPDF) { window.App.showToast('La librería PDF no está disponible', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc      = new jsPDF({ unit: 'mm', format: 'a5' });
  const pageW    = doc.internal.pageSize.getWidth();
  const pageH    = doc.internal.pageSize.getHeight();
  const margin   = 14;
  const contentW = pageW - margin * 2;
  const academyName = window.App.state.settings?.academyName || 'Academia';

  // Header band
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(academyName, margin, 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('RECIBO DE PAGO', margin, 20);
  doc.setFontSize(9);
  doc.text(`Nº ${r.number}`, pageW - margin, 12, { align: 'right' });
  doc.text(window.App.fmtDate(r.generatedAt), pageW - margin, 20, { align: 'right' });

  // Student block
  let y = 38;
  doc.setFillColor(243, 244, 246);
  doc.roundedRect(margin, y, contentW, 26, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL ALUMNO', margin + 4, y + 6);
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);
  doc.setFont('helvetica', 'bold');
  doc.text(s.name, margin + 4, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  const meta = [s.course, s.phone].filter(Boolean).join('  ·  ');
  if (meta) doc.text(meta, margin + 4, y + 21);

  // Amount block
  y += 34;
  doc.setFillColor(224, 231, 255);
  doc.roundedRect(margin, y, contentW, 22, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  doc.setFont('helvetica', 'bold');
  doc.text('IMPORTE', margin + 4, y + 6);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(79, 70, 229);
  doc.text(window.App.fmtCurrency(r.amount), margin + 4, y + 17);

  // Classes detail
  y += 30;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(107, 114, 128);
  doc.text('DETALLE DE CLASES', margin + 4, y);
  
  // Get classes from receipt
  const classIds = r.classIds || [];
  const classes = classIds
    .map(id => window.App.state.classes.find(c => c.id === id))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  
  y += 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(31, 41, 55);
  
  if (classes.length > 0) {
    // Table header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text('FECHA', margin + 4, y);
    doc.text('TIPO', margin + 30, y);
    doc.text('IMPORTE', margin + contentW - 4, y, { align: 'right' });
    
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(31, 41, 55);
    
    classes.forEach(c => {
      if (y > pageH - 35) {
        // New page if needed
        doc.addPage();
        y = margin;
      }
      
      const classType = c.type === 'individual' ? 'Individual' : 
                       (c.groupId ? window.App.state.groups.find(g => g.id === c.groupId)?.name || 'Grupo' : 'Grupo');
      
      doc.text(window.App.fmtDate(c.date), margin + 4, y);
      doc.text(classType, margin + 30, y);
      doc.text(window.App.fmtCurrency(c.fee), margin + contentW - 4, y, { align: 'right' });
      y += 5;
    });
  } else {
    doc.setTextColor(156, 163, 175);
    doc.text('Sin clases registradas', margin + 4, y);
    y += 5;
  }

  // Divider
  y += 8;
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);

  // Footer
  y += 7;
  doc.setFontSize(7);
  doc.setTextColor(156, 163, 175);
  doc.text('Importe pendiente de pago. Este recibo no es válido sin justificante de abono.', margin, y);
  
  // Payment instructions
  y += 8;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(107, 114, 128);
  doc.text('INSTRUCCIONES DE PAGO', margin, y);
  
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(31, 41, 55);
  const paymentText = 'El pago se hará a través de la app del banco, mediante halcash (envío a cajero, envío efectivo móvil, envío con código, etc.). En el concepto/descripción indica tu nombre y apellidos, el teléfono al que enviar el código es el 659951873. Por último recuerda enviar por Whatsapp al número anterior el código/PIN de retirada del pago y el número de teléfono desde el que se hizo el pago.';
  const lines = doc.splitTextToSize(paymentText, contentW);
  doc.text(lines, margin, y);

  doc.save(`recibo_${r.number}_${s.name.replace(/\s+/g, '_')}.pdf`);

  window.App.showToast(`Recibo ${r.number} descargado`, 'success');
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
              <span class="receipt-number">Nº ${window.App.escHtml(r.number)}</span>
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
            ${buildReceiptClassLines(r)}
            <div class="receipt-item-actions">
              ${r.status === 'pending' ? `
                <button class="btn btn-sm btn-secondary" onclick="window.markReceiptAsSent('${s.id}','${r.id}')">Marcar enviado</button>
                <button class="btn btn-sm btn-secondary" onclick="window.cancelReceipt('${s.id}','${r.id}')">Cancelar</button>
              ` : ''}
              ${r.status === 'sent' ? `
                <button class="btn btn-sm btn-primary" onclick="window.markReceiptAsPaid('${s.id}','${r.id}')">Marcar pagado</button>
              ` : ''}
              <button class="btn btn-sm ${r.status === 'paid' ? 'btn-secondary' : 'btn-primary'}" onclick="window.downloadReceiptPdf('${s.id}','${r.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                PDF
              </button>
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
  window.App.showToast(`Recibo ${r.number} marcado como enviado · saldo actualizado`, 'success');
}

// Mark receipt as paid (informational only, balance already deducted when sent)
window.App.markReceiptAsPaid = function(studentId, receiptId) {
  const s = window.App.state.students.find(s => s.id === studentId);
  if (!s) return;
  const r = (s.receipts || []).find(r => r.id === receiptId);
  if (!r) return;
  
  if (r.status === 'pending') {
    window.App.showToast('Debes marcar el recibo como enviado primero', 'error');
    return;
  }
  
  if (r.status === 'paid') {
    window.App.showToast('Este recibo ya está marcado como pagado', 'error');
    return;
  }
  
  r.status = 'paid';
  r.paidAt = window.App.todayStr();
  
  window.App.saveState();
  
  // Update modal if it's open for this student
  if (window.App.currentReceiptsStudentId === studentId) {
    renderReceiptsModal(s);
  }
  
  window.App.renderCurrentTab();
  window.App.showToast(`Recibo ${r.number} marcado como pagado`, 'success');
}

// Generate receipt PDF as blob (for WhatsApp API upload)
async function generateReceiptPdfBlob(student, receipt) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Header
  const academyName = window.App.state.settings?.academyName || 'Academia';
  doc.setFontSize(20);
  doc.text(academyName, 105, 20, { align: 'center' });
  
  doc.setFontSize(14);
  doc.text('RECIBO', 105, 30, { align: 'center' });
  
  // Receipt details
  doc.setFontSize(11);
  let y = 45;
  doc.text(`Número: ${receipt.number}`, 20, y);
  y += 8;
  doc.text(`Fecha: ${window.App.fmtDate(receipt.generatedAt)}`, 20, y);
  y += 8;
  doc.text(`Alumno: ${student.name}`, 20, y);
  y += 15;
  
  // Classes table
  doc.setFontSize(12);
  doc.text('Detalle de clases:', 20, y);
  y += 10;
  
  // Table headers
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('Fecha', 20, y);
  doc.text('Tipo', 60, y);
  doc.text('Importe', 150, y);
  y += 7;
  
  // Table rows
  doc.setFont(undefined, 'normal');
  const classIds = receipt.classIds || [];
  classIds.forEach(classId => {
    const c = window.App.state.classes.find(cl => cl.id === classId);
    if (c) {
      doc.text(window.App.fmtDate(c.date), 20, y);
      doc.text(c.classType || 'Individual', 60, y);
      doc.text(window.App.fmtCurrency(c.fee), 150, y);
      y += 7;
    }
  });
  
  // Total
  y += 5;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', 120, y);
  doc.text(window.App.fmtCurrency(receipt.amount), 150, y);
  
  // Footer
  y += 20;
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text('Gracias por tu confianza', 105, y, { align: 'center' });
  
  return doc.output('blob');
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
        const filename = `recibo_${receipt.number}.pdf`;
        
        // Upload to WhatsApp Cloud API
        const mediaId = await uploadMediaToWhatsApp(pdfBlob, filename);
        
        // Send message with document
        const academyName = window.App.state.settings?.academyName || 'Academia';
        const firstName = student.name.split(' ')[0];
        const caption = `Hola ${firstName}, te envío el recibo ${receipt.number} por importe de ${window.App.fmtCurrency(receipt.amount)}. Gracias, ${academyName}`;
        
        await sendWhatsAppDocument(phone, mediaId, caption, filename);
        
        // Mark as sent
        receipt.status = 'sent';
        receipt.sentAt = window.App.todayStr();
        sent++;
        
        // Wait between receipts to avoid rate limiting
        await sleep(1000);
        
      } catch (e) {
        console.error(`Error sending receipt ${receipt.number}:`, e);
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
  window.markReceiptAsSent = window.App.markReceiptAsSent;
  window.markReceiptAsPaid = window.App.markReceiptAsPaid;
}
