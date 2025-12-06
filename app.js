// app.js — CSV robusto (comentarios con comas), estados 2-valores (done|pending),
// bulk import, autocompletado cruzado, búsqueda y herramientas WA.

import { toCSV, parseCSV } from './csv.js';
import {
  initDB,
  fetchAll,
  saveRow,
  deleteRow,
  deleteAll,
  getConnectionString,
  setConnectionString,
  isDbConnected,
  bulkUpsert,

  getNote,
  saveNote,
  getContacts,
  saveContactsBulk
} from './neon-db.js';

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
const counters = { 1: $('#c1'), 2: $('#c2'), 3: $('#c3'), t: $('#ct') };
const cPendingEl = $('#cPending');
const cDoneEl = $('#cDone');

const clearAllBtn = $('#clearAll');
const btnConfigDB = $('#btnConfigDB');
const btnSync = $('#btnSync');
const dlgConfig = $('#dlgConfig');
const neonUrlInp = $('#neonUrl');
const configSave = $('#configSave');
const configCancel = $('#configCancel');
const btnMigrateCsv = $('#btnMigrateCsv');
const csvUpload = $('#csvUpload');

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

// ================== Auth Logic ==================
function checkAuth() {
  if (sessionStorage.getItem('ms_auth') === 'ok') {
    dlgAuth.close();
    return;
  }
  dlgAuth.showModal();
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
    ? `Neon DB: Conectado${note ? ' · ' + note : ''}`
    : 'Neon DB: Desconectado';
}

// Normalizaciones base
const TYPES = {
  2: 'Resuelta su consulta de WhatsApp',
  3: 'Resuelta consulta de Email'
};
const KIND_BY_LABEL = label =>
  label === TYPES[2] ? 2
    : label === TYPES[3] ? 3
      : 2; // fallback a WhatsApp

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

// CSV descarga
function downloadCSV() {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'activities.csv';
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
    estado: true,                // por defecto: completado
    comentario: (comment || '').trim()
  };
  rows.push(item);
  saveLocal(); buildDir(); render();
  if (isDbConnected()) {
    saveRow(item).then(() => {
      setDbUI(true, 'guardado');
    });
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

// Helper edición
function updateField(id, field, value) {
  const r = rows.find(x => x.id === id);
  if (!r) return;
  const v = (field === 'whatsapp') ? digitsOnly(value) : value;
  r[field] = v;
  r.fecha = nowStr();
  saveLocal(); buildDir(); render();
  if (isDbConnected()) saveRow(r).then(() => setDbUI(true, 'actualizado'));
}

// ================== Render ==================
function render() {
  const list = getFilteredSorted();
  const total = list.length;

  tbody.innerHTML = list.map((r, i) => {
    const kind = KIND_BY_LABEL(r.tipo);
    const rowClass = kind === 2 ? 'type-2' : 'type-3';
    const selClass = kind === 2 ? 't2' : 't3';
    const nDesc = total - i;

    const emailHtml = r.email
      ? `<span class="copy-mail" data-email="${esc(r.email)}" title="Copiar email">${esc(r.email)}</span>`
      : '';

    const waDigits = digitsOnly(r.whatsapp);
    const waHtml = waDigits
      ? `<span class="copy-wa" data-wa="${waDigits}" title="Copiar WhatsApp y usar en Link rápido">${esc(waDigits)}</span>`
      : '';

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
        <td class="editable" contenteditable="true" data-id="${r.id}" data-field="comentario">${esc(r.comentario)}</td>
        <td><button class="btn" data-del="${r.id}">Eliminar</button></td>
      </tr>
    `;
  }).join('');

  // Copiar email al click
  tbody.querySelectorAll('.copy-mail').forEach(el => {
    el.addEventListener('click', async () => {
      const mail = el.getAttribute('data-email') || '';
      if (!mail) return;
      await copyToClipboard(mail);
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 800);
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

  // Eliminar
  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = +btn.dataset.del;
      rows = rows.filter(r => r.id !== id);
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
  tbody.querySelectorAll('td.editable').forEach(td => {
    const commit = () => {
      const id = +td.dataset.id;
      const field = td.dataset.field;   // "comentario"
      const val = (td.textContent || '').trim();
      updateField(id, field, val);
    };
    td.addEventListener('blur', commit);
    td.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
        td.blur();
      }
    });
  });

  // === Contadores: SOLO HOY (zona Lima) ===
  const today = ymdLima();
  const todayRows = rows.filter(r => (r.fecha || '').slice(0, 10) === today);
  const c2 = todayRows.filter(r => r.tipo === TYPES[2]).length;
  const c3 = todayRows.filter(r => r.tipo === TYPES[3]).length;
  counters[2].textContent = c2;
  counters[3].textContent = c3;
  counters.t.textContent = todayRows.length;

  // === Contadores por estado (totales) ===
  if (cPendingEl) cPendingEl.textContent = rows.filter(r => !r.estado).length;
  if (cDoneEl) cDoneEl.textContent = rows.filter(r => r.estado).length;

  thDate.textContent = sortDesc ? 'Fecha ▼' : 'Fecha ▲';
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
$('#clearForms').addEventListener('click', () => {
  ['2', '3'].forEach(k => {
    $(`#em${k}`).value = '';
    $(`#wa${k}`).value = '';
    $(`#co${k}`).value = '';
  });
});

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
  t = setTimeout(() => { q = qInp.value || ''; render(); }, 80);
});

qInp.addEventListener('paste', (e) => {
  const txt = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  if (isPhoneLike(txt)) {
    e.preventDefault();
    qInp.setRangeText(digitsOnly(txt), qInp.selectionStart, qInp.selectionEnd, 'end');
    qInp.dispatchEvent(new Event('input'));
  }
});

$('#clearQ').addEventListener('click', () => { q = ''; qInp.value = ''; render(); });

// Filtro por estado (persistente)
if (stateSel) {
  stateSel.addEventListener('change', () => {
    filterState = stateSel.value;
    try { localStorage.setItem(LS_FILTER, filterState); } catch { }
    render();
  });
}

// CSV & carpeta
$('#downloadCSV').addEventListener('click', downloadCSV);
// Config DB
btnConfigDB?.addEventListener('click', () => {
  neonUrlInp.value = getConnectionString();
  dlgConfig.showModal();
});
configCancel?.addEventListener('click', () => dlgConfig.close());
configSave?.addEventListener('click', async () => {
  const url = neonUrlInp.value.trim();
  if (!url) return;
  await setConnectionString(url);
  const ok = await initDB();
  if (ok) {
    setDbUI(true, 'Conectado');
    dlgConfig.close();

    // Cargar nota inicial de DB
    try {
      const n = await getNote();
      if (n) {
        notesArea.value = n;
        localStorage.setItem(NOTES_KEY, n);
        notesStatus.textContent = 'Cargado de DB.';
      }
    } catch (e) { console.warn('Init note error', e); }

    await reloadFromDb();
    startAutoSync();
  } else {
    setStatus('Error al conectar con Neon', false);
  }
});

// Sincronizar
btnSync?.addEventListener('click', async () => {
  if (!isDbConnected()) {
    setStatus('Primero configura la DB', false);
    return;
  }
  await reloadFromDb();
});

// Migrar CSV
btnMigrateCsv?.addEventListener('click', async () => {
  if (!isDbConnected()) {
    alert('Primero conecta la DB arriba.');
    return;
  }
  const file = csvUpload.files[0];
  if (!file) {
    alert('Selecciona un archivo .csv primero');
    return;
  }

  try {
    const text = await file.text();
    const rawRows = parseCSV(text);
    if (!rawRows.length) {
      alert('El CSV está vacío o no se pudo leer.');
      return;
    }

    // Sanear y convertir
    const cleanRows = rawRows.map((it, idx) => sanitizeRow(coerceFromAny(it, idx), idx));

    const ok = confirm(`Se encontraron ${cleanRows.length} filas. ¿Subir a Neon DB? (Esto puede tardar unos segundos)`);
    if (!ok) return;

    setStatus('Subiendo datos...', true);
    await bulkUpsert(cleanRows);
    setStatus('Migración completada', true);
    alert('Migración exitosa. Se recargarán los datos.');

    dlgConfig.close();
    await reloadFromDb('migrado');

  } catch (e) {
    console.error('Error migración:', e);
    alert('Error al migrar: ' + e.message);
  }

});

// Forzar subida de local a DB (reparación)
$('#btnPushLocal')?.addEventListener('click', async () => {
  if (!isDbConnected()) {
    alert('Primero conecta la DB arriba.');
    return;
  }
  const ok = confirm(`¿Seguro que deseas subir ${rows.length} registros locales a Neon DB?\nEsto sobrescribirá los datos en la nube con lo que ves aquí.`);
  if (!ok) return;

  try {
    setStatus('Subiendo datos...', true);
    await bulkUpsert(rows);
    setStatus('Subida forzada completada', true);
    alert('Datos subidos correctamente. Ahora otros navegadores deberían ver estos datos al recargar/sincronizar.');
    dlgConfig.close();
  } catch (e) {
    console.error('Error push local:', e);
    alert('Error al subir: ' + e.message);
  }
});

// Botón "Limpiar todo" — borra todas las actividades + sincroniza CSV
clearAllBtn?.addEventListener('click', async () => {
  if (!rows.length) {
    setStatus('No hay actividades para limpiar', false);
    return;
  }
  const ok = confirm(
    'Esto eliminará TODAS las actividades y sobrescribirá activities.csv con un archivo vacío.\n\n¿Seguro que deseas continuar?'
  );
  if (!ok) return;

  rows = [];
  saveLocal();
  buildDir();
  render();

  if (isDbConnected()) {
    try {
      await deleteAll();
      setDbUI(true, 'DB vacía');
      setStatus('Actividades limpiadas en DB', true);
    } catch (e) {
      console.error('Error al limpiar DB:', e);
      setStatus('Error al limpiar DB', false);
    }
  } else {
    setStatus('Actividades limpiadas (solo local)', true);
  }
});

// Ordenar por fecha
thDate.addEventListener('click', () => { sortDesc = !sortDesc; render(); });

// ====== WhatsApp quick tool ======
const waQuick = $('#waQuick');
const waCopy = $('#waCopy');
const waOpen = $('#waOpen');
const waClear = $('#waClear');

function clearWaQuickHighlight() {
  waQuick?.classList.remove('picked');
  if (lastPickedWaEl) {
    lastPickedWaEl.classList.remove('picked');
    lastPickedWaEl = null;
  }
}

// usado al hacer click en un número de la tabla
function setQuickWaFromTable(num, el) {
  if (waQuick) {
    waQuick.value = digitsOnly(num);
    waQuick.classList.add('picked');
  }
  if (lastPickedWaEl) lastPickedWaEl.classList.remove('picked');
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
    window.open(link, '_blank', 'noopener,noreferrer');
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

async function saveNotes() {
  const txt = notesArea.value || '';
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

try {
  notesArea.value = localStorage.getItem(NOTES_KEY) || '';
  notesStatus.textContent = 'Cargado.';
} catch { }
notesArea.addEventListener('focus', () => {
  if ((notesArea.value || '').trim() === '') {
    notesArea.value = '- ';
    const pos = notesArea.value.length;
    notesArea.setSelectionRange(pos, pos);
    saveNotesDebounced();
  }
});
notesArea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const ta = notesArea;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);

    const insert = '\n- ';
    ta.value = before + insert + after;

    const pos = before.length + insert.length;
    ta.setSelectionRange(pos, pos);

    // Guardar inmediatamente
    setTimeout(saveNotes, 10);
  }
});
notesArea.addEventListener('paste', (e) => {
  const data = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  if (!data) return;

  if (data.includes('\n')) {
    e.preventDefault();

    const bullet = (s) => {
      const clean = s.replace(/^\s*-\s?/, '');
      return '- ' + clean;
    };
    const bulletText = data.replace(/\r/g, '').split('\n').map(bullet).join('\n');

    const ta = notesArea;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    ta.value = ta.value.slice(0, start) + bulletText + ta.value.slice(end);
    const pos = start + bulletText.length;
    ta.setSelectionRange(pos, pos);

    saveNotesDebounced();
  }
});
notesArea.addEventListener('input', saveNotesDebounced);

// ====== Recargar CSV desde la conexión actual (carpeta o archivo) ======
// ====== Recargar desde DB ======
async function reloadFromDb(note = 'sincronizado') {
  if (!isDbConnected()) return;

  // Evitar recarga si el usuario está editando
  if (document.activeElement && document.activeElement.closest('td.editable')) {
    return;
  }

  try {
    // 1. Sync Notas (si no está escribiendo en ellas)
    if (note === 'auto-sync' && document.activeElement !== notesArea) {
      try {
        const serverNote = await getNote();
        if (serverNote !== notesArea.value) {
          notesArea.value = serverNote;
          localStorage.setItem(NOTES_KEY, serverNote);
          notesStatus.textContent = 'Sincronizado ' + new Date().toLocaleTimeString();
        }
      } catch (e) { console.warn('Error syncing notes', e); }
    }

    // 2. Sync Tabla
    let arr = await fetchAll();
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
        // Si ya existe, podríamos sobreescribir o ignorar. 
        // Sobreescribir parece mejor para traer novedades.
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
  // 2) Intentar conectar DB si hay string guardado
  if (getConnectionString()) {
    const ok = await initDB();
    if (ok) {
      setDbUI(true, 'Conectado auto');

      // Cargar nota inicial de DB
      try {
        const n = await getNote();
        if (n) {
          notesArea.value = n;
          localStorage.setItem(NOTES_KEY, n);
          notesStatus.textContent = 'Cargado de DB.';
        }
      } catch (e) { console.warn('Init note error', e); }

      await reloadFromDb();
      startAutoSync(); // Iniciar polling
    } else {
      setDbUI(false, 'Error conexión');
    }
  }
})();
