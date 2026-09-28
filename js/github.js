/* =============================================
   GitHub Sync Module
   Handles GitHub repository synchronization
   ============================================= */

window.App = window.App || {};

window.App.getGithubConfig = function() {
  const s = window.App.state.settings;
  const token = s?.githubToken?.trim();
  const gistUrl = s?.githubGistUrl?.trim();
  if (!token || !gistUrl) return null;
  
  // Extract gist ID from URL
  const match = gistUrl.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/);
  if (!match) return null;
  
  return { token, gistId: match[1], gistUrl };
};

function githubApiHeaders(token) {
  return {
    'Authorization':       `token ${token}`,
    'Accept':              'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':        'application/json',
  };
}

// Derive AES-GCM key from GitHub token
async function deriveKey(token) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(token),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('academia-tic-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt state to base64 using AES-GCM with GitHub token as key
async function stateToEncryptedBase64(token) {
  const safe = Object.assign({}, window.App.state, {
    settings: Object.assign({}, window.App.state.settings, {
      githubToken:  '',   // never stored remotely
      gcalClientId: '',   // OAuth client ID stays local
    }),
  });
  const json = JSON.stringify(safe, null, 2);
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  
  const key = await deriveKey(token);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Concatenate IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Convert to base64
  let binary = '';
  combined.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

// Decrypt base64 content using AES-GCM with GitHub token as key
async function encryptedBase64ToObj(b64, token) {
  try {
    const binary = atob(b64.replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    // Extract IV and encrypted data
    const iv = bytes.slice(0, 12);
    const encrypted = bytes.slice(12);
    
    const key = await deriveKey(token);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    const json = new TextDecoder().decode(decrypted);
    return JSON.parse(json);
  } catch (e) {
    console.error('Error decrypting content:', e);
    // Try legacy plain base64 format for backward compatibility
    try {
      const binary = atob(b64.replace(/\n/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const json = new TextDecoder().decode(bytes);
      return JSON.parse(json);
    } catch (e2) {
      console.error('Error decoding legacy base64:', e2);
      return null;
    }
  }
}

window.App.setGithubStatusUI = function(status) {
  window.App.setGithubStatus(status);
  const dot = document.getElementById('github-sync-dot');
  if (!dot) return;
  dot.className = `github-sync-dot ${status}`;
  const labels = {
    unconfigured: window.App.MESSAGES.githubUnconfiguredStatus,
    ok:      `Sincronizado${window.App.githubLastSync ? ' ' + window.App.githubLastSync.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''}`,
    pending: window.App.MESSAGES.githubPending,
    syncing: window.App.MESSAGES.githubSyncing,
    error:   window.App.MESSAGES.githubError,
  };
  dot.title = labels[status] || status;
  // Update settings modal indicator if open
  const settingsDot   = document.getElementById('settings-github-dot');
  const settingsLabel = document.getElementById('settings-github-label');
  if (settingsDot)   settingsDot.className    = 'gcal-dot ' + (status === 'ok' ? 'connected' : 'disconnected');
  if (settingsLabel) settingsLabel.textContent = labels[status] || status;
};

// Pull remote state from GitHub Gist and reconcile with local
window.App.githubPull = async function() {
  const cfg = window.App.getGithubConfig();
  if (!cfg) return false;

  window.App.setGithubStatusUI('syncing');
  try {
    const url = `https://api.github.com/gists/${cfg.gistId}`;
    const res = await fetch(url, { headers: githubApiHeaders(cfg.token) });

    if (res.status === 404) {
      // Gist not found
      window.App.setGithubStatusUI('error');
      window.App.showToast('Gist no encontrado', 'error');
      return false;
    }
    if (res.status === 401 || res.status === 403) {
      window.App.setGithubStatusUI('error');
      window.App.showToast(window.App.MESSAGES.errorGithubAccess, 'error');
      return false;
    }
    if (!res.ok) {
      window.App.setGithubStatusUI('error');
      window.App.showToast(`GitHub pull error ${res.status}`, 'error');
      return false;
    }

    const gist = await res.json();
    const file = gist.files['clasestic.json'];
    
    if (!file || !file.content) {
      // File doesn't exist in gist yet
      console.log('[GitHub] clasestic.json not in gist');
      
      // Check if local state has meaningful data before pushing
      const hasLocalData = 
        (window.App.state.students && window.App.state.students.length > 0) ||
        (window.App.state.classes && window.App.state.classes.length > 0) ||
        (window.App.state.courses && window.App.state.courses.length > 0) ||
        (window.App.state.groups && window.App.state.groups.length > 0);
      
      if (hasLocalData) {
        console.log('[GitHub] Local has data, will create file in gist on next push');
        window.App.setGithubStatusUI('ok');
        setTimeout(() => window.App.githubPush(), 500);
      } else {
        console.log('[GitHub] Local is empty, skipping push to avoid overwriting');
        window.App.setGithubStatusUI('ok');
        window.App.showToast('Gist vacío detectado. No se sobrescribirá con datos vacíos.', 'info');
      }
      return true;
    }
    
    const remote = await encryptedBase64ToObj(file.content, cfg.token);
    
    // If decryption failed, file is corrupted or wrong key
    if (!remote) {
      console.warn('[GitHub] Cannot decrypt remote file - ignoring remote, will use local data');
      window.App.setGithubStatusUI('ok');
      return false;
    }
    
    // Safety warning: if remote has data but local is empty
    const hasLocalData = 
      (window.App.state.students && window.App.state.students.length > 0) ||
      (window.App.state.classes && window.App.state.classes.length > 0) ||
      (window.App.state.courses && window.App.state.courses.length > 0) ||
      (window.App.state.groups && window.App.state.groups.length > 0);
    
    const hasRemoteData =
      (remote.students && remote.students.length > 0) ||
      (remote.classes && remote.classes.length > 0) ||
      (remote.courses && remote.courses.length > 0) ||
      (remote.groups && remote.groups.length > 0);
    
    if (hasRemoteData && !hasLocalData) {
      console.log('[GitHub] Remote has data, local is empty - adopting remote data');
      window.App.showToast('Datos cargados desde GitHub (dispositivo nuevo)', 'success');
    }
    
    reconcileWithRemote(remote);
    return true;
  } catch (e) {
    console.error('GitHub pull error:', e);
    window.App.setGithubStatusUI('error');
    return false;
  }
};

// Merge remote state into local according to timestamps
function reconcileWithRemote(remote) {
  if (!remote || typeof remote !== 'object') return;

  const localTs  = window.App.state.lastModified  ? new Date(window.App.state.lastModified).getTime()  : 0;
  const remoteTs = remote.lastModified ? new Date(remote.lastModified).getTime() : 0;

  if (remoteTs > localTs) {
    // Remote is newer — adopt it, but keep local GitHub credentials
    const localGhCreds = {
      githubToken:    window.App.state.settings?.githubToken    || '',
      githubRepo:     window.App.state.settings?.githubRepo     || '',
      githubBranch:   window.App.state.settings?.githubBranch   || 'main',
      githubFilePath: window.App.state.settings?.githubFilePath || 'academia_data.json',
    };
    const localGcalClientId = window.App.state.settings?.gcalClientId || '';
    window.App.state.courses        = Array.isArray(remote.courses)  ? remote.courses  : [];
    window.App.state.students       = Array.isArray(remote.students) ? remote.students : [];
    window.App.state.groups         = Array.isArray(remote.groups)   ? remote.groups   : [];
    window.App.state.classes        = Array.isArray(remote.classes)  ? remote.classes  : [];
    window.App.state.receiptCounter = remote.receiptCounter || 0;
    window.App.state.lastModified   = remote.lastModified;
    window.App.state.settings       = Object.assign({}, remote.settings || {}, localGhCreds, { gcalClientId: localGcalClientId });
    // Ensure compat fields
    window.App.state.students.forEach(s => { if (!Array.isArray(s.receipts)) s.receipts = []; });
    if (!window.App.state.settings.defaultIndividualFee) window.App.state.settings.defaultIndividualFee = 15;
    if (!window.App.state.settings.defaultGroupFee) window.App.state.settings.defaultGroupFee = 10;
    window.App.saveLocalOnly();
    window.App.renderAll();
    const remoteDate = new Date(remote.lastModified).toLocaleString('es');
    window.App.showToast(`Datos actualizados desde GitHub (${remoteDate})`, 'success');
  } else {
    // Local is same age or newer — merge in any remote-only records
    const localCourseIds  = new Set((window.App.state.courses  || []).map(c  => c.id));
    const localStudentIds = new Set((window.App.state.students || []).map(s  => s.id));
    const localGroupIds   = new Set((window.App.state.groups   || []).map(g  => g.id));
    const localClassIds   = new Set((window.App.state.classes  || []).map(cl => cl.id));
    let changed = false;
    (remote.courses  || []).forEach(c  => { if (!localCourseIds.has(c.id))  { window.App.state.courses.push(c);  changed = true; } });
    (remote.students || []).forEach(s  => {
      if (!localStudentIds.has(s.id)) {
        if (!s.receipts) s.receipts = [];
        window.App.state.students.push(s);
        changed = true;
      }
    });
    (remote.groups   || []).forEach(g  => { if (!localGroupIds.has(g.id))   { window.App.state.groups.push(g);   changed = true; } });
    (remote.classes  || []).forEach(cl => { if (!localClassIds.has(cl.id))  { window.App.state.classes.push(cl); changed = true; } });
    window.App.state.receiptCounter = Math.max(window.App.state.receiptCounter || 0, remote.receiptCounter || 0);
    if (changed) {
      window.App.saveLocalOnly();
      window.App.renderAll();
      window.App.showToast(window.App.MESSAGES.remoteChangesMerged, 'success');
    }
    // Local is newer or equal — push our version to GitHub
    window.App.scheduleGithubPush();
  }
  window.App.setGithubStatusUI('ok');
}

// Schedule a debounced push (2 s after last saveState)
window.App.scheduleGithubPush = function() {
  if (!window.App.getGithubConfig()) return;
  window.App.setGithubStatusUI('pending');
  clearTimeout(window.App.githubSyncTimer);
  window.App.setGithubSyncTimer(setTimeout(window.App.githubPush, 2000));
};

// Push current state to GitHub Gist
window.App.githubPush = async function(retry) {
  const cfg = window.App.getGithubConfig();
  if (!cfg || window.App.githubSyncing) return;

  // Safety check: prevent pushing empty state if gist might have data
  const hasLocalData = 
    (window.App.state.students && window.App.state.students.length > 0) ||
    (window.App.state.classes && window.App.state.classes.length > 0) ||
    (window.App.state.courses && window.App.state.courses.length > 0) ||
    (window.App.state.groups && window.App.state.groups.length > 0);
  
  if (!hasLocalData && !retry) {
    console.warn('[GitHub] Refusing to push empty state - might overwrite good data');
    window.App.setGithubStatusUI('error');
    window.App.showToast('No se puede sincronizar: el estado local está vacío', 'error');
    return;
  }

  window.App.setGithubSyncing(true);
  window.App.setGithubStatusUI('syncing');

  const content = await stateToEncryptedBase64(cfg.token);
  const body = {
    files: {
      'clasestic.json': {
        content: content
      }
    }
  };

  try {
    const url = `https://api.github.com/gists/${cfg.gistId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: githubApiHeaders(cfg.token),
      body: JSON.stringify(body),
    });

    if (res.status === 401 || res.status === 403) {
      window.App.setGithubSyncing(false);
      window.App.setGithubStatusUI('error');
      window.App.showToast('Token sin permisos. Necesita scope "gist"', 'error');
      return;
    }
    if (!res.ok) {
      window.App.setGithubSyncing(false);
      window.App.setGithubStatusUI('error');
      const errorData = await res.json().catch(() => ({}));
      console.error('GitHub push error:', res.status, errorData);
      const msg = errorData.message || `GitHub push error ${res.status}`;
      window.App.showToast(msg, 'error');
      return;
    }

    await res.json();
    window.App.setGithubSyncing(false);
    window.App.setGithubLastSync(new Date());
    window.App.setGithubStatusUI('ok');
  } catch (e) {
    window.App.setGithubSyncing(false);
    window.App.setGithubStatusUI('error');
    console.error('GitHub push network error:', e);
    window.App.showToast('Error de conexión con GitHub', 'error');
  }
};

// Manual sync triggered by the header button
window.App.manualGithubSync = async function() {
  const cfg = window.App.getGithubConfig();
  if (!cfg) {
    window.App.showToast(window.App.MESSAGES.githubUnconfigured, 'error');
    return;
  }
  await window.App.githubPull();
};

// Connection test triggered from settings modal
window.App.testGithubConnection = async function() {
  const token = document.getElementById('settings-gh-token').value.trim();
  const gistUrl = document.getElementById('settings-gh-gist-url').value.trim();

  if (!token || !gistUrl) {
    window.App.showToast('Introduce token y URL del Gist', 'error');
    return;
  }

  const match = gistUrl.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/);
  if (!match) {
    window.App.showToast('URL del Gist no válida', 'error');
    return;
  }

  const gistId = match[1];
  const settingsLabel = document.getElementById('settings-github-label');
  const settingsDot = document.getElementById('settings-github-dot');
  if (settingsLabel) settingsLabel.textContent = window.App.MESSAGES.checking;

  try {
    const url = `https://api.github.com/gists/${gistId}`;
    const res = await fetch(url, { headers: githubApiHeaders(token) });
    if (res.status === 200) {
      if (settingsLabel) settingsLabel.textContent = 'Conexión OK ✓';
      if (settingsDot) settingsDot.className = 'gcal-dot connected';
      window.App.showToast(window.App.MESSAGES.githubConnectionOk, 'success');
    } else if (res.status === 401 || res.status === 403) {
      if (settingsLabel) settingsLabel.textContent = 'Acceso denegado';
      if (settingsDot) settingsDot.className = 'gcal-dot disconnected';
      window.App.showToast(window.App.MESSAGES.errorGithubToken, 'error');
    } else if (res.status === 404) {
      if (settingsLabel) settingsLabel.textContent = 'Gist no encontrado';
      if (settingsDot) settingsDot.className = 'gcal-dot disconnected';
      window.App.showToast('Gist no encontrado', 'error');
    } else {
      if (settingsLabel) settingsLabel.textContent = `Error ${res.status}`;
      window.App.showToast(`GitHub error ${res.status}`, 'error');
    }
  } catch (e) {
    if (settingsLabel) settingsLabel.textContent = 'Error de red';
    window.App.showToast(window.App.MESSAGES.errorGithubConnection, 'error');
  }
};

// Initialize GitHub status
window.App.initGithubStatus = function() {
  const cfg = window.App.getGithubConfig();
  window.App.setGithubStatusUI(cfg ? 'pending' : 'unconfigured');
  
  // Start periodic pull every 5 minutes if configured
  if (cfg) {
    window.App.startPeriodicGithubPull();
  }
};

// Start periodic pull timer
window.App.startPeriodicGithubPull = function() {
  // Clear any existing timer
  if (window.App.githubPullTimer) {
    clearInterval(window.App.githubPullTimer);
  }
  
  // Pull every 5 minutes
  window.App.githubPullTimer = setInterval(async () => {
    const cfg = window.App.getGithubConfig();
    if (cfg && !window.App.githubSyncing) {
      console.log('[GitHub] Periodic pull...');
      await window.App.githubPull();
    }
  }, 5 * 60 * 1000); // 5 minutes
};

// Stop periodic pull timer
window.App.stopPeriodicGithubPull = function() {
  if (window.App.githubPullTimer) {
    clearInterval(window.App.githubPullTimer);
    window.App.githubPullTimer = null;
  }
};
