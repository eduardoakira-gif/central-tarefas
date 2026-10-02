/*
 * storage.js
 * Camada de persistência. Hoje grava no IndexedDB do navegador.
 *
 * Para sincronizar computador e celular no futuro (Supabase/Firebase),
 * basta criar outro adaptador com os mesmos métodos (loadTasks, saveTask,
 * deleteTask, replaceTasks, loadSettings, saveSettings) e trocá-lo aqui.
 * O resto do app só conversa com o objeto Storage.
 */
const C = window.Core;

export const BACKUP_VERSION = 1;

const IndexedDBAdapter = {
  async loadTasks() {
    return (await C.idb.getAll('tasks')) || [];
  },
  saveTask(task) {
    return C.idb.put('tasks', task);
  },
  deleteTask(id) {
    return C.idb.del('tasks', id);
  },
  replaceTasks(list) {
    return C.idb.replaceAll('tasks', list);
  },
  async loadSettings() {
    return C.mergeSettings(await C.idb.get('kv', 'settings'));
  },
  saveSettings(settings) {
    return C.idb.put('kv', settings, 'settings');
  },
};

const adapter = IndexedDBAdapter;

export const Storage = {
  loadTasks: () => adapter.loadTasks(),
  saveTask: (t) => adapter.saveTask(t),
  deleteTask: (id) => adapter.deleteTask(id),
  replaceTasks: (list) => adapter.replaceTasks(list),
  loadSettings: () => adapter.loadSettings(),

  /** Lê as configurações atuais, aplica as mudanças e grava. */
  async patchSettings(patch) {
    const current = await adapter.loadSettings();
    const next = C.mergeSettings(
      Object.assign({}, current, patch, {
        push: Object.assign({}, current.push, patch.push || {}),
      })
    );
    await adapter.saveSettings(next);
    return next;
  },
};

// -----------------------------------------------------------------------------
// Backup
// -----------------------------------------------------------------------------
export function createBackup(tasks, settings) {
  const { push, lastNotifiedAt, ...prefs } = settings;
  return {
    app: 'central-de-tarefas',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    areas: C.AREAS.map(({ id, name, color }) => ({ id, name, color })),
    statuses: C.STATUSES,
    priorities: C.PRIORITIES.map(({ id, name }) => ({ id, name })),
    settings: Object.assign({}, prefs, {
      // o token de push nunca vai para o arquivo de backup
      push: { endpoint: push.endpoint, vapidPublicKey: push.vapidPublicKey },
    }),
    tasks,
  };
}

export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  if (!data || !Array.isArray(data.tasks)) {
    throw new Error('Arquivo inválido: a lista de tarefas não foi encontrada.');
  }
  const tasks = data.tasks
    .filter((t) => t && typeof t === 'object' && String(t.title || '').trim())
    .map(C.normalizeTask);
  const s = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const settings = {};
  if (typeof s.notificationsEnabled === 'boolean') settings.notificationsEnabled = s.notificationsEnabled;
  if ([1, 2, 3, 4, 6].includes(Number(s.frequencyHours))) settings.frequencyHours = Number(s.frequencyHours);
  if (/^\d{2}:\d{2}$/.test(s.startTime || '')) settings.startTime = s.startTime;
  if (/^\d{2}:\d{2}$/.test(s.endTime || '')) settings.endTime = s.endTime;
  if (['auto', 'light', 'dark'].includes(s.theme)) settings.theme = s.theme;
  if (C.AREA_MAP[s.lastArea]) settings.lastArea = s.lastArea;
  if (s.push && typeof s.push === 'object') {
    settings.push = {};
    if (typeof s.push.endpoint === 'string') settings.push.endpoint = s.push.endpoint;
    if (typeof s.push.vapidPublicKey === 'string') settings.push.vapidPublicKey = s.push.vapidPublicKey;
  }
  return { tasks, settings };
}
