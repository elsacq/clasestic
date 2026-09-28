/* =============================================
   Config & Constants
   ============================================= */

window.App = window.App || {};

window.App.CONFIG = {
  appName: 'Clases TIC',
  defaultAcademyName: 'Mi Academia',
  version: '1.0.0',
  storageKey: 'academia_mvp_data',
};

window.App.GITHUB_CONFIG = {
  defaultBranch: 'main',
  defaultFilePath: 'academia_data.json',
};

window.App.GCAL_CONFIG = {
  defaultCalendarId: 'primary',
  classDuration: 60, // minutes
};

window.App.MESSAGES = {
  // Success messages
  saved: 'Guardado correctamente',
  deleted: 'Eliminado correctamente',
  settingsSaved: 'Ajustes guardados',
  dataExported: 'Datos exportados correctamente',
  dataImported: 'Datos importados correctamente',
  receiptCreated: 'Recibo generado correctamente',
  githubSyncOk: 'Sincronizado con GitHub ✓',
  githubPullOk: 'Datos actualizados desde GitHub ✓',
  githubConnectionOk: 'Conexión con GitHub correcta ✓',
  gcalConnected: 'Google Calendar conectado ✓',
  gcalDisconnected: 'Desconectado de Google Calendar',
  gcalEventCreated: 'Evento creado en Google Calendar',
  gcalEventUpdated: 'Evento actualizado en Google Calendar',
  gcalEventDeleted: 'Evento eliminado de Google Calendar',
  remoteChangesMerged: 'Cambios remotos incorporados',
  
  // Error messages
  errorSaving: 'Error guardando datos',
  errorLoading: 'Error cargando datos',
  errorExporting: 'Error al exportar',
  errorImporting: 'Error al importar: formato inválido',
  errorNetwork: 'Error de red',
  errorGithubConnection: 'Error de red al conectar con GitHub',
  errorGithubAccess: 'GitHub: acceso denegado. Revisa el token.',
  errorGithubToken: 'GitHub: token sin permisos o incorrecto',
  errorGcalInit: 'Error inicializando Google Calendar',
  errorGcalCreate: 'Error al crear evento en Google Calendar',
  errorGcalUpdate: 'Error al actualizar evento en Google Calendar',
  errorGcalDelete: 'Error al eliminar evento de Google Calendar',
  pastDateTime: 'No se puede crear una clase en el pasado',
  
  // Validation messages
  requiredFields: 'Completa todos los campos obligatorios',
  requiredName: 'El nombre es obligatorio',
  requiredCourse: 'El nombre del curso es obligatorio',
  requiredDateTime: 'Fecha y hora obligatorias',
  invalidFee: 'Cuota inválida',
  invalidAmount: 'Importe inválido',
  selectStudent: 'Selecciona al menos un alumno',
  individualClassLimit: 'Clase individual: solo 1 alumno',
  timeConflict: (label, time) => `Conflicto: ya hay una clase ${label} a las ${time}`,
  
  // Confirm messages
  confirmDeleteStudent: (name) => `¿Eliminar alumno "${name}"?`,
  confirmDeleteClass: 'Confirmar eliminación de clase',
  confirmDeleteCourse: (name) => `¿Eliminar curso "${name}"?`,
  unsavedChanges: '¿Descartar cambios sin guardar?',
  
  // Info messages
  noStudents: 'No hay alumnos',
  noClasses: 'No hay clases',
  noCourses: 'No hay cursos',
  noReceipts: 'No hay recibos',
  githubUnconfigured: 'Configura GitHub en Ajustes primero',
  githubRepoFound: 'Repositorio encontrado (archivo se creará al guardar)',
  
  // Status messages
  githubSyncing: 'Sincronizando con GitHub…',
  githubPending: 'Pendiente de sincronizar…',
  githubError: 'Error de sincronización con GitHub',
  githubUnconfiguredStatus: 'GitHub Sync no configurado (Ajustes)',
  checking: 'Comprobando…',
};

window.App.MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

window.App.MONTHS_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
];

window.App.DAYS_ES = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'
];

window.App.CLASS_TYPES = {
  individual: 'Individual',
  grupal: 'Grupal'
};
