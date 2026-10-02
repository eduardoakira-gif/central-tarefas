/*
 * storage.js
 * Armazenamento local do dispositivo:
 * - cópia (cache) da central e das tarefas, para abrir rápido e funcionar offline;
 * - fila de alterações ainda não enviadas ao servidor;
 * - preferências deste dispositivo (tema, centrais recentes, lembretes locais);
 * - backup (exportar/importar) e tarefas da versão anterior.
 */
const C = window.Core;

const kv = {
  get: (k) => C.idb.get('kv', k),
  set: (k, v) => C.idb.put('kv', v, k),
};

export const Local = {
  loadCache: (id) => kv.get('central:' + id),
  saveCache: (id, central, tasks) => kv.set('central:' + id, { central, tasks, savedAt: new Date().toISOString() }),

  async loadOutbox(id) {
    const ob = await kv.get('outbox:' + id);
    return Object.assign({ upserts: {}, deletes: [], centralPatch: null }, ob || {});
  },
  saveOutbox: (id, ob) => kv.set('outbox:' + id, ob),

  async loadDevice(id) {
    const d = await kv.get('device:' + id);
    return Object.assign({ lastNotifiedAt: null, push: false, muted: false, lastArea: null }, d || {});
  },
  async patchDevice(id, patch) {
    const next = Object.assign(await this.loadDevice(id), patch);
    await kv.set('device:' + id, next);
    return next;
  },

  setLastCentral: (id) => kv.set('lastCentralId', id),

  /** Tarefas salvas pela versão 1 (antes das centrais com link). */
  async legacyTasks() {
    try {
      return ((await C.idb.getAll('tasks')) || []).filter((t) => t && String(t.title || '').trim());
    } catch {
      return [];
    }
  },
};

// -----------------------------------------------------------------------------
// Preferências deste navegador (localStorage)
// -----------------------------------------------------------------------------
const ls = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

export const Prefs = {
  theme: () => {
    try {
      return localStorage.getItem('ct-theme') || 'auto';
    } catch {
      return 'auto';
    }
  },
  setTheme: (t) => {
    try {
      localStorage.setItem('ct-theme', t);
    } catch {}
  },
  recent: () => ls.get('ct-recent', []),
  addRecent(id, name) {
    const list = this.recent().filter((r) => r.id !== id);
    list.unshift({ id, name, openedAt: new Date().toISOString() });
    ls.set('ct-recent', list.slice(0, 12));
  },
  removeRecent(id) {
    ls.set('ct-recent', this.recent().filter((r) => r.id !== id));
  },
  lastCentral: () => ls.get('ct-last', null),
  setLastCentral: (id) => ls.set('ct-last', id),
  legacyImported: () => ls.get('ct-legacy-imported', false),
  setLegacyImported: () => ls.set('ct-legacy-imported', true),
};

// -----------------------------------------------------------------------------
// Áreas: junta as áreas de um backup/versão antiga com as da central
// -----------------------------------------------------------------------------
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function mergeAreas(centralAreas, incoming) {
  const areas = centralAreas.map((a) => Object.assign({}, a));
  const map = {};
  for (const a of incoming) {
    let match = areas.find((x) => x.id === a.id) || areas.find((x) => fold(x.name) === fold(a.name));
    if (!match && areas.length < 20) {
      const used = new Set(areas.map((x) => x.color));
      match = { id: C.newAreaId(), name: String(a.name).slice(0, 40), color: a.color && !used.has(a.color) ? a.color : C.nextAreaColor(areas) };
      areas.push(match);
    }
    map[a.id] = match ? match.id : areas[0].id;
  }
  return { areas, map };
}

/** Converte tarefas de outra origem para as áreas desta central. */
export function remapTasks(tasks, map, areaIds) {
  return tasks.map((t) => C.normalizeTask(Object.assign({}, t, { area: map[t.area] || t.area }), areaIds));
}

// -----------------------------------------------------------------------------
// Backup
// -----------------------------------------------------------------------------
export const BACKUP_VERSION = 2;

export function createBackup(central, tasks) {
  return {
    app: 'central-de-tarefas',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    central: { name: central.name, areas: central.areas, settings: central.settings },
    statuses: C.STATUSES,
    priorities: C.PRIORITIES.map(({ id, name }) => ({ id, name })),
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
  if (!data || !Array.isArray(data.tasks)) throw new Error('Arquivo inválido: a lista de tarefas não foi encontrada.');
  const tasks = data.tasks.filter((t) => t && typeof t === 'object' && String(t.title || '').trim());
  // v2 guarda as áreas em central.areas; v1 em areas (ou as fixas da versão 1)
  const areas = (data.central && Array.isArray(data.central.areas) && data.central.areas) ||
    (Array.isArray(data.areas) && data.areas) || C.LEGACY_AREAS;
  const src = (data.central && data.central.settings) || data.settings || {};
  const settings = {};
  if (typeof src.notificationsEnabled === 'boolean') settings.notificationsEnabled = src.notificationsEnabled;
  if ([1, 2, 3, 4, 6].includes(Number(src.frequencyHours))) settings.frequencyHours = Number(src.frequencyHours);
  if (/^\d{2}:\d{2}$/.test(src.startTime || '')) settings.startTime = src.startTime;
  if (/^\d{2}:\d{2}$/.test(src.endTime || '')) settings.endTime = src.endTime;
  return { tasks, areas: areas.filter((a) => a && a.id && a.name), settings };
}
