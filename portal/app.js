const FILE_BUCKET = 'portal-files';
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const config = window.PORTAL_CONFIG || {};
const client = config.supabaseUrl && config.supabaseAnonKey && window.supabase?.createClient
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

let currentUser = null;
let currentStudent = null;
let portalGroups = [];
let portalVideos = [];
let portalSubmissions = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function setMessage(elementId, text, isError = false) {
  const element = document.getElementById(elementId);
  element.textContent = text;
  element.classList.toggle('error', isError);
  element.classList.toggle('hidden', !text);
}

async function functionErrorMessage(error) {
  const response = error?.context;
  if (!(response instanceof Response)) return error?.message || 'No se pudo completar la operación.';

  try {
    const body = await response.clone().json();
    if (typeof body?.error === 'string') return body.error;
    if (typeof body?.message === 'string') return body.message;
  } catch {
    // Some gateway errors are not returned as JSON.
  }
  return `${error?.message || 'La función de Supabase devolvió un error.'} (HTTP ${response.status})`;
}

function fileDate(value) {
  if (!value) return '';
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-ES');
}

function safeFileName(value) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'ejercicios.xlsx';
}

function setPortalState(state) {
  document.getElementById('portal-config-error').classList.toggle('hidden', state !== 'config');
  document.getElementById('portal-login').classList.toggle('hidden', state !== 'login');
  document.getElementById('portal-content').classList.toggle('hidden', state !== 'content');
  document.getElementById('btn-portal-logout').classList.toggle('hidden', state !== 'content');
}

async function loginWithGoogle() {
  setMessage('portal-login-message', '');
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) setMessage('portal-login-message', error.message, true);
}

async function linkStudentProfile() {
  const { data, error } = await client.functions.invoke('link-student');
  if (error) throw new Error(await functionErrorMessage(error));
  currentStudent = data;
}

async function loadStudentContent() {
  const [groupsResult, videosResult, submissionsResult] = await Promise.all([
    client.from('portal_groups').select('id,name').order('name'),
    client.from('portal_videos')
      .select('id,group_id,title,class_date,has_exercise,exercise_filename')
      .eq('visible', true)
      .order('class_date', { ascending: false }),
    client.from('student_submissions')
      .select('id,video_id,file_name,uploaded_at,grade,feedback')
      .order('uploaded_at', { ascending: false }),
  ]);
  const error = groupsResult.error || videosResult.error || submissionsResult.error;
  if (error) throw error;

  portalGroups = groupsResult.data || [];
  const videoIds = (videosResult.data || []).map(video => video.id);
  const videoGroupsResult = videoIds.length
    ? await client.from('portal_video_groups').select('video_id,group_id').in('video_id', videoIds)
    : { data: [], error: null };
  if (videoGroupsResult.error) throw videoGroupsResult.error;
  const groupIdsByVideo = new Map();
  (videoGroupsResult.data || []).forEach(({ video_id: videoId, group_id: groupId }) => {
    if (!groupIdsByVideo.has(videoId)) groupIdsByVideo.set(videoId, []);
    groupIdsByVideo.get(videoId).push(groupId);
  });
  portalVideos = (videosResult.data || []).map(video => ({
    ...video,
    group_ids: groupIdsByVideo.get(video.id) || [video.group_id],
  }));
  portalSubmissions = submissionsResult.data || [];
  document.getElementById('portal-welcome').textContent = currentStudent?.name
    ? `Hola, ${currentStudent.name}`
    : 'Tus clases';
  const filter = document.getElementById('portal-group-filter');
  const selectedGroup = filter.value;
  filter.innerHTML = '<option value="">Todos mis grupos</option>' +
    portalGroups.map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join('');
  filter.value = portalGroups.some(group => group.id === selectedGroup) ? selectedGroup : '';
  renderStudentVideos();
  setMessage('portal-content-message', '');
}

function renderStudentVideos() {
  const selectedGroup = document.getElementById('portal-group-filter').value;
  const groups = selectedGroup
    ? portalGroups.filter(group => group.id === selectedGroup)
    : portalGroups;
  const list = document.getElementById('portal-video-list');
  if (!portalVideos.length) {
    list.innerHTML = '<div class="no-videos">Todavía no hay vídeos visibles para tus grupos.</div>';
    return;
  }
  const visibleVideos = portalVideos.filter(video => !selectedGroup || video.group_ids.includes(selectedGroup));
  if (!visibleVideos.length) {
    list.innerHTML = '<div class="no-videos">No hay vídeos visibles para este grupo.</div>';
    return;
  }
  const groupNames = new Map(groups.map(group => [group.id, group.name]));
  const groupedVideos = new Map();
  visibleVideos.forEach(video => {
    const assignedGroups = video.group_ids.filter(groupId => groupNames.has(groupId)).sort();
    const groupKey = assignedGroups.join('|');
    if (!groupedVideos.has(groupKey)) groupedVideos.set(groupKey, { groupIds: assignedGroups, videos: [] });
    groupedVideos.get(groupKey).videos.push(video);
  });
  list.innerHTML = [...groupedVideos.values()].map(({ groupIds, videos }) => `
    <section>
      <h3 class="group-heading">${escapeHtml(groupIds.map(groupId => groupNames.get(groupId)).join(', ') || 'Grupo')}</h3>
      ${videos.map(video => renderStudentVideo(video)).join('')}
    </section>`).join('');
}

function renderStudentVideo(video) {
  const submissions = portalSubmissions.filter(item => item.video_id === video.id);
  return `
    <article class="video-card" data-video-card="${escapeHtml(video.id)}">
      <div class="video-date">${fileDate(video.class_date)}</div>
      <h4>${escapeHtml(video.title)}</h4>
      <div class="video-meta hidden" data-video-password="${escapeHtml(video.id)}"></div>
      <div class="video-actions">
        <button class="button primary" type="button" data-open-video="${escapeHtml(video.id)}">Abrir vídeo</button>
        ${video.has_exercise ? `<button class="button secondary" type="button" data-download-exercise="${escapeHtml(video.id)}">Descargar ${escapeHtml(video.exercise_filename || 'Excel de ejercicios')}</button>` : ''}
      </div>
      <form class="submission-form" data-submit-exercise="${escapeHtml(video.id)}">
        <label>Subir ejercicios terminados (.xls o .xlsx)
          <input type="file" name="exercise" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button class="button secondary" type="submit">Entregar</button>
      </form>
      ${submissions.length ? `<div class="submission-list"><strong>Tus entregas y correcciones</strong>${submissions.map(renderStudentSubmission).join('')}</div>` : ''}
    </article>`;
}

function renderStudentSubmission(submission) {
  const grade = submission.grade === null ? 'Pendiente de calificar' : `Nota: ${submission.grade}/10`;
  return `
    <div class="submission-item">
      <strong>${escapeHtml(submission.file_name)}</strong>
      <span> · ${fileDate(submission.uploaded_at?.slice(0, 10))} · ${escapeHtml(grade)}</span>
      ${submission.feedback ? `<p class="submission-feedback">${escapeHtml(submission.feedback)}</p>` : ''}
      <button class="button secondary" type="button" data-download-submission="${escapeHtml(submission.id)}">Descargar mi entrega</button>
    </div>`;
}

async function callAccessFunction(body) {
  const { data, error } = await client.functions.invoke('record-access', { body });
  if (error) throw new Error(await functionErrorMessage(error));
  return data;
}

async function openVideo(videoId) {
  const popup = window.open('about:blank', '_blank');
  try {
    const data = await callAccessFunction({ action: 'video', video_id: videoId });
    if (!data.url) throw new Error('El vídeo no tiene un enlace válido.');
    const card = document.querySelector(`[data-video-card="${CSS.escape(videoId)}"]`);
    const password = card?.querySelector('[data-video-password]');
    if (password && data.password) {
      password.textContent = `Contraseña del vídeo: ${data.password}`;
      password.classList.remove('hidden');
    }
    if (popup) popup.location.replace(data.url);
    else window.location.assign(data.url);
  } catch (error) {
    if (popup) popup.close();
    setMessage('portal-content-message', error.message, true);
  }
}

async function downloadFile(action, id) {
  const popup = window.open('about:blank', '_blank');
  try {
    const data = await callAccessFunction(action === 'submission'
      ? { action, submission_id: id }
      : { action: 'exercise', video_id: id });
    if (!data.url) throw new Error('No se pudo preparar la descarga.');
    if (popup) popup.location.replace(data.url);
    else window.location.assign(data.url);
  } catch (error) {
    if (popup) popup.close();
    setMessage('portal-content-message', error.message, true);
  }
}

async function submitExercise(event) {
  event.preventDefault();
  const form = event.target;
  const videoId = form.dataset.submitExercise;
  const file = form.elements.exercise.files[0];
  if (!file || !/\.(xlsx|xls)$/i.test(file.name) || file.size > MAX_FILE_SIZE) {
    setMessage('portal-content-message', 'Selecciona un Excel .xls o .xlsx de hasta 25 MB.', true);
    return;
  }
  const filePath = `submissions/${currentUser.id}/${videoId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const upload = await client.storage.from(FILE_BUCKET).upload(filePath, file, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upload.error) {
    setMessage('portal-content-message', `No se pudo subir el ejercicio: ${upload.error.message}`, true);
    return;
  }
  const inserted = await client.from('student_submissions').insert({
    video_id: videoId,
    student_id: currentStudent.student_id,
    file_path: filePath,
    file_name: file.name,
  });
  if (inserted.error) {
    const cleanup = await client.storage.from(FILE_BUCKET).remove([filePath]);
    if (cleanup.error) console.error('No se pudo limpiar una entrega que no quedó registrada:', cleanup.error);
    setMessage('portal-content-message', `No se pudo registrar la entrega: ${inserted.error.message}`, true);
    return;
  }
  await loadStudentContent();
  setMessage('portal-content-message', 'Ejercicio entregado correctamente.');
}

async function restorePortalSession() {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    setPortalState('login');
    return;
  }
  currentUser = data.session.user;
  try {
    await linkStudentProfile();
  } catch (error) {
    await client.auth.signOut();
    currentUser = null;
    setPortalState('login');
    setMessage('portal-login-message', error.message, true);
    return;
  }
  setPortalState('content');
  await loadStudentContent();
}

async function startPortal() {
  if (!client) {
    setPortalState('config');
    return;
  }
  setPortalState('login');
  document.getElementById('btn-google-login').addEventListener('click', loginWithGoogle);
  document.getElementById('btn-portal-logout').addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) {
      setMessage('portal-content-message', `No se pudo cerrar sesión: ${error.message}`, true);
      return;
    }
    currentUser = null;
    currentStudent = null;
    setPortalState('login');
  });
  document.getElementById('portal-group-filter').addEventListener('change', renderStudentVideos);
  document.getElementById('portal-video-list').addEventListener('click', event => {
    const openButton = event.target.closest('[data-open-video]');
    const exerciseButton = event.target.closest('[data-download-exercise]');
    const submissionButton = event.target.closest('[data-download-submission]');
    if (openButton) openVideo(openButton.dataset.openVideo);
    if (exerciseButton) downloadFile('exercise', exerciseButton.dataset.downloadExercise);
    if (submissionButton) downloadFile('submission', submissionButton.dataset.downloadSubmission);
  });
  document.getElementById('portal-video-list').addEventListener('submit', submitExercise);
  try {
    await restorePortalSession();
  } catch (error) {
    setPortalState('login');
    setMessage('portal-login-message', error.message || 'No se pudo cargar el portal.', true);
  }
}

document.addEventListener('DOMContentLoaded', startPortal);
