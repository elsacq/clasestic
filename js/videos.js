window.App = window.App || {};

const PORTAL_BUCKET = 'portal-files';
const MAX_EXERCISE_SIZE = 25 * 1024 * 1024;
let portalClient = null;
let portalAdminUser = null;
let portalVideos = [];

window.App.isPortalAdmin = false;

function getPortalClient() {
  if (portalClient) return portalClient;
  const config = window.PORTAL_CONFIG || {};
  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) return null;
  portalClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  return portalClient;
}

function showVideoMessage(elementId, message, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('portal-error', isError);
  element.classList.toggle('hidden', !message);
}

function setVideoAdminState(isAdmin) {
  window.App.isPortalAdmin = isAdmin;
  document.getElementById('videos-config-warning').classList.add('hidden');
  document.getElementById('videos-admin-login').classList.toggle('hidden', isAdmin);
  document.getElementById('videos-admin-panel').classList.toggle('hidden', !isAdmin);
  if (document.getElementById('tab-students').classList.contains('active')) {
    window.App.renderStudents();
  }
}

function portalErrorMessage(error) {
  return error?.message || 'No se pudo completar la operación. Revisa la conexión y vuelve a intentarlo.';
}

async function portalFunctionErrorMessage(error) {
  const response = error?.context;
  if (!(response instanceof Response)) return portalErrorMessage(error);

  try {
    const body = await response.clone().json();
    if (typeof body?.error === 'string') return body.error;
    if (typeof body?.message === 'string') return body.message;
  } catch {
    // The function may return a non-JSON error response.
  }
  return `${portalErrorMessage(error)} (HTTP ${response.status})`;
}

async function loadAdminVideos() {
  const client = getPortalClient();
  const [groupsResult, videosResult, secretsResult, submissionsResult, activityResult] = await Promise.all([
    client.from('portal_groups').select('id,name,enabled').order('name'),
    client.from('portal_videos').select('*').order('class_date', { ascending: false }),
    client.from('portal_video_secrets').select('*'),
    client.from('student_submissions').select('*').order('uploaded_at', { ascending: false }),
    client.from('portal_access_logs').select('*').order('created_at', { ascending: false }).limit(100),
  ]);
  const error = groupsResult.error || videosResult.error || secretsResult.error || submissionsResult.error || activityResult.error;
  if (error) throw error;

  const groups = groupsResult.data || [];
  const secretsByVideo = new Map((secretsResult.data || []).map(secret => [secret.video_id, secret]));
  portalVideos = (videosResult.data || []).map(video => {
    const secret = secretsByVideo.get(video.id);
    return {
      ...video,
      ...secret,
      updated_at: video.updated_at,
      secret_updated_at: secret?.updated_at,
    };
  });
  const groupSelect = document.getElementById('video-group');
  const selectedGroup = groupSelect.value;
  const editingVideo = portalVideos.find(video => video.id === document.getElementById('video-id').value);
  const availableGroups = groups.filter(group => group.enabled || group.id === editingVideo?.group_id);
  groupSelect.innerHTML = availableGroups.length
    ? availableGroups.map(group => `<option value="${window.App.escHtml(group.id)}" ${group.id === selectedGroup ? 'selected' : ''} ${group.enabled ? '' : 'disabled'}>${window.App.escHtml(group.name)}${group.enabled ? '' : ' (inactivo)'}</option>`).join('')
    : '<option value="">Sin grupos sincronizados</option>';

  renderAdminVideos(portalVideos, groups);
  renderVideoSubmissions(submissionsResult.data || [], groups);
  renderPortalActivity(activityResult.data || [], groups);
}

function renderPortalActivity(events, groups) {
  const list = document.getElementById('portal-access-logs');
  if (!events.length) {
    list.innerHTML = '<p class="form-hint">Todavía no hay clics ni descargas registrados.</p>';
    return;
  }
  const students = new Map(window.App.state.students.map(student => [student.id, student]));
  const videos = new Map(portalVideos.map(video => [video.id, video]));
  const groupNames = new Map(groups.map(group => [group.id, group.name]));
  const labels = {
    video_clicked: 'Clic en vídeo',
    exercise_downloaded: 'Descarga de Excel',
    submission_downloaded: 'Descarga de entrega',
  };
  list.innerHTML = `<div class="portal-activity-list">${events.map(event => {
    const video = videos.get(event.video_id);
    return `<div class="portal-activity-row">
      <strong>${window.App.escHtml(students.get(event.student_id)?.name || 'Alumno no encontrado')}</strong>
      <span>${window.App.escHtml(labels[event.event_type] || event.event_type)} · ${window.App.escHtml(video?.title || 'Vídeo eliminado')} · ${window.App.escHtml(groupNames.get(video?.group_id) || '')}</span>
      <time datetime="${window.App.escHtml(event.created_at)}">${new Date(event.created_at).toLocaleString('es-ES')}</time>
    </div>`;
  }).join('')}</div>`;
}

function renderAdminVideos(videos, groups) {
  const groupNames = new Map(groups.map(group => [group.id, group.name]));
  const list = document.getElementById('videos-admin-list');
  if (videos.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>Aún no hay vídeos. Sincroniza los grupos y añade el primero.</p></div>';
    return;
  }
  list.innerHTML = videos.map(video => `
    <article class="card video-admin-card">
      <div>
        <h3>${window.App.escHtml(video.title)}</h3>
        <p class="form-hint">${window.App.escHtml(groupNames.get(video.group_id) || 'Grupo eliminado')} · ${window.App.fmtDate(video.class_date)} · ${video.visible ? 'Visible' : 'Oculto'}</p>
        ${video.has_exercise ? `<p class="form-hint">Excel: ${window.App.escHtml(video.exercise_filename || '')}</p>` : ''}
      </div>
      <div class="video-admin-actions">
        <button class="btn btn-sm btn-secondary" type="button" data-edit-video="${window.App.escHtml(video.id)}">Editar</button>
        <button class="btn btn-sm btn-danger" type="button" data-delete-video="${window.App.escHtml(video.id)}">Eliminar</button>
      </div>
    </article>`).join('');
}

function renderVideoSubmissions(submissions, groups) {
  const list = document.getElementById('video-submissions-list');
  if (submissions.length === 0) {
    list.innerHTML = '<p class="form-hint">Todavía no se han entregado ejercicios.</p>';
    return;
  }
  const students = new Map(window.App.state.students.map(student => [student.id, student]));
  const videos = new Map(portalVideos.map(video => [video.id, video]));
  const groupNames = new Map(groups.map(group => [group.id, group.name]));
  list.innerHTML = submissions.map(submission => {
    const student = students.get(submission.student_id);
    const video = videos.get(submission.video_id);
    return `
      <form class="card video-submission-card" data-grade-submission="${window.App.escHtml(submission.id)}">
        <div class="video-submission-heading">
          <strong>${window.App.escHtml(student?.name || 'Alumno no encontrado')}</strong>
          <span>${window.App.escHtml(video?.title || 'Vídeo eliminado')} · ${window.App.escHtml(groupNames.get(video?.group_id) || '')}</span>
          <small>${window.App.fmtDate(submission.uploaded_at?.slice(0, 10) || '')} · ${window.App.escHtml(submission.file_name)}</small>
        </div>
        <div class="video-admin-actions">
          <button type="button" class="btn btn-sm btn-secondary" data-download-submission="${window.App.escHtml(submission.id)}">Descargar ejercicio</button>
          <label class="grade-field">Nota
            <input name="grade" type="number" min="0" max="10" step="0.1" value="${submission.grade ?? ''}" placeholder="0-10" />
          </label>
        </div>
        <label class="form-group">Correcciones / comentarios
          <textarea name="feedback" rows="2" maxlength="4000">${window.App.escHtml(submission.feedback || '')}</textarea>
        </label>
        <button class="btn btn-sm btn-primary" type="submit">Guardar calificación</button>
      </form>`;
  }).join('');
}

function getPortalEligibleStudents() {
  const groupedStudentIds = new Set(window.App.state.groups
    .filter(group => group.active !== false)
    .flatMap(group => group.studentIds || []));
  return window.App.state.students.filter(student =>
    student.active !== false && groupedStudentIds.has(student.id)
  );
}

function renderPortalAccounts() {
  const list = document.getElementById('portal-accounts-list');
  const groupsByStudent = new Map();
  window.App.state.groups.filter(group => group.active !== false).forEach(group => {
    (group.studentIds || []).forEach(studentId => {
      if (!groupsByStudent.has(studentId)) groupsByStudent.set(studentId, []);
      groupsByStudent.get(studentId).push(group.name);
    });
  });
  const students = getPortalEligibleStudents().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (students.length === 0) {
    list.innerHTML = '<p class="form-hint">No hay alumnos activos asignados a grupos activos.</p>';
    return;
  }
  list.innerHTML = `<div class="portal-account-list">${students.map(student => {
    const email = student.email || '';
    return `<div class="portal-account-row">
      <div>
        <strong>${window.App.escHtml(student.name)}</strong>
        <span>${window.App.escHtml(email || 'Falta correo Google')} · ${window.App.escHtml((groupsByStudent.get(student.id) || []).join(', ') || 'Sin grupo')}</span>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function resetVideoForm() {
  document.getElementById('video-form').reset();
  document.getElementById('video-id').value = '';
  document.getElementById('video-date').value = window.App.todayStr();
  document.getElementById('video-visible').checked = true;
  document.getElementById('video-form-title').textContent = 'Añadir vídeo';
  document.getElementById('video-current-file').textContent = '';
  document.getElementById('btn-video-cancel-edit').classList.add('hidden');
}

function editVideo(videoId) {
  const video = portalVideos.find(item => item.id === videoId);
  if (!video) return;
  document.getElementById('video-id').value = video.id;
  document.getElementById('video-group').value = video.group_id;
  document.getElementById('video-date').value = video.class_date;
  document.getElementById('video-title').value = video.title;
  document.getElementById('video-url').value = video.video_url;
  document.getElementById('video-password').value = video.video_password || '';
  document.getElementById('video-visible').checked = video.visible;
  document.getElementById('video-exercise-file').value = '';
  document.getElementById('video-current-file').textContent = video.exercise_filename
    ? `Archivo actual: ${video.exercise_filename}. Selecciona otro solo si quieres reemplazarlo.`
    : 'No hay archivo Excel adjunto.';
  document.getElementById('video-form-title').textContent = 'Editar vídeo';
  document.getElementById('btn-video-cancel-edit').classList.remove('hidden');
  document.getElementById('video-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateVideoUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

async function restoreVideoSave(client, videoId, previous) {
  if (!previous) {
    const result = await client.from('portal_videos').delete().eq('id', videoId);
    return result.error ? [result.error] : [];
  }
  const results = await Promise.all([
    client.from('portal_videos').upsert({
      id: previous.id,
      group_id: previous.group_id,
      title: previous.title,
      class_date: previous.class_date,
      exercise_filename: previous.exercise_filename,
      has_exercise: previous.has_exercise,
      visible: previous.visible,
      created_at: previous.created_at,
      updated_at: previous.updated_at,
    }),
    previous.video_url
      ? client.from('portal_video_secrets').upsert({
        video_id: previous.id,
        video_url: previous.video_url,
        video_password: previous.video_password,
        exercise_path: previous.exercise_path,
        updated_at: previous.secret_updated_at || previous.updated_at,
      })
      : client.from('portal_video_secrets').delete().eq('video_id', previous.id),
  ]);
  return results.filter(result => result.error).map(result => result.error);
}

function getSafeFileName(fileName) {
  return fileName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'ejercicios.xlsx';
}

async function saveVideo(event) {
  event.preventDefault();
  const client = getPortalClient();
  const videoId = document.getElementById('video-id').value || crypto.randomUUID();
  const url = document.getElementById('video-url').value.trim();
  const file = document.getElementById('video-exercise-file').files[0];
  if (!validateVideoUrl(url)) {
    window.App.showToast('El enlace del vídeo debe ser una URL segura HTTPS', 'error');
    return;
  }
  if (file && (!/\.(xlsx|xls)$/i.test(file.name) || file.size > MAX_EXERCISE_SIZE)) {
    window.App.showToast('Adjunta un Excel .xls o .xlsx de hasta 25 MB', 'error');
    return;
  }
  const current = portalVideos.find(item => item.id === videoId);
  let uploadedPath = null;
  let exercisePath = current?.exercise_path || null;
  let exerciseFilename = current?.exercise_filename || null;
  if (file) {
    uploadedPath = `exercises/${videoId}/${crypto.randomUUID()}-${getSafeFileName(file.name)}`;
    const uploadResult = await client.storage.from(PORTAL_BUCKET).upload(uploadedPath, file, {
      cacheControl: '3600',
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (uploadResult.error) {
      window.App.showToast(`No se pudo subir el Excel: ${portalErrorMessage(uploadResult.error)}`, 'error');
      return;
    }
    exercisePath = uploadedPath;
    exerciseFilename = file.name;
  }

  const record = {
    id: videoId,
    group_id: document.getElementById('video-group').value,
    title: document.getElementById('video-title').value.trim(),
    class_date: document.getElementById('video-date').value,
    exercise_filename: exerciseFilename,
    has_exercise: Boolean(exercisePath),
    visible: current ? document.getElementById('video-visible').checked : false,
    updated_at: new Date().toISOString(),
  };
  const secret = {
    video_id: videoId,
    video_url: url,
    video_password: document.getElementById('video-password').value.trim() || null,
    exercise_path: exercisePath,
    updated_at: new Date().toISOString(),
  };
  const recordResult = await client.from('portal_videos').upsert(record);
  if (recordResult.error) {
    if (uploadedPath) {
      const cleanup = await client.storage.from(PORTAL_BUCKET).remove([uploadedPath]);
      if (cleanup.error) console.error('No se pudo limpiar el Excel subido tras fallar el guardado:', cleanup.error);
    }
    window.App.showToast(`No se pudo guardar el vídeo: ${portalErrorMessage(recordResult.error)}`, 'error');
    return;
  }
  const secretResult = await client.from('portal_video_secrets').upsert(secret);
  if (secretResult.error) {
    if (uploadedPath) {
      const cleanup = await client.storage.from(PORTAL_BUCKET).remove([uploadedPath]);
      if (cleanup.error) console.error('No se pudo limpiar el Excel subido tras fallar el guardado:', cleanup.error);
    }
    const rollbackErrors = await restoreVideoSave(client, videoId, current);
    const rollbackMessage = rollbackErrors.length
      ? ` No se pudo restaurar el vídeo anterior: ${rollbackErrors.map(portalErrorMessage).join('; ')}`
      : '';
    window.App.showToast(`No se pudo guardar el enlace seguro del vídeo: ${portalErrorMessage(secretResult.error)}${rollbackMessage}`, 'error');
    return;
  }
  const visible = document.getElementById('video-visible').checked;
  const visibilityResult = await client.from('portal_videos')
    .update({ visible, updated_at: new Date().toISOString() }).eq('id', videoId);
  if (visibilityResult.error) {
    if (uploadedPath) {
      const cleanup = await client.storage.from(PORTAL_BUCKET).remove([uploadedPath]);
      if (cleanup.error) console.error('No se pudo limpiar el Excel subido tras fallar el guardado:', cleanup.error);
    }
    const rollbackErrors = await restoreVideoSave(client, videoId, current);
    const rollbackMessage = rollbackErrors.length
      ? ` No se pudo restaurar el vídeo anterior: ${rollbackErrors.map(portalErrorMessage).join('; ')}`
      : '';
    window.App.showToast(`No se pudo publicar el vídeo: ${portalErrorMessage(visibilityResult.error)}${rollbackMessage}`, 'error');
    return;
  }

  if (file && current?.exercise_path) {
    const removal = await client.storage.from(PORTAL_BUCKET).remove([current.exercise_path]);
    if (removal.error) window.App.showToast('Vídeo guardado, pero no se pudo retirar el Excel anterior', 'error');
  }
  resetVideoForm();
  await loadAdminVideos();
  window.App.showToast('Vídeo guardado', 'success');
}

async function deleteVideo(videoId) {
  const video = portalVideos.find(item => item.id === videoId);
  if (!video || !window.confirm(`¿Eliminar "${video.title}"? No se podrá eliminar si ya tiene ejercicios entregados.`)) return;
  const client = getPortalClient();
  const result = await client.from('portal_videos').delete().eq('id', videoId);
  if (result.error) {
    window.App.showToast(`No se pudo eliminar: ${portalErrorMessage(result.error)}`, 'error');
    return;
  }
  if (video.exercise_path) {
    const removal = await client.storage.from(PORTAL_BUCKET).remove([video.exercise_path]);
    if (removal.error) window.App.showToast('Vídeo eliminado, pero no se pudo retirar el Excel del almacenamiento', 'error');
  }
  await loadAdminVideos();
  window.App.showToast('Vídeo eliminado', 'success');
}

async function syncPortalStudents() {
  const client = getPortalClient();
  const status = document.getElementById('portal-sync-status');
  status.textContent = 'Sincronizando correos y grupos...';
  try {
    const students = getPortalEligibleStudents();
    const studentIds = new Set(students.map(student => student.id));
    const { data, error } = await client.functions.invoke('manage-students', {
      body: {
        action: 'sync',
        students: students.map(student => ({
          id: student.id,
          name: student.name,
          email: student.email || '',
          active: student.active !== false,
        })),
        groups: window.App.state.groups.map(group => ({
          id: group.id,
          name: group.name,
          active: group.active !== false,
          studentIds: group.active !== false
            ? (group.studentIds || []).filter(studentId => studentIds.has(studentId))
            : [],
        })),
      },
    });
    if (error) throw error;
    const updated = data.results.filter(item => item.status === 'synced').length;
    const failures = data.results.filter(item => item.status === 'error');
    status.classList.toggle('portal-error', failures.length > 0);
    status.textContent = `${updated} alumnos activos con grupo sincronizados${failures.length ? `, ${failures.length} con error: ${failures.map(item => `${item.name}: ${item.message}`).join('; ')}` : ''}. Los alumnos entran con su cuenta de Google.`;
    renderPortalAccounts();
    await loadAdminVideos();
  } catch (error) {
    status.textContent = `Error al sincronizar: ${await portalFunctionErrorMessage(error)}`;
    status.classList.add('portal-error');
  }
}

async function downloadSubmission(submissionId) {
  const client = getPortalClient();
  const submission = document.querySelector(`[data-grade-submission="${CSS.escape(submissionId)}"]`);
  if (!submission) return;
  const { data, error } = await client.from('student_submissions').select('file_path,file_name').eq('id', submissionId).single();
  if (error) {
    window.App.showToast(`No se pudo abrir la entrega: ${portalErrorMessage(error)}`, 'error');
    return;
  }
  const signed = await client.storage.from(PORTAL_BUCKET).createSignedUrl(data.file_path, 300, { download: data.file_name });
  if (signed.error) {
    window.App.showToast(`No se pudo descargar la entrega: ${portalErrorMessage(signed.error)}`, 'error');
    return;
  }
  window.open(signed.data.signedUrl, '_blank', 'noopener,noreferrer');
}

async function saveSubmissionGrade(event) {
  event.preventDefault();
  const form = event.target;
  const gradeValue = form.elements.grade.value.trim();
  const grade = gradeValue === '' ? null : Number(gradeValue);
  if (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > 10)) {
    window.App.showToast('La nota debe estar entre 0 y 10', 'error');
    return;
  }
  const result = await getPortalClient().from('student_submissions').update({
    grade,
    feedback: form.elements.feedback.value.trim() || null,
    graded_at: grade !== null || form.elements.feedback.value.trim() ? new Date().toISOString() : null,
  }).eq('id', form.dataset.gradeSubmission);
  if (result.error) {
    window.App.showToast(`No se pudo guardar la corrección: ${portalErrorMessage(result.error)}`, 'error');
    return;
  }
  window.App.showToast('Calificación guardada', 'success');
}

async function signInVideoAdmin(event) {
  event.preventDefault();
  const client = getPortalClient();
  showVideoMessage('videos-admin-login-error', '');
  sessionStorage.setItem('clasestic-oauth-return-tab', 'videos');
  try {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      sessionStorage.removeItem('clasestic-oauth-return-tab');
      showVideoMessage('videos-admin-login-error', portalErrorMessage(error), true);
    }
  } catch (error) {
    sessionStorage.removeItem('clasestic-oauth-return-tab');
    showVideoMessage('videos-admin-login-error', portalErrorMessage(error), true);
    return;
  }
}

async function restoreVideoAdminSession() {
  const client = getPortalClient();
  if (!client) return;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) return;
  const admin = await client.from('portal_admins').select('user_id').eq('user_id', data.session.user.id).maybeSingle();
  if (admin.error) throw admin.error;
  if (!admin.data) {
    await client.auth.signOut();
    showVideoMessage('videos-admin-login-error', 'La cuenta de Google no tiene permisos de administración. Añádela a portal_admins en Supabase.', true);
    return;
  }
  portalAdminUser = data.session.user;
  setVideoAdminState(true);
  renderPortalAccounts();
  const portalBaseUrl = new URL('portal/index.html', window.location.href).href;
  document.getElementById('videos-portal-url').innerHTML = `Portal: <a href="${window.App.escHtml(portalBaseUrl)}" target="_blank" rel="noopener noreferrer">${window.App.escHtml(portalBaseUrl)}</a>`;
  await loadAdminVideos();
}

window.App.renderVideos = async function() {
  const client = getPortalClient();
  if (!client) {
    document.getElementById('videos-config-warning').classList.remove('hidden');
    document.getElementById('videos-admin-login').classList.add('hidden');
    document.getElementById('videos-admin-panel').classList.add('hidden');
    return;
  }
  if (!portalAdminUser) {
    document.getElementById('videos-admin-login').classList.remove('hidden');
    document.getElementById('videos-admin-panel').classList.add('hidden');
    try {
      await restoreVideoAdminSession();
    } catch (error) {
      showVideoMessage('videos-admin-login-error', portalErrorMessage(error), true);
    }
    return;
  }
  try {
    await loadAdminVideos();
  } catch (error) {
    window.App.showToast(`No se pudo cargar el catálogo: ${portalErrorMessage(error)}`, 'error');
  }
};

window.App.initVideoEvents = function() {
  const client = getPortalClient();
  if (!client) {
    document.getElementById('videos-config-warning').classList.remove('hidden');
    return;
  }
  document.getElementById('videos-admin-login-form').addEventListener('submit', signInVideoAdmin);
  document.getElementById('video-form').addEventListener('submit', saveVideo);
  document.getElementById('btn-video-cancel-edit').addEventListener('click', resetVideoForm);
  document.getElementById('btn-sync-portal-students').addEventListener('click', syncPortalStudents);
  document.getElementById('btn-refresh-portal-activity').addEventListener('click', async () => {
    try {
      await loadAdminVideos();
    } catch (error) {
      window.App.showToast(`No se pudo actualizar la actividad: ${portalErrorMessage(error)}`, 'error');
    }
  });
  document.getElementById('btn-videos-admin-logout').addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) {
      window.App.showToast(`No se pudo cerrar sesión: ${portalErrorMessage(error)}`, 'error');
      return;
    }
    portalAdminUser = null;
    setVideoAdminState(false);
    portalVideos = [];
  });
  document.getElementById('videos-admin-list').addEventListener('click', async event => {
    const editButton = event.target.closest('[data-edit-video]');
    const deleteButton = event.target.closest('[data-delete-video]');
    if (editButton) editVideo(editButton.dataset.editVideo);
    if (deleteButton) await deleteVideo(deleteButton.dataset.deleteVideo);
  });
  document.getElementById('video-submissions-list').addEventListener('click', event => {
    const downloadButton = event.target.closest('[data-download-submission]');
    if (downloadButton) downloadSubmission(downloadButton.dataset.downloadSubmission);
  });
  document.getElementById('video-submissions-list').addEventListener('submit', saveSubmissionGrade);
};
