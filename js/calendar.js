/* =============================================
   Calendar Module
   Calendar view and navigation
   ============================================= */

window.App = window.App || {};

window.App.renderCalendar = function() {
  const year  = window.App.calendarDate.getFullYear();
  const month = window.App.calendarDate.getMonth();

  document.getElementById('cal-month-title').textContent =
    `${window.App.MONTHS_ES[month]} ${year}`;

  // First day of month (Mon=0)
  const firstDay = new Date(year, month, 1);
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // convert to Mon=0

  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const daysInPrevMon = new Date(year, month, 0).getDate();

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  // Build a map: dateStr -> classes[]
  const classMap = {};
  window.App.state.classes.forEach(c => {
    if (!classMap[c.date]) classMap[c.date] = [];
    classMap[c.date].push(c);
  });

  const grid = document.getElementById('calendar-days');
  let html = '';

  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    let dayNum, dateStr, isOther = false;
    if (i < startDow) {
      dayNum  = daysInPrevMon - startDow + 1 + i;
      dateStr = window.App.formatDateStr(year, month - 1, dayNum);
      isOther = true;
    } else if (i >= startDow + daysInMonth) {
      dayNum  = i - startDow - daysInMonth + 1;
      dateStr = window.App.formatDateStr(year, month + 1, dayNum);
      isOther = true;
    } else {
      dayNum  = i - startDow + 1;
      dateStr = window.App.formatDateStr(year, month, dayNum);
    }

    const cellDate = new Date(year, isOther ? (i < startDow ? month - 1 : month + 1) : month, dayNum);
    const isToday  = cellDate.getTime() === todayDate.getTime();
    const isPast   = cellDate < todayDate;
    const classes  = classMap[dateStr] || [];
    const hasClass = classes.length > 0;

    const dots = classes.slice(0, 3).map(c =>
      `<div class="class-dot ${c.type}"></div>`
    ).join('');

    const clickAction = hasClass 
      ? `onclick="window.openDayClasses('${dateStr}')"` 
      : (!isOther ? `onclick="window.openNewClass('${dateStr}')"` : '');

    html += `
      <div class="cal-day${isOther ? ' other-month' : ''}${isToday ? ' today' : ''}${hasClass ? ' has-class' : ''}${isPast ? ' past' : ''}"
           ${clickAction}>
        ${dayNum}
        ${dots ? `<div class="cal-dots">${dots}</div>` : ''}
      </div>`;
  }

  grid.innerHTML = html;
}

window.App.openDayClasses = function(dateStr) {
  const classes = window.App.state.classes.filter(c => c.date === dateStr)
    .sort((a, b) => a.time.localeCompare(b.time));
  if (classes.length === 0) return;
  
  if (classes.length === 1) {
    window.App.openClassDetail(classes[0].id);
    return;
  }
  // Show first class detail (could be improved with a list modal)
  window.App.openClassDetail(classes[0].id);
}

// Initialize calendar events
window.App.initCalendarEvents = function() {
  document.getElementById('cal-prev').addEventListener('click', () => {
    const newDate = new Date(window.App.calendarDate);
    newDate.setMonth(newDate.getMonth() - 1);
    window.App.setCalendarDate(newDate);
    window.App.renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    const newDate = new Date(window.App.calendarDate);
    newDate.setMonth(newDate.getMonth() + 1);
    window.App.setCalendarDate(newDate);
    window.App.renderCalendar();
  });
}

// Make functions globally available for onclick handlers
if (typeof window !== 'undefined') {
  window.openDayClasses = window.App.openDayClasses;
}
