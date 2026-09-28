/* =============================================
   Google Calendar Integration Module
   ============================================= */

window.App = window.App || {};

let gcalAccessExpiry = 0;

window.App.onGISLoaded = function() {
  window.App.initGCalTokenClient();
};

window.App.isGCalConnected = function() {
  return !!(window.App.gcalAccessToken && Date.now() < gcalAccessExpiry);
};

window.App.initGCalTokenClient = function() {
  const clientId = window.App.state.settings?.gcalClientId?.trim();
  if (!clientId || !window.google?.accounts?.oauth2) return;
  const client = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    callback: handleGCalToken,
  });
  window.App.setGcalTokenClient(client);
  window.App.updateGCalUI();
};

function handleGCalToken(response) {
  if (response.error) {
    window.App.showToast('Error Google: ' + (response.error_description || response.error), 'error');
    return;
  }
  window.App.setGcalAccessToken(response.access_token);
  gcalAccessExpiry = Date.now() + ((parseInt(response.expires_in, 10) || 3600) - 60) * 1000;
  window.App.updateGCalUI();
  window.App.showToast(window.App.MESSAGES.gcalConnected, 'success');
}

window.App.connectGCal = function() {
  const clientId = window.App.state.settings?.gcalClientId?.trim();
  if (!clientId) {
    window.App.showToast('Introduce primero el Client ID en Ajustes', 'error');
    return;
  }
  if (!window.google?.accounts?.oauth2) {
    window.App.showToast('El SDK de Google aún no está cargado, espera un momento', 'error');
    return;
  }
  if (!window.App.gcalTokenClient) window.App.initGCalTokenClient();
  window.App.gcalTokenClient.requestAccessToken({ prompt: '' });
};

window.App.disconnectGCal = function() {
  if (window.App.gcalAccessToken && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(window.App.gcalAccessToken, () => {});
  }
  window.App.setGcalAccessToken(null);
  gcalAccessExpiry = 0;
  window.App.setGcalTokenClient(null);
  window.App.updateGCalUI();
  window.App.showToast(window.App.MESSAGES.gcalDisconnected);
};

window.App.updateGCalUI = function() {
  const connected = window.App.isGCalConnected();
  const headerDot = document.getElementById('gcal-dot');
  if (headerDot) headerDot.className = 'gcal-dot ' + (connected ? 'connected' : 'disconnected');

  const syncBtn = document.getElementById('btn-gcal-sync');
  if (syncBtn) syncBtn.classList.toggle('hidden', !connected);

  const settingsDot    = document.getElementById('settings-gcal-dot');
  const settingsLabel  = document.getElementById('settings-gcal-label');
  const connectBtn     = document.getElementById('btn-gcal-connect');
  const disconnectBtn  = document.getElementById('btn-gcal-disconnect');
  if (settingsDot)   settingsDot.className    = 'gcal-dot ' + (connected ? 'connected' : 'disconnected');
  if (settingsLabel) settingsLabel.textContent = connected ? 'Conectado' : 'Desconectado';
  if (connectBtn)    connectBtn.classList.toggle('hidden', connected);
  if (disconnectBtn) disconnectBtn.classList.toggle('hidden', !connected);
};

window.App.syncAllToGCal = async function() {
  if (!window.App.isGCalConnected()) { window.App.showToast('Conecta primero Google Calendar', 'error'); return; }
  const today  = window.App.todayStr();
  const toSync = window.App.state.classes.filter(c => c.date >= today);
  if (toSync.length === 0) { window.App.showToast('No hay clases futuras para sincronizar'); return; }

  window.App.showToast(`Sincronizando ${toSync.length} clase${toSync.length !== 1 ? 's' : ''}…`);
  let synced = 0;
  for (const cls of toSync) {
    const eventId = await window.App.upsertGCalEvent(cls);
    if (eventId) { cls.gcalEventId = eventId; synced++; }
    if (!window.App.isGCalConnected()) break;
  }
  if (synced > 0) {
    window.App.saveState();
    window.App.renderCalendar();
    window.App.showToast(`${synced} clase${synced !== 1 ? 's' : ''} sincronizada${synced !== 1 ? 's' : ''} ✓`, 'success');
  }
};

window.App.upsertGCalEvent = async function(cls) {
  const calendarId = encodeURIComponent(window.App.state.settings?.gcalCalendarId || 'primary');
  const timeZone   = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const startDt    = new Date(`${cls.date}T${cls.time}:00`);
  
  // Use class duration (default to 60 minutes if not set)
  const durationMinutes = cls.duration || 60;
  const endDt      = new Date(startDt.getTime() + durationMinutes * 60 * 1000);

  const studentNames = cls.studentIds.map(id => {
    const s = window.App.state.students.find(s => s.id === id);
    return s ? s.name : '?';
  }).join(', ');

  // Build event title: student name for individual, group name for group classes
  let eventTitle = '';
  if (cls.type === 'individual') {
    // For individual classes, use student name
    const student = window.App.state.students.find(s => s.id === cls.studentIds[0]);
    eventTitle = student ? student.name : 'Clase Individual';
  } else {
    // For group classes, use group name
    if (cls.groupId) {
      const group = window.App.state.groups?.find(g => g.id === cls.groupId);
      eventTitle = group ? group.name : 'Clase Grupal';
    } else {
      eventTitle = 'Clase Grupal';
    }
  }

  const event = {
    summary:     eventTitle,
    description: `Alumnos: ${studentNames}\nCuota: ${window.App.fmtCurrency(cls.fee)}/alumno`,
    start: { dateTime: startDt.toISOString(), timeZone },
    end:   { dateTime: endDt.toISOString(),   timeZone },
    colorId: cls.type === 'individual' ? '1' : '5',
  };

  try {
    let url, method;
    if (cls.gcalEventId) {
      url    = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(cls.gcalEventId)}`;
      method = 'PUT';
    } else {
      url    = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
      method = 'POST';
    }
    const res = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${window.App.gcalAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (res.status === 401) {
      window.App.setGcalAccessToken(null);
      gcalAccessExpiry = 0;
      window.App.updateGCalUI();
      window.App.showToast('Sesión de Google expirada, reconecta', 'error');
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    return data.id;
  } catch {
    return null;
  }
};

window.App.deleteGCalEvent = async function(cls) {
  if (!cls.gcalEventId) return true;
  if (!window.App.isGCalConnected()) return false;
  const calendarId = encodeURIComponent(window.App.state.settings?.gcalCalendarId || 'primary');
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(cls.gcalEventId)}`,
      { method: 'DELETE', headers: { 'Authorization': `Bearer ${window.App.gcalAccessToken}` } }
    );

    if (res.status === 401) {
      window.App.setGcalAccessToken(null);
      gcalAccessExpiry = 0;
      window.App.updateGCalUI();
      window.App.showToast('Sesion de Google expirada, reconecta', 'error');
      return false;
    }

    // 204 = deleted, 404 = already absent in Google Calendar
    return res.status === 204 || res.status === 404;
  } catch {
    return false;
  }
};
