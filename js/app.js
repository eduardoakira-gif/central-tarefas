/*
 * app.js
 * Ponto de entrada: carrega dados, liga eventos, controla rotas, diálogos,
 * configurações, backup e o ciclo de lembretes.
 */
import { Storage, createBackup, parseBackup } from './storage.js';
import { Tasks } from './tasks.js';
import { Notifier } from './notifications.js';
import * as UI from './ui.js';

const C = window.Core;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const state = {
  route: 'tasks',
  filter: { status: 'all', area: null, query: '' },
  history: { query: '', area: '' },
  settings: null,
  editingId: null,
  waitingId: null,
  installPrompt: null,
  lastDateKey: C.toDateKey(new Date()),
};

// -----------------------------------------------------------------------------
// Toasts
// -----------------------------------------------------------------------------
function toast(message, action) {
  const box = $('#toasts');
  box.innerHTML = ''; // só um aviso por vez, para o "Desfazer" sempre se referir à última ação
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${UI.esc(message)}</span>`;
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
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
  });
}

// -----------------------------------------------------------------------------
// Tema
// -----------------------------------------------------------------------------
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  try {
    localStorage.setItem('ct-theme', theme);
  } catch {}
  $$('input[name="theme"]').forEach((r) => (r.checked = r.value === theme));
}

// -----------------------------------------------------------------------------
// Renderização
// -----------------------------------------------------------------------------
function renderTasks() {
  const now = new Date();
  const d = UI.renderDashboard(Tasks.all(), state.filter, now);
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
  document.title = d.stats.overdue ? `(${d.stats.overdue}) Minhas tarefas` : 'Minhas tarefas';
}

function renderHistory() {
  $('#historyList').innerHTML = UI.renderHistory(Tasks.all(), state.history, new Date());
}

function renderAll() {
  if (state.route === 'tasks') renderTasks();
  if (state.route === 'history') renderHistory();
  if (state.route === 'settings') renderSettings();
}

// -----------------------------------------------------------------------------
// Rotas (#/, #/historico, #/config, #/nova)
// -----------------------------------------------------------------------------
function route() {
  const hash = location.hash.replace(/^#/, '');
  if (hash === '/nova') {
    history.replaceState(null, '', '#/');
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
// Formulário de tarefa
// -----------------------------------------------------------------------------
function buildFormControls() {
  const radio = (name, list) =>
    list
      .map(
        (o) => `<label class="seg-opt"${o.color ? ` style="--area:${o.color}"` : ''}>
          <input type="radio" name="${name}" value="${o.id}"><span>${o.color ? '<i></i>' : ''}${UI.esc(o.name)}</span></label>`
      )
      .join('');
  $('#fArea').innerHTML = radio('area', C.AREAS);
  $('#fPriority').innerHTML = radio('priority', C.PRIORITIES.slice().reverse());
  $('#fStatus').innerHTML = radio('status', C.STATUSES);
  $('#historyArea').innerHTML =
    '<option value="">Todas as áreas</option>' + C.AREAS.map((a) => `<option value="${a.id}">${UI.esc(a.name)}</option>`).join('');
}

function setRadio(form, name, value) {
  const el = form.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

function toggleWaitingFields() {
  const form = $('#taskForm');
  const waiting = form.status.value === 'waiting';
  $('#waitingFields').hidden = !waiting;
  if (waiting && !form.waitingSince.value) form.waitingSince.value = C.toDateKey(new Date());
}

function openTaskDialog(id) {
  const form = $('#taskForm');
  const t = id ? Tasks.get(id) : null;
  state.editingId = t ? t.id : null;
  form.reset();
  $('#titleError').hidden = true;
  $('#taskDialogTitle').textContent = t ? 'Editar tarefa' : 'Nova tarefa';

  const defaults = {
    area: state.filter.area || state.settings.lastArea || C.AREAS[0].id,
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
  if (data.status !== 'waiting') {
    // mantém os dados de espera só se a tarefa estiver aguardando
    if (!state.editingId) Object.assign(data, { waitingFor: '', waitingSince: null, followUpDate: null });
  }
  try {
    if (state.editingId) {
      await Tasks.update(state.editingId, data);
      toast('Tarefa atualizada');
    } else {
      await Tasks.create(data);
      toast('Tarefa criada');
    }
    if (data.area !== state.settings.lastArea) state.settings = await Storage.patchSettings({ lastArea: data.area });
    $('#taskDialog').close();
  } catch (err) {
    console.error(err);
    toast('Não foi possível salvar. Verifique se o navegador permite armazenamento local.');
  }
}

// -----------------------------------------------------------------------------
// Diálogo "Aguardando retorno"
// -----------------------------------------------------------------------------
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
// Ações nos cards
// -----------------------------------------------------------------------------
async function handleAction(action, id) {
  const t = id ? Tasks.get(id) : null;
  switch (action) {
    case 'new':
      return openTaskDialog();
    case 'edit':
      return openTaskDialog(id);
    case 'wait':
      return openWaitDialog(id);
    case 'complete': {
      await Tasks.complete(id);
      return toast('Tarefa concluída', { label: 'Desfazer', fn: () => Tasks.restore(id) });
    }
    case 'restore': {
      await Tasks.restore(id);
      return toast('Tarefa restaurada');
    }
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
  }
}

async function handleQuickChange(el) {
  const card = el.closest('[data-id]');
  if (!card) return;
  const id = card.dataset.id;
  const field = el.dataset.quick;
  if (field === 'status') {
    if (el.value === 'waiting') {
      renderAll(); // volta o select; a mudança acontece ao salvar o diálogo
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
// Configurações
// -----------------------------------------------------------------------------
function permissionText() {
  const p = Notifier.permission();
  if (p === 'granted') return 'Permitidas neste navegador.';
  if (p === 'denied') return 'Bloqueadas. Libere nas configurações do site (ícone de cadeado ao lado do endereço).';
  if (p === 'unsupported') {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return ios
      ? 'No iPhone, as notificações só funcionam com o app instalado: Compartilhar, Adicionar à Tela de Início, e abra por lá.'
      : 'Este navegador não suporta notificações.';
  }
  return 'Ainda não permitidas.';
}

async function renderSettings() {
  const s = state.settings;
  $('#setEnabled').checked = s.notificationsEnabled;
  $('#setFrequency').value = String(s.frequencyHours);
  $('#setStart').value = s.startTime;
  $('#setEnd').value = s.endTime;
  $('#permStatus').textContent = permissionText();
  $('#btnPermission').hidden = Notifier.permission() !== 'default';
  $$('input[name="theme"]').forEach((r) => (r.checked = r.value === s.theme));

  const next = C.nextReminderAt(s, new Date());
  const nextEl = $('#nextReminder');
  if (s.push.enabled) nextEl.textContent = 'Enviado pelo servidor de push, conforme a frequência e o horário configurados.';
  else if (!s.notificationsEnabled) nextEl.textContent = 'Lembretes desligados.';
  else if (Notifier.permission() !== 'granted') nextEl.textContent = 'Permita as notificações para receber lembretes.';
  else nextEl.textContent = next ? 'Por volta de ' + next.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + ', se houver demandas abertas.' : '–';

  $('#pushEndpoint').value = s.push.endpoint;
  $('#pushToken').value = s.push.token;
  $('#pushVapid').value = s.push.vapidPublicKey;
  $('#btnPushEnable').hidden = s.push.enabled;
  $('#btnPushDisable').hidden = !s.push.enabled;
  $('#btnPushTest').hidden = !s.push.enabled;
  $('#pushStatus').textContent = s.push.enabled
    ? 'Push ativo neste dispositivo. Os lembretes chegam mesmo com o app fechado.'
    : 'Push desativado. Os lembretes funcionam enquanto o app estiver aberto.';

  const periodic = await Notifier.syncPeriodic(s);
  const modes = {
    on: 'Como o app está instalado, o navegador também verifica periodicamente com o app fechado. Ele decide o intervalo exato.',
    'not-installed': 'Instale o app (Chrome ou Edge) para que o navegador também possa verificar com o app fechado.',
  };
  $('#notifModeHint').textContent = s.push.enabled
    ? ''
    : 'Sem push, os lembretes funcionam com o app aberto em alguma aba ou janela, mesmo minimizado. ' + (modes[periodic] || '');

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('#btnInstall').hidden = !state.installPrompt;
  $('#installHint').textContent = standalone
    ? 'O app já está instalado neste dispositivo.'
    : ios
      ? 'No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.'
      : state.installPrompt
        ? 'Instale para abrir como app, com ícone próprio e janela separada.'
        : 'No Chrome ou Edge, use o ícone de instalar na barra de endereço ou o menu do navegador. No Android, menu e Instalar app.';

  const all = Tasks.all();
  $('#storageInfo').textContent = `Dados salvos neste navegador (IndexedDB): ${all.length} ${all.length === 1 ? 'tarefa' : 'tarefas'}, ${all.filter((t) => t.status === 'done').length} no histórico.`;
}

async function saveSettings(patch) {
  state.settings = await Storage.patchSettings(patch);
  renderSettings();
  schedulePushSync();
}

function exportBackup() {
  const data = createBackup(Tasks.all(), state.settings);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `central-tarefas-backup-${C.toDateKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup exportado');
}

async function importBackup(file) {
  try {
    const { tasks, settings } = parseBackup(await file.text());
    const ok = await confirmDialog({
      title: 'Importar backup?',
      message: `As tarefas atuais (${Tasks.all().length}) serão substituídas pelas ${tasks.length} do backup. Exporte um backup antes se quiser guardar as atuais.`,
      confirmLabel: 'Importar e substituir',
    });
    if (!ok) return;
    await Tasks.replaceAll(tasks);
    state.settings = await Storage.patchSettings(settings);
    applyTheme(state.settings.theme);
    renderAll();
    toast(`Backup importado: ${tasks.length} ${tasks.length === 1 ? 'tarefa' : 'tarefas'}`);
  } catch (err) {
    toast(err.message || 'Não foi possível importar o arquivo.');
  }
}

// -----------------------------------------------------------------------------
// Push: sincroniza o resumo com o servidor quando algo muda
// -----------------------------------------------------------------------------
let pushTimer = null;
function schedulePushSync() {
  if (!state.settings || !state.settings.push.enabled) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    Notifier.syncPush(state.settings, Tasks.all()).catch((err) => console.warn('Push sync:', err.message));
  }, 2000);
}

// -----------------------------------------------------------------------------
// Ciclo de minuto: lembretes e virada de dia
// -----------------------------------------------------------------------------
async function minuteTick() {
  try {
    await Notifier.check(Tasks.all());
  } catch (err) {
    console.warn('Lembrete:', err);
  }
  state.settings = await Storage.loadSettings();
  const busy = document.activeElement && document.activeElement.closest && document.activeElement.closest('#taskList, #historyList, dialog[open]');
  const dayChanged = state.lastDateKey !== C.toDateKey(new Date());
  state.lastDateKey = C.toDateKey(new Date());
  if (!busy || dayChanged) renderAll();
}

// -----------------------------------------------------------------------------
// Eventos
// -----------------------------------------------------------------------------
function bindEvents() {
  // Ações por delegação (cards, botões "nova tarefa", limpar filtros)
  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const card = actionEl.closest('[data-id]');
      handleAction(actionEl.dataset.action, card && card.dataset.id);
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
  });

  // Busca
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

  // Diálogos
  $$('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close(); // clique fora
      if (e.target.closest('[data-close]')) dlg.close();
    });
  });
  $('#taskDialog').addEventListener('close', () => {
    state.editingId = null;
  });
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

  // Atalhos de data (Hoje, Amanhã, +1 semana, Sem prazo)
  $$('.quick').forEach((box) =>
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-days]');
      if (!b) return;
      const input = box.closest('form')[box.dataset.target];
      input.value = b.dataset.days === '' ? '' : C.addDays(C.toDateKey(new Date()), Number(b.dataset.days));
    })
  );

  // Teclado
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

  // Configurações
  $('#setEnabled').addEventListener('change', async (e) => {
    if (e.target.checked && Notifier.permission() === 'default') await Notifier.requestPermission();
    saveSettings({ notificationsEnabled: e.target.checked, lastNotifiedAt: new Date().toISOString() });
  });
  $('#setFrequency').addEventListener('change', (e) => saveSettings({ frequencyHours: Number(e.target.value) }));
  $('#setStart').addEventListener('change', (e) => e.target.value && saveSettings({ startTime: e.target.value }));
  $('#setEnd').addEventListener('change', (e) => e.target.value && saveSettings({ endTime: e.target.value }));
  $('#btnPermission').addEventListener('click', async () => {
    const p = await Notifier.requestPermission();
    if (p === 'granted') toast('Notificações permitidas');
    renderSettings();
  });
  $('#btnTestNotif').addEventListener('click', async () => {
    if (Notifier.permission() === 'default') await Notifier.requestPermission();
    if (Notifier.permission() !== 'granted') return toast('Permita as notificações para enviar o teste.');
    await Notifier.sendTest(Tasks.all());
    toast('Notificação de teste enviada');
  });
  $$('input[name="theme"]').forEach((r) =>
    r.addEventListener('change', () => {
      applyTheme(r.value);
      saveSettings({ theme: r.value });
    })
  );
  $('#btnExport').addEventListener('click', exportBackup);
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importBackup(file);
  });

  // Push
  const pushFields = () => ({
    endpoint: $('#pushEndpoint').value.trim(),
    token: $('#pushToken').value.trim(),
    vapidPublicKey: $('#pushVapid').value.trim(),
  });
  $('#btnPushEnable').addEventListener('click', async () => {
    const btn = $('#btnPushEnable');
    btn.disabled = true;
    try {
      const draft = C.mergeSettings({ ...state.settings, push: { ...pushFields(), enabled: true } });
      await Notifier.enablePush(draft, Tasks.all());
      await saveSettings({ push: { ...pushFields(), enabled: true } });
      toast('Push ativado');
    } catch (err) {
      $('#pushStatus').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  $('#btnPushDisable').addEventListener('click', async () => {
    try {
      await Notifier.disablePush(state.settings);
    } catch (err) {
      console.warn(err);
    }
    await saveSettings({ push: { enabled: false }, lastNotifiedAt: new Date().toISOString() });
    toast('Push desativado');
  });
  $('#btnPushTest').addEventListener('click', async () => {
    try {
      await Notifier.testPush(state.settings);
      toast('Teste enviado pelo servidor');
    } catch (err) {
      $('#pushStatus').textContent = err.message;
    }
  });

  // Instalação (Chrome/Edge/Android)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPrompt = e;
    if (state.route === 'settings') renderSettings();
  });
  $('#btnInstall').addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => {});
    state.installPrompt = null;
    renderSettings();
  });

  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) minuteTick();
  });
}

// -----------------------------------------------------------------------------
// Inicialização
// -----------------------------------------------------------------------------
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('service-worker.js', { scope: './' });
    await navigator.serviceWorker.ready;
    Notifier.syncPeriodic(state.settings);
  } catch (err) {
    console.warn('Service worker não registrado:', err);
  }
}

async function init() {
  try {
    await Tasks.init();
    state.settings = await Storage.loadSettings();
  } catch (err) {
    console.error(err);
    document.querySelector('main').innerHTML =
      '<div class="empty"><p class="empty-title">Não foi possível abrir o armazenamento do navegador.</p><p class="empty-text">Verifique se a navegação anônima ou o bloqueio de dados de sites está desativado e recarregue a página.</p></div>';
    return;
  }
  // Na primeira abertura o relógio dos lembretes começa agora (sem notificar de imediato)
  if (!state.settings.lastNotifiedAt) {
    state.settings = await Storage.patchSettings({ lastNotifiedAt: new Date().toISOString() });
  }
  applyTheme(state.settings.theme);
  buildFormControls();
  bindEvents();
  Tasks.subscribe(() => {
    renderAll();
    schedulePushSync();
  });
  route();
  registerServiceWorker();
  setInterval(minuteTick, 60000);
  setTimeout(minuteTick, 3000);
}

init();
