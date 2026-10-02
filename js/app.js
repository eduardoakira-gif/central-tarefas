/*
 * app.js
 * Ponto de entrada.
 * - Sem ?c= no endereço: página inicial (criar central ou abrir uma existente).
 * - Com ?c=CODIGO: abre a central, sincronizada com o servidor.
 */
import { api, apiConfigured } from './api.js';
import { Local, Prefs, createBackup, parseBackup, mergeAreas, remapTasks } from './storage.js';
import { Sync } from './sync.js';
import { Tasks } from './tasks.js';
import { Notes } from './notes.js';
import { Notifier } from './notifications.js';
import * as UI from './ui.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const esc = UI.esc;

const state = {
  centralId: null,
  route: 'tasks',
  noteId: null,
  filter: { status: 'all', area: null, query: '', owner: '' },
  history: { query: '', area: '', tab: 'done' },
  notesQuery: '',
  agendaOffset: 0,
  reportDays: 30,
  editingId: null,
  waitingId: null,
  formChecklist: [],
  review: null,
  ai: null, // true/false quando souber
  installPrompt: null,
  lastDateKey: C.toDateKey(new Date()),
  areasKey: '',
  landingAreas: [],
  bound: false,
};

const baseUrl = () => location.origin + location.pathname;
const centralUrl = (id) => baseUrl() + '?c=' + encodeURIComponent(id);
const areas = () => (Sync.central ? Sync.central.areas : []);
const people = () => (Sync.central && Sync.central.people) || [];
const settings = () => C.mergeSettings(Sync.central && Sync.central.settings);

// -----------------------------------------------------------------------------
// Utilidades de interface
// -----------------------------------------------------------------------------
function toast(message, action) {
  const box = $('#toasts');
  box.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.onclick = () => {
      action.fn();
      el.remove();
    };
    el.appendChild(b);
  }
  box.appendChild(el);
  setTimeout(() => el.classList.add('is-leaving'), 5200);
  setTimeout(() => el.remove(), 5600);
}

function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = true }) {
  const dlg = $('#confirmDialog');
  $('#confirmTitle').textContent = title;
  $('#confirmMsg').textContent = message;
  const ok = $('#confirmOk');
  ok.textContent = confirmLabel;
  ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Link copiado');
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  Prefs.setTheme(theme);
  $$('input[name="theme"]').forEach((r) => (r.checked = r.value === theme));
}

function showScreen(name) {
  document.body.dataset.screen = name; // landing | app | message | pin
  $('#landing').hidden = name !== 'landing';
  $('#appShell').hidden = name !== 'app';
  $('#messageScreen').hidden = name !== 'message';
  $('#pinScreen').hidden = name !== 'pin';
}

function showMessage(title, text, actions = '') {
  $('#messageTitle').textContent = title;
  $('#messageText').textContent = text;
  $('#messageActions').innerHTML = actions;
  showScreen('message');
}

function busy(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = label;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

// -----------------------------------------------------------------------------
// Página inicial
// -----------------------------------------------------------------------------
function renderLandingAreas() {
  $('#landingAreaList').innerHTML = state.landingAreas.length
    ? state.landingAreas
        .map(
          (a, i) => `<span class="area-chip" style="--area:${a.color}"><i></i>${esc(a.name)}
            <button type="button" data-remove-area="${i}" aria-label="Remover ${esc(a.name)}">×</button></span>`
        )
        .join('')
    : '<span class="hint">Nenhuma área ainda. Adicione pelo menos uma.</span>';
}

function addLandingArea() {
  const input = $('#landingAreaInput');
  const name = input.value.trim();
  if (!name) return;
  if (state.landingAreas.length >= 20) return toast('Use no máximo 20 áreas.');
  if (state.landingAreas.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
    input.value = '';
    return;
  }
  state.landingAreas.push({ id: C.newAreaId(), name: name.slice(0, 40), color: C.nextAreaColor(state.landingAreas) });
  input.value = '';
  input.focus();
  renderLandingAreas();
}

async function showLanding() {
  showScreen('landing');
  document.title = 'Central de tarefas';
  $('#landingConfigWarning').hidden = apiConfigured();

  const recent = Prefs.recent();
  $('#recentBox').hidden = !recent.length;
  $('#recentList').innerHTML = recent
    .map((r) => `<a class="recent-item" href="${esc(centralUrl(r.id))}"><span>${esc(r.name)}</span><span class="recent-arrow" aria-hidden="true">›</span></a>`)
    .join('');

  const legacy = Prefs.legacyImported() ? [] : await Local.legacyTasks();
  $('#legacyRow').hidden = !legacy.length;
  $('#legacyCount').textContent = legacy.length;
  if (legacy.length && !state.landingAreas.length) {
    const used = new Set(legacy.map((t) => t.area));
    state.landingAreas = C.LEGACY_AREAS.filter((a) => used.has(a.id)).map((a) => Object.assign({}, a));
  }
  renderLandingAreas();

  $('#landingAreaAdd').onclick = addLandingArea;
  $('#landingAreaInput').onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLandingArea();
    }
  };
  $('#landingAreaList').onclick = (e) => {
    const b = e.target.closest('[data-remove-area]');
    if (!b) return;
    state.landingAreas.splice(Number(b.dataset.removeArea), 1);
    renderLandingAreas();
  };

  $('#createForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#landingName').value.trim();
    const err = $('#createError');
    err.hidden = true;
    if ($('#landingAreaInput').value.trim()) addLandingArea();
    if (!name) {
      err.textContent = 'Dê um nome para a sua central.';
      err.hidden = false;
      return $('#landingName').focus();
    }
    if (!state.landingAreas.length) {
      err.textContent = 'Adicione pelo menos uma área.';
      err.hidden = false;
      return $('#landingAreaInput').focus();
    }
    const btn = $('#createBtn');
    busy(btn, true, 'Criando…');
    try {
      const { central } = await api('create', { name, areas: state.landingAreas });
      if (!$('#legacyRow').hidden && $('#legacyImport').checked) {
        const used = new Set(legacy.map((t) => t.area));
        const { areas: merged, map } = mergeAreas(central.areas, C.LEGACY_AREAS.filter((a) => used.has(a.id)));
        if (merged.length !== central.areas.length) await api('updateCentral', { centralId: central.id, patch: { areas: merged } });
        await api('replaceData', { centralId: central.id, tasks: remapTasks(legacy, map, merged.map((a) => a.id)) });
        Prefs.setLegacyImported();
      }
      sessionStorage.setItem('ct-new', central.id);
      location.href = centralUrl(central.id);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      busy(btn, false);
    }
  };

  $('#openForm').onsubmit = (e) => {
    e.preventDefault();
    const v = $('#openInput').value.trim();
    let id = v;
    try {
      id = new URL(v).searchParams.get('c') || v;
    } catch {}
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return toast('Cole o link completo da central.');
    location.href = centralUrl(id);
  };
}

// -----------------------------------------------------------------------------
// Renderização da central
// -----------------------------------------------------------------------------
function renderOwnerFilter() {
  const owners = Tasks.owners();
  const sel = $('#ownerFilter');
  sel.hidden = !owners.length;
  if (state.filter.owner && !owners.some((o) => o.toLowerCase() === state.filter.owner.toLowerCase())) state.filter.owner = '';
  sel.innerHTML =
    '<option value="">Todos os responsáveis</option>' +
    owners.map((o) => `<option value="${esc(o)}"${o === state.filter.owner ? ' selected' : ''}>${esc(o)}</option>`).join('');
  $('#ownersList').innerHTML = owners.map((o) => `<option value="${esc(o)}"></option>`).join('');
}

function renderTasks() {
  const now = new Date();
  renderOwnerFilter();
  const d = UI.renderDashboard(Tasks.all(), state.filter, now, areas());
  $('#summary').textContent = d.summary;
  const dateText = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#todayDate').textContent = dateText.charAt(0).toUpperCase() + dateText.slice(1);
  $('#progressCard').innerHTML = d.progress;
  $('#stats').innerHTML = d.statCards;
  $('#areas').innerHTML = d.areas;
  $('#statusFilters').innerHTML = d.chips;
  const bar = $('#filterBar');
  bar.innerHTML = d.filterBar;
  bar.hidden = !d.filterBar;
  $('#taskList').innerHTML = d.list;
  document.title = (d.stats.overdue ? `(${d.stats.overdue}) ` : '') + Sync.central.name;
}

function renderHistory() {
  const trash = Tasks.trash();
  $('#trashCount').textContent = trash.length || '';
  $$('[data-history-tab]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.historyTab === state.history.tab));
  $('.toolbar-history', $('[data-view="history"]')).hidden = state.history.tab === 'trash';
  $('#historyList').innerHTML =
    state.history.tab === 'trash'
      ? UI.renderTrash(trash, new Date(), areas())
      : UI.renderHistory(Tasks.all(), state.history, new Date(), areas());
}

function renderNotesList() {
  $('#notesList').innerHTML = UI.renderNotesList(Notes.all(), Sync.tasks, state.notesQuery);
}

function renderNote() {
  const n = Notes.get(state.noteId);
  if (!n) {
    location.hash = '#/notas';
    return;
  }
  const editing = document.activeElement && document.activeElement.closest('.note-editor') && !document.activeElement.closest('#noteTasks');
  if (!editing) {
    $('#noteTitle').value = n.title;
    $('#noteDate').value = n.date;
    $('#noteParticipants').value = n.participants;
    $('#noteBody').value = n.body;
  }
  const list = Tasks.all().filter((t) => t.noteId === n.id);
  const areaMap = UI.areaMapOf(areas());
  $('#noteTasks').innerHTML = list.length
    ? UI.section('note', 'Tarefas criadas desta reunião', C.sortTasks(list.filter((t) => t.status !== 'done'), new Date()).concat(list.filter((t) => t.status === 'done')), new Date(), areaMap)
    : '';
  document.title = (n.title || 'Nota') + ' · ' + Sync.central.name;
}

function renderAgenda() {
  $('#agendaList').innerHTML = UI.renderAgenda(Tasks.all(), new Date(), areas(), state.agendaOffset);
}

function renderReport() {
  $('#reportBody').innerHTML = UI.renderReport(Tasks.all(), new Date(), areas(), state.reportDays);
}

function renderHeader() {
  $('#brandName').textContent = Sync.central.name;
  $('#centralTitle').textContent = Sync.central.name;
}

function renderAll() {
  renderHeader();
  refreshAreaControls();
  const r = state.route;
  if (r === 'tasks') renderTasks();
  if (r === 'history') renderHistory();
  if (r === 'notes') renderNotesList();
  if (r === 'note') renderNote();
  if (r === 'agenda') renderAgenda();
  if (r === 'report') renderReport();
  if (r === 'settings') renderSettings();
  if ($('#taskDialog').open && state.editingId) renderComments();
}

const STATUS_TEXT = { saved: 'Sincronizado', saving: 'Salvando…', offline: 'Offline', error: 'Erro ao sincronizar', idle: '' };
function renderSyncStatus(status, err) {
  const el = $('#syncStatus');
  el.dataset.status = status;
  el.querySelector('span').textContent = STATUS_TEXT[status] || '';
  el.title =
    status === 'offline'
      ? 'Sem conexão. As alterações ficam salvas neste dispositivo e serão enviadas quando a conexão voltar.'
      : status === 'error'
        ? (err && err.message) || 'Erro ao sincronizar'
        : STATUS_TEXT[status];
  if (state.route === 'note') $('#noteSaved').textContent = status === 'saving' ? 'Salvando…' : status === 'saved' ? 'Salvo' : STATUS_TEXT[status];
}

// -----------------------------------------------------------------------------
// Rotas
// -----------------------------------------------------------------------------
const ROUTES = { '/historico': 'history', '/config': 'settings', '/notas': 'notes', '/agenda': 'agenda', '/relatorio': 'report' };

function route() {
  const hash = location.hash.replace(/^#/, '');
  if (hash === '/nova') {
    history.replaceState(null, '', location.pathname + location.search + '#/');
    state.route = 'tasks';
    showView();
    openTaskDialog();
    return;
  }
  const m = hash.match(/^\/notas\/([\w-]+)$/);
  if (m) {
    state.route = 'note';
    state.noteId = m[1];
  } else {
    state.route = ROUTES[hash] || 'tasks';
    state.noteId = null;
  }
  showView();
}

function showView() {
  $$('.view').forEach((v) => (v.hidden = v.dataset.view !== state.route));
  const navRoute = state.route === 'note' ? 'notes' : state.route === 'report' && innerWidth <= 720 ? 'settings' : state.route;
  $$('.nav a, .bottom-nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.route === navRoute ? 'page' : 'false'));
  document.body.dataset.route = state.route;
  renderAll();
  window.scrollTo(0, 0);
  if (state.route === 'note') {
    const n = Notes.get(state.noteId);
    if (n && !n.body && !n.title) setTimeout(() => $('#noteTitle').focus(), 50);
  }
}

// -----------------------------------------------------------------------------
// Formulário de tarefa
// -----------------------------------------------------------------------------
function refreshAreaControls() {
  const key = JSON.stringify(areas());
  if (key === state.areasKey) return;
  state.areasKey = key;
  const form = $('#taskForm');
  const current = form.area ? form.area.value : null;
  $('#fArea').innerHTML = areas()
    .map(
      (a) => `<label class="seg-opt" style="--area:${a.color}">
        <input type="radio" name="area" value="${esc(a.id)}"><span><i></i>${esc(a.name)}</span></label>`
    )
    .join('');
  if (current) setRadio(form, 'area', current);
  $('#historyArea').innerHTML =
    '<option value="">Todas as áreas</option>' + areas().map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  $('#historyArea').value = state.history.area;
  if (state.filter.area && !areas().some((a) => a.id === state.filter.area)) state.filter.area = null;
}

function buildStaticControls() {
  const radio = (name, list) =>
    list.map((o) => `<label class="seg-opt"><input type="radio" name="${name}" value="${o.id}"><span>${esc(o.name)}</span></label>`).join('');
  $('#fPriority').innerHTML = radio('priority', C.PRIORITIES.slice().reverse());
  $('#fStatus').innerHTML = radio('status', C.STATUSES);
}

function setRadio(form, name, value) {
  const el = form.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
  if (el) el.checked = true;
}

function toggleWaitingFields() {
  const form = $('#taskForm');
  const waiting = form.status.value === 'waiting';
  $('#waitingFields').hidden = !waiting;
  if (waiting && !form.waitingSince.value) form.waitingSince.value = C.toDateKey(new Date());
}

function renderChecklistEditor() {
  $('#fChecklist').innerHTML = state.formChecklist
    .map(
      (c, i) => `<div class="check-item">
        <input type="checkbox" data-check-index="${i}"${c.done ? ' checked' : ''} aria-label="Concluir etapa">
        <input class="input check-text" data-check-text="${i}" value="${esc(c.text)}" maxlength="200" aria-label="Etapa">
        <button type="button" class="icon-btn" data-check-remove="${i}" aria-label="Remover etapa">×</button>
      </div>`
    )
    .join('');
}

function addChecklistItem() {
  const input = $('#checklistInput');
  const text = input.value.trim();
  if (!text) return;
  state.formChecklist.push({ id: C.uid(), text, done: false });
  input.value = '';
  renderChecklistEditor();
  input.focus();
}

function renderComments() {
  const t = Tasks.get(state.editingId);
  $('#commentsBox').hidden = !t;
  if (!t) return;
  $('#commentsList').innerHTML = t.comments.length
    ? t.comments
        .map(
          (c) => `<div class="comment"><div class="comment-head"><span>${UI.dateTimeLabel(c.at)}</span>
            <button type="button" class="link-btn link-muted" data-comment-remove="${esc(c.id)}">Apagar</button></div>
            <p>${esc(c.text)}</p></div>`
        )
        .join('')
    : '<p class="hint">Nenhum comentário ainda.</p>';
}

async function openTaskDialog(id, prefill) {
  const form = $('#taskForm');
  const t = id ? Tasks.get(id) : null;
  state.editingId = t ? t.id : null;
  form.reset();
  $('#titleError').hidden = true;
  $('#taskDialogTitle').textContent = t ? 'Editar tarefa' : 'Nova tarefa';
  const device = await Local.loadDevice(state.centralId);
  const ids = areas().map((a) => a.id);
  const defaults = Object.assign(
    {
      area: state.filter.area || (ids.includes(device.lastArea) ? device.lastArea : ids[0]),
      priority: state.filter.status === 'urgent' ? 'urgent' : 'normal',
      status: ['pending', 'doing', 'waiting'].includes(state.filter.status) ? state.filter.status : 'pending',
      dueDate: state.filter.status === 'today' ? C.toDateKey(new Date()) : '',
      owner: state.filter.owner || '',
    },
    prefill || {}
  );
  const v = t || defaults;
  form.taskTitle.value = v.title || '';
  setRadio(form, 'area', ids.includes(v.area) ? v.area : defaults.area);
  setRadio(form, 'priority', v.priority || 'normal');
  setRadio(form, 'status', v.status || 'pending');
  form.dueDate.value = v.dueDate || '';
  form.dueTime.value = v.dueTime || '';
  form.recurrence.value = v.recurrence || '';
  ['description', 'owner', 'waitingFor', 'link', 'notes'].forEach((k) => (form[k].value = v[k] || ''));
  form.waitingSince.value = v.waitingSince || '';
  form.followUpDate.value = v.followUpDate || '';
  state.formChecklist = (v.checklist || []).map((c) => (typeof c === 'string' ? { id: C.uid(), text: c, done: false } : Object.assign({}, c)));
  renderChecklistEditor();
  toggleWaitingFields();
  $('#moreDetails').open = !!(v.description || v.owner || v.link || v.notes);
  $('#taskMeta').textContent = t
    ? 'Criada em ' + UI.dateTimeLabel(t.createdAt) + (t.completedAt ? '. Concluída em ' + UI.dateTimeLabel(t.completedAt) : '')
    : '';
  renderOwnerFilter();
  renderComments();
  $('#taskDialog').showModal();
  setTimeout(() => form.taskTitle.focus(), 30);
}

async function submitTaskForm(e) {
  e.preventDefault();
  const form = $('#taskForm');
  const title = form.taskTitle.value.trim();
  if (!title) {
    $('#titleError').hidden = false;
    form.taskTitle.focus();
    return;
  }
  if ($('#checklistInput').value.trim()) addChecklistItem();
  const recurrence = form.recurrence.value || null;
  let dueDate = form.dueDate.value || null;
  if (recurrence && !dueDate) dueDate = C.toDateKey(new Date());
  const data = {
    title,
    area: form.area.value,
    priority: form.priority.value,
    status: form.status.value,
    dueDate,
    dueTime: dueDate ? form.dueTime.value || null : null,
    recurrence,
    checklist: state.formChecklist.filter((c) => c.text.trim()),
    description: form.description.value.trim(),
    owner: form.owner.value.trim(),
    waitingFor: form.waitingFor.value.trim(),
    waitingSince: form.waitingSince.value || null,
    followUpDate: form.followUpDate.value || null,
    link: form.link.value.trim(),
    notes: form.notes.value.trim(),
  };
  if (data.status !== 'waiting' && !state.editingId) Object.assign(data, { waitingFor: '', waitingSince: null, followUpDate: null });
  if (state.editingId) {
    await Tasks.update(state.editingId, data);
    toast('Tarefa atualizada');
  } else {
    await Tasks.create(data);
    toast('Tarefa criada');
  }
  Local.patchDevice(state.centralId, { lastArea: data.area });
  $('#taskDialog').close();
}

function openWaitDialog(id) {
  const t = Tasks.get(id);
  if (!t) return;
  state.waitingId = id;
  const form = $('#waitForm');
  form.reset();
  $('#waitTaskTitle').textContent = t.title;
  form.waitingFor.value = t.waitingFor || '';
  form.waitingSince.value = t.waitingSince || C.toDateKey(new Date());
  form.followUpDate.value = t.followUpDate || '';
  $('#waitDialog').showModal();
  setTimeout(() => form.waitingFor.focus(), 30);
}

async function submitWaitForm(e) {
  e.preventDefault();
  const form = $('#waitForm');
  await Tasks.update(state.waitingId, {
    status: 'waiting',
    waitingFor: form.waitingFor.value.trim(),
    waitingSince: form.waitingSince.value || C.toDateKey(new Date()),
    followUpDate: form.followUpDate.value || null,
  });
  $('#waitDialog').close();
  toast('Marcada como aguardando retorno');
}

// -----------------------------------------------------------------------------
// Captura rápida com IA
// -----------------------------------------------------------------------------
async function quickCapture(e) {
  e.preventDefault();
  const input = $('#quickInput');
  const text = input.value.trim();
  if (!text) return input.focus();
  if (state.ai === false) {
    input.value = '';
    return openTaskDialog(null, { title: text });
  }
  const btn = $('#quickBtn');
  busy(btn, true, 'Lendo…');
  try {
    const s = await Notes.quick(text);
    input.value = '';
    if (!s) return openTaskDialog(null, { title: text });
    openTaskDialog(null, {
      title: s.title,
      description: s.description,
      area: s.areaId || undefined,
      priority: s.priority,
      status: s.status,
      dueDate: s.dueDate,
      dueTime: s.dueTime,
      owner: s.owner,
      waitingFor: s.waitingFor,
      checklist: s.checklist,
    });
  } catch (err) {
    if (err.code === 'ai_not_configured') state.ai = false;
    toast(err.code === 'ai_not_configured' ? 'IA não configurada. Abrindo o cadastro normal.' : err.message);
    input.value = '';
    openTaskDialog(null, { title: text });
  } finally {
    busy(btn, false);
  }
}

// -----------------------------------------------------------------------------
// Notas e revisão das tarefas sugeridas
// -----------------------------------------------------------------------------
let noteTimer = null;
function scheduleNoteSave() {
  $('#noteSaved').textContent = 'Editando…';
  clearTimeout(noteTimer);
  noteTimer = setTimeout(saveNoteNow, 600);
}
async function saveNoteNow() {
  clearTimeout(noteTimer);
  if (!state.noteId || !Notes.get(state.noteId)) return;
  await Notes.update(state.noteId, {
    title: $('#noteTitle').value,
    date: $('#noteDate').value || C.toDateKey(new Date()),
    participants: $('#noteParticipants').value,
    body: $('#noteBody').value,
  });
}

async function extractTasks() {
  await saveNoteNow();
  const note = Notes.get(state.noteId);
  if (!note || note.body.trim().length < 10) return toast('Escreva a anotação antes de gerar as tarefas.');
  const btn = $('#extractBtn');
  busy(btn, true, 'Analisando a reunião…');
  try {
    const suggestions = await Notes.extract(note);
    if (!suggestions.length) return toast('A IA não encontrou tarefas nesta anotação.');
    state.review = { noteId: note.id, items: suggestions.map((s) => Object.assign({ include: true }, s)) };
    renderReview();
    $('#reviewDialog').showModal();
  } catch (err) {
    toast(err.code === 'ai_not_configured' ? 'A IA ainda não foi configurada no servidor. Veja o README.' : err.message);
  } finally {
    busy(btn, false);
  }
}

function renderReview() {
  const r = state.review;
  const areaOpts = (s) => {
    let html = areas().map((a) => `<option value="${esc(a.id)}"${a.id === s.areaId ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
    if (!s.areaId && s.newArea) html = `<option value="new:${esc(s.newArea)}" selected>Nova área: ${esc(s.newArea)}</option>` + html;
    return html;
  };
  const prioOpts = (v) => C.PRIORITIES.map((p) => `<option value="${p.id}"${p.id === v ? ' selected' : ''}>${p.name}</option>`).join('');
  $('#reviewList').innerHTML = r.items
    .map(
      (s, i) => `<div class="review-item${s.include ? '' : ' is-off'}" data-review="${i}">
        <label class="review-check"><input type="checkbox" data-review-include${s.include ? ' checked' : ''} aria-label="Criar esta tarefa"></label>
        <div class="review-body">
          <input class="input review-title" data-f="title" value="${esc(s.title)}" maxlength="200" aria-label="Título">
          <div class="review-fields">
            <label><span>Área</span><select class="select select-sm" data-f="area">${areaOpts(s)}</select></label>
            <label><span>Prioridade</span><select class="select select-sm" data-f="priority">${prioOpts(s.priority)}</select></label>
            <label><span>Status</span><select class="select select-sm" data-f="status">
              <option value="pending"${s.status !== 'waiting' ? ' selected' : ''}>Pendente</option>
              <option value="waiting"${s.status === 'waiting' ? ' selected' : ''}>Aguardando retorno</option></select></label>
            <label><span>Prazo</span><input type="date" class="input input-sm" data-f="dueDate" value="${s.dueDate || ''}"></label>
            <label><span>Responsável</span><input class="input input-sm" data-f="owner" value="${esc(s.owner)}" list="ownersList" placeholder="Você"></label>
            <label><span>Aguardando</span><input class="input input-sm" data-f="waitingFor" value="${esc(s.waitingFor)}" placeholder="Pessoa ou empresa"></label>
          </div>
          ${s.description ? `<p class="review-desc">${esc(s.description)}</p>` : ''}
          ${s.checklist.length ? `<p class="review-desc">Checklist: ${s.checklist.map(esc).join(' · ')}</p>` : ''}
        </div>
      </div>`
    )
    .join('');
  updateReviewCount();
}

function updateReviewCount() {
  const n = $$('#reviewList [data-review-include]').filter((c) => c.checked).length;
  $('#reviewSubmit').textContent = n === 1 ? 'Criar 1 tarefa' : `Criar ${n} tarefas`;
  $('#reviewSubmit').disabled = n === 0;
  const newAreas = new Set(
    $$('#reviewList .review-item')
      .filter((el) => el.querySelector('[data-review-include]').checked)
      .map((el) => el.querySelector('[data-f="area"]').value)
      .filter((v) => v.startsWith('new:'))
  );
  $('#reviewMeta').textContent = newAreas.size ? `Vai criar ${newAreas.size === 1 ? '1 área nova' : newAreas.size + ' áreas novas'}.` : '';
}

async function submitReview(e) {
  e.preventDefault();
  const r = state.review;
  const note = Notes.get(r.noteId);
  const rows = $$('#reviewList .review-item').filter((el) => el.querySelector('[data-review-include]').checked);
  const btn = $('#reviewSubmit');
  busy(btn, true, 'Criando…');
  try {
    // áreas novas aprovadas
    const list = areas().map((a) => Object.assign({}, a));
    const newAreaIds = {};
    for (const el of rows) {
      const v = el.querySelector('[data-f="area"]').value;
      if (!v.startsWith('new:')) continue;
      const name = v.slice(4).trim().slice(0, 40);
      const existing = list.find((a) => a.name.toLowerCase() === name.toLowerCase());
      if (existing) newAreaIds[v] = existing.id;
      else if (list.length < 20) {
        const a = { id: C.newAreaId(), name, color: C.nextAreaColor(list) };
        list.push(a);
        newAreaIds[v] = a.id;
      } else newAreaIds[v] = list[0].id;
    }
    if (list.length !== areas().length) await Sync.patchCentral({ areas: list });

    const created = [];
    for (const el of rows) {
      const i = Number(el.dataset.review);
      const s = r.items[i];
      const f = (k) => el.querySelector(`[data-f="${k}"]`).value.trim();
      const areaVal = f('area');
      const status = f('status');
      const dueDate = f('dueDate') || null;
      const t = await Tasks.create({
        title: f('title') || s.title,
        description: s.description,
        area: newAreaIds[areaVal] || areaVal,
        priority: f('priority'),
        status,
        dueDate,
        dueTime: dueDate ? s.dueTime : null,
        owner: f('owner'),
        waitingFor: f('waitingFor'),
        waitingSince: status === 'waiting' ? note ? note.date : C.toDateKey(new Date()) : null,
        checklist: s.checklist.map((text) => ({ text, done: false })),
        noteId: r.noteId,
      });
      created.push(t.id);
    }
    if (note) await Notes.update(note.id, { taskIds: note.taskIds.concat(created) });
    $('#reviewDialog').close();
    toast(created.length === 1 ? '1 tarefa criada' : `${created.length} tarefas criadas`);
  } catch (err) {
    toast(err.message);
  } finally {
    busy(btn, false);
    updateReviewCount();
  }
}

// -----------------------------------------------------------------------------
// Ações
// -----------------------------------------------------------------------------
async function handleAction(action, id, el) {
  const t = id ? Tasks.get(id) : null;
  switch (action) {
    case 'new':
      return openTaskDialog();
    case 'edit':
      return openTaskDialog(id);
    case 'wait':
      return openWaitDialog(id);
    case 'complete': {
      const prevStatus = t.status;
      const { next } = await Tasks.complete(id);
      if (next) toast(`Concluída. Próxima: ${UI.relativeDay(next.dueDate, new Date())}`, {
        label: 'Desfazer',
        fn: async () => {
          await Tasks.purge(next.id);
          await Tasks.update(id, { status: prevStatus, recurrence: next.recurrence });
        },
      });
      else toast('Tarefa concluída', { label: 'Desfazer', fn: () => Tasks.restore(id) });
      return;
    }
    case 'restore':
      await Tasks.restore(id);
      return toast('Tarefa restaurada');
    case 'delete':
      await Tasks.remove(id);
      return toast('Tarefa movida para a lixeira', { label: 'Desfazer', fn: () => Tasks.restoreFromTrash(id) });
    case 'untrash':
      await Tasks.restoreFromTrash(id);
      return toast('Tarefa restaurada da lixeira');
    case 'purge': {
      const ok = await confirmDialog({
        title: 'Excluir definitivamente?',
        message: `“${t.title}” será apagada de vez. Essa ação não pode ser desfeita.`,
        confirmLabel: 'Excluir',
      });
      if (ok) {
        await Tasks.purge(id);
        toast('Tarefa excluída definitivamente');
      }
      return;
    }
    case 'empty-trash': {
      const n = Tasks.trash().length;
      const ok = await confirmDialog({ title: 'Esvaziar a lixeira?', message: `${n} ${n === 1 ? 'tarefa será apagada' : 'tarefas serão apagadas'} de vez.`, confirmLabel: 'Esvaziar' });
      if (ok) {
        await Tasks.emptyTrash();
        toast('Lixeira esvaziada');
      }
      return;
    }
    case 'clear-filters':
      state.filter = { status: 'all', area: null, query: '', owner: '' };
      $('#search').value = '';
      return renderTasks();
    case 'new-note': {
      const n = await Notes.create({ date: C.toDateKey(new Date()) });
      location.hash = '#/notas/' + n.id;
      return;
    }
    case 'open-note': {
      const nid = el.dataset.noteId;
      if (!Notes.get(nid)) return toast('A nota de origem foi excluída.');
      if ($('#taskDialog').open) $('#taskDialog').close();
      location.hash = '#/notas/' + nid;
      return;
    }
    case 'delete-note': {
      const ok = await confirmDialog({
        title: 'Excluir esta nota?',
        message: 'A anotação será apagada. As tarefas criadas a partir dela continuam na lista.',
        confirmLabel: 'Excluir nota',
      });
      if (!ok) return;
      clearTimeout(noteTimer);
      await Notes.remove(state.noteId);
      location.hash = '#/notas';
      return toast('Nota excluída');
    }
    case 'extract':
      return extractTasks();
    case 'copy-link':
      return copyText(centralUrl(state.centralId));
    case 'share-link':
      if (navigator.share) {
        try {
          await navigator.share({ title: Sync.central.name, url: centralUrl(state.centralId) });
        } catch {}
      } else copyText(centralUrl(state.centralId));
      return;
    case 'area-color': {
      const aid = el.closest('[data-area-id]').dataset.areaId;
      const list = areas().map((a) => Object.assign({}, a));
      const a = list.find((x) => x.id === aid);
      const i = C.AREA_COLORS.indexOf(a.color);
      a.color = C.AREA_COLORS[(i + 1) % C.AREA_COLORS.length];
      return Sync.patchCentral({ areas: list });
    }
    case 'area-delete':
      return deleteArea(el.closest('[data-area-id]').dataset.areaId);
    case 'area-add':
      return addArea();
    case 'person-add':
      return addPerson();
    case 'person-remove':
      return Sync.patchCentral({ people: people().filter((p) => p.id !== el.dataset.personId) });
    case 'pin-set':
      $('#newPinInput').value = '';
      $('#newPinError').hidden = true;
      $('#pinDialogTitle').textContent = Sync.central.hasPin ? 'Trocar PIN' : 'Criar PIN';
      $('#pinDialog').showModal();
      setTimeout(() => $('#newPinInput').focus(), 30);
      return;
    case 'pin-remove': {
      const ok = await confirmDialog({ title: 'Remover o PIN?', message: 'Qualquer pessoa com o link vai conseguir abrir a central.', confirmLabel: 'Remover PIN' });
      if (!ok) return;
      try {
        await Sync.call('setPin', { newPin: '' });
        await Sync.setPin(null);
        Sync.central = Object.assign({}, Sync.central, { hasPin: false });
        await Local.saveCache(state.centralId, Sync.central, Sync.tasks, Sync.notes);
        toast('PIN removido');
        renderSettings();
      } catch (err) {
        toast(err.message);
      }
      return;
    }
    case 'rotate-link':
      return rotateLink();
    case 'notif-enable':
      return enableNotifications();
    case 'notif-disable':
      await Notifier.disable(state.centralId);
      toast('Notificações desativadas neste dispositivo');
      return renderSettings();
    case 'notif-test':
      try {
        const mode = await Notifier.test(state.centralId, Sync.central, Tasks.all());
        toast(mode === 'push' ? 'Teste enviado pelo servidor' : 'Notificação de teste enviada');
      } catch (err) {
        toast(err.message);
      }
      return;
    case 'install':
      if (!state.installPrompt) return;
      state.installPrompt.prompt();
      await state.installPrompt.userChoice.catch(() => {});
      state.installPrompt = null;
      return renderSettings();
    case 'export':
      return exportBackup();
    case 'import':
      return $('#importFile').click();
    case 'import-legacy':
      return importLegacy();
    case 'retry':
      return location.reload();
  }
}

async function handleQuickChange(el) {
  const card = el.closest('[data-id]');
  if (!card) return;
  const id = card.dataset.id;
  const field = el.dataset.quick;
  if (field === 'status') {
    if (el.value === 'waiting') {
      renderAll();
      return openWaitDialog(id);
    }
    if (el.value === 'done') return handleAction('complete', id, el);
    return Tasks.update(id, { status: el.value });
  }
  if (field === 'priority') return Tasks.update(id, { priority: el.value });
  if (field === 'dueDate') return Tasks.update(id, { dueDate: el.value || null, ...(el.value ? {} : { dueTime: null }) });
}

// -----------------------------------------------------------------------------
// Áreas, equipe, PIN e link
// -----------------------------------------------------------------------------
async function addArea() {
  const input = $('#newAreaInput');
  const name = input.value.trim();
  if (!name) return;
  const list = areas().map((a) => Object.assign({}, a));
  if (list.length >= 20) return toast('Use no máximo 20 áreas.');
  if (list.some((a) => a.name.toLowerCase() === name.toLowerCase())) return toast('Já existe uma área com esse nome.');
  list.push({ id: C.newAreaId(), name: name.slice(0, 40), color: C.nextAreaColor(list) });
  input.value = '';
  await Sync.patchCentral({ areas: list });
  toast('Área adicionada');
}

async function renameArea(id, name) {
  name = name.trim().slice(0, 40);
  const list = areas().map((a) => Object.assign({}, a));
  const a = list.find((x) => x.id === id);
  if (!a || !name || a.name === name) return renderSettings();
  a.name = name;
  await Sync.patchCentral({ areas: list });
}

async function deleteArea(id) {
  const list = areas();
  if (list.length <= 1) return toast('A central precisa ter pelo menos uma área.');
  const area = list.find((a) => a.id === id);
  const rest = list.filter((a) => a.id !== id);
  const affected = Sync.tasks.filter((t) => t.area === id);
  const ok = await confirmDialog({
    title: `Excluir a área “${area.name}”?`,
    message: affected.length
      ? `${affected.length} ${affected.length === 1 ? 'tarefa desta área será movida' : 'tarefas desta área serão movidas'} para “${rest[0].name}”.`
      : 'Nenhuma tarefa usa esta área.',
    confirmLabel: 'Excluir área',
  });
  if (!ok) return;
  for (const t of affected) await Tasks.update(t.id, { area: rest[0].id });
  await Sync.patchCentral({ areas: rest });
  toast('Área excluída');
}

async function addPerson() {
  const input = $('#newPersonInput');
  const name = input.value.trim().slice(0, 60);
  if (!name) return;
  if (people().some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast('Essa pessoa já está na lista.');
  if (people().length >= 50) return toast('Use no máximo 50 pessoas.');
  input.value = '';
  await Sync.patchCentral({ people: people().concat({ id: C.uid(), name }) });
}

async function submitPinDialog(e) {
  e.preventDefault();
  const pin = $('#newPinInput').value.trim();
  const errEl = $('#newPinError');
  if (!/^\d{4,12}$/.test(pin)) {
    errEl.textContent = 'Use de 4 a 12 números.';
    errEl.hidden = false;
    return;
  }
  try {
    await Sync.call('setPin', { newPin: pin });
    await Sync.setPin(pin);
    Sync.central = Object.assign({}, Sync.central, { hasPin: true });
    await Local.saveCache(state.centralId, Sync.central, Sync.tasks, Sync.notes);
    $('#pinDialog').close();
    toast('PIN salvo. Guarde-o: ele será pedido em aparelhos novos.');
    renderSettings();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
}

async function rotateLink() {
  const ok = await confirmDialog({
    title: 'Gerar um novo link?',
    message: 'O link atual vai parar de funcionar em todos os aparelhos e para todas as pessoas. Você vai precisar abrir o novo link nos seus outros aparelhos.',
    confirmLabel: 'Gerar novo link',
  });
  if (!ok) return;
  try {
    await Sync.flush();
    const old = state.centralId;
    const { central } = await Sync.call('rotateId');
    const device = await Local.loadDevice(old);
    await Local.patchDevice(central.id, device);
    Prefs.removeRecent(old);
    Prefs.addRecent(central.id, central.name);
    Prefs.setLastCentral(central.id);
    sessionStorage.setItem('ct-new', central.id);
    location.replace(centralUrl(central.id) + '#/config');
  } catch (err) {
    toast(err.message);
  }
}

// -----------------------------------------------------------------------------
// Configurações
// -----------------------------------------------------------------------------
async function renderSettings() {
  const c = Sync.central;
  const s = settings();
  const device = await Local.loadDevice(state.centralId);

  if (document.activeElement !== $('#centralName')) $('#centralName').value = c.name;
  $('#centralLink').value = centralUrl(state.centralId);

  $('#areaEditor').innerHTML = c.areas
    .map(
      (a) => `<div class="area-row" data-area-id="${esc(a.id)}" style="--area:${a.color}">
        <button type="button" class="area-swatch" data-action="area-color" title="Trocar cor" aria-label="Trocar cor de ${esc(a.name)}"></button>
        <input class="input area-name-input" value="${esc(a.name)}" maxlength="40" aria-label="Nome da área">
        <span class="area-row-count">${Tasks.all().filter((t) => t.area === a.id && t.status !== 'done').length} abertas</span>
        <button type="button" class="icon-btn" data-action="area-delete" title="Excluir área" aria-label="Excluir ${esc(a.name)}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>`
    )
    .join('');

  $('#peopleList').innerHTML = people().length
    ? people()
        .map((p) => `<span class="area-chip person-chip">${esc(p.name)}<button type="button" data-action="person-remove" data-person-id="${esc(p.id)}" aria-label="Remover ${esc(p.name)}">×</button></span>`)
        .join('')
    : '<span class="hint">Ninguém cadastrado.</span>';

  $('#setEnabled').checked = s.notificationsEnabled;
  $('#setFrequency').value = String(s.frequencyHours);
  $('#setStart').value = s.startTime;
  $('#setEnd').value = s.endTime;
  $('#setSummary').checked = s.dailySummary;
  $('#setSummaryTime').value = s.dailySummaryTime;

  $('#pinStatus').textContent = c.hasPin
    ? 'Ativo. Quem abrir o link em um aparelho novo precisa digitar o PIN.'
    : 'Sem PIN. Qualquer pessoa com o link abre a central.';
  $('#btnPinSet').textContent = c.hasPin ? 'Trocar PIN' : 'Criar PIN';
  $('#btnPinRemove').hidden = !c.hasPin;

  $('#aiStatus').textContent =
    state.ai === null ? 'Verificando…' : state.ai ? 'Ativo.' : 'Não configurado. Cadastre a chave ANTHROPIC_API_KEY nos Secrets do Supabase (veja o README).';

  // notificações neste dispositivo
  const perm = Notifier.permission();
  const isOn = perm === 'granted' && !device.muted;
  let text;
  if (perm === 'unsupported') {
    text = Notifier.isIOS() && !Notifier.isStandalone()
      ? 'No iPhone, instale o app (Compartilhar, Adicionar à Tela de Início) e abra pelo ícone para receber notificações.'
      : 'Este navegador não suporta notificações.';
  } else if (perm === 'denied') {
    text = 'Bloqueadas pelo navegador. Libere nas configurações do site (cadeado ao lado do endereço) e toque em Ativar.';
  } else if (!isOn) {
    text = 'Desativadas neste dispositivo.';
  } else if (device.push) {
    text = 'Ativas. Os lembretes chegam mesmo com o app e o navegador fechados.';
  } else {
    text = 'Ativas enquanto o app estiver aberto (mesmo minimizado).';
  }
  $('#deviceNotifStatus').textContent = text;
  const canUpgrade = isOn && !device.push && Notifier.pushSupported();
  $('#btnNotifEnable').hidden = perm === 'unsupported' || (isOn && !canUpgrade);
  $('#btnNotifEnable').textContent = canUpgrade ? 'Ativar com o app fechado' : 'Ativar neste dispositivo';
  $('#btnNotifTest').hidden = !isOn;
  $('#btnNotifDisable').hidden = !isOn;

  const next = C.nextReminderAt(s, device.lastNotifiedAt, new Date());
  $('#nextReminder').textContent = !s.notificationsEnabled
    ? 'Lembretes desligados para esta central.'
    : isOn && !device.push && next
      ? 'Próximo lembrete neste dispositivo: por volta de ' + next.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + ', se houver demandas abertas.'
      : '';
  Notifier.syncPeriodic(c, device);

  const standalone = Notifier.isStandalone();
  $('#btnInstall').hidden = !state.installPrompt;
  $('#installHint').textContent = standalone
    ? 'O app já está instalado neste dispositivo.'
    : Notifier.isIOS()
      ? 'No Safari, abra o link da central, toque em Compartilhar e depois em Adicionar à Tela de Início.'
      : state.installPrompt
        ? 'Instale para abrir como app, com ícone próprio. O app instalado abre direto nesta central.'
        : 'No Chrome ou Edge, use o ícone de instalar na barra de endereço. No Android, menu ⋮ e Instalar app.';

  const legacy = Prefs.legacyImported() ? [] : await Local.legacyTasks();
  $('#legacyBox').hidden = !legacy.length;
  $('#legacyBoxCount').textContent = legacy.length;
  const all = Tasks.all();
  $('#storageInfo').textContent = `${all.length} ${all.length === 1 ? 'tarefa' : 'tarefas'} nesta central, ${all.filter((t) => t.status === 'done').length} no histórico, ${Tasks.trash().length} na lixeira e ${Sync.notes.length} ${Sync.notes.length === 1 ? 'nota' : 'notas'}. Os dados ficam no servidor e uma cópia neste dispositivo para funcionar offline.`;
}

async function enableNotifications() {
  const btn = $('#btnNotifEnable');
  btn.disabled = true;
  try {
    const r = await Notifier.enable(state.centralId, Sync.central, Tasks.all());
    if (r.mode === 'push') toast('Notificações ativadas neste dispositivo');
    else toast(r.reason ? 'Ativadas com o app aberto. Push indisponível: ' + r.reason : 'Notificações ativadas com o app aberto');
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    renderSettings();
  }
}

function patchSettings(patch) {
  return Sync.patchCentral({ settings: Object.assign({}, settings(), patch) });
}

function exportBackup() {
  const data = createBackup(Sync.central, Sync.tasks, Sync.notes);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const slug = Sync.central.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  a.download = `${slug || 'central'}-backup-${C.toDateKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup exportado');
}

async function importIntoCentral({ tasks, notes, people: incomingPeople, areas: incomingAreas, settings: settingsPatch }, confirmText) {
  const ok = await confirmDialog({ title: 'Importar?', message: confirmText, confirmLabel: 'Importar e substituir' });
  if (!ok) return false;
  const { areas: merged, map } = mergeAreas(areas(), incomingAreas);
  if (JSON.stringify(merged) !== JSON.stringify(areas())) await Sync.patchCentral({ areas: merged });
  if (settingsPatch && Object.keys(settingsPatch).length) await patchSettings(settingsPatch);
  if (incomingPeople && incomingPeople.length) {
    const names = new Set(people().map((p) => p.name.toLowerCase()));
    const add = incomingPeople.filter((p) => !names.has(String(p.name).toLowerCase())).map((p) => ({ id: String(p.id), name: String(p.name) }));
    if (add.length) await Sync.patchCentral({ people: people().concat(add).slice(0, 50) });
  }
  await Sync.flush();
  await Tasks.replaceAll(remapTasks(tasks, map, merged.map((a) => a.id)), notes);
  return true;
}

async function importBackup(file) {
  try {
    const data = parseBackup(await file.text());
    const done = await importIntoCentral(
      data,
      `As ${Sync.tasks.length} tarefas atuais desta central${data.notes ? ' e as notas' : ''} serão substituídas pelo conteúdo do backup (${data.tasks.length} tarefas${data.notes ? `, ${data.notes.length} notas` : ''}), em todos os dispositivos.`
    );
    if (done) toast(`Backup importado: ${data.tasks.length} ${data.tasks.length === 1 ? 'tarefa' : 'tarefas'}`);
  } catch (err) {
    toast(err.message || 'Não foi possível importar o arquivo.');
  }
}

async function importLegacy() {
  try {
    const legacy = await Local.legacyTasks();
    const used = new Set(legacy.map((t) => t.area));
    const done = await importIntoCentral(
      { tasks: legacy, notes: null, areas: C.LEGACY_AREAS.filter((a) => used.has(a.id)), settings: null },
      `As ${legacy.length} tarefas salvas neste navegador pela versão anterior vão substituir as ${Sync.tasks.length} tarefas atuais desta central.`
    );
    if (done) {
      Prefs.setLegacyImported();
      toast('Tarefas importadas');
      renderSettings();
    }
  } catch (err) {
    toast(err.message);
  }
}

// -----------------------------------------------------------------------------
// Ciclo de minuto: lembretes locais e virada de dia
// -----------------------------------------------------------------------------
async function minuteTick() {
  try {
    await Notifier.check(state.centralId, Sync.central, Tasks.all());
  } catch (err) {
    console.warn('Lembrete:', err);
  }
  const active = document.activeElement;
  const busyNow = active && active.closest && active.closest('#taskList, #historyList, #agendaList, dialog[open], [data-view="settings"], .note-editor');
  const dayChanged = state.lastDateKey !== C.toDateKey(new Date());
  state.lastDateKey = C.toDateKey(new Date());
  if (!busyNow || dayChanged) renderAll();
}

// -----------------------------------------------------------------------------
// Eventos da central
// -----------------------------------------------------------------------------
function bindEvents() {
  if (state.bound) return;
  state.bound = true;

  document.addEventListener('click', (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const card = actionEl.closest('[data-id]');
      handleAction(actionEl.dataset.action, card && card.dataset.id, actionEl);
      return;
    }
    const statusEl = e.target.closest('[data-filter-status]');
    if (statusEl) {
      const v = statusEl.dataset.filterStatus;
      state.filter.status = state.filter.status === v && v !== 'all' ? 'all' : v;
      return renderTasks();
    }
    const areaEl = e.target.closest('[data-filter-area]');
    if (areaEl) {
      const v = areaEl.dataset.filterArea;
      state.filter.area = state.filter.area === v ? null : v;
      return renderTasks();
    }
    const ag = e.target.closest('[data-agenda]');
    if (ag) {
      state.agendaOffset = Math.max(0, state.agendaOffset + Number(ag.dataset.agenda));
      return renderAgenda();
    }
    const rd = e.target.closest('[data-report-days]');
    if (rd) {
      state.reportDays = Number(rd.dataset.reportDays);
      return renderReport();
    }
    const ht = e.target.closest('[data-history-tab]');
    if (ht) {
      state.history.tab = ht.dataset.historyTab;
      return renderHistory();
    }
    const dateInput = e.target.closest('input[data-quick="dueDate"]');
    if (dateInput && dateInput.showPicker) {
      try {
        dateInput.showPicker();
      } catch {}
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-quick]')) handleQuickChange(e.target);
    if (e.target.matches('.area-name-input')) renameArea(e.target.closest('[data-area-id]').dataset.areaId, e.target.value);
  });

  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filter.query = e.target.value;
      renderTasks();
    }, 120);
  });
  $('#ownerFilter').addEventListener('change', (e) => {
    state.filter.owner = e.target.value;
    renderTasks();
  });
  $('#historySearch').addEventListener('input', (e) => {
    state.history.query = e.target.value;
    renderHistory();
  });
  $('#historyArea').addEventListener('change', (e) => {
    state.history.area = e.target.value;
    renderHistory();
  });
  $('#notesSearch').addEventListener('input', (e) => {
    state.notesQuery = e.target.value;
    renderNotesList();
  });
  $('#quickForm').addEventListener('submit', quickCapture);

  // editor de notas (salva sozinho)
  ['#noteTitle', '#noteParticipants', '#noteBody'].forEach((sel) => $(sel).addEventListener('input', scheduleNoteSave));
  $('#noteDate').addEventListener('change', scheduleNoteSave);
  window.addEventListener('pagehide', saveNoteNow);

  // diálogos
  $$('dialog').forEach((dlg) =>
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
      if (e.target.closest('[data-close]')) dlg.close();
    })
  );
  $('#taskDialog').addEventListener('close', () => (state.editingId = null));
  $('#waitDialog').addEventListener('close', () => {
    state.waitingId = null;
    renderAll();
  });

  const taskForm = $('#taskForm');
  taskForm.addEventListener('submit', submitTaskForm);
  taskForm.addEventListener('change', (e) => {
    if (e.target.name === 'status') toggleWaitingFields();
    if (e.target.matches('[data-check-index]')) state.formChecklist[Number(e.target.dataset.checkIndex)].done = e.target.checked;
  });
  taskForm.addEventListener('input', (e) => {
    if (e.target.matches('[data-check-text]')) state.formChecklist[Number(e.target.dataset.checkText)].text = e.target.value;
  });
  taskForm.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-check-remove]');
    if (rm) {
      state.formChecklist.splice(Number(rm.dataset.checkRemove), 1);
      renderChecklistEditor();
    }
    const cr = e.target.closest('[data-comment-remove]');
    if (cr && state.editingId) await Tasks.removeComment(state.editingId, cr.dataset.commentRemove);
  });
  taskForm.taskTitle.addEventListener('input', () => ($('#titleError').hidden = true));
  $('#checklistAdd').addEventListener('click', addChecklistItem);
  $('#checklistInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addChecklistItem();
    }
  });
  const sendComment = async () => {
    const input = $('#commentInput');
    if (!input.value.trim() || !state.editingId) return;
    await Tasks.addComment(state.editingId, input.value);
    input.value = '';
    renderComments();
  };
  $('#commentAdd').addEventListener('click', sendComment);
  $('#commentInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendComment();
    }
  });
  $('#waitForm').addEventListener('submit', submitWaitForm);
  $('#reviewForm').addEventListener('submit', submitReview);
  $('#reviewList').addEventListener('change', (e) => {
    if (e.target.matches('[data-review-include]')) e.target.closest('.review-item').classList.toggle('is-off', !e.target.checked);
    updateReviewCount();
  });
  $('#pinDialogForm').addEventListener('submit', submitPinDialog);

  $$('.quick').forEach((box) =>
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-days]');
      if (!b) return;
      const input = box.closest('form')[box.dataset.target];
      input.value = b.dataset.days === '' ? '' : C.addDays(C.toDateKey(new Date()), Number(b.dataset.days));
    })
  );

  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.screen !== 'app') return;
    const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
    const dialogOpen = !!document.querySelector('dialog[open]');
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && $('#taskDialog').open) {
      e.preventDefault();
      taskForm.requestSubmit();
      return;
    }
    if (typing || dialogOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      openTaskDialog();
    } else if (e.key === '/' && state.route === 'tasks') {
      e.preventDefault();
      $('#search').focus();
    }
  });

  // configurações
  $('#centralName').addEventListener('change', async (e) => {
    const name = e.target.value.trim().slice(0, 80);
    if (!name) return renderSettings();
    await Sync.patchCentral({ name });
    Prefs.addRecent(state.centralId, name);
    toast('Nome atualizado');
  });
  $('#newAreaInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addArea();
    }
  });
  $('#newPersonInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPerson();
    }
  });
  $('#setEnabled').addEventListener('change', (e) => patchSettings({ notificationsEnabled: e.target.checked }));
  $('#setFrequency').addEventListener('change', (e) => patchSettings({ frequencyHours: Number(e.target.value) }));
  $('#setStart').addEventListener('change', (e) => e.target.value && patchSettings({ startTime: e.target.value }));
  $('#setEnd').addEventListener('change', (e) => e.target.value && patchSettings({ endTime: e.target.value }));
  $('#setSummary').addEventListener('change', (e) => patchSettings({ dailySummary: e.target.checked }));
  $('#setSummaryTime').addEventListener('change', (e) => e.target.value && patchSettings({ dailySummaryTime: e.target.value }));
  $$('input[name="theme"]').forEach((r) => r.addEventListener('change', () => applyTheme(r.value)));
  $('#importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importBackup(file);
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPrompt = e;
    if (state.route === 'settings') renderSettings();
  });
  window.addEventListener('hashchange', () => {
    if (state.route === 'note') saveNoteNow();
    route();
  });
  document.addEventListener('visibilitychange', () => !document.hidden && minuteTick());
}

// -----------------------------------------------------------------------------
// Inicialização
// -----------------------------------------------------------------------------
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('service-worker.js', { scope: './' });
  } catch (err) {
    console.warn('Service worker não registrado:', err);
  }
}

function showPinScreen(message, isError) {
  showScreen('pin');
  $('#pinMessage').textContent = message || 'Digite o PIN para abrir esta central.';
  $('#pinError').hidden = !isError;
  if (isError) $('#pinError').textContent = 'PIN incorreto. Tente de novo.';
  $('#pinInput').value = '';
  setTimeout(() => $('#pinInput').focus(), 50);
  $('#pinForm').onsubmit = async (e) => {
    e.preventDefault();
    const pin = $('#pinInput').value.trim();
    if (!pin) return;
    await Local.patchDevice(state.centralId, { pin });
    openCentral(state.centralId);
  };
}

let started = false;
async function openCentral(id) {
  state.centralId = id;
  showMessage('Abrindo sua central…', '');
  try {
    await Sync.open(id);
  } catch (err) {
    if (err.status === 404) {
      Prefs.removeRecent(id);
      return showMessage(
        'Central não encontrada',
        'Confira se o link está completo. Se um novo link foi gerado, peça o link atualizado.',
        `<a class="btn btn-primary" href="${esc(baseUrl())}">Ir para a página inicial</a>`
      );
    }
    if (err.status === 401) return showPinScreen(null, err.code === 'pin_invalid');
    return showMessage(
      'Não foi possível abrir a central',
      err.message + ' Verifique a conexão e tente de novo.',
      `<button class="btn btn-primary" type="button" data-action="retry">Tentar de novo</button>`
    );
  }

  Prefs.addRecent(id, Sync.central.name);
  Prefs.setLastCentral(id);
  Local.setLastCentral(id);
  const device = await Local.loadDevice(id);
  if (!device.lastNotifiedAt) await Local.patchDevice(id, { lastNotifiedAt: new Date().toISOString() });

  showScreen('app');
  if (started) return renderAll();
  started = true;
  buildStaticControls();
  bindEvents();
  Sync.onChange(renderAll);
  Sync.onStatus(renderSyncStatus);
  renderSyncStatus(Sync.status, Sync.lastError);
  route();
  Sync.startPolling((err) => {
    if (err.status === 401) showPinScreen('O PIN desta central foi alterado. Digite o novo PIN.', false);
    else if (err.status === 404) showMessage('Central não encontrada', 'Este link não funciona mais. Peça o link atualizado.', `<a class="btn btn-primary" href="${esc(baseUrl())}">Ir para a página inicial</a>`);
  });
  setInterval(minuteTick, 60000);
  setTimeout(minuteTick, 3000);
  Tasks.autoPurge().catch(() => {});
  api('config')
    .then((r) => {
      state.ai = !!r.ai;
      if (state.route === 'settings') renderSettings();
    })
    .catch(() => {});

  if (sessionStorage.getItem('ct-new') === id) {
    sessionStorage.removeItem('ct-new');
    $('#newLink').value = centralUrl(id);
    $('#linkDialog').showModal();
  }
}

async function boot() {
  applyTheme(Prefs.theme());
  registerServiceWorker();
  document.addEventListener('click', (e) => {
    if (document.body.dataset.screen === 'app') return;
    const a = e.target.closest('[data-action="retry"]');
    if (a) location.reload();
    const copy = e.target.closest('[data-action="copy-link"]');
    if (copy && state.centralId) copyText(centralUrl(state.centralId));
  });
  // o diálogo de link aparece com a central aberta; o botão copiar também precisa funcionar ali
  const id = new URLSearchParams(location.search).get('c');
  if (!id) {
    const last = Prefs.lastCentral();
    if (Notifier.isStandalone() && last) {
      location.replace(centralUrl(last) + location.hash);
      return;
    }
    return showLanding();
  }
  if (!apiConfigured()) {
    return showMessage('Servidor não configurado', 'Edite o arquivo js/config.js com o endereço da função do Supabase (veja o README).');
  }
  return openCentral(id);
}

boot();
