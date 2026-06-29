// billera, autocompletado cruzado, búsqueda y herramientas WA.

import { toCSV, parseCSV } from './csv.js';
import {
  initDB,
  fetchAll,
  saveRow,
  deleteRow,
  deleteAll,
  isDbConnected,
  bulkUpsert,

  getNote,
  saveNote,
  getContacts,
  saveContactsBulk
} from './supabase-db.js';

const $ = s => document.querySelector(s);

window.onerror = function (msg, url, line, col, error) {
  // Ignorar errores de conexión de Neon/WebSocket que son esperables en polling
  if (msg && (
    msg.includes('Connection terminated') ||
    msg.includes('WebSocket') ||
    msg.includes('network')
  )) {
    console.warn('Ignored connection error:', msg);
    return true; // Suppress alert
  }
  alert('Error en el script:\n' + msg + '\nLínea: ' + line);
  return false;
};




// Compatibilidad básica con File System Access + HTTPS (Netlify)
const supportsFSA =
  'showDirectoryPicker' in window ||
  'showOpenFilePicker' in window ||
  'showSaveFilePicker' in window;

const isHttps = location.protocol === 'https:';

// UI refs
// UI refs
const dbStatus = $('#dbStatus');
const status = $('#status');
const cPendingEl = $('#cPending');
const cDoneEl = $('#cDone');

const clearAllFieldsBtn = $('#clearAllFields');
const btnSync = $('#btnSync');

// Auth refs
const dlgAuth = $('#dlgAuth');
const authPin = $('#authPin');
const btnAuth = $('#btnAuth');

const tbody = $('#tbody');
const thDate = $('#thDate');
const qInp = $('#q');
const LS_KEY = 'ms_activity_log_v2';
const LS_FILTER = 'ms_filter_state_v2';
const PAIRS_KEY = 'ms_pairs_v1';
const NOTES_KEY = 'ms_quick_notes_v1';

let rows = [];
let q = '';                  // filtro texto
let filterState = 'all';     // all | pending | done
let sortDesc = true;         // por fecha desc

// directorio pares (construido desde rows + importaciones)
let mapEmailToWa = new Map();
let mapWaToEmail = new Map();
let lastPickedWaEl = null;   // último número WA resaltado en la tabla
let lastPickedEmailEl = null; // último email resaltado en la tabla

// -- Pagination & Sync vars --
let currentPage = 1;
const itemsPerPage = 50;
let lastLocalInteractionTime = 0; // timestamp para evitar sobrescritura cloud
const SYNC_GRACE_PERIOD = 5000;   // ms a esperar tras interacción local

function markLocalInteraction() {
  lastLocalInteractionTime = Date.now();
}

// ================== Auth Logic ==================
function checkAuth() {
  if (sessionStorage.getItem('ms_auth') === 'ok') {
    dlgAuth.close();
    return;
  }
  dlgAuth.showModal();
}

// Reusable custom prompt helper since Electron doesn't support window.prompt()
function showPrompt(title, defaultValue = '') {
  return new Promise((resolve) => {
    const dlg = $('#dlgPrompt');
    const titleEl = $('#promptTitle');
    const inputEl = $('#promptInput');
    const btnCancel = $('#promptCancel');
    const btnConfirm = $('#promptConfirm');

    titleEl.textContent = title;
    inputEl.value = defaultValue;

    const onConfirm = () => {
      cleanup();
      resolve(inputEl.value);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    const cleanup = () => {
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
      inputEl.removeEventListener('keydown', onKeyDown);
      dlg.close();
    };

    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    inputEl.addEventListener('keydown', onKeyDown);

    dlg.showModal();
    inputEl.focus();
    inputEl.select();
  });
}


btnAuth?.addEventListener('click', () => {
  if (authPin.value === '4147') {
    sessionStorage.setItem('ms_auth', 'ok');
    dlgAuth.close();
  } else {
    alert('PIN incorrecto');
    authPin.value = '';
    authPin.focus();
  }
});

authPin?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnAuth.click();
});

// ================== Utils ==================
function nowStr() {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
function saveLocal() {
  localStorage.setItem(LS_KEY, JSON.stringify(rows));
}
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function esc(s) {
  return (s ?? '').replace(/[&<>"']/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
  ));
}
function norm(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function setStatus(msg, ok = true) {
  status.textContent = msg;
  status.className = 'status pill ' + (ok ? 'ok' : 'bad');
  setTimeout(() => status.className = 'status pill', 2200);
}
function setDbUI(ok, note = '') {
  dbStatus.className = 'pill ' + (ok ? 'ok' : '');
  dbStatus.textContent = ok
    ? `DB: Conectado${note ? ' · ' + note : ''}`
    : 'DB: Desconectado';
}

// Normalizaciones base
const TYPES = {
  2: 'WhatsApp',
  3: 'Email'
};
const KIND_BY_LABEL = label => {
  const l = (label || '').trim();
  if (l === 'Resuelta consulta de Email' || l === TYPES[3]) return 3;
  if (l === 'Resuelta su consulta de WhatsApp' || l === TYPES[2]) return 2;
  return 2; // fallback a WhatsApp
};

const cleanEmail = s => (s || '').trim().toLowerCase();

// *** SOLO DÍGITOS para WhatsApp ***
const digitsOnly = s => (s || '').replace(/\D/g, '');

// ====== Normalización robusta de ESTADO (csv tolerant) ======
function normalizeState(v) {
  const t = String(v ?? '').trim().toLowerCase();
  if ([
    '1', 'true', 'si', 'sí', 'ok', 'done',
    'completado', 'completada', 'completed', 'complete'
  ].includes(t)) return true;
  if ([
    '0', 'false', 'no', 'pendiente', 'pending', 'todo',
    'por hacer', 'incompleto', 'incomplete'
  ].includes(t)) return false;
  // fallback: si viene vacío, lo consideramos "completado" (como antes)
  return true;
}

// ====== Coerción/Parche de CSV importado ======
// Acepta elementos como objetos {id,fecha,...} o arreglos [id,fecha,tipo,email,wa,estado,comentario, ...]
// Si el comentario tenía comas sin comillas, un split naive rompe en >7 columnas;
// este parche junta desde la 6 en adelante.
function coerceFromAny(item, idxFallback) {
  // Caso array de columnas
  if (Array.isArray(item)) {
    const arr = item.map(x => (x == null ? '' : String(x)));
    const id = arr[0] || '';
    const fecha = arr[1] || '';
    const tipo = arr[2] || '';
    const email = arr[3] || '';
    const whatsapp = arr[4] || '';
    const estado = arr[5];
    const comentario = (arr.length > 6) ? arr.slice(6).join(',') : (arr[6] || '');
    return {
      id: Number.parseInt(id) || (idxFallback + 1),
      fecha,
      tipo,
      email,
      whatsapp: digitsOnly(whatsapp),
      estado: normalizeState(estado),
      comentario: comentario || ''
    };
  }

  // Caso objeto normal/variado
  const o = item || {};
  const id = Number.parseInt(o.id ?? o.ID ?? o.n ?? o.N) || (idxFallback + 1);
  const fecha = String(o.fecha ?? o.date ?? o.Fecha ?? o.Date ?? '').trim();
  const tipo = String(o.tipo ?? o.Tipo ?? '').trim();
  const email = String(o.email ?? o.Email ?? '').trim();
  const waRaw = String(o.whatsapp ?? o.Whatsapp ?? o.wa ?? '').trim();
  const estadoRaw = (o.estado ?? o.Status ?? o.status ?? o.done ?? o.completado);
  // Comentario: si encontramos claves sueltas extra (comentario_1, comentario_2), las juntamos
  let comentario = '';
  if (typeof o.comentario !== 'undefined') comentario = String(o.comentario);
  else if (typeof o.Comentario !== 'undefined') comentario = String(o.Comentario);
  else {
    // juntar posibles fragmentos
    const frags = Object.keys(o)
      .filter(k => /^coment/i.test(k) && k !== 'comentario' && k !== 'Comentario')
      .sort()
      .map(k => String(o[k]));
    if (frags.length) comentario = frags.join(',');
  }

  return {
    id,
    fecha,
    tipo,
    email,
    whatsapp: digitsOnly(waRaw),
    estado: normalizeState(estadoRaw),
    comentario: comentario || ''
  };
}

// ====== Sanitiza y asegura estructura final ======
function sanitizeRow(r, idx) {
  const out = {
    id: Number.isFinite(+r.id) ? +r.id : (idx + 1),
    fecha: String(r.fecha || ''),
    tipo: r.tipo && [TYPES[2], TYPES[3]].includes(r.tipo)
      ? r.tipo
      : (r.tipo || ''),
    email: (r.email || '').trim(),
    whatsapp: digitsOnly(r.whatsapp),
    estado: !!normalizeState(r.estado),
    comentario: (r.comentario || '').trim()
  };

  // Si fecha vacía o malformada, dejamos timestamp actual para evitar fallos al ordenar
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(out.fecha)) {
    // Intento: si venía con "T" (ISO), lo transformamos a "YYYY-MM-DD HH:mm:ss"
    const iso = String(r.fecha || '').replace('T', ' ').replace('Z', '').slice(0, 19);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso)) out.fecha = iso;
    else out.fecha = nowStr();
  }

  // Tipo: si vino vacío, infiere por keywords (opcional)
  if (!out.tipo) {
    const t = norm(out.comentario);
    if (t.includes('email')) out.tipo = TYPES[3];
    else out.tipo = TYPES[2];
  }
  return out;
}

// ====== Directorio email/wa (autocompletado) ======
function loadPairs() {
  try { return JSON.parse(localStorage.getItem(PAIRS_KEY) || '[]'); }
  catch { return []; }
}
function savePairs(arr) {
  localStorage.setItem(PAIRS_KEY, JSON.stringify(arr || []));
}

function buildDir() {
  mapEmailToWa = new Map();
  mapWaToEmail = new Map();
  const pairs = loadPairs();

  const push = (email, waRaw) => {
    const e = cleanEmail(email);
    const w = digitsOnly(waRaw);
    if (!e && !w) return;
    if (e && w) {
      if (!mapEmailToWa.has(e)) mapEmailToWa.set(e, w);
      if (!mapWaToEmail.has(w)) mapWaToEmail.set(w, e);
    }
  };

  rows.forEach(r => push(r.email, r.whatsapp));
  pairs.forEach(p => push(p.email, p.whatsapp));
}

// Descarga en formato Excel compatible (CSV con sep=; y BOM)
function downloadExcel() {
  const BOM = '\uFEFF';
  const header = ['fecha', 'tipo', 'email', 'whatsapp', 'estado', 'comentario'];
  const lines = ['sep=;', header.join(';')];

  // Ordenar cronológicamente descendente (más recientes primero)
  const sortedRows = [...rows].sort((a, b) => {
    const fa = String(a.fecha || '');
    const fb = String(b.fecha || '');
    return fb.localeCompare(fa) || (b.id - a.id);
  });

  function q(v) {
    const s = (v ?? '').toString();
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  for (const r of sortedRows) {
    lines.push([
      q(r.fecha),
      q(r.tipo),
      q(r.email),
      r.whatsapp ? `="${r.whatsapp}"` : '',
      q(r.estado ? 'completado' : 'pendiente'),
      q(r.comentario)
    ].join(';'));
  }

  const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'contador_actividades.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// Filtrado + orden
function getFilteredSorted() {
  const tokens = norm(q).split(/[^a-z0-9+@.]+/).filter(Boolean);
  let list = rows;

  if (tokens.length) {
    list = list.filter(r => {
      const hay = [r.tipo, r.email, r.whatsapp, r.comentario].map(norm).join(' ');
      return tokens.every(t => hay.includes(t));
    });
  }

  if (filterState === 'pending') list = list.filter(r => !r.estado);
  else if (filterState === 'done') list = list.filter(r => r.estado);
  else if (filterState === 'whatsapp') list = list.filter(r => KIND_BY_LABEL(r.tipo) === 2);
  else if (filterState === 'email') list = list.filter(r => KIND_BY_LABEL(r.tipo) === 3);

  return [...list].sort((a, b) => {
    const fa = String(a.fecha || '');
    const fb = String(b.fecha || '');
    // si por algún motivo están vacías, evitar crash
    const byDate = sortDesc ? fb.localeCompare(fa) : fa.localeCompare(fb);
    return byDate || (b.id - a.id);
  });
}

// Altas
function addActivity(kind, email, whatsapp, comment) {
  const id = rows.length ? Math.max(...rows.map(r => r.id)) + 1 : 1;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setStatus('Email no válido', false);
    return;
  }
  const item = {
    id,
    fecha: nowStr(),
    tipo: TYPES[kind],
    email: (email || '').trim(),
    whatsapp: digitsOnly(whatsapp),
    estado: false,               // por defecto: pendiente (rojo)
    comentario: (comment || '').trim()
  };
  rows.push(item);
  markLocalInteraction(); // <---
  saveLocal(); buildDir(); render();
  if (isDbConnected()) {
    saveRow(item).then(() => {
      setDbUI(true, 'guardado');
    });
    // Guardar contacto si hay datos
    if (item.email && item.whatsapp) {
      saveContactsBulk([{ email: item.email, whatsapp: item.whatsapp }])
        .then(() => console.log('Contacto guardado en Supabase'));
    }
  }
  setStatus('Actividad registrada', true);
}

function ymdLima(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function formatCommentHTML(text) {
  if (!text) return '';
  const parts = text.split('|').map(p => p.trim());
  
  let commentIndex = 0;
  const formattedParts = parts.map((part) => {
    const isEmailAlt = /E-mail alterno:/i.test(part);
    const isWaAlt = /WhatsApp alterno:/i.test(part);
    
    if (isEmailAlt || isWaAlt) {
      return `<strong class="comment-alt-contact">${esc(part)}</strong>`;
    } else {
      if (commentIndex === 0) {
        commentIndex++;
        return `<span class="comment-newest">${esc(part)}</span>`;
      } else {
        return `<span class="comment-old">${esc(part)}</span>`;
      }
    }
  });
  
  return formattedParts.join(' | ');
}

function updateRowFields(id, updates) {
  const r = rows.find(x => x.id === id);
  if (!r) return;
  for (const [field, value] of Object.entries(updates)) {
    r[field] = (field === 'whatsapp') ? digitsOnly(value) : value;
  }
  r.fecha = nowStr();
  markLocalInteraction();
  saveLocal(); buildDir(); render();
  if (isDbConnected()) {
    saveRow(r).then(() => setDbUI(true, 'actualizado'));
    if (r.email && r.whatsapp) {
      saveContactsBulk([{ email: r.email, whatsapp: r.whatsapp }])
        .catch(err => console.error('Error guardando contacto al editar:', err));
    }
  }
}

// Helper edición
function updateField(id, field, value) {
  const r = rows.find(x => x.id === id);
  if (!r) return;
  const v = (field === 'whatsapp') ? digitsOnly(value) : value;
  r[field] = v;
  r.fecha = nowStr();
  markLocalInteraction(); // <---
  saveLocal(); buildDir(); render();
  if (isDbConnected()) {
    saveRow(r).then(() => setDbUI(true, 'actualizado'));

    // Si se actualizó email o whatsapp, intentar guardar contacto
    // Usamos los valores actuales de la fila
    if ((field === 'email' || field === 'whatsapp') && r.email && r.whatsapp) {
      saveContactsBulk([{ email: r.email, whatsapp: r.whatsapp }])
        .catch(err => console.error('Error guardando contacto al editar:', err));
    }
  }
}


// ================== Render (con Paginación) ==================
function render() {
  const list = getFilteredSorted();
  const totalItems = list.length;

  // Calcular páginas
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  // Slice data
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = list.slice(startIdx, endIdx);

  tbody.innerHTML = pageItems.map((r, i) => {
    // Nota: 'i' es índice relativo a la página. 
    // Para el contador global (descendente), usamos el índice real en 'list'
    // El índice real es startIdx + i
    const realIdx = startIdx + i;
    const nDesc = totalItems - realIdx;

    const kind = KIND_BY_LABEL(r.tipo);
    const rowClass = kind === 2 ? 'type-2' : 'type-3';
    const selClass = kind === 2 ? 't2' : 't3';

    const emailHtml = r.email
      ? `<span class="copy-mail" data-email="${esc(r.email)}" title="Copiar email">${esc(r.email)}</span>`
      : `<button class="btn-add-val btn-add-email" data-id="${r.id}" title="Agregar Email">+ Email</button>`;

    const waDigits = digitsOnly(r.whatsapp);
    const waHtml = waDigits
      ? `<span class="copy-wa" data-wa="${waDigits}" title="Copiar WhatsApp y usar en Link rápido">${esc(waDigits)}</span>`
      : `<button class="btn-add-val btn-add-wa" data-id="${r.id}" title="Agregar WhatsApp">+ WA</button>`;

    const stTitle = r.estado ? 'Completado' : 'Pendiente';

    return `
      <tr data-id="${r.id}" class="${rowClass}">
        <td>${nDesc}</td>
        <td><span class="muted">${r.fecha}</span></td>
        <td>
          <select class="typeSel ${selClass}" data-id="${r.id}">
            <option value="2" ${kind === 2 ? 'selected' : ''}>${esc(TYPES[2])}</option>
            <option value="3" ${kind === 3 ? 'selected' : ''}>${esc(TYPES[3])}</option>
          </select>
        </td>
        <td>${emailHtml}</td>
        <td>${waHtml}</td>
        <td>
          <label class="switch ${r.estado ? 'done' : 'pending'}" title="${stTitle}">
            <input type="checkbox" class="st" data-id="${r.id}" ${r.estado ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </td>
        <td class="comment-cell">
          <div class="comment-wrapper">
            <button class="btn-comment-add" data-id="${r.id}" title="Añadir comentario">+</button>
            <div class="editable" contenteditable="true" data-id="${r.id}" data-field="comentario">${formatCommentHTML(r.comentario)}</div>
          </div>
        </td>
        <td><button class="btn" data-del="${r.id}">Eliminar</button></td>
      </tr>
    `;
  }).join('');

  // Botón "+" para añadir comentario al inicio
  tbody.querySelectorAll('.btn-comment-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = +btn.dataset.id;
      startAddComment(id);
    });
  });

  // Render controles paginación
  renderPaginationControls(totalPages, totalItems);

  // Copiar email al click
  tbody.querySelectorAll('.copy-mail').forEach(el => {
    el.addEventListener('click', async () => {
      const mail = el.getAttribute('data-email') || '';
      if (!mail) return;
      await copyToClipboard(mail);

      clearTableHighlights();
      el.classList.add('picked');
      lastPickedEmailEl = el;

      setStatus('Email copiado al portapapeles', true);
    });
  });

  // Agregar email desde la tabla
  tbody.querySelectorAll('.btn-add-email').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = +btn.dataset.id;
      const val = await showPrompt('Ingresa el Email para esta actividad:');
      if (val === null) return; // canceló
      const cleanVal = val.trim();
      if (cleanVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanVal)) {
        setStatus('Email no válido', false);
        alert('Email no válido');
        return;
      }
      updateField(id, 'email', cleanVal);
      setStatus('Email agregado', true);
    });
  });

  // Copiar WhatsApp y preparar "Link rápido"
  tbody.querySelectorAll('.copy-wa').forEach(el => {
    el.addEventListener('click', async () => {
      const n = el.getAttribute('data-wa') || '';
      if (!n) return;
      await copyToClipboard(n);
      setQuickWaFromTable(n, el);
      setStatus('WhatsApp copiado y preparado en Link rápido', true);
    });
  });

  // Agregar WhatsApp desde la tabla
  tbody.querySelectorAll('.btn-add-wa').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = +btn.dataset.id;
      const val = await showPrompt('Ingresa el WhatsApp para esta actividad (solo números):');
      if (val === null) return; // canceló
      const cleanVal = digitsOnly(val);
      updateField(id, 'whatsapp', cleanVal);
      setStatus('WhatsApp agregado', true);
    });
  });

  // Eliminar
  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = +btn.dataset.del;
      rows = rows.filter(r => r.id !== id);
      markLocalInteraction(); // <---
      saveLocal(); buildDir(); render();
      if (isDbConnected()) deleteRow(id).then(() => setDbUI(true, 'eliminado'));
      setStatus('Fila eliminada', true);
    });
  });

  // Cambiar tipo
  tbody.querySelectorAll('select.typeSel').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = +sel.dataset.id;
      const kind = +sel.value;
      updateField(id, 'tipo', TYPES[kind]);
    });
  });

  // Toggle estado (2 estados)
  tbody.querySelectorAll('input.st').forEach(ch => {
    ch.addEventListener('change', () => {
      const id = +ch.dataset.id;
      updateField(id, 'estado', ch.checked);
    });
  });

  // Editables (solo comentario ahora)
  tbody.querySelectorAll('.editable').forEach(el => {
    const commit = () => {
      const id = +el.dataset.id;
      const field = el.dataset.field;   // "comentario"
      let val = (el.textContent || '').trim();
      
      // Limpiar barras/pipes y espacios adicionales sobrantes al inicio o al final
      val = val.replace(/^[\s|]+|[\s|]+$/g, '').trim();
      
      updateField(id, field, val);
    };
    el.addEventListener('blur', commit);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
        el.blur();
      }
    });
  });

  // === Contadores: SOLO HOY (zona Lima) ===
  // (Removido por solicitud del usuario)

  // === Contadores por estado (totales) ===
  if (cPendingEl) cPendingEl.textContent = rows.filter(r => !r.estado).length;
  if (cDoneEl) cDoneEl.textContent = rows.filter(r => r.estado).length;

  thDate.textContent = sortDesc ? 'Fecha ▼' : 'Fecha ▲';
}

function renderPaginationControls(totalPages, totalItems) {
  const container = $('#pagination');
  if (!container) return;

  if (totalPages <= 1 && totalItems < itemsPerPage) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = `
    <button class="btn" id="pgPrev" ${currentPage === 1 ? 'disabled' : ''}>Prev</button>
    <span>Página ${currentPage} de ${totalPages} (${totalItems} items)</span>
    <button class="btn" id="pgNext" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
  `;

  $('#pgPrev')?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; render(); }
  });

  $('#pgNext')?.addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage++; render(); }
  });
}

// ======== Autocompletado cruzado (historial + import) ========
function maybeFillEmailFromWa(waInp, emInp) {
  const waKey = digitsOnly(waInp.value);
  if (!waKey || emInp.value.trim()) return;
  const email = mapWaToEmail.get(waKey);
  if (email) emInp.value = email;
}
function maybeFillWaFromEmail(emInp, waInp) {
  const emKey = cleanEmail(emInp.value);
  if (!emKey || waInp.value.trim()) return;
  const wa = mapEmailToWa.get(emKey);
  if (wa) waInp.value = wa;
}

// Vincula un bloque de alta (k = 1/2/3) con saneo en input/paste
function bindFormEnhancements(k) {
  const em = $(`#em${k}`),
    wa = $(`#wa${k}`),
    co = $(`#co${k}`);

  // Saneador de WA en input
  wa.addEventListener('input', () => {
    wa.value = digitsOnly(wa.value);
    maybeFillEmailFromWa(wa, em);
  });

  // Saneador de WA en paste (respeta selección)
  wa.addEventListener('paste', (e) => {
    const txt = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    if (!txt) return;
    e.preventDefault();
    wa.setRangeText(digitsOnly(txt), wa.selectionStart, wa.selectionEnd, 'end');
    wa.dispatchEvent(new Event('input'));
  });

  // autocompletado con email
  em.addEventListener('input', () => maybeFillWaFromEmail(em, wa));
  em.addEventListener('blur', () => maybeFillWaFromEmail(em, wa));
  wa.addEventListener('blur', () => maybeFillEmailFromWa(wa, em));

  // buscadores
  $(`#findEmail${k}`).addEventListener('click', () => {
    q = em.value.trim();
    qInp.value = q;
    render();
    tableCard.scrollIntoView({ behavior: 'smooth' });
  });
  $(`#findWa${k}`).addEventListener('click', () => {
    q = wa.value.trim();
    qInp.value = q;
    render();
    tableCard.scrollIntoView({ behavior: 'smooth' });
  });
}
// ======== Fin autocompletado ========

// Eventos: altas
$('#b2').addEventListener('click', () => {
  addActivity(2, $('#em2').value, $('#wa2').value, $('#co2').value);
  markAdded($('#b2'));
});
$('#b3').addEventListener('click', () => {
  addActivity(3, $('#em3').value, $('#wa3').value, $('#co3').value);
  markAdded($('#b3'));
});
bindFormEnhancements(2);
bindFormEnhancements(3);

// Enter = Agregar
function bindEnter(kind, btnSel) {
  const em = $(`#em${kind}`),
    wa = $(`#wa${kind}`),
    co = $(`#co${kind}`);
  [em, wa, co].forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addActivity(kind, em.value, wa.value, co.value);
        markAdded($(btnSel));
      }
    });
  });
}
bindEnter(2, '#b2');
bindEnter(3, '#b3');

// Estado “Agregado”
function markAdded(btn) {
  if (!btn) return;
  const old = btn.textContent;
  btn.textContent = 'Agregado';
  btn.classList.add('done');
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = old;
    btn.classList.remove('done');
    btn.disabled = false;
  }, 1400);
}

// Clear formularios
const clearInputs = () => {
  ['2', '3'].forEach(k => {
    $(`#em${k}`).value = '';
    $(`#wa${k}`).value = '';
    $(`#co${k}`).value = '';
  });
};

$('#clearForms').addEventListener('click', clearInputs);

// Clear all fields (forms + search)
const clearAllActive = () => {
  clearInputs();
  q = '';
  qInp.value = '';
  if (lastPickedEmailEl) lastPickedEmailEl.classList.remove('picked');
  if (lastPickedWaEl) lastPickedWaEl.classList.remove('picked');
  lastPickedEmailEl = null;
  lastPickedWaEl = null;
  currentPage = 1;
  render();
};

clearAllFieldsBtn?.addEventListener('click', clearAllActive);

// Eventos de botones de cabecera y pie de página
$('#downloadCSV')?.addEventListener('click', downloadExcel);
$('#btnSync')?.addEventListener('click', () => reloadFromDb('sincronizado'));
$('#saveNow')?.addEventListener('click', async () => {
  await saveNotes();
  if (isDbConnected()) {
    await reloadFromDb('sincronizado');
  }
  setStatus('Guardado y sincronizado manualmente', true);
});

// ESC key support
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    clearAllActive();
  }
});

// Activity Tag Paste buttons
const handleTagPaste = async (kind) => {
  const em = $(`#em${kind}`);
  const wa = $(`#wa${kind}`);
  const co = $(`#co${kind}`);

  // Clean before paste
  em.value = '';
  wa.value = '';
  co.value = '';

  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      const clean = text.trim();
      if (clean.startsWith('@')) {
        co.value = `Telegram: ${clean} ... `;
      } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
        em.value = clean;
        maybeFillWaFromEmail(em, wa);
      } else if (/\d/.test(clean)) {
        wa.value = digitsOnly(clean);
        maybeFillEmailFromWa(wa, em);
      } else {
        // Fallback: put in comment or as best guess
        co.value = clean;
      }
      setStatus('Pegado del portapapeles', true);
    }
    // Final focus on comment field and place cursor at the end
    co.focus();
    if (co.value) {
      co.setSelectionRange(co.value.length, co.value.length);
    }
  } catch (err) {
    console.error('Clipboard paste failed:', err);
    co.focus(); // Focus even on error
  }
};

$('#pasteRow2')?.addEventListener('click', () => handleTagPaste(2));
$('#pasteRow3')?.addEventListener('click', () => handleTagPaste(3));

// Buscador + filtro (persistente) — sanea teléfonos en #q
let t;
const isPhoneLike = s => /^[\s()+\-]*\+?\d[\s\d()+\-]*$/.test(s || '');

qInp.addEventListener('input', (e) => {
  const v = e.target.value;
  if (isPhoneLike(v)) {
    const cleaned = digitsOnly(v);
    if (cleaned !== v) {
      qInp.value = cleaned;
      qInp.setSelectionRange(cleaned.length, cleaned.length);
    }
  }
  clearTimeout(t);
  t = setTimeout(() => {
    q = qInp.value || '';
    currentPage = 1; // reset page on search
    render();
  }, 80);
});

qInp.addEventListener('paste', (e) => {
  const txt = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  if (isPhoneLike(txt)) {
    e.preventDefault();
    qInp.setRangeText(digitsOnly(txt), qInp.selectionStart, qInp.selectionEnd, 'end');
    qInp.dispatchEvent(new Event('input'));
  }
});

// Paste button logic
$('#btnPaste')?.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      qInp.value = text;
      qInp.dispatchEvent(new Event('input'));
      qInp.focus();
    }
  } catch (err) {
    console.error('Clipboard paste failed:', err);
    alert('No se pudo acceder al portapapeles. Da permiso o usa Ctrl+V.');
  }
});

$('#clearQ').addEventListener('click', () => { q = ''; qInp.value = ''; currentPage = 1; render(); });

// Filtro por estado (persistente)
// Filtro por estado (persistente)
if (typeof stateSel !== 'undefined' && stateSel) {
  stateSel.addEventListener('change', () => {
    filterState = stateSel.value;
    try { localStorage.setItem(LS_FILTER, filterState); } catch { }
    currentPage = 1; // reset page on filter change
    render();
  });
}

// Botón "Limpiar todo" - REMOVED per user request
/*
clearAllBtn?.addEventListener('click', async () => {
  ...
});
*/

// Ordenar por fecha
thDate.addEventListener('click', () => { sortDesc = !sortDesc; render(); });

// ====== WhatsApp quick tool ======
const waQuick = $('#waQuick');
const waCopy = $('#waCopy');
const waOpen = $('#waOpen');
const waClear = $('#waClear');

function clearTableHighlights() {
  if (lastPickedWaEl) {
    lastPickedWaEl.classList.remove('picked');
    lastPickedWaEl = null;
  }
  if (lastPickedEmailEl) {
    lastPickedEmailEl.classList.remove('picked');
    lastPickedEmailEl = null;
  }
}

function clearWaQuickHighlight() {
  waQuick?.classList.remove('picked');
  clearTableHighlights();
}

// usado al hacer click en un número de la tabla
function setQuickWaFromTable(num, el) {
  if (waQuick) {
    waQuick.value = digitsOnly(num);
    waQuick.classList.add('picked');
  }
  clearTableHighlights();
  if (el) { el.classList.add('picked'); lastPickedWaEl = el; }
}

async function copyToClipboard(txt) {
  try {
    await navigator.clipboard.writeText(txt);
    setStatus('Copiado al portapapeles', true);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      setStatus('Copiado al portapapapeles', true);
    } catch {
      setStatus('No se pudo copiar', false);
    } finally {
      document.body.removeChild(ta);
    }
  }
}

const WA_BASE = 'https://web.whatsapp.com/send?phone=';
const buildWaLink = (num) => {
  const n = digitsOnly(num);
  return n ? (WA_BASE + n) : null;
};

if (waQuick) {
  waQuick.addEventListener('input', () => {
    waQuick.value = digitsOnly(waQuick.value);
    if (waQuick.value) waQuick.classList.add('picked');
    else clearWaQuickHighlight();
  });
  waQuick.addEventListener('paste', (e) => {
    const txt = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    if (!txt) return;
    e.preventDefault();
    waQuick.setRangeText(digitsOnly(txt), waQuick.selectionStart, waQuick.selectionEnd, 'end');
    waQuick.dispatchEvent(new Event('input'));
  });
}
if (waCopy) {
  waCopy.addEventListener('click', async () => {
    const link = buildWaLink(waQuick?.value || '');
    if (!link) { setStatus('Ingresa un número válido', false); return; }
    await copyToClipboard(link);
  });
}
if (waOpen) {
  waOpen.addEventListener('click', () => {
    const link = buildWaLink(waQuick?.value || '');
    if (!link) { setStatus('Ingresa un número válido', false); return; }
    
    const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron;
    if (isElectron) {
      try {
        const { exec } = require('child_process');
        exec(`start msedge "${link}"`);
      } catch (err) {
        console.error('Error opening in Edge:', err);
        window.open(link, 'whatsapp_web_tab');
      }
    } else {
      window.open(link, 'whatsapp_web_tab');
    }
  });
}
if (waClear) {
  waClear.addEventListener('click', () => {
    if (waQuick) waQuick.value = '';
    clearWaQuickHighlight();
  });
}

// ====== Bulk import ======
const dlgBulk = $('#dlgBulk'),
  bulkText = $('#bulkText');
$('#btnBulk').addEventListener('click', () => {
  bulkText.value = '';
  dlgBulk.showModal();
});
$('#bulkCancel').addEventListener('click', () => dlgBulk.close());
$('#bulkImport').addEventListener('click', () => {
  const text = bulkText.value || '';
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) { alert('Nada para importar'); return; }
  const pairs = loadPairs();
  const set = new Map(pairs.map(p => {
    const key = cleanEmail(p.email) || digitsOnly(p.whatsapp);
    return [key, { email: p.email, whatsapp: digitsOnly(p.whatsapp) }];
  }));

  let ok = 0, dup = 0, bad = 0;
  for (const ln of lines) {
    // Permite coma o tab — NO dividimos comentarios aquí: solo pares email/wa
    let email = '', wa = '';
    if (ln.includes('\t')) {
      const [a, b] = ln.split('\t'); email = (a || '').trim(); wa = (b || '').trim();
    } else {
      const [a, b] = ln.split(','); email = (a || '').trim(); wa = (b || '').trim();
    }

    const waClean = digitsOnly(wa);
    if (!email && !waClean) { bad++; continue; }

    const key = cleanEmail(email) || waClean;
    if (set.has(key)) { dup++; continue; }

    set.set(key, { email, whatsapp: waClean });
    ok++;
  }

  const out = [...set.values()];
  savePairs(out);
  buildDir();

  // Guardar en DB si está conectado
  if (isDbConnected()) {
    saveContactsBulk(out).then(() => {
      setStatus('Contactos guardados en DB', true);
    }).catch(e => {
      console.error('Error saving contacts bulk:', e);
    });
  }

  dlgBulk.close();
  setStatus(`Importados: ${ok} · Duplicados: ${dup} · Vacíos: ${bad}`, true);
});

// ====== Notas rápidas (autosave + DB sync) ======
const notesArea = $('#quickNotes');
const notesStatus = $('#notesStatus');
const notesSearch = $('#searchNotes');

// Helper to get plain text from notesArea
const getNotesText = () => notesArea.innerText || '';

async function saveNotes() {
  const txt = getNotesText();
  try {
    localStorage.setItem(NOTES_KEY, txt);
    if (isDbConnected()) {
      await saveNote(txt);
      notesStatus.textContent = 'Guardado en DB ' + new Date().toLocaleTimeString();
    } else {
      notesStatus.textContent = 'Guardado local ' + new Date().toLocaleTimeString();
    }
  } catch { }
}

function saveNotesDebounced() {
  clearTimeout(notesArea._t);
  notesArea._t = setTimeout(saveNotes, 500);
}

// Initial Load
try {
  const saved = localStorage.getItem(NOTES_KEY) || '';
  notesArea.innerText = saved;
  notesStatus.textContent = 'Cargado.';
} catch { }

// Clear highlights when focusing the notes
notesArea.addEventListener('focus', () => {
  const txt = getNotesText();
  notesArea.innerText = txt; // Remove <mark> tags
  if (txt.trim() === '') {
    notesArea.innerText = '- ';
    // Position cursor at end
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(notesArea);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    saveNotesDebounced();
  }
});

notesArea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const sel = window.getSelection();
    const range = sel.getRangeAt(0);
    const textNode = document.createTextNode('\n- ');
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    sel.removeAllRanges();
    sel.addRange(range);
    saveNotesDebounced();
  }
});

notesArea.addEventListener('copy', (e) => {
  const text = window.getSelection().toString();
  if (text && e.clipboardData) {
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
  }
});

notesArea.addEventListener('click', (e) => {
  const sel = window.getSelection();
  if (!sel.isCollapsed || !sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  // In contenteditable, it's usually a text node after focus()
  if (node.nodeType !== Node.TEXT_NODE) return;

  const text = node.textContent;
  const off = range.startOffset;

  // Find boundaries of the current line
  let start = text.lastIndexOf('\n', off - 1) + 1;
  let end = text.indexOf('\n', off);
  if (end === -1) end = text.length;

  const line = text.substring(start, end);
  const match = line.match(/^(\s*-\s*)/);
  if (match) {
    const bulletLen = match[0].length;

    // Select the text PART of the line (excluding "- ")
    const newRange = document.createRange();
    newRange.setStart(node, start + bulletLen);
    newRange.setEnd(node, end);
    sel.removeAllRanges();
    sel.addRange(newRange);

    const plain = text.substring(start + bulletLen, end).trim();
  }
});

notesArea.addEventListener('paste', (e) => {
  e.preventDefault();
  const data = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  if (!data) return;

  const bullet = (s) => {
    const clean = s.replace(/^\s*-\s?/, '');
    return '- ' + clean;
  };
  const processed = data.includes('\n')
    ? data.replace(/\r/g, '').split('\n').map(bullet).join('\n')
    : data;

  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();

  const textNode = document.createTextNode(processed);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  saveNotesDebounced();
});

notesArea.addEventListener('input', (e) => {
  if (e.inputType !== 'insertReplacementText') { // Avoid loop if we were highlighting (though we blur)
    saveNotesDebounced();
  }
});

// New Note Button
$('#addNote')?.addEventListener('click', () => {
  const currentText = getNotesText();
  notesArea.innerText = '- \n' + currentText;
  notesArea.focus();
  // Set cursor after "- "
  const range = document.createRange();
  const sel = window.getSelection();
  if (notesArea.firstChild) {
    range.setStart(notesArea.firstChild, 2);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  saveNotesDebounced();
});

// Search and Highlight Notes
notesSearch?.addEventListener('input', (e) => {
  const term = e.target.value.trim();
  const text = getNotesText();

  if (!term) {
    notesArea.innerText = text;
    return;
  }

  // Escape regex chars
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');

  // Highlight using innerHTML
  // We use textContent trick to avoid XSS if the notes have accidental HTML
  const temp = document.createElement('div');
  temp.textContent = text;
  const safeText = temp.innerHTML;

  notesArea.innerHTML = safeText.replace(regex, '<mark>$1</mark>');

  // Scroll to first match
  const firstMark = notesArea.querySelector('mark');
  if (firstMark) {
    firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

// ====== Recargar CSV desde la conexión actual (carpeta o archivo) ======
// ====== Recargar desde DB ======
async function reloadFromDb(note = 'sincronizado') {
  if (!isDbConnected()) return;

  // Evitar recarga si el usuario está editando tabla
  if (document.activeElement && document.activeElement.closest('.editable')) {
    return;
  }

  const interactionTimeAtStart = lastLocalInteractionTime; // Snapshot before fetch

  try {
    // 1. Sync Notas (si no está escribiendo en ellas)
    if (note === 'auto-sync' && document.activeElement !== notesArea) {
      try {
        const serverNote = await getNote();
        if (serverNote !== getNotesText()) {
          notesArea.innerText = serverNote;
          localStorage.setItem(NOTES_KEY, serverNote);
          notesStatus.textContent = 'Sincronizado ' + new Date().toLocaleTimeString();
        }
      } catch (e) { console.warn('Error syncing notes', e); }
    }

    // 2. Sync Tabla
    let arr = await fetchAll();

    // Check if a local interaction happened DURING the fetch
    if (lastLocalInteractionTime !== interactionTimeAtStart) {
      if (note !== 'auto-sync') console.warn('Sync ignored: local interaction occurred during fetch');
      return;
    }

    // Double check grace period (standard check)
    if (Date.now() - lastLocalInteractionTime < SYNC_GRACE_PERIOD) {
      if (note !== 'auto-sync') console.warn('Sync skipped due to local activity');
      return;
    }

    if (Array.isArray(arr)) {
      const newRows = arr.map((it, idx) => sanitizeRow(it, idx));

      // Comparación simple para evitar re-render si no hay cambios
      if (JSON.stringify(newRows) !== JSON.stringify(rows)) {
        rows = newRows;
        setDbUI(true, note);
        normalizeAndRender();
      } else {
        // Solo actualizar estado visual sin re-render
        setDbUI(true, note);
      }
    } else {
      if (rows.length > 0) {
        rows = [];
        setDbUI(true, '(vacío)');
        normalizeAndRender();
      }
    }
  } catch (e) {
    // Si es auto-sync, no molestar al usuario con alertas visuales
    if (note === 'auto-sync') {
      console.warn('Auto-sync error (silenced):', e);
    } else {
      console.error('reloadFromDb error:', e);
      setStatus('Error al leer de Neon DB: ' + e.message, false);
    }
  }

  // 3. Sync Contactos (Dictionary) - Silent
  try {
    const contacts = await getContacts();
    if (contacts && contacts.length) {
      // Merge con lo local
      const pairs = loadPairs();
      const map = new Map();
      // Prioridad: DB > Local? O mezcla. Mezclamos.
      pairs.forEach(p => {
        const k = cleanEmail(p.email) || digitsOnly(p.whatsapp);
        if (k) map.set(k, p);
      });
      contacts.forEach(c => {
        const k = cleanEmail(c.email) || digitsOnly(c.whatsapp);
        if (k) map.set(k, { email: c.email || '', whatsapp: c.whatsapp || '' });
      });
      savePairs([...map.values()]);
      buildDir();
    }
  } catch (e) { console.warn('Contacts sync error:', e); }
}

// ====== Normaliza/Parchea después de cargar desde carpeta ======
function normalizeAndRender() {
  rows = rows.map((r, i) => sanitizeRow(r, i));
  saveLocal(); buildDir(); render();
}

function startAutoSync() {
  setInterval(() => {
    reloadFromDb('auto-sync');
  }, 5000); // 5 segundos
}

// ================== Init ==================
(async function init() {
  checkAuth();
  // 1) Cargar localStorage
  rows = (loadLocal() || []).map((r, i) => {
    // migraciones antiguas (boolean estado, WA sucia)
    if (typeof r.estado === 'boolean' || typeof r.estado === 'string' || typeof r.estado === 'number') {
      r.estado = normalizeState(r.estado);
    }
    r.whatsapp = digitsOnly(r.whatsapp);
    return sanitizeRow(r, i);
  });

  // filtro persistente
  try {
    const stored = localStorage.getItem(LS_FILTER);
    if (stored) {
      filterState = stored;
      if (stateSel) stateSel.value = stored;
    }
  } catch { }

  buildDir();
  render();

  // Mensaje inicial según soporte del navegador / contexto
  // 2) Intentar conectar DB (Supabase)
  const ok = await initDB();
  if (ok) {
    setDbUI(true, 'Conectado (Supabase)');

    // Check if DB is empty to Restore/Migrate
    try {
      const serverRows = await fetchAll();
      if ((!serverRows || serverRows.length === 0) && rows.length > 0) {
        // Upload local data to Supabase (Migration)
        setStatus('Migrando datos locales a Supabase...', true);
        await bulkUpsert(rows);

        const localNote = localStorage.getItem(NOTES_KEY) || '';
        if (localNote) await saveNote(localNote);

        // Contacts
        const allPairs = loadPairs();
        if (allPairs.length) await saveContactsBulk(allPairs);

        setStatus('Migración completada', true);
      }
    } catch (e) {
      console.warn('Migration check failed:', e);
    }

    startAutoSync();
  } else {
    // Si falla, el propio initDB suele alertar, pero actualizamos UI por si acaso
    setDbUI(false, 'Error conexión (ver consola)');
  }
})();

// ====== Lógica de Menú Contextual Personalizado (Email/WhatsApp Alternativos) ======
const customContextMenu = $('#customContextMenu');
const contextMenuList = $('#contextMenuList');

function showContextMenu(e, items) {
  contextMenuList.innerHTML = items.map(item => {
    if (item.type === 'divider') {
      return `<li class="context-menu-divider"></li>`;
    }
    const dangerClass = item.danger ? 'danger' : '';
    return `<li class="context-menu-item ${dangerClass}" data-action="${item.action}">
      <span>${item.icon}</span>
      <span>${item.text}</span>
    </li>`;
  }).join('');

  // Mostrar el menú
  customContextMenu.style.display = 'block';
  
  // Calcular posición evitando salirse de la pantalla
  const menuWidth = customContextMenu.offsetWidth || 240;
  const menuHeight = customContextMenu.offsetHeight || 180;
  
  let left = e.pageX;
  let top = e.pageY;
  
  if (left + menuWidth > window.innerWidth + window.scrollX) {
    left = window.innerWidth + window.scrollX - menuWidth - 10;
  }
  if (top + menuHeight > window.innerHeight + window.scrollY) {
    top = window.innerHeight + window.scrollY - menuHeight - 10;
  }
  
  customContextMenu.style.left = `${left}px`;
  customContextMenu.style.top = `${top}px`;

  // Asignar controladores de eventos a las opciones
  const menuItems = contextMenuList.querySelectorAll('.context-menu-item');
  menuItems.forEach(el => {
    el.addEventListener('click', () => {
      const actionName = el.getAttribute('data-action');
      const item = items.find(it => it.action === actionName);
      if (item && item.handler) {
        item.handler();
      }
      hideContextMenu();
    });
  });
}

function hideContextMenu() {
  customContextMenu.style.display = 'none';
}

// Ocultar menú al hacer scroll o clic en otro sitio
window.addEventListener('scroll', hideContextMenu);
document.addEventListener('click', (e) => {
  if (!e.target.closest('#customContextMenu')) {
    hideContextMenu();
  }
});

function startAddComment(rowId) {
  const r = rows.find(x => x.id === rowId);
  if (!r) return;

  let currentText = (r.comentario || '').trim();
  if (currentText) {
    if (!currentText.startsWith('|') && !currentText.startsWith(' |')) {
      r.comentario = ' | ' + currentText;
    }
  } else {
    r.comentario = '';
  }

  // Re-renderizar la UI para pintar el " | " y dar clases correctas
  render();

  // Encontrar el elemento editable en el DOM y hacer focus
  const tr = document.querySelector(`tr[data-id="${rowId}"]`);
  const tdComment = tr?.querySelector('.editable[data-field="comentario"]');
  if (!tdComment) return;

  tdComment.focus();

  // Posicionar cursor al inicio (antes del " | ")
  try {
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(tdComment, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (err) {
    console.warn('Error setting caret position:', err);
  }
}

// Delegación de Evento de Clic Derecho (contextmenu) en la tabla
document.addEventListener('contextmenu', (e) => {
  const mailEl = e.target.closest('.copy-mail');
  const waEl = e.target.closest('.copy-wa');
  
  if (mailEl) {
    e.preventDefault();
    const rowId = +mailEl.closest('tr').dataset.id;
    const currentVal = mailEl.getAttribute('data-email');
    const r = rows.find(x => x.id === rowId);
    if (!r) return;
    
    // Resaltar elemento en la tabla
    clearTableHighlights();
    mailEl.classList.add('picked');
    lastPickedEmailEl = mailEl;

    const options = [
      {
        icon: '💬',
        text: 'Añadir comentario',
        action: 'add_comment',
        handler: () => {
          startAddComment(rowId);
        }
      },
      { type: 'divider' },
      {
        icon: '📋',
        text: 'Copiar Email Principal',
        action: 'copy',
        handler: async () => {
          await copyToClipboard(currentVal);
          setStatus('Email copiado al portapapeles', true);
        }
      },
      {
        icon: '🔍',
        text: 'Buscar por Email',
        action: 'search',
        handler: () => {
          q = currentVal.trim();
          qInp.value = q;
          render();
          const tableCard = $('#tableCard');
          tableCard?.scrollIntoView({ behavior: 'smooth' });
        }
      },
      { type: 'divider' },
      {
        icon: '📧',
        text: 'Agregar Email Alterno',
        action: 'add_alt',
        handler: async () => {
          const val = await showPrompt('Ingresa el Email alternativo:');
          if (val === null) return;
          const cleanVal = val.trim();
          if (!cleanVal) return;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanVal)) {
            setStatus('Email no válido', false);
            alert('Email no válido');
            return;
          }
          
          let currentComment = (r.comentario || '').trim();
          const altText = `E-mail alterno: ${cleanVal}`;
          if (currentComment) {
            if (!currentComment.endsWith('|') && !currentComment.endsWith(' |')) {
              currentComment += ' | ';
            }
            currentComment += altText;
          } else {
            currentComment = altText;
          }
          
          updateField(rowId, 'comentario', currentComment);
          setStatus('Email alternativo agregado', true);
        }
      },
      {
        icon: '✈️',
        text: 'Agregar Telegram',
        action: 'add_telegram',
        handler: async () => {
          const val = await showPrompt('Ingresa el Telegram (ejemplo: @Daghreeri):');
          if (val === null) return;
          const cleanVal = val.trim();
          if (!cleanVal) return;
          
          let currentComment = (r.comentario || '').trim();
          const altText = `Telegram: ${cleanVal}`;
          if (currentComment) {
            if (!currentComment.endsWith('|') && !currentComment.endsWith(' |')) {
              currentComment += ' | ';
            }
            currentComment += altText;
          } else {
            currentComment = altText;
          }
          
          updateField(rowId, 'comentario', currentComment);
          setStatus('Telegram agregado', true);
        }
      },
      {
        icon: '✏️',
        text: 'Cambiar Email Principal',
        action: 'change_primary',
        handler: async () => {
          const val = await showPrompt('Modificar Email principal:', currentVal);
          if (val === null) return;
          const cleanVal = val.trim();
          if (!cleanVal) return;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanVal)) {
            setStatus('Email no válido', false);
            alert('Email no válido');
            return;
          }
          
          // Mover anterior a alternativo en el comentario
          let currentComment = (r.comentario || '').trim();
          const altText = `E-mail alterno: ${currentVal}`;
          if (currentComment) {
            if (!currentComment.endsWith('|') && !currentComment.endsWith(' |')) {
              currentComment += ' | ';
            }
            currentComment += altText;
          } else {
            currentComment = altText;
          }
          
          updateRowFields(rowId, {
            email: cleanVal,
            comentario: currentComment
          });
          setStatus('Email principal modificado y anterior guardado como alterno', true);
        }
      }
    ];
    showContextMenu(e, options);
  } else if (waEl) {
    e.preventDefault();
    const rowId = +waEl.closest('tr').dataset.id;
    const currentVal = waEl.getAttribute('data-wa');
    const r = rows.find(x => x.id === rowId);
    if (!r) return;

    // Resaltar elemento y preparar en el buscador de WhatsApp del panel
    clearTableHighlights();
    waEl.classList.add('picked');
    lastPickedWaEl = waEl;
    if (waQuick) {
      waQuick.value = digitsOnly(currentVal);
      waQuick.classList.add('picked');
    }

    const options = [
      {
        icon: '💬',
        text: 'Añadir comentario',
        action: 'add_comment',
        handler: () => {
          startAddComment(rowId);
        }
      },
      { type: 'divider' },
      {
        icon: '📋',
        text: 'Copiar WhatsApp Principal',
        action: 'copy',
        handler: async () => {
          await copyToClipboard(currentVal);
          setStatus('WhatsApp copiado al portapapeles', true);
        }
      },
      {
        icon: '🔍',
        text: 'Buscar por WhatsApp',
        action: 'search',
        handler: () => {
          q = currentVal.trim();
          qInp.value = q;
          render();
          const tableCard = $('#tableCard');
          tableCard?.scrollIntoView({ behavior: 'smooth' });
        }
      },
      { type: 'divider' },
      {
        icon: '💬',
        text: 'Agregar WhatsApp Alterno',
        action: 'add_alt',
        handler: async () => {
          const val = await showPrompt('Ingresa el WhatsApp alternativo (solo números):');
          if (val === null) return;
          const cleanVal = digitsOnly(val);
          if (!cleanVal) return;
          
          let currentComment = (r.comentario || '').trim();
          const altText = `WhatsApp alterno: ${cleanVal}`;
          if (currentComment) {
            if (!currentComment.endsWith('|') && !currentComment.endsWith(' |')) {
              currentComment += ' | ';
            }
            currentComment += altText;
          } else {
            currentComment = altText;
          }
          
          updateField(rowId, 'comentario', currentComment);
          setStatus('WhatsApp alternativo agregado', true);
        }
      },
      {
        icon: '✈️',
        text: 'Agregar Telegram',
        action: 'add_telegram',
        handler: async () => {
          const val = await showPrompt('Ingresa el Telegram (ejemplo: @Daghreeri):');
          if (val === null) return;
          const cleanVal = val.trim();
          if (!cleanVal) return;
          
          let currentComment = (r.comentario || '').trim();
          const altText = `Telegram: ${cleanVal}`;
          if (currentComment) {
            if (!currentComment.endsWith('|') && !currentComment.endsWith(' |')) {
              currentComment += ' | ';
            }
            currentComment += altText;
          } else {
            currentComment = altText;
          }
          
          updateField(rowId, 'comentario', currentComment);
          setStatus('Telegram agregado', true);
        }
      },
      {
        icon: '✏️',
        text: 'Cambiar WhatsApp Principal',
        action: 'change_primary',
        handler: async () => {
          const val = await showPrompt('Modificar WhatsApp principal (solo números):', currentVal);
          if (val === null) return;
          const cleanVal = digitsOnly(val);
          if (!cleanVal) return;
          
          // Mover anterior a alternativo en el comentario
          let currentComment = (r.comentario || '').trim();
          const altText = `WhatsApp alterno: ${currentVal}`;
          if (currentComment) {
            if (!currentComment.endsWith('|') && !currentComment.endsWith(' |')) {
              currentComment += ' | ';
            }
            currentComment += altText;
          } else {
            currentComment = altText;
          }
          
          updateRowFields(rowId, {
            whatsapp: cleanVal,
            comentario: currentComment
          });
          setStatus('WhatsApp principal modificado y anterior guardado como alterno', true);
        }
      }
    ];
    showContextMenu(e, options);
  } else {
    hideContextMenu();
  }
});

