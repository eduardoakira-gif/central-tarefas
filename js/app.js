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
import { Notifier } from './notifications.js';
import * as UI from './ui.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const esc = UI.esc;

const state = {
  centralId: null,
  route: 'tasks',
  filter: { status: 'all', area: null, query: '' },
  history: { query: '', area: '' },
  editingId: null,
  waitingId: null,
  installPrompt: null,
  lastDateKey: C.toDateKey(new Date()),
  areasKey: '',
  landingAreas: [],
};

const baseUrl = () => location.origin + location.pathname;
const centralUrl = (id) => baseUrl() + '?c=' + encodeURIComponent(id);
const areas = () => (Sync.central ? Sync.central.areas : []);
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
  document.body.dataset.screen = name; // landing | app | message
  $('#landing').hidden = name !== 'landing';
  $('#appShell').hidden = name !== 'app';
  $('#messageScreen').hidden = name !== 'message';
}

function showMessage(title, text, actions = '') {
  $('#messageTitle').textContent = title;
  $('#messageText').textContent = text;
  $('#messageActions').innerHTML = actions;
  showScreen('message');
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
    // sugere as áreas que as tarefas antigas usavam
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
    btn.disabled = true;
    btn.textContent = 'Criando…';
    try {
      const { central } = await api('create', { name, areas: state.landingAreas });
      if (!$('#legacyRow').hidden && $('#legacyImport').checked) {
        const used = new Set(legacy.map((t) => t.area));
        const { areas: merged, map } = mergeAreas(central.areas, C.LEGACY_AREAS.filter((a) => used.has(a.id)));
        if (merged.length !== central.areas.length) await api('updateCentral', { centralId: central.id, patch: { areas: merged } });
        const tasks = remapTasks(legacy, map, merged.map((a) => a.id));
        await api('replaceTasks', { centralId: central.id, tasks });
        Prefs.setLegacyImported();
      }
      sessionStorage.setItem('ct-new', central.id);
      location.href = centralUrl(central.id);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Criar minha central';
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
function renderTasks() {
  const now = new Date();
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
  $('#historyList').innerHTML = UI.renderHistory(Tasks.all(), state.history, new Date(), areas());
}

function renderHeader() {
  $('#brandName').textContent = Sync.central.name;
  $('#centralTitle').textContent = Sync.central.name;
}

function renderAll() {
  renderHeader();
  refreshAreaControls();
  if (state.route === 'tasks') renderTasks();
  if (state.route === 'history') renderHistory();
  if (state.route === 'settings') renderSettings();
}

const STATUS_TEXT = {
  saved: 'Sincronizado',
  saving: 'Salvando…',
  offline: 'Offline',
  error: 'Erro ao sincronizar',
  idle: '',
};
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
}

// -----------------------------------------------------------------------------
// Rotas (#/, #/historico, #/config, #/nova)
// -----------------------------------------------------------------------------
function route() {
  const hash = location.hash.replace(/^#/, '');
  if (hash === '/nova') {
    history.replaceState(null, '', location.pathname + location.search + '#/');
    state.route = 'tasks';
    showView();
    openTaskDialog();
    return;
  }
  state.route = hash === '/historico' ? 'history' : hash === '/config' ? 'settings' : 'tasks';
  showView();
}

function showView() {
  $$('.view').forEach((v) => (v.hidden = v.dataset.view !== state.route));
  $$('.nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.route === state.route ? 'page' : 'false'));
  renderAll();
  window.scrollTo(0, 0);
}

// -----------------------------------------------------------------------------
// Formulários de tarefa
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

async function openTaskDialog(id) {
  const form = $('#taskForm');
  const t = id ? Tasks.get(id) : null;
  state.editingId = t ? t.id : null;
  form.reset();
  $('#titleError').hidden = true;
  $('#taskDialogTitle').textContent = t ? 'Editar tarefa' : 'Nova tarefa';
  const device = await Local.loadDevice(state.centralId);
  const ids = areas().map((a) => a.id);
  const defaults = {
    area: state.filter.area || (ids.includes(device.lastArea) ? device.lastArea : ids[0]),
    priority: state.filter.status === 'urgent' ? 'urgent' : 'normal',
    status: ['pending', 'doing', 'waiting'].includes(state.filter.status) ? state.filter.status : 'pending',
    dueDate: state.filter.status === 'today' ? C.toDateKey(new Date()) : '',
  };
  const v = t || defaults;
  form.taskTitle.value = t ? t.title : '';
  setRadio(form, 'area', v.area);
  setRadio(form, 'priority', v.priority);
  setRadio(form, 'status', v.status);
  form.dueDate.value = v.dueDate || '';
  form.dueTime.value = (t && t.dueTime) || '';
  ['description', 'owner', 'waitingFor', 'link', 'notes'].forEach((k) => (form[k].value = (t && t[k]) || ''));
  form.waitingSince.value = (t && t.waitingSince) || '';
  form.followUpDate.value = (t && t.followUpDate) || '';
  toggleWaitingFields();
  $('#moreDetails').open = !!(t && (t.description || t.owner || t.link || t.notes));
  $('#taskMeta').textContent = t
    ? 'Criada em ' + UI.dateTimeLabel(t.createdAt) + (t.completedAt ? '. Concluída em ' + UI.dateTimeLabel(t.completedAt) : '')
    : '';
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
  const data = {
    title,
    area: form.area.value,
    priority: form.priority.value,
    status: form.status.value,
    dueDate: form.dueDate.value || null,
    dueTime: form.dueDate.value ? form.dueTime.value || null : null,
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
    case 'complete':
      await Tasks.complete(id);
      return toast('Tarefa concluída', { label: 'Desfazer', fn: () => Tasks.restore(id) });
    case 'restore':
      await Tasks.restore(id);
      return toast('Tarefa restaurada');
    case 'delete': {
      const removed = await Tasks.remove(id);
      return toast('Tarefa excluída', { label: 'Desfazer', fn: () => Tasks.put(removed) });
    }
    case 'purge': {
      const ok = await confirmDialog({
        title: 'Excluir definitivamente?',
        message: `“${t.title}” será apagada do histórico. Essa ação não pode ser desfeita.`,
        confirmLabel: 'Excluir',
      });
      if (ok) {
        await Tasks.remove(id);
        toast('Tarefa excluída definitivamente');
      }
      return;
    }
    case 'clear-filters':
      state.filter = { status: 'all', area: null, query: '' };
      $('#search').value = '';
      return renderTasks();
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
    await Tasks.update(id, { status: el.value });
    if (el.value === 'done') toast('Tarefa concluída', { label: 'Desfazer', fn: () => Tasks.restore(id) });
    return;
  }
  if (field === 'priority') return Tasks.update(id, { priority: el.value });
  if (field === 'dueDate') return Tasks.update(id, { dueDate: el.value || null, ...(el.value ? {} : { dueTime: null }) });
}

// -----------------------------------------------------------------------------
// Áreas
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
  const affected = Tasks.all().filter((t) => t.area === id);
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

  $('#setEnabled').checked = s.notificationsEnabled;
  $('#setFrequency').value = String(s.frequencyHours);
  $('#setStart').value = s.startTime;
  $('#setEnd').value = s.endTime;

  // estado das notificações neste dispositivo
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
  $('#storageInfo').textContent = `${all.length} ${all.length === 1 ? 'tarefa' : 'tarefas'} nesta central, ${all.filter((t) => t.status === 'done').length} no histórico. Os dados ficam no servidor e uma cópia neste dispositivo para funcionar offline.`;
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
  const data = createBackup(Sync.central, Tasks.all());
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

async function importIntoCentral(tasks, incomingAreas, settingsPatch, confirmText) {
  const ok = await confirmDialog({ title: 'Importar tarefas?', message: confirmText, confirmLabel: 'Importar e substituir' });
  if (!ok) return false;
  const { areas: merged, map } = mergeAreas(areas(), incomingAreas);
  if (JSON.stringify(merged) !== JSON.stringify(areas())) await Sync.patchCentral({ areas: merged });
  if (settingsPatch && Object.keys(settingsPatch).length) await patchSettings(settingsPatch);
  await Sync.flush();
  await Tasks.replaceAll(remapTasks(tasks, map, merged.map((a) => a.id)));
  return true;
}

async function importBackup(file) {
  try {
    const { tasks, areas: incoming, settings: s } = parseBackup(await file.text());
    const done = await importIntoCentral(
      tasks, incoming, s,
      `As ${Tasks.all().length} tarefas atuais desta central serão substituídas pelas ${tasks.length} do backup, em todos os dispositivos.`
    );
    if (done) toast(`Backup importado: ${tasks.length} ${tasks.length === 1 ? 'tarefa' : 'tarefas'}`);
  } catch (err) {
    toast(err.message || 'Não foi possível importar o arquivo.');
  }
}

async function importLegacy() {
  try {
    const legacy = await Local.legacyTasks();
    const used = new Set(legacy.map((t) => t.area));
    const done = await importIntoCentral(
      legacy, C.LEGACY_AREAS.filter((a) => used.has(a.id)), null,
      `As ${legacy.length} tarefas salvas neste navegador pela versão anterior vão substituir as ${Tasks.all().length} tarefas atuais desta central.`
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
  const busy = document.activeElement && document.activeElement.closest && document.activeElement.closest('#taskList, #historyList, dialog[open], #view-settings');
  const dayChanged = state.lastDateKey !== C.toDateKey(new Date());
  state.lastDateKey = C.toDateKey(new Date());
  if (!busy || dayChanged) renderAll();
}

// -----------------------------------------------------------------------------
// Eventos da central
// -----------------------------------------------------------------------------
function bindEvents() {
  document.addEventListener('click', (e) => {
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
  $('#historySearch').addEventListener('input', (e) => {
    state.history.query = e.target.value;
    renderHistory();
  });
  $('#historyArea').addEventListener('change', (e) => {
    state.history.area = e.target.value;
    renderHistory();
  });

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
  });
  taskForm.taskTitle.addEventListener('input', () => ($('#titleError').hidden = true));
  $('#waitForm').addEventListener('submit', submitWaitForm);

  $$('.quick').forEach((box) =>
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-days]');
      if (!b) return;
      const input = box.closest('form')[box.dataset.target];
      input.value = b.dataset.days === '' ? '' : C.addDays(C.toDateKey(new Date()), Number(b.dataset.days));
    })
  );

  document.addEventListener('keydown', (e) => {
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

  // Configurações da central
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
  $('#setEnabled').addEventListener('change', (e) => patchSettings({ notificationsEnabled: e.target.checked }));
  $('#setFrequency').addEventListener('change', (e) => patchSettings({ frequencyHours: Number(e.target.value) }));
  $('#setStart').addEventListener('change', (e) => e.target.value && patchSettings({ startTime: e.target.value }));
  $('#setEnd').addEventListener('change', (e) => e.target.value && patchSettings({ endTime: e.target.value }));
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
  window.addEventListener('hashchange', route);
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
        'Confira se o link está completo. Se a central foi criada em outro endereço, abra pelo link original.',
        `<a class="btn btn-primary" href="${esc(baseUrl())}">Ir para a página inicial</a>`
      );
    }
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
  buildStaticControls();
  bindEvents();
  Sync.onChange(renderAll);
  Sync.onStatus(renderSyncStatus);
  renderSyncStatus(Sync.status, Sync.lastError);
  route();
  Sync.startPolling();
  setInterval(minuteTick, 60000);
  setTimeout(minuteTick, 3000);

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
  });
  const id = new URLSearchParams(location.search).get('c');
  if (!id) {
    const last = Prefs.lastCentral();
    // o app instalado abre direto na última central usada
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
