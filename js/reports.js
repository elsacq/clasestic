/* =============================================
   Reports Module
   Monthly billed/paid summary with export
   ============================================= */

window.App = window.App || {};

window.App.reportsData = [];

function getMonthLabel(monthKey) {
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const [year, month] = monthKey.split('-');
  return `${monthNames[parseInt(month, 10) - 1] || monthKey} ${year}`;
}

function inDateRange(dateStr, fromDate, toDate) {
  if (!dateStr) return false;
  if (fromDate && dateStr < fromDate) return false;
  if (toDate && dateStr > toDate) return false;
  return true;
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function buildReportsData(fromDate, toDate) {
  const billedByMonth = new Map();
  const paidByMonth = new Map();

  window.App.state.students.forEach(s => {
    (s.receipts || []).forEach(r => {
      const amount = parseFloat(r.amount) || 0;
      if (amount <= 0) return;

      if (inDateRange(r.generatedAt, fromDate, toDate)) {
        const billedMonth = r.generatedAt.substring(0, 7);
        const billedCurrent = billedByMonth.get(billedMonth) || 0;
        billedByMonth.set(billedMonth, billedCurrent + amount);
      }

      if (r.status === 'paid') {
        const paidDate = r.paidAt || r.generatedAt;
        if (inDateRange(paidDate, fromDate, toDate)) {
          const paidMonth = paidDate.substring(0, 7);
          const paidCurrent = paidByMonth.get(paidMonth) || 0;
          paidByMonth.set(paidMonth, paidCurrent + amount);
        }
      }
    });
  });

  const monthKeys = new Set([...billedByMonth.keys(), ...paidByMonth.keys()]);
  const months = Array.from(monthKeys).sort().reverse();

  return months.map(month => {
    const billed = billedByMonth.get(month) || 0;
    const paid = paidByMonth.get(month) || 0;
    return {
      month,
      monthLabel: getMonthLabel(month),
      billed,
      paid,
      pending: Math.max(0, billed - paid)
    };
  });
}

window.App.renderReports = function() {
  const fromDate = document.getElementById('reports-date-from')?.value || '';
  const toDate = document.getElementById('reports-date-to')?.value || '';

  const rows = buildReportsData(fromDate, toDate);
  window.App.reportsData = rows;

  const totalBilled = rows.reduce((sum, row) => sum + row.billed, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);

  const billedEl = document.getElementById('reports-total-billed');
  if (billedEl) billedEl.textContent = window.App.fmtCurrency(totalBilled);

  const paidEl = document.getElementById('reports-total-paid');
  if (paidEl) paidEl.textContent = window.App.fmtCurrency(totalPaid);

  const list = document.getElementById('reports-monthly-list');
  if (!list) return;

  if (rows.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No hay datos en el rango seleccionado</p></div>';
    return;
  }

  list.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="font-size:0.95rem;color:var(--gray-700)">Resumen mensual</h3>
      </div>
      <div class="report-table-head">
        <span>Mes</span>
        <span>Facturado</span>
        <span>Cobrado</span>
      </div>
      ${rows.map(row => `
        <div class="report-row">
          <span class="report-month">${row.monthLabel}</span>
          <strong class="report-amount-billed">${window.App.fmtCurrency(row.billed)}</strong>
          <strong class="report-amount">${window.App.fmtCurrency(row.paid)}</strong>
        </div>
      `).join('')}
    </div>
  `;
};

window.App.exportReportsCsv = function() {
  const rows = window.App.reportsData || [];
  if (rows.length === 0) {
    window.App.showToast('No hay datos para exportar', 'info');
    return;
  }

  const fromDate = document.getElementById('reports-date-from')?.value || '';
  const toDate = document.getElementById('reports-date-to')?.value || '';

  const lines = [];
  lines.push('Mes;Facturado;Cobrado;Pendiente');
  rows.forEach(row => {
    lines.push([
      csvEscape(row.monthLabel),
      csvEscape(row.billed.toFixed(2).replace('.', ',')),
      csvEscape(row.paid.toFixed(2).replace('.', ',')),
      csvEscape(row.pending.toFixed(2).replace('.', ','))
    ].join(';'));
  });

  const totalBilled = rows.reduce((sum, row) => sum + row.billed, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalPending = Math.max(0, totalBilled - totalPaid);
  lines.push([
    'TOTAL',
    totalBilled.toFixed(2).replace('.', ','),
    totalPaid.toFixed(2).replace('.', ','),
    totalPending.toFixed(2).replace('.', ',')
  ].join(';'));

  const csv = '\ufeff' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const rangePart = `${fromDate || 'inicio'}_${toDate || 'hoy'}`;
  a.href = url;
  a.download = `informe_mensual_${rangePart}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  window.App.showToast('Informe CSV descargado', 'success');
};

window.App.exportReportsPdf = function() {
  const rows = window.App.reportsData || [];
  if (rows.length === 0) {
    window.App.showToast('No hay datos para exportar', 'info');
    return;
  }
  if (!window.jspdf?.jsPDF) {
    window.App.showToast('La libreria PDF no esta disponible', 'error');
    return;
  }

  const fromDate = document.getElementById('reports-date-from')?.value || '';
  const toDate = document.getElementById('reports-date-to')?.value || '';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const academyName = window.App.state.settings?.academyName || 'Academia';

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const right = pageW - margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${academyName} - Informe mensual`, margin, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const rangeText = `Rango: ${fromDate ? window.App.fmtDate(fromDate) : 'Inicio'} - ${toDate ? window.App.fmtDate(toDate) : 'Hoy'}`;
  doc.text(rangeText, margin, 23);

  const totalBilled = rows.reduce((sum, row) => sum + row.billed, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalPending = Math.max(0, totalBilled - totalPaid);

  doc.setFont('helvetica', 'bold');
  doc.text(`Total facturado: ${window.App.fmtCurrency(totalBilled)}`, margin, 31);
  doc.text(`Total cobrado: ${window.App.fmtCurrency(totalPaid)}`, margin, 37);
  doc.text(`Pendiente: ${window.App.fmtCurrency(totalPending)}`, margin, 43);

  let y = 55;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Mes', margin, y);
  doc.text('Facturado', right - 60, y, { align: 'right' });
  doc.text('Cobrado', right - 30, y, { align: 'right' });
  doc.text('Pendiente', right, y, { align: 'right' });

  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, right, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  rows.forEach(row => {
    if (y > pageH - 18) {
      doc.addPage();
      y = 16;
      doc.setFont('helvetica', 'bold');
      doc.text('Mes', margin, y);
      doc.text('Facturado', right - 60, y, { align: 'right' });
      doc.text('Cobrado', right - 30, y, { align: 'right' });
      doc.text('Pendiente', right, y, { align: 'right' });
      y += 8;
      doc.setFont('helvetica', 'normal');
    }

    doc.text(row.monthLabel, margin, y);
    doc.text(window.App.fmtCurrency(row.billed), right - 60, y, { align: 'right' });
    doc.text(window.App.fmtCurrency(row.paid), right - 30, y, { align: 'right' });
    doc.text(window.App.fmtCurrency(row.pending), right, y, { align: 'right' });
    y += 6;
  });

  const rangePart = `${fromDate || 'inicio'}_${toDate || 'hoy'}`;
  doc.save(`informe_mensual_${rangePart}.pdf`);
  window.App.showToast('Informe PDF descargado', 'success');
};

window.App.initReportsEvents = function() {
  const fromInput = document.getElementById('reports-date-from');
  const toInput = document.getElementById('reports-date-to');
  const applyBtn = document.getElementById('btn-reports-apply');
  const exportCsvBtn = document.getElementById('btn-reports-export-csv');
  const exportPdfBtn = document.getElementById('btn-reports-export-pdf');

  const today = window.App.todayStr();
  const yearStart = `${today.substring(0, 4)}-01-01`;

  if (fromInput && !fromInput.value) fromInput.value = yearStart;
  if (toInput && !toInput.value) toInput.value = today;

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const fromDate = fromInput?.value || '';
      const toDate = toInput?.value || '';
      if (fromDate && toDate && fromDate > toDate) {
        window.App.showToast('La fecha Desde no puede ser mayor que Hasta', 'error');
        return;
      }
      window.App.renderReports();
    });
  }

  if (fromInput) {
    fromInput.addEventListener('change', () => {
      if (toInput && toInput.value && fromInput.value > toInput.value) {
        toInput.value = fromInput.value;
      }
      window.App.renderReports();
    });
  }

  if (toInput) {
    toInput.addEventListener('change', () => {
      if (fromInput && fromInput.value && toInput.value < fromInput.value) {
        fromInput.value = toInput.value;
      }
      window.App.renderReports();
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', window.App.exportReportsCsv);
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', window.App.exportReportsPdf);
  }
};
